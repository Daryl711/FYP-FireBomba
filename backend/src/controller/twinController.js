const supabase = require("../config/supabase");
const { mqttEvents } = require("../services/mqttService");

// Latest reading per room, so a twin that connects mid-stream is not blank
// until every sensor happens to publish again.
const latest = new Map(); // topic -> { data, at }
const clients = new Set();

mqttEvents.on("sensor-data", ({ topic, data }) => {
  latest.set(topic, { data, at: Date.now() });
  const frame = `data: ${JSON.stringify({ topic, payload: data, age: 0 })}\n\n`;
  clients.forEach((res) => res.write(frame));
});

// Read-only floor layout for the digital twin. Only ids, names and the
// bilik/space grouping are returned; no household names or user data.
exports.getLayout = async (req, res) => {
  try {
    const [bilikRes, roomsRes] = await Promise.all([
      supabase.from("bilik").select("bilik_id, bilik_number").order("bilik_id"),
      supabase
        .from("rooms")
        .select("room_id, name, space_type, bilik_id")
        .order("room_id")
    ]);

    if (bilikRes.error) throw bilikRes.error;
    if (roomsRes.error) throw roomsRes.error;

    res.json({
      bilik: bilikRes.data.map((b) => ({
        bilikId: b.bilik_id,
        bilikNumber: b.bilik_number
      })),
      rooms: roomsRes.data.map((r) => ({
        roomId: r.room_id,
        name: r.name,
        spaceType: r.space_type,
        bilikId: r.bilik_id
      }))
    });
  } catch (err) {
    console.error("Twin layout error:", err);
    res.status(500).json({ error: "Could not load layout." });
  }
};

// Server-Sent Events feed of live sensor readings relayed from AWS IoT Core.
// Read-only: the twin can watch the stream but cannot send anything back.
exports.streamSensors = (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no" // stop nginx buffering the stream
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const now = Date.now();
  latest.forEach(({ data, at }, topic) => {
    res.write(`data: ${JSON.stringify({ topic, payload: data, age: now - at })}\n\n`);
  });

  clients.add(res);
  // A comment line every 20 s keeps proxies from closing an idle connection.
  const beat = setInterval(() => res.write(": keep-alive\n\n"), 20000);
  req.on("close", () => {
    clearInterval(beat);
    clients.delete(res);
  });
};

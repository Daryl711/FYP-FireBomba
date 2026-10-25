const supabase = require("../config/supabase");
const Bilik = require("../models/Bilik");
const SensorReading = require("../models/SensorReading");
const twinSensorStream = require("../services/twinSensorStream");

// Read-only floor layout for the digital twin. Only ids, names and the
// bilik/space grouping are returned; no household names or user data.
exports.getLayout = async (req, res) => {
  try {
    const [bilik, roomsRes] = await Promise.all([
      Bilik.getLayoutBiliks(),
      supabase
        .from("rooms")
        .select("room_id, name, space_type, bilik_id")
        .order("room_id")
    ]);

    if (roomsRes.error) throw roomsRes.error;

    res.json({
      bilik,
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

// Dedicated all-room feed of persisted sensor readings for the digital twin.
exports.streamSensors = async (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no" // stop nginx buffering the stream
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  // Subscribe before loading the snapshot so readings during the query are kept.
  // The client uses timestamps to prevent older snapshot rows replacing live data.
  const unsubscribe = twinSensorStream.subscribe(res);
  let closed = false;
  // A comment line every 20 s keeps proxies from closing an idle connection.
  const beat = setInterval(() => {
    if (!closed) res.write(": keep-alive\n\n");
  }, 20000);
  const closeStream = () => {
    if (closed) return;
    closed = true;
    clearInterval(beat);
    unsubscribe();
  };
  req.on("close", closeStream);
  res.on("close", closeStream);

  try {
    const { data: rooms, error } = await supabase.from("rooms").select("room_id");
    if (error) throw error;
    if (closed) return;
    await Promise.all((rooms || []).map(async ({ room_id }) => {
      const reading = await SensorReading.getLatestSensorReading(room_id);
      if (!closed && reading) twinSensorStream.sendSensorReading(res, reading);
    }));
  } catch (error) {
    console.error("Twin sensor stream error:", error);
    if (!closed) {
      res.write(`event: stream-error\ndata: ${JSON.stringify({ error: "Twin sensor stream failed" })}\n\n`);
      closeStream();
      res.end();
    }
  }
};

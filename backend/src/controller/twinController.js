const supabase = require("../config/supabase");
const Bilik = require("../models/Bilik");
const SensorReading = require("../models/SensorReading");
const twinSensorStream = require("../services/twinSensorStream");

// A non-personal label derived from the space type. The stored room names
// contain residents' names (e.g. "Ali Bedroom"); this endpoint is public, so
// we must not leak them. The keyword ("Bedroom"/"Kitchen") is kept because the
// digital-twin layout matches on it to place rooms.
const genericRoomName = (spaceType) => {
  switch (spaceType) {
    case "DAPUR":
      return "Kitchen";
    case "BILIK_ROOM":
      return "Bedroom";
    case "RUAI":
      return "Living Room";
    case "TANJU":
      return "Tanju";
    default:
      return "Room";
  }
};

// Read-only floor layout for the digital twin. Only ids and the bilik/space
// grouping are returned, with generic room labels; no household names or user
// data are exposed.
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
        name: genericRoomName(r.space_type),
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

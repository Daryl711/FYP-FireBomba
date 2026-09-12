const SensorReading = require("../models/SensorReading");

exports.insertSensorReading = async (req, res) => {
  try {
    const {
      room_id,
      flame_detected,
      reading_timestamp,
      temperature,
      humidity,
      smoke,
      co,
    } = req.body || {};


    if (!Number.isInteger(Number(room_id)) || Number(room_id) < 1) {
      return res.status(400).json({ error: "room_id is required and must be a positive integer" });
    }

    const insertedReadingId = await SensorReading.insertSensorReading({
      roomId: Number(room_id),
      timestamp: reading_timestamp,
      flame: flame_detected,
      temperature,
      humidity,
      smoke,
      co,
    });

    return res.status(200).json({
      message: "Sensor reading synced",
      readingId: insertedReadingId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};
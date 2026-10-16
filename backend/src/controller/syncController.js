const SensorReading = require("../models/SensorReading");
const Alert = require("../models/AlertNotification");

const FIRE_ALERT_TITLE = "Fire Detected";
// The Pi syncs a reading every few seconds while a fire burns; one alarm per
// room per window is enough. Kept in memory, so a restart re-arms it.
const FIRE_ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const lastFireAlertAt = new Map();

// MySQL on the Pi sends booleans as 0/1.
const isFlame = (value) =>
  value === true || value === 1 || value === "1" || value === "true";

const raiseFireAlert = async (roomId) => {
  const now = Date.now();
  if (now - (lastFireAlertAt.get(roomId) ?? 0) < FIRE_ALERT_COOLDOWN_MS) return;
  lastFireAlertAt.set(roomId, now);

  try {
    await Alert.createAlert({ roomId, warningTitles: FIRE_ALERT_TITLE });
  } catch (error) {
    // Let the next flame reading retry instead of waiting out the cooldown.
    lastFireAlertAt.delete(roomId);
    console.error("Failed to raise fire alert:", error);
  }
};

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

    // Backlogged readings synced after an outage are history, not a live fire.
    const readingAge = reading_timestamp
      ? Date.now() - new Date(reading_timestamp).getTime()
      : 0;
    if (isFlame(flame_detected) && !(readingAge > FIRE_ALERT_COOLDOWN_MS)) {
      await raiseFireAlert(Number(room_id));
    }

    return res.status(200).json({
      message: "Sensor reading synced",
      readingId: insertedReadingId,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};
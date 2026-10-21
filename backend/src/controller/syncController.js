const SensorReading = require("../models/SensorReading");
const Alert = require("../models/AlertNotification");
const SensorAggregate = require("../models/SensorAggregate");
const sensorAggregateStream = require("../services/sensorAggregateStream");
const { parseSensorTimestamp } = require("../utils/sensorTimestamp");
const sensorReadingStream = require("../services/sensorReadingStream");
const twinSensorStream = require("../services/twinSensorStream");

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
      return res
        .status(400)
        .json({ error: "room_id is required and must be a positive integer" });
    }

    const reading = await SensorReading.insertSensorReading({
      roomId: Number(room_id),
      reading_timestamp,
      flame: flame_detected,
      temperature,
      humidity,
      smoke,
      co,
    });

    sensorReadingStream.publishSensorReading(reading);
    twinSensorStream.publishSensorReading(reading);

    // Backlogged readings synced after an outage are history, not a live fire.
    const readingAge = reading.timestamp
      ? Date.now() - new Date(reading.timestamp).getTime()
      : 0;
    if (isFlame(flame_detected) && !(readingAge > FIRE_ALERT_COOLDOWN_MS)) {
      await raiseFireAlert(Number(room_id));
    }

    return res.status(200).json({
      message: "Sensor reading synced",
      readingId: reading.reading_id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.insertSensorAggregate = async (req, res) => {
  const {
    room_id,
    window_start,
    window_end,
    avg_temperature,
    avg_smoke,
    avg_co,
    avg_humidity,
  } = req.body || {};

  const roomId = Number(room_id);
  const start = parseSensorTimestamp(window_start);
  const end = parseSensorTimestamp(window_end);
  const averages = {
    avg_temperature,
    avg_smoke,
    avg_co,
    avg_humidity,
  };
  const requiredAverageKeys = Object.keys(averages);

  if (
    !Number.isInteger(roomId) ||
    roomId < 1 ||
    !window_start ||
    !window_end ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start ||
    requiredAverageKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(req.body || {}, key),
    ) ||
    Object.values(averages).some(
      (value) =>
        value !== null &&
        value !== undefined &&
        !Number.isFinite(Number(value)),
    )
  ) {
    return res.status(400).json({ error: "Invalid sensor aggregate data" });
  }

  try {
    const aggregate = await SensorAggregate.insertSyncedAggregate({
      room_id: roomId,
      window_start: start.toISOString(),
      window_end: end.toISOString(),
      avg_temperature: avg_temperature === undefined ? null : avg_temperature,
      avg_smoke: avg_smoke === undefined ? null : avg_smoke,
      avg_co: avg_co === undefined ? null : avg_co,
      avg_humidity: avg_humidity === undefined ? null : avg_humidity,
    });
    sensorAggregateStream.publishSensorAggregate(aggregate);

    return res.status(200).json({
      message: "Sensor aggregate synced",
      aggregateId: aggregate.aggregate_id,
    });
  } catch (error) {
    console.error("Error storing sensor aggregate:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

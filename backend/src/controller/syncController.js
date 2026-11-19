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

// The Pi sends up to 50 per batch; leave headroom without allowing huge bodies.
const MAX_BULK_READINGS = 100;
const READING_VALUE_KEYS = ["temperature", "humidity", "smoke", "co"];

// Rooms the calling Pi may write, set by middleware/deviceAuth. With no
// device on the request nothing is allowed.
const allowedRooms = (req) => req.device?.roomIds ?? new Set();
const notAuthorized = (req, roomId) =>
  `room ${roomId} is not authorized for device ${req.device?.id ?? "unknown"}`;

const isPositiveInteger = (value) =>
  Number.isInteger(Number(value)) && Number(value) >= 1;

// Returns { row } ready to insert, or { error } explaining the rejection.
const toReadingRow = (reading) => {
  if (!reading || typeof reading !== "object") {
    return { error: "Reading must be an object" };
  }
  if (!isPositiveInteger(reading.reading_id)) {
    return { error: "reading_id must be a positive integer" };
  }
  if (!isPositiveInteger(reading.room_id)) {
    return { error: "room_id must be a positive integer" };
  }

  // Required: it is part of the duplicate key.
  const timestamp = parseSensorTimestamp(reading.reading_timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return { error: "reading_timestamp is missing or invalid" };
  }

  const row = {
    pi_reading_id: Number(reading.reading_id),
    room_id: Number(reading.room_id),
    timestamp: timestamp.toISOString(),
    flame_detected:
      reading.flame_detected === null || reading.flame_detected === undefined
        ? null
        : isFlame(reading.flame_detected),
  };

  for (const key of READING_VALUE_KEYS) {
    const value = reading[key];
    if (value === null || value === undefined) {
      row[key] = null;
    } else if (Number.isFinite(Number(value))) {
      row[key] = Number(value);
    } else {
      return { error: `${key} must be a number or null` };
    }
  }

  return { row };
};

// Raw sensor readings from the Pi's batched sync.
// Body: { readings: [ <Pi SensorReadings row>, ... ] }
// Reply: { synced: [Pi reading ids], rejected: [{ reading_id, error }] }
// Valid readings are stored even when others in the batch are rejected, and a
// retried batch is safe: readings already stored count as synced again.
exports.insertSensorReadingsBulk = async (req, res) => {
  const readings = req.body?.readings;

  if (
    !Array.isArray(readings) ||
    readings.length === 0 ||
    readings.length > MAX_BULK_READINGS
  ) {
    return res.status(400).json({
      error: `readings must be an array of 1 to ${MAX_BULK_READINGS} items`,
    });
  }

  const rejected = [];
  let rows = [];
  const allowed = allowedRooms(req);

  for (const reading of readings) {
    const { row, error } = toReadingRow(reading);
    if (error) {
      rejected.push({ reading_id: reading?.reading_id ?? null, error });
    } else if (!allowed.has(row.room_id)) {
      rejected.push({ reading_id: row.pi_reading_id, error: notAuthorized(req, row.room_id) });
    } else {
      rows.push(row);
    }
  }

  try {
    const roomIds = [...new Set(rows.map((row) => row.room_id))];
    const existingRooms = await SensorReading.getExistingRoomIds(roomIds);
    rows = rows.filter((row) => {
      if (existingRooms.has(row.room_id)) return true;
      rejected.push({
        reading_id: row.pi_reading_id,
        error: `room ${row.room_id} does not exist`,
      });
      return false;
    });

    // Only newly stored rows come back; retried duplicates are skipped.
    const saved = await SensorReading.insertSensorReadings(rows);

    // Live streams: one update per room (its newest reading), not a flood
    // of history when a backlog drains.
    const newestByRoom = new Map();
    for (const reading of saved) {
      const current = newestByRoom.get(reading.room_id);
      if (!current || new Date(reading.timestamp) > new Date(current.timestamp)) {
        newestByRoom.set(reading.room_id, reading);
      }
    }
    for (const reading of newestByRoom.values()) {
      sensorReadingStream.publishSensorReading(reading);
      twinSensorStream.publishSensorReading(reading);
    }

    // Fire alerts: only recent flames count (a backlog synced after an
    // outage is history, not a live fire), at most one per room.
    const now = Date.now();
    const roomsOnFire = new Set(
      saved
        .filter(
          (reading) =>
            isFlame(reading.flame_detected) &&
            !(now - new Date(reading.timestamp).getTime() > FIRE_ALERT_COOLDOWN_MS),
        )
        .map((reading) => reading.room_id),
    );
    for (const roomId of roomsOnFire) {
      await raiseFireAlert(roomId);
    }

    return res.status(200).json({
      message: "Sensor readings synced",
      synced: rows.map((row) => row.pi_reading_id),
      rejected,
    });
  } catch (error) {
    console.error("Error bulk syncing sensor readings:", error);
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

  if (!allowedRooms(req).has(roomId)) {
    return res.status(403).json({ error: notAuthorized(req, roomId) });
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

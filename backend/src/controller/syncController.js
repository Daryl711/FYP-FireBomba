const SensorReading = require("../models/SensorReading");
const SensorAggregate = require("../models/SensorAggregate");
const sensorReadingStream = require("../services/sensorReadingStream");
const sensorAggregateStream = require("../services/sensorAggregateStream");

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
  const start = new Date(window_start);
  const end = new Date(window_end);
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
      avg_temperature:
        avg_temperature === undefined ? null : avg_temperature,
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
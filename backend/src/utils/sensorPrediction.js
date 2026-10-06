const { parseSensorTimestamp } = require("./sensorTimestamp");

const METRICS = ["avg_temperature", "avg_humidity", "avg_smoke", "avg_co"];
const STEP_MS = 5 * 60 * 1000;

function normalizePrediction(roomId, payload, receivedAt = new Date()) {
  const room = Number(roomId);
  const legacy = Array.isArray(payload);
  const predictions = legacy ? payload : payload?.predictions;
  if (!Number.isInteger(room) || room < 1 || !Array.isArray(predictions) ||
      predictions.length === 0 || predictions.length > 100) {
    throw new Error("Invalid sensor prediction payload");
  }
  // Older Pi versions send only values. Their best available baseline is the
  // completed five-minute boundary at receipt; new versions send the real one.
  const base = legacy
    ? new Date(Math.floor(receivedAt.getTime() / STEP_MS) * STEP_MS)
    : parseSensorTimestamp(payload.base_time);
  const generated = legacy ? receivedAt : parseSensorTimestamp(payload.generated_at);
  if (!Number.isFinite(base.getTime()) || !Number.isFinite(generated.getTime())) {
    throw new Error("Prediction timestamps are required");
  }
  return {
    room_id: room,
    base_time: base.toISOString(),
    generated_at: generated.toISOString(),
    predictions: predictions.map((point, index) => {
      const values = {};
      for (const metric of METRICS) {
        const value = point?.[metric];
        if (value === null || value === undefined || value === "" ||
            !Number.isFinite(Number(value))) {
          throw new Error(`Invalid prediction value: ${metric}`);
        }
        values[metric] = Number(value);
      }
      return {
        ...values,
        forecast_at: new Date(base.getTime() + (index + 1) * STEP_MS).toISOString(),
      };
    }),
  };
}

module.exports = { normalizePrediction };

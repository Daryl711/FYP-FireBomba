const db = require("../config/database");

exports.getLatestReading = async () => {
  const sql = "SELECT * FROM SensorReadings ORDER BY created_at DESC LIMIT 1";
  const [result] = await db.query(sql);

  const roomId = result[0].room_id;
  const flame = result[0].flame_detected;
  const temperature = result[0].temperature;
  const humidity = result[0].humidity;
  const smoke = result[0].smoke;
  const co = result[0].co;

  return {
    roomId,
    flame,
    temperature,
    humidity,
    smoke,
    co,
  };
};

const db = require("../config/database");

// exports.getLatestReading = async () => {
//   const sql = "SELECT * FROM SensorReadings ORDER BY timestamp DESC LIMIT 1";
//   const [result] = await db.query(sql);

//   const roomId = result[0].room_id;
//   const flame = result[0].flame_detected;
//   const temperature = result[0].temperature;
//   const humidity = result[0].humidity;
//   const smoke = result[0].smoke;
//   const co = result[0].co;

//   return {
//     roomId,
//     flame,
//     temperature,
//     humidity,
//     smoke,
//     co,
//   };
// };

exports.insertSensorReading = async (data) => {
  const {
    roomId = null,
    flame = null,
    temperature = null,
    humidity = null,
    smoke = null,
    co = null,
  } = data || {};

  const sql =
    "INSERT INTO SensorReadings (room_id, timestamp, flame_detected, temperature, humidity, smoke, co) VALUES (?, NOW(), ?, ?, ?, ?, ?)";

  const [result] = await db.query(sql, [
    roomId,
    flame,
    temperature,
    humidity,
    smoke,
    co,
  ]);
  return;
};

const db = require("../config/database");

exports.getWaterPumpStatus = async (roomId) => {
  const sql = `
    SELECT activated_status FROM Actuators WHERE room_id = ?
  `;
  const [rows] = await db.query(sql, [roomId]);

  const activationStatus = rows[0].activated_status;
  return activationStatus;
};

exports.updateWaterPumpStatus = async (waterPumpStatus, roomId) => {
  const sql =
    "UPDATE Actuators SET activated_status = ?, last_updated = NOW() WHERE room_id = ?";
  const [result] = await db.query(sql, [waterPumpStatus, roomId]);
  return;
};

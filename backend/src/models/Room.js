const db = require("../config/database");

exports.getRoomData = async (roomId) => {
  const sql = "SELECT * FROM Rooms WHERE room_id = ?";
  const [result] = await db.query(sql, [roomId]);

  const name = result[0].name;
  const status = result[0].status;

  return {
    roomId,
    name,
    status,
  };
};

exports.getCameraStatus = async (roomId) => {
  const sql = `
    SELECT camera_enabled FROM Rooms WHERE room_id = ?
  `;
  const [rows] = await db.query(sql, [roomId]);

  const cameraStatus = rows[0].camera_enabled;
  return cameraStatus;
}

exports.updateCameraStatus = async (cameraStatus, roomId) => {
  const sql =
    "UPDATE Rooms SET camera_enabled = ?, last_updated = NOW() WHERE room_id = ?";
  const [result] = await db.query(sql, [cameraStatus, roomId]);
  return;
};

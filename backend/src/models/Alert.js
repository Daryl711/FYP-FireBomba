const db = require("../config/database");

exports.getAlertsByRoom = async (roomId) => {
  const sql = `
    SELECT an.*, r.name AS room_name
    FROM AlertNotification an
    LEFT JOIN Rooms r ON an.room_id = r.room_id
    WHERE an.room_id = ?
    ORDER BY an.timestamp DESC
  `;
  const [rows] = await db.query(sql, [roomId]);
  return rows;
};

exports.createAlert = async (userId, roomId, sensorType, type, description) => {
  const sql = `
    INSERT INTO alerts (user_id, room_id, sensor_type, type, description)
    VALUES (?, ?, ?, ?, ?)
  `;
  const [result] = await db.query(sql, [userId, roomId, sensorType, type, description]);
  return result.insertId;
};

exports.markRead = async (id, userId) => {
  const sql = "UPDATE AlertNotifications SET is_read = TRUE WHERE id = ? AND room_id = ?";
  const [result] = await db.query(sql, [id, roomId]);
  return result.affectedRows;
};

exports.markAllRead = async (roomId) => {
  const sql = "UPDATE AlertNotifications SET is_read = TRUE WHERE room_id = ?";
  const [result] = await db.query(sql, [roomId]);
  return result.affectedRows;
};

exports.deleteAlert = async (id, userId) => {
  const sql = "DELETE FROM alerts WHERE id = ? AND user_id = ?";
  const [result] = await db.query(sql, [id, userId]);
  return result.affectedRows;
};

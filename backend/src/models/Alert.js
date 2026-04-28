const db = require("../config/database");

exports.getAlertsByUser = async (userId) => {
  const sql = `
    SELECT a.*, r.name AS room_name
    FROM alerts a
    LEFT JOIN rooms r ON a.room_id = r.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
  `;
  const [rows] = await db.query(sql, [userId]);
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
  const sql = "UPDATE alerts SET is_read = TRUE WHERE id = ? AND user_id = ?";
  const [result] = await db.query(sql, [id, userId]);
  return result.affectedRows;
};

exports.markAllRead = async (userId) => {
  const sql = "UPDATE alerts SET is_read = TRUE WHERE user_id = ?";
  const [result] = await db.query(sql, [userId]);
  return result.affectedRows;
};

exports.deleteAlert = async (id, userId) => {
  const sql = "DELETE FROM alerts WHERE id = ? AND user_id = ?";
  const [result] = await db.query(sql, [id, userId]);
  return result.affectedRows;
};

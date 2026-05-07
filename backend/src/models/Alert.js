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

exports.createAlert = async (data) => {
  const { roomId = null, warning_titles = null } = data || {};

  const sql = `
    INSERT INTO AlertNotification (room_id, timestamp, warning_title, is_read)
    VALUES (?, NOW(), ?, FALSE)
  `;

  const [result] = await db.query(sql, [roomId, warningTitle]);




  return result.insertId; 
};

exports.markRead = async (id, roomId) => {
  const sql =
    "UPDATE AlertNotification SET is_read = TRUE WHERE alert_id = ? AND room_id = ?";
  const [result] = await db.query(sql, [id, roomId]);
  return result.affectedRows;
};

exports.markAllRead = async (roomId) => {
  const sql = "UPDATE AlertNotification SET is_read = TRUE WHERE room_id = ?";
  const [result] = await db.query(sql, [roomId]);
  return result.affectedRows;
};

exports.deleteAlert = async (id, userId) => {
  const sql = "DELETE FROM alerts WHERE id = ? AND user_id = ?";
  const [result] = await db.query(sql, [id, userId]);
  return result.affectedRows;
};

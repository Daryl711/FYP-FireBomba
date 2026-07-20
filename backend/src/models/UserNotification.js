const db = require("../config/database");

exports.createUserNotification = async (userId, alertId) => {
  const sql = `
    INSERT INTO UserNotification (user_id, alert_id, is_read, is_hidden, last_updated)
    VALUES (?, ?, FALSE, FALSE, NOW())
  `;
  const [result] = await db.query(sql, [userId, alertId]);
  return result.insertId;
};

exports.markRead = async (userId, alertId) => {
  const sql = `
    UPDATE UserNotification
    SET is_read = TRUE
    WHERE user_id = ? AND alert_id = ?
  `;
  const [result] = await db.query(sql, [userId, alertId]);
  return result.affectedRows;
};

exports.markAllRead = async (userId) => {
  const sql = `
    UPDATE UserNotification
    SET is_read = TRUE
    WHERE user_id = ?
  `;
  const [result] = await db.query(sql, [userId]);
  return result.affectedRows;
};

exports.hideNotification = async (userId, alertId) => {
  const sql = `
    UPDATE UserNotification
    SET is_hidden = TRUE
    WHERE user_id = ? AND alert_id = ?
  `;
  const [result] = await db.query(sql, [userId, alertId]);
  return result.affectedRows;
};

exports.hideAllNotifications = async (userId) => {
  const sql = `
    UPDATE UserNotification
    SET is_hidden = TRUE
    WHERE user_id = ?
  `;
  const [result] = await db.query(sql, [userId]);
  return result.affectedRows;
};

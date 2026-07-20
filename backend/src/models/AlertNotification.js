const db = require("../config/database");
const {
  createUserNotification,
  markRead: markUserNotificationRead,
  markAllRead: markUserNotificationAllRead,
  hideNotification: hideUserNotification,
  hideAllNotifications: hideAllUserNotifications,
} = require("./UserNotification");

exports.getAlertsByUser = async (userId) => {
  const sql = `
    SELECT
      an.alert_id,
      an.room_id,
      an.timestamp,
      an.warning_title,
      r.name AS room_name,
      un.is_read,
      un.is_hidden
    FROM UserNotification un
    JOIN AlertNotification an ON un.alert_id = an.alert_id
    LEFT JOIN Rooms r ON an.room_id = r.room_id
    WHERE un.user_id = ? AND un.is_hidden = FALSE
    ORDER BY an.timestamp DESC
  `;
  const [rows] = await db.query(sql, [userId]);
  return rows;
};

exports.createAlert = async (data) => {
  const { roomId = null, warningTitles = null } = data || {};

  const titles = Array.isArray(warningTitles)
    ? warningTitles
    : warningTitles !== null
      ? [warningTitles]
      : [];

  if (titles.length === 0) return [];

  const sql = `
    INSERT INTO AlertNotification (room_id, timestamp, warning_title, is_read)
    VALUES (?, NOW(), ?, FALSE)
  `;

  const insertIds = [];
  for (const title of titles) {
    const [result] = await db.query(sql, [roomId, title]);
    const alertId = result.insertId;
    insertIds.push(alertId);

    const [userRows] = await db.query(
      "SELECT user_id FROM Users WHERE room_id = ?",
      [roomId],
    );

    for (const userRow of userRows) {
      await createUserNotification(userRow.user_id, alertId);
    }
  }

  return insertIds;
};

exports.markRead = async (id, userId) => {
  return markUserNotificationRead(userId, id);
};

exports.markAllRead = async (userId) => {
  return markUserNotificationAllRead(userId);
};

exports.deleteAlert = async (id, userId) => {
  return hideUserNotification(userId, id);
};

exports.hideAllAlerts = async (userId) => {
  return hideAllUserNotifications(userId);
};

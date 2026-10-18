const supabase = require("../config/supabase");
const {
  createUserNotification,
  markRead: markUserNotificationRead,
  markAllRead: markUserNotificationAllRead,
  hideNotification: hideUserNotification,
  hideAllNotifications: hideAllUserNotifications,
} = require("./UserNotification");
const { sendFireAlarm } = require("../services/pushService");

exports.getAlertsByUser = async (userId) => {
  const { data, error } = await supabase
    .from("user_notifications")
    .select(
      "is_read, is_hidden, alert:alert_id!inner (alert_id, room_id, timestamp, warning_title, room:room_id (name))",
    )
    .eq("user_id", userId)
    .eq("is_hidden", false);

  if (error) {
    throw error;
  }

  // Flattened to the shape the MySQL join used to return. PostgREST cannot
  // order parent rows by an embedded column, so the newest-first sort is here.
  return data
    .map(({ is_read, is_hidden, alert }) => ({
      alert_id: alert.alert_id,
      room_id: alert.room_id,
      timestamp: alert.timestamp,
      warning_title: alert.warning_title,
      room_name: alert.room?.name ?? null,
      is_read,
      is_hidden,
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
};

exports.createAlert = async (data) => {
  const { roomId = null, warningTitles = null } = data || {};

  const titles = Array.isArray(warningTitles)
    ? warningTitles
    : warningTitles !== null
      ? [warningTitles]
      : [];

  if (titles.length === 0) return [];

  // Users belong to a bilik, so everyone in the room's bilik is notified.
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("bilik_id, name")
    .eq("room_id", roomId)
    .maybeSingle();

  if (roomError) {
    throw roomError;
  }

  let userIds = [];
  if (room?.bilik_id != null) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("user_id")
      .eq("bilik_id", room.bilik_id);

    if (usersError) {
      throw usersError;
    }
    userIds = users.map((user) => user.user_id);
  }

  const insertIds = [];
  for (const title of titles) {
    const { data: alert, error } = await supabase
      .from("alert_notifications")
      .insert({ room_id: roomId, warning_title: title })
      .select("alert_id")
      .single();

    if (error) {
      throw error;
    }
    insertIds.push(alert.alert_id);

    for (const userId of userIds) {
      await createUserNotification(userId, alert.alert_id);
    }
  }

  // Rings phones where the app is backgrounded or closed; open apps also
  // pick the alert up through polling and loop the in-app alarm.
  await sendFireAlarm(userIds, {
    title: `🔥 ${titles[0]}`,
    body: `${room?.name ?? "A room"}: ${titles.join(", ")}. Open FireBomba now.`,
    data: { type: "fire", roomId, alertIds: insertIds },
  });

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

// Alerts raised in these rooms since a date - the "Fire Events" stat.
exports.countSince = async (roomIds, since) => {
  if (roomIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("alert_notifications")
    .select("alert_id", { count: "exact", head: true })
    .in("room_id", roomIds)
    .gte("timestamp", since.toISOString());

  if (error) {
    throw error;
  }

  return count ?? 0;
};

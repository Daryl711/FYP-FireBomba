const supabase = require("../config/supabase");

// Every update returns the changed rows so callers can tell "not found" (0)
// apart from success, like MySQL's affectedRows did.
const updateCount = async (query) => {
  const { data, error } = await query.select("user_notification_id");
  if (error) {
    throw error;
  }
  return data.length;
};

exports.createUserNotification = async (userId, alertId) => {
  const { data, error } = await supabase
    .from("user_notifications")
    .insert({ user_id: userId, alert_id: alertId })
    .select("user_notification_id")
    .single();

  if (error) {
    throw error;
  }

  return data.user_notification_id;
};

exports.markRead = (userId, alertId) =>
  updateCount(
    supabase
      .from("user_notifications")
      .update({ is_read: true, last_updated: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("alert_id", alertId),
  );

exports.markAllRead = (userId) =>
  updateCount(
    supabase
      .from("user_notifications")
      .update({ is_read: true, last_updated: new Date().toISOString() })
      .eq("user_id", userId),
  );

exports.hideNotification = (userId, alertId) =>
  updateCount(
    supabase
      .from("user_notifications")
      .update({ is_hidden: true, last_updated: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("alert_id", alertId),
  );

exports.hideAllNotifications = (userId) =>
  updateCount(
    supabase
      .from("user_notifications")
      .update({ is_hidden: true, last_updated: new Date().toISOString() })
      .eq("user_id", userId),
  );

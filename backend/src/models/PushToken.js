const supabase = require("../config/supabase");

// Until migration_alarm_sound_supabase.sql is run the column is missing; fall
// back to the old behaviour so fire pushes keep working with the default sound.
const isMissingAlarmSoundColumn = (error) =>
  ["42703", "PGRST204"].includes(error?.code) &&
  String(error?.message).includes("alarm_sound");

// Re-registering the same device just refreshes the row; signing in to a
// different account on that device moves the token over. alarmSound is the
// tone this device picked (see ALARM_SOUNDS in services/pushService.js).
exports.saveToken = async (userId, token, platform = null, alarmSound = null) => {
  const row = {
    user_id: userId,
    token,
    platform,
    updated_at: new Date().toISOString(),
  };
  if (alarmSound) row.alarm_sound = alarmSound;

  let { error } = await supabase
    .from("push_tokens")
    .upsert(row, { onConflict: "token" });

  if (isMissingAlarmSoundColumn(error)) {
    console.warn("push_tokens.alarm_sound missing - run migration_alarm_sound_supabase.sql");
    delete row.alarm_sound;
    ({ error } = await supabase
      .from("push_tokens")
      .upsert(row, { onConflict: "token" }));
  }

  if (error) {
    throw error;
  }
};

exports.deleteToken = async (userId, token) => {
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("user_id", userId)
    .eq("token", token);

  if (error) {
    throw error;
  }
};

// Expo reports DeviceNotRegistered for uninstalled apps; drop those tokens.
exports.deleteTokens = async (tokens) => {
  if (tokens.length === 0) return;
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .in("token", tokens);

  if (error) {
    throw error;
  }
};

// Resolves to [{ token, alarmSound }]; alarmSound is null when not chosen.
exports.getTokensForUsers = async (userIds) => {
  if (userIds.length === 0) return [];

  let { data, error } = await supabase
    .from("push_tokens")
    .select("token, alarm_sound")
    .in("user_id", userIds);

  if (isMissingAlarmSoundColumn(error)) {
    ({ data, error } = await supabase
      .from("push_tokens")
      .select("token")
      .in("user_id", userIds));
  }

  if (error) {
    throw error;
  }

  return data.map((row) => ({ token: row.token, alarmSound: row.alarm_sound ?? null }));
};

// The device's row if it is registered to this account, else null.
exports.getUserToken = async (userId, token) => {
  let { data, error } = await supabase
    .from("push_tokens")
    .select("token, alarm_sound")
    .eq("user_id", userId)
    .eq("token", token)
    .maybeSingle();

  if (isMissingAlarmSoundColumn(error)) {
    ({ data, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .eq("token", token)
      .maybeSingle());
  }

  if (error) {
    throw error;
  }

  return data ? { token: data.token, alarmSound: data.alarm_sound ?? null } : null;
};

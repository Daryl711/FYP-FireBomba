const supabase = require("../config/supabase");

// Absolute session deadlines for biometric login. See user_sessions in
// sql/migration_sms_otp_biometric_supabase.sql.

exports.create = async (sessionId, userId, rememberMe, expiresAt) => {
  const { error } = await supabase.from("user_sessions").upsert({
    session_id: sessionId,
    user_id: userId,
    remember_me: rememberMe,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
};

exports.find = async (sessionId) => {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

exports.deleteById = async (sessionId) => {
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("session_id", sessionId);
  if (error) throw error;
};

// Without a row, /refresh refuses the session - so this ends every session
// the user has open (used after a password reset).
exports.deleteByUserId = async (userId) => {
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("user_id", userId);
  if (error) throw error;
};

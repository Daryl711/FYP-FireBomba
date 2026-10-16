const supabase = require("../config/supabase");

// Re-registering the same device just refreshes the row; signing in to a
// different account on that device moves the token over.
exports.saveToken = async (userId, token, platform = null) => {
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

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

exports.getTokensForUsers = async (userIds) => {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("push_tokens")
    .select("token")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return data.map((row) => row.token);
};

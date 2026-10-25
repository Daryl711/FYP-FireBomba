const supabase = require("../config/supabase");

// New accounts join this bilik until signup lets the user pick one
// (the MySQL version put everyone in room 1).
const DEFAULT_BILIK_ID = 1;

// Fire alarms reach every account, regardless of household or role. Page through
// profiles so the database response limit cannot silently omit recipients.
exports.getAllUserIds = async () => {
  const pageSize = 500;
  const userIds = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("users")
      .select("user_id")
      .order("user_id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    userIds.push(...data.map((user) => user.user_id));
    if (data.length < pageSize) return userIds;
  }
};

exports.checkEmail = async (email) => {
  const { data, error } = await supabase
    .from("users")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
};

// Creates the Supabase Auth account and its public.users profile. If the
// profile insert fails the auth account is removed again, so a half-made user
// cannot sign in to a "User profile not found" error.
exports.addUser = async (fullName, email, password, phone = null, bilikId = DEFAULT_BILIK_ID) => {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    throw error;
  }

  const userId = data.user.id;

  const { error: profileError } = await supabase.from("users").insert({
    user_id: userId,
    email,
    phone,
    full_name: fullName,
    role: "user",
    bilik_id: bilikId,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    throw profileError;
  }

  return userId;
};

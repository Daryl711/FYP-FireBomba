const supabase = require("../config/supabase");

// Reads the public.users profile row that sits beside each auth.users account.

const one = async (query) => {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
};

exports.getById = (userId) =>
  one(supabase.from("users").select("*").eq("user_id", userId));

exports.getByEmail = (email) =>
  one(supabase.from("users").select("*").eq("email", email));

exports.getByPhone = (phone) =>
  one(supabase.from("users").select("*").eq("phone", phone));

exports.markPhoneVerified = async (userId) => {
  const { error } = await supabase
    .from("users")
    .update({ phone_verified: true })
    .eq("user_id", userId);
  if (error) throw error;
};

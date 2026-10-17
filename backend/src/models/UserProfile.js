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

// Normalises 012-345 6789 / +60123456789 / 60123456789 to a single stored form.
const normalisePhone = (phone) => {
  if (!phone) {
    return null;
  }

  const digits = String(phone).replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    return digits;
  }
  if (digits.startsWith("0")) {
    return "+60" + digits.slice(1);
  }
  if (digits.startsWith("60")) {
    return "+" + digits;
  }
  return digits;
};
exports.normalisePhone = normalisePhone;

// Checks a phone AFTER normalisePhone: optional +, then 8-15 digits.
exports.isValidPhone = (phone) => /^\+?\d{8,15}$/.test(phone);

// Login accepts an email OR a phone number in one field. Anything containing
// "@" is an email; everything else is looked up by phone.
exports.getByIdentifier = (rawIdentifier) =>
  String(rawIdentifier).includes("@")
    ? exports.getByEmail(String(rawIdentifier).trim().toLowerCase())
    : exports.getByPhone(normalisePhone(rawIdentifier));

// fields uses column names, e.g. { full_name, phone, phone_verified }.
exports.updateById = async (userId, fields) => {
  const { data, error } = await supabase
    .from("users")
    .update(fields)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

exports.markPhoneVerified = async (userId) => {
  const { error } = await supabase
    .from("users")
    .update({ phone_verified: true })
    .eq("user_id", userId);
  if (error) throw error;
};

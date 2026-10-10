const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const supabase = require("../config/supabase");

// Development helper: when OTP_DEV_CODE is set, every generated code is that
// fixed value, so you can test login without reading the console each time.
// Deliberately refuses to activate while real SMS is enabled - a predictable
// code plus real delivery would be a genuine account-takeover hole.
const DEV_CODE = process.env.OTP_DEV_CODE || null;
const SMS_ENABLED = process.env.SMS_ENABLED === "true";

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
// Every code is one SMS, and every SMS costs money. Caps what one account can
// trigger per 24h across login, resend and password reset combined.
const DAILY_SMS_LIMIT = Number(process.env.SMS_DAILY_LIMIT_PER_USER || 10);
const DAY_MS = 24 * 60 * 60 * 1000;

const isAllDigits = (value) => /^[0-9]+$/.test(value);

const devCodeUsable =
  Boolean(DEV_CODE) &&
  !SMS_ENABLED &&
  DEV_CODE.length === OTP_LENGTH &&
  isAllDigits(DEV_CODE);

if (DEV_CODE && !devCodeUsable) {
  console.error(
    SMS_ENABLED
      ? "OTP_DEV_CODE ignored: it cannot be used while SMS_ENABLED=true."
      : `OTP_DEV_CODE ignored: it must be exactly ${OTP_LENGTH} digits.`
  );
}

// crypto.randomInt is cryptographically secure - Math.random is not.
const generateCode = () => {
  if (devCodeUsable) {
    return DEV_CODE;
  }

  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, "0");
};

const consume = async (otpId) => {
  const { error } = await supabase
    .from("otp_codes")
    .update({ consumed_at: new Date().toISOString(), pending_session: null })
    .eq("otp_id", otpId);
  if (error) throw error;
};

const getActive = async (userId, purpose) => {
  const { data, error } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
};

// Invalidate any outstanding codes so only the newest one works. Returns the
// pending sessions those codes were holding so the caller can revoke them.
exports.invalidateActive = async (userId, purpose) => {
  const active = await getActive(userId, purpose);
  const dropped = active.map((row) => row.pending_session).filter(Boolean);
  for (const row of active) {
    await consume(row.otp_id);
  }
  return dropped;
};

exports.isInCooldown = async (userId, purpose) => {
  const { data, error } = await supabase
    .from("otp_codes")
    .select("created_at")
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  if (data.length === 0) {
    return { inCooldown: false, retryAfter: 0 };
  }

  const elapsedSeconds =
    (Date.now() - new Date(data[0].created_at).getTime()) / 1000;
  const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);

  return { inCooldown: retryAfter > 0, retryAfter: Math.max(retryAfter, 0) };
};

// Counts codes issued in the last 24h. create() deletes anything older, so the
// table never holds more than this window per user.
exports.isOverDailyLimit = async (userId) => {
  const { count, error } = await supabase
    .from("otp_codes")
    .select("otp_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - DAY_MS).toISOString());
  if (error) throw error;

  return count >= DAILY_SMS_LIMIT;
};

// Returns the PLAINTEXT code so the caller can SMS it. Only the hash is stored.
//
// pendingSession is the Supabase session parked until the code is verified.
// Pass carryPending: true on a resend so the new code keeps holding the
// session the first code was holding. Any session that is dropped instead is
// returned in droppedSessions so the caller can revoke it.
exports.create = async (
  userId,
  purpose,
  destination,
  { pendingSession = null, carryPending = false } = {}
) => {
  const active = await getActive(userId, purpose);

  let parked = pendingSession;
  if (carryPending && active.length > 0) {
    parked = active[0].pending_session;
  }

  // Collected before consume(), which clears pending_session on these rows.
  const droppedSessions = active
    .map((row) => row.pending_session)
    .filter((session) => session && session !== parked);

  for (const row of active) {
    await consume(row.otp_id);
  }

  // Housekeeping: nothing older than a day is ever needed again.
  await supabase
    .from("otp_codes")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", new Date(Date.now() - DAY_MS).toISOString());

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const { error } = await supabase.from("otp_codes").insert({
    user_id: userId,
    code_hash: codeHash,
    purpose,
    destination,
    pending_session: parked,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;

  return { code, expiresAt, droppedSessions };
};

// Verifies and consumes in one step: a valid code can never be reused.
// On success returns the parked session (login) so it can be released.
exports.verify = async (userId, purpose, code) => {
  const active = await getActive(userId, purpose);

  if (active.length === 0) {
    return { valid: false, reason: "no_active_code" };
  }

  // A copy, so pending_session is still readable after consume() clears it.
  const record = { ...active[0] };

  if (new Date() > new Date(record.expires_at)) {
    await consume(record.otp_id);
    return {
      valid: false,
      reason: "expired",
      droppedSession: record.pending_session,
    };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await consume(record.otp_id);
    return {
      valid: false,
      reason: "too_many_attempts",
      droppedSession: record.pending_session,
    };
  }

  const codeMatch = await bcrypt.compare(String(code), record.code_hash);

  if (!codeMatch) {
    const attempts = record.attempts + 1;
    const { error } = await supabase
      .from("otp_codes")
      .update({ attempts })
      .eq("otp_id", record.otp_id);
    if (error) throw error;

    return { valid: false, reason: "incorrect", attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  await consume(record.otp_id);
  return { valid: true, pendingSession: record.pending_session };
};

module.exports.OTP_TTL_MINUTES = OTP_TTL_MINUTES;
module.exports.RESEND_COOLDOWN_SECONDS = RESEND_COOLDOWN_SECONDS;

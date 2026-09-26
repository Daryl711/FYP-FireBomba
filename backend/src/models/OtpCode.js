const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../config/database");

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

if (devCodeUsable) {
  console.warn("=============================================================");
  console.warn(`  OTP_DEV_CODE is active - every code will be ${DEV_CODE}`);
  console.warn("  For development only. Clear it in .env before any demo");
  console.warn("  that uses real SMS.");
  console.warn("=============================================================");
}

// crypto.randomInt is cryptographically secure - Math.random is not.
const generateCode = () => {
  if (devCodeUsable) {
    return DEV_CODE;
  }

  const max = 10 ** OTP_LENGTH;
  return String(crypto.randomInt(0, max)).padStart(OTP_LENGTH, "0");
};

// Invalidate any outstanding codes so only the newest one works.
exports.invalidateActive = async (userId, purpose) => {
  const sql = `
    UPDATE OtpCodes
    SET consumed_at = NOW()
    WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
  `;
  await db.query(sql, [userId, purpose]);
};

exports.getLastSentAt = async (userId, purpose) => {
  const sql = `
    SELECT created_at FROM OtpCodes
    WHERE user_id = ? AND purpose = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const [result] = await db.query(sql, [userId, purpose]);

  return result.length > 0 ? new Date(result[0].created_at) : null;
};

exports.isInCooldown = async (userId, purpose) => {
  const lastSentAt = await exports.getLastSentAt(userId, purpose);
  if (!lastSentAt) {
    return { inCooldown: false, retryAfter: 0 };
  }

  const elapsedSeconds = (Date.now() - lastSentAt.getTime()) / 1000;
  const retryAfter = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds);

  return { inCooldown: retryAfter > 0, retryAfter: Math.max(retryAfter, 0) };
};

// Returns the PLAINTEXT code so the caller can SMS it. Only the hash is stored.
exports.create = async (userId, purpose, destination) => {
  await exports.invalidateActive(userId, purpose);

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const sql = `
    INSERT INTO OtpCodes (user_id, code_hash, purpose, destination, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `;
  await db.query(sql, [userId, codeHash, purpose, destination, expiresAt]);

  return { code, expiresAt };
};

// Verifies and consumes in one step: a valid code can never be reused.
exports.verify = async (userId, purpose, code) => {
  const sql = `
    SELECT * FROM OtpCodes
    WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const [result] = await db.query(sql, [userId, purpose]);

  if (result.length === 0) {
    return { valid: false, reason: "no_active_code" };
  }

  const record = result[0];

  if (new Date() > new Date(record.expires_at)) {
    await db.query("UPDATE OtpCodes SET consumed_at = NOW() WHERE otp_id = ?", [record.otp_id]);
    return { valid: false, reason: "expired" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await db.query("UPDATE OtpCodes SET consumed_at = NOW() WHERE otp_id = ?", [record.otp_id]);
    return { valid: false, reason: "too_many_attempts" };
  }

  const codeMatch = await bcrypt.compare(String(code), record.code_hash);

  if (!codeMatch) {
    await db.query("UPDATE OtpCodes SET attempts = attempts + 1 WHERE otp_id = ?", [record.otp_id]);
    const attemptsLeft = MAX_ATTEMPTS - (record.attempts + 1);
    return { valid: false, reason: "incorrect", attemptsLeft };
  }

  await db.query("UPDATE OtpCodes SET consumed_at = NOW() WHERE otp_id = ?", [record.otp_id]);
  return { valid: true };
};

exports.deleteExpired = async () => {
  const sql = "DELETE FROM OtpCodes WHERE expires_at < NOW() - INTERVAL 1 DAY";
  const [result] = await db.query(sql);
  return result.affectedRows;
};

module.exports.OTP_TTL_MINUTES = OTP_TTL_MINUTES;
module.exports.RESEND_COOLDOWN_SECONDS = RESEND_COOLDOWN_SECONDS;

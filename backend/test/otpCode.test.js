const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const { load, plain } = require("./helpers/load");
const { fakeSupabase } = require("./helpers/fakeSupabase");

// Loads the real OtpCode model on top of a fake otp_codes table.
function otp({ rows = [], env = {} } = {}) {
  const db = fakeSupabase({ otp_codes: rows });
  const model = load("models/OtpCode.js", {
    crypto, bcryptjs: bcrypt, "../config/supabase": db.client,
  }, { env });
  return { model, db, codes: () => db.rows("otp_codes") };
}
const secondsAgo = (seconds) => new Date(Date.now() - seconds * 1000).toISOString();
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60 * 1000).toISOString();

// ---------- Creating a code ----------

test("a new code is 6 digits, stored only as a hash, and expires in 5 minutes", async () => {
  const { model, codes } = otp();
  const before = Date.now();
  const { code, expiresAt } = await model.create("user-1", "login", "a@b.com");
  assert.match(code, /^\d{6}$/);
  const [row] = codes();
  assert.equal(row.user_id, "user-1");
  assert.equal(row.purpose, "login");
  assert.notEqual(row.code_hash, code, "the plain code must never be saved");
  assert.ok(await bcrypt.compare(code, row.code_hash));
  const ttl = new Date(row.expires_at).getTime() - before;
  assert.ok(ttl > 4.9 * 60 * 1000 && ttl <= 5 * 60 * 1000 + 1000);
  assert.equal(new Date(expiresAt).toISOString(), row.expires_at);
});

test("requesting a new code cancels older codes and returns their parked sessions", async () => {
  const { model, codes } = otp();
  await model.create("user-1", "login", "a@b.com", { pendingSession: { access_token: "old" } });
  const { droppedSessions } = await model.create("user-1", "login", "a@b.com", { pendingSession: { access_token: "new" } });
  assert.deepEqual(plain(droppedSessions), [{ access_token: "old" }]);
  const active = codes().filter((row) => row.consumed_at === null);
  assert.equal(active.length, 1, "only the newest code may work");
  assert.deepEqual(plain(active[0].pending_session), { access_token: "new" });
});

test("a resend keeps holding the session the first code was holding", async () => {
  const { model, codes } = otp();
  await model.create("user-1", "login", "+60123456789", { pendingSession: { access_token: "parked" } });
  const { droppedSessions } = await model.create("user-1", "login", "+60123456789", { carryPending: true });
  assert.deepEqual(plain(droppedSessions), []);
  const active = codes().find((row) => row.consumed_at === null);
  assert.deepEqual(plain(active.pending_session), { access_token: "parked" });
});

test("codes for one purpose never cancel codes for another purpose or user", async () => {
  const { model, codes } = otp();
  await model.create("user-1", "reset", "a@b.com");
  await model.create("user-2", "login", "c@d.com");
  await model.create("user-1", "login", "a@b.com");
  assert.equal(codes().filter((row) => row.consumed_at === null).length, 3);
});

test("rows older than a day are cleaned up when a new code is made", async () => {
  const { model, codes } = otp({ rows: [
    { otp_id: 90, user_id: "user-1", purpose: "login", created_at: secondsAgo(25 * 3600), consumed_at: secondsAgo(25 * 3600) },
    { otp_id: 91, user_id: "user-2", purpose: "login", created_at: secondsAgo(25 * 3600), consumed_at: secondsAgo(25 * 3600) },
  ] });
  await model.create("user-1", "login", "a@b.com");
  assert.deepEqual(codes().map((row) => row.user_id).sort(), ["user-1", "user-2"], "only user-1's old row is removed");
});

test("the fixed developer code is used only for SMS, only with 6 digits, and never with real SMS", async () => {
  const phone = "+60123456789";
  assert.equal((await otp({ env: { OTP_DEV_CODE: "123456" } }).model.create("u", "login", phone)).code, "123456");
  const emailCode = (await otp({ env: { OTP_DEV_CODE: "123456" } }).model.create("u", "login", "a@b.com")).code;
  assert.match(emailCode, /^\d{6}$/);
  for (const env of [{ OTP_DEV_CODE: "123456", SMS_ENABLED: "true" }, { OTP_DEV_CODE: "12345" }, { OTP_DEV_CODE: "abcdef" }]) {
    // A random code could equal 123456 by chance, so try a few times.
    const results = new Set();
    for (let i = 0; i < 3; i += 1) results.add((await otp({ env }).model.create("u", "login", phone)).code);
    assert.ok(![...results].every((code) => code === "123456"), `${JSON.stringify(env)} must not use the developer code`);
  }
});

// ---------- Checking a code ----------

test("the right code is accepted once, and returns the parked session and destination", async () => {
  const { model } = otp();
  const { code } = await model.create("user-1", "login", "+60123456789", { pendingSession: { access_token: "p" } });
  const result = plain(await model.verify("user-1", "login", code));
  assert.deepEqual(result, { valid: true, pendingSession: { access_token: "p" }, destination: "+60123456789" });
  assert.deepEqual(plain(await model.verify("user-1", "login", code)), { valid: false, reason: "no_active_code" }, "a used code cannot be reused");
});

test("a wrong code counts down the attempts left", async () => {
  const { model, codes } = otp();
  const { code } = await model.create("user-1", "login", "a@b.com");
  const wrong = code === "000000" ? "111111" : "000000";
  for (const left of [4, 3, 2, 1, 0]) {
    assert.deepEqual(plain(await model.verify("user-1", "login", wrong)), { valid: false, reason: "incorrect", attemptsLeft: left });
  }
  assert.equal(codes()[0].attempts, 5);
});

test("after 5 wrong tries even the right code is refused and the code is cancelled", async () => {
  const { model, codes } = otp();
  const { code } = await model.create("user-1", "login", "a@b.com", { pendingSession: { access_token: "p" } });
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i += 1) await model.verify("user-1", "login", wrong);
  const result = plain(await model.verify("user-1", "login", code));
  assert.equal(result.reason, "too_many_attempts");
  assert.deepEqual(result.droppedSession, { access_token: "p" });
  assert.notEqual(codes()[0].consumed_at, null);
});

test("an expired code is refused and cancelled, and its parked session is handed back", async () => {
  const { model, codes } = otp({ rows: [{
    otp_id: 1, user_id: "user-1", purpose: "login", code_hash: await bcrypt.hash("123456", 4),
    attempts: 0, consumed_at: null, created_at: secondsAgo(400), expires_at: minutesFromNow(-1),
    pending_session: { access_token: "p" }, destination: "a@b.com",
  }] });
  const result = plain(await model.verify("user-1", "login", "123456"));
  assert.deepEqual(result, { valid: false, reason: "expired", droppedSession: { access_token: "p" } });
  assert.notEqual(codes()[0].consumed_at, null);
});

test("checking with no code requested says so", async () => {
  const { model } = otp();
  assert.deepEqual(plain(await model.verify("user-1", "login", "123456")), { valid: false, reason: "no_active_code" });
});

test("a code made for login cannot be used for a password reset", async () => {
  const { model } = otp();
  const { code } = await model.create("user-1", "login", "a@b.com");
  assert.equal(plain(await model.verify("user-1", "reset", code)).reason, "no_active_code");
});

// ---------- Limits ----------

test("a new code cannot be requested within 60 seconds of the last one", async () => {
  const row = (seconds) => ({ otp_id: 1, user_id: "user-1", purpose: "login", created_at: secondsAgo(seconds) });
  assert.deepEqual(plain(await otp().model.isInCooldown("user-1", "login")), { inCooldown: false, retryAfter: 0 });
  assert.deepEqual(plain(await otp({ rows: [row(30)] }).model.isInCooldown("user-1", "login")), { inCooldown: true, retryAfter: 30 });
  assert.deepEqual(plain(await otp({ rows: [row(61)] }).model.isInCooldown("user-1", "login")), { inCooldown: false, retryAfter: 0 });
  assert.equal((await otp({ rows: [row(30)] }).model.isInCooldown("user-1", "reset")).inCooldown, false, "cooldown is per purpose");
});

test("at most 10 codes per user per day, counting only the last 24 hours", async () => {
  const rows = (count, ageSeconds, userId = "user-1") =>
    Array.from({ length: count }, (_, i) => ({ otp_id: i + 1, user_id: userId, purpose: "login", created_at: secondsAgo(ageSeconds) }));
  assert.equal(await otp({ rows: rows(9, 60) }).model.isOverDailyLimit("user-1"), false);
  assert.equal(await otp({ rows: rows(10, 60) }).model.isOverDailyLimit("user-1"), true);
  assert.equal(await otp({ rows: rows(10, 25 * 3600) }).model.isOverDailyLimit("user-1"), false, "older codes do not count");
  assert.equal(await otp({ rows: rows(10, 60, "user-2") }).model.isOverDailyLimit("user-1"), false, "other users do not count");
  assert.equal(await otp({ rows: rows(3, 60), env: { SMS_DAILY_LIMIT_PER_USER: "3" } }).model.isOverDailyLimit("user-1"), true);
});

test("cancelling active codes returns the sessions they were holding", async () => {
  const { model, codes } = otp();
  await model.create("user-1", "login", "a@b.com", { pendingSession: { access_token: "p" } });
  await model.create("user-1", "reset", "a@b.com");
  assert.deepEqual(plain(await model.invalidateActive("user-1", "login")), [{ access_token: "p" }]);
  assert.deepEqual(codes().map((row) => [row.purpose, row.consumed_at === null]), [["login", false], ["reset", true]]);
});

test("database errors are thrown, never treated as a valid or missing code", async () => {
  const { model, db } = otp();
  db.failWith = new Error("database down");
  for (const call of [
    () => model.verify("user-1", "login", "123456"),
    () => model.create("user-1", "login", "a@b.com"),
    () => model.isInCooldown("user-1", "login"),
    () => model.isOverDailyLimit("user-1"),
  ]) {
    await assert.rejects(call(), /database down/);
  }
});

test("destinations with @ are emails and everything else is a phone", () => {
  const { model } = otp();
  assert.equal(model.isEmailDestination("a@b.com"), true);
  assert.equal(model.isEmailDestination("+60123456789"), false);
});

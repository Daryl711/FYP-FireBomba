const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, plain, response } = require("./helpers/load");
const { fakeSupabase } = require("./helpers/fakeSupabase");

// ---------- Phone number helpers (UserProfile model) ----------

const userTable = () => fakeSupabase({ users: [
  { user_id: "u1", email: "alice@mail.com", phone: "+60123456789", full_name: "Alice" },
] });
const profileModel = (db = userTable()) => ({ db, model: load("models/UserProfile.js", { "../config/supabase": db.client }) });

test("Malaysian phone numbers in any common format are saved the same way", () => {
  const { model } = profileModel();
  for (const input of ["012-345 6789", "0123456789", "60123456789", "+60123456789", "+60 12-345 6789"]) {
    assert.equal(model.normalisePhone(input), "+60123456789", input);
  }
  assert.equal(model.normalisePhone(""), null);
  assert.equal(model.normalisePhone(null), null);
});

test("a valid phone has 8 to 15 digits with an optional +", () => {
  const { model } = profileModel();
  for (const ok of ["+60123456789", "12345678", "+123456789012345"]) assert.equal(model.isValidPhone(ok), true, ok);
  for (const bad of ["1234567", "+1234567890123456", "+6012abc6789", "", "++60123456789"]) assert.equal(model.isValidPhone(bad), false, bad);
});

test("one login field finds an account by email (any case) or by phone (any format)", async () => {
  const { model } = profileModel();
  assert.equal((await model.getByIdentifier("  ALICE@Mail.com ")).user_id, "u1");
  assert.equal((await model.getByIdentifier("012-345 6789")).user_id, "u1");
  assert.equal(await model.getByIdentifier("nobody@mail.com"), null);
});

test("updating a profile changes only that user's row", async () => {
  const db = fakeSupabase({ users: [{ user_id: "u1", full_name: "Alice" }, { user_id: "u2", full_name: "Bob" }] });
  const { model } = profileModel(db);
  const updated = await model.updateById("u1", { full_name: "Alicia" });
  assert.equal(updated.full_name, "Alicia");
  await model.markPhoneVerified("u1");
  assert.deepEqual(plain(db.rows("users")), [{ user_id: "u1", full_name: "Alicia", phone_verified: true }, { user_id: "u2", full_name: "Bob" }]);
});

// ---------- Profile controller ----------

const ALICE = { user_id: "u1", full_name: "Alice", email: "alice@mail.com", phone: "+60123456789", phone_verified: true, created_at: "2026-01-01" };
const BOB = { user_id: "u2", full_name: "Bob", email: "bob@mail.com", phone: "+60199999999", phone_verified: false };

function profile({ me = ALICE, others = [BOB], otp = {}, updateError = null } = {}) {
  const log = [];
  const real = profileModel().model;
  let current = { ...me };
  const api = load("controller/profileController.js", {
    "../models/UserProfile": {
      normalisePhone: real.normalisePhone, isValidPhone: real.isValidPhone,
      getById: async () => ({ ...current }),
      getByPhone: async (phone) => [current, ...others].find((u) => u.phone === phone) ?? null,
      updateById: async (id, changes) => { log.push(["update", id, changes]); if (updateError) throw updateError; current = { ...current, ...changes }; return current; },
      markPhoneVerified: async (id) => log.push(["verified", id]),
    },
    "../models/OtpCode": {
      OTP_TTL_MINUTES: 5, RESEND_COOLDOWN_SECONDS: 60,
      invalidateActive: async (id, purpose) => log.push(["codesCancelled", id, purpose]),
      isInCooldown: async () => otp.cooldown ?? { inCooldown: false, retryAfter: 0 },
      isOverDailyLimit: async () => otp.overLimit ?? false,
      create: async (id, purpose, destination) => { log.push(["codeCreated", id, purpose, destination]); return { code: "111222" }; },
      verify: async (id, purpose, code) => { log.push(["codeChecked", id, purpose, code]); return otp.result ?? { valid: true, destination: current.phone }; },
    },
    "../services/smsService": { sendOtpSms: async (to, code, purpose) => log.push(["sms", to, code, purpose]) },
    "../models/FireSafetyProgress": {},
  });
  const call = async (name, body) => { const res = response(); await api[name]({ body, user: { userId: me.user_id } }, res); return res; };
  const did = (kind) => plain(log.filter((entry) => entry[0] === kind));
  return { call, did };
}

test("the profile is returned in the app's format", async () => {
  const res = await profile({ me: { ...ALICE, phone: undefined, phone_verified: null, created_at: undefined } }).call("getProfile");
  assert.deepEqual(res.body, { fullName: "Alice", email: "alice@mail.com", phone: null, phoneVerified: false, createdAt: null });
});

test("a name must not be blank or longer than 100 characters, and is trimmed", async () => {
  for (const fullName of ["", "   ", "x".repeat(101)]) {
    const { call, did } = profile();
    assert.equal((await call("updateProfile", { fullName })).code, 400);
    assert.equal(did("update").length, 0);
  }
  const { call, did } = profile();
  const res = await call("updateProfile", { fullName: "  Alicia  " });
  assert.equal(res.body.fullName, "Alicia");
  assert.deepEqual(did("update"), [["update", "u1", { full_name: "Alicia" }]]);
});

test("a phone must be valid and not belong to someone else", async () => {
  for (const [phone, error] of [["123", "Invalid phone number"], ["019-999 9999", "Phone number already registered"]]) {
    const { call, did } = profile();
    const res = await call("updateProfile", { phone });
    assert.deepEqual([res.code, res.body.error], [400, error]);
    assert.equal(did("update").length, 0);
  }
});

test("a new phone number must be verified again and old verify codes are cancelled", async () => {
  const { call, did } = profile();
  const res = await call("updateProfile", { phone: "011-1111 2222" });
  assert.equal(res.code, 200);
  assert.deepEqual(did("update"), [["update", "u1", { phone: "+601111112222", phone_verified: false }]]);
  assert.deepEqual(did("codesCancelled"), [["codesCancelled", "u1", "verify_phone"]]);
  assert.equal(res.body.phoneVerified, false);
});

test("saving the same number in another format keeps it verified", async () => {
  const { call, did } = profile();
  const res = await call("updateProfile", { phone: "012-345 6789" });
  assert.equal(res.body.phoneVerified, true);
  assert.equal(did("update").length, 0, "nothing changed, so nothing is written");
});

test("a blank phone removes the number", async () => {
  const { call, did } = profile();
  await call("updateProfile", { phone: "" });
  assert.deepEqual(did("update"), [["update", "u1", { phone: null, phone_verified: false }]]);
});

test("two people saving the same number at once: the database duplicate error becomes a clear 400", async () => {
  const res = await profile({ updateError: Object.assign(new Error("dup"), { code: "23505" }) }).call("updateProfile", { phone: "011-1111 2222" });
  assert.deepEqual([res.code, res.body.error], [400, "Phone number already registered"]);
});

// ---------- Phone verification ----------

test("a verify code is only sent when there is an unverified phone and no limit is hit", async () => {
  const cases = [
    [{ me: { ...ALICE, phone: null } }, 400, "No phone number on file"],
    [{ me: ALICE }, 400, "Phone number is already verified"],
    [{ me: BOB, otp: { cooldown: { inCooldown: true, retryAfter: 20 } } }, 429, "Please wait 20s before requesting another code"],
    [{ me: BOB, otp: { overLimit: true } }, 429, "Too many codes today, please try again tomorrow"],
  ];
  for (const [options, code, error] of cases) {
    const { call, did } = profile({ others: [], ...options });
    const res = await call("sendPhoneCode");
    assert.deepEqual([res.code, res.body.error], [code, error]);
    assert.equal(did("sms").length, 0);
  }
});

test("a verify code is sent by SMS to the phone on file", async () => {
  const { call, did } = profile({ me: BOB, others: [] });
  const res = await call("sendPhoneCode");
  assert.deepEqual(res.body, { message: "Code sent", expiresInMinutes: 5, resendAfter: 60 });
  assert.deepEqual(did("codeCreated"), [["codeCreated", "u2", "verify_phone", "+60199999999"]]);
  assert.deepEqual(did("sms"), [["sms", "+60199999999", "111222", "verify_phone"]]);
});

test("checking a verify code maps each failure to the right status", async () => {
  assert.equal((await profile({ me: BOB, others: [] }).call("verifyPhoneCode", {})).code, 400);
  for (const [result, code] of [
    [{ valid: false, reason: "expired" }, 400], [{ valid: false, reason: "too_many_attempts" }, 429],
    [{ valid: false, reason: "no_active_code" }, 400], [{ valid: false, reason: "incorrect", attemptsLeft: 1 }, 401],
  ]) {
    const { call, did } = profile({ me: BOB, others: [], otp: { result } });
    const res = await call("verifyPhoneCode", { code: "000000" });
    assert.equal(res.code, code, result.reason);
    assert.equal(did("verified").length, 0);
  }
});

test("a right code only verifies the phone it was sent to", async () => {
  let { call, did } = profile({ me: BOB, others: [], otp: { result: { valid: true, destination: "+60111111111" } } });
  let res = await call("verifyPhoneCode", { code: "111222" });
  assert.deepEqual([res.code, res.body.error], [400, "Phone number changed, please request a new code"]);
  assert.equal(did("verified").length, 0);
  ({ call, did } = profile({ me: BOB, others: [] }));
  res = await call("verifyPhoneCode", { code: "111222" });
  assert.equal(res.code, 200);
  assert.equal(res.body.phoneVerified, true);
  assert.deepEqual(did("verified"), [["verified", "u2"]]);
});

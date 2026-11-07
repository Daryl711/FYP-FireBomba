const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { load, plain, response } = require("./helpers/load");

const OTP_SECRET = "test_otp_secret";
const DAY = 24 * 60 * 60 * 1000;
const realPhone = load("models/UserProfile.js", { "../config/supabase": {} });

// A Supabase access token always carries the id of its login session.
const accessToken = (sessionId) => jwt.sign({ session_id: sessionId }, "supabase");
const session = (sessionId = "s1") => ({ access_token: accessToken(sessionId), refresh_token: `refresh-${sessionId}`, expires_at: 123 });
const ALICE = { user_id: "u1", full_name: "Alice", email: "alice@mail.com", phone: "+60123456789", bilik_id: 3 };
const NO_PHONE = { user_id: "u2", full_name: "Bob", email: "bob@mail.com", phone: null, bilik_id: 4 };

// Loads the real auth controller with every model and service faked. `log`
// records what the controller asked each fake to do.
function auth({ otpLogin = false, users = [ALICE, NO_PHONE], passwords = { "alice@mail.com": "right-pass" }, otp = {}, sessions = {}, delivered = true, refreshed, authStamp = "stamp-1", updateError = null, addUserError = null, noProfile = false } = {}) {
  const log = [];
  const byId = (id) => users.find((u) => u.user_id === id) ?? null;
  const byPhone = (phone) => users.find((u) => u.phone === phone) ?? null;
  const byEmail = (email) => users.find((u) => u.email === email) ?? null;
  const authClient = {
    auth: {
      async signInWithPassword({ email, password }) {
        log.push(["signIn", email]);
        if (passwords[email] !== password) return { data: null, error: new Error("bad credentials") };
        const user = byEmail(email);
        return { data: { user: { id: user.user_id, email }, session: session("s1") }, error: null };
      },
      async refreshSession({ refresh_token }) {
        log.push(["refreshSession", refresh_token]);
        if (refreshed !== undefined) return refreshed;
        return { data: { session: session("s1"), user: { id: "u1", email: ALICE.email } }, error: null };
      },
      admin: { signOut: async (token) => { log.push(["revoke", jwt.decode(token).session_id]); } },
    },
  };
  const api = load("controller/authController.js", {
    bcryptjs: bcrypt, jsonwebtoken: jwt,
    "../models/User": {
      checkEmail: async (email) => Boolean(byEmail(email)),
      addUser: async (...args) => { log.push(["addUser", ...args]); if (addUserError) throw addUserError; return "new-user"; },
    },
    "../models/RefreshToken": {},
    "../config/supabase": { auth: { admin: {
      getUserById: async () => ({ data: { user: { updated_at: authStamp } }, error: null }),
      updateUserById: async (id, changes) => { log.push(["updatePassword", id, changes.password]); return { error: updateError }; },
    } } },
    "../config/supabaseAuth": () => authClient,
    "../models/UserProfile": {
      normalisePhone: realPhone.normalisePhone, isValidPhone: realPhone.isValidPhone,
      getById: async (id) => (noProfile ? null : byId(id)), getByPhone: async (phone) => byPhone(phone),
      getByIdentifier: async (raw) => (String(raw).includes("@") ? byEmail(String(raw).trim().toLowerCase()) : byPhone(realPhone.normalisePhone(raw))),
      markPhoneVerified: async (id) => log.push(["phoneVerified", id]),
    },
    "../models/UserSession": {
      create: async (id, userId, remembered, expiresAt) => log.push(["sessionCreated", id, userId, remembered, expiresAt.getTime()]),
      find: async (id) => sessions[id] ?? null,
      deleteById: async (id) => log.push(["sessionDeleted", id]),
      deleteByUserId: async (id) => log.push(["allSessionsDeleted", id]),
    },
    "../models/OtpCode": {
      OTP_TTL_MINUTES: 5,
      isEmailDestination: (d) => String(d).includes("@"),
      isOverDailyLimit: async () => otp.overLimit ?? false,
      isInCooldown: async () => otp.cooldown ?? { inCooldown: false, retryAfter: 0 },
      create: async (userId, purpose, destination, options) => { log.push(["otpCreated", userId, purpose, destination, options]); return { code: "654321", droppedSessions: otp.dropped ?? [] }; },
      invalidateActive: async (userId, purpose) => { log.push(["otpCancelled", userId, purpose]); return otp.parked ?? []; },
      verify: async (userId, purpose, code) => { log.push(["otpChecked", userId, purpose, code]); return otp.result ?? { valid: true, pendingSession: session("s1"), destination: "alice@mail.com" }; },
    },
    "../services/smsService": { sendOtpSms: async (to, code, purpose) => { log.push(["sms", to, code, purpose]); return { delivered }; } },
    "../services/emailService": { sendOtpEmail: async (to, code, purpose) => { log.push(["email", to, code, purpose]); return { delivered }; } },
  }, { env: { OTP_LOGIN_ENABLED: otpLogin ? "true" : "false", OTP_CHALLENGE_SECRET: OTP_SECRET } });
  const call = async (name, body) => { const res = response(); await api[name]({ body }, res); return res; };
  const did = (kind) => log.filter((entry) => entry[0] === kind);
  return { call, log, did };
}
const challenge = (claims, secret = OTP_SECRET, expiresIn = "10m") => jwt.sign(claims, secret, { expiresIn });

// ---------- Sign up ----------

test("sign up needs a name, email and password", async () => {
  for (const body of [{}, { email: "x@y.com", password: "p" }, { fullName: "X", password: "p" }, { fullName: "X", email: "x@y.com" }, { fullName: "X", email: "   ", password: "p" }]) {
    const { call, did } = auth();
    const res = await call("signup", body);
    assert.equal(res.code, 400);
    assert.equal(did("addUser").length, 0);
  }
});

test("sign up rejects bad phone numbers and emails or phones that are already registered", async () => {
  for (const [body, error] of [
    [{ phone: "12345" }, "Invalid phone number"],
    [{ email: "  ALICE@mail.com " }, "Email already registered"],
    [{ phone: "012-345 6789" }, "Phone number already registered"],
  ]) {
    const { call, did } = auth();
    const res = await call("signup", { fullName: "New", email: "new@mail.com", password: "secret12", ...body });
    assert.equal(res.code, 400);
    assert.equal(res.body.error, error);
    assert.equal(did("addUser").length, 0);
  }
});

test("sign up saves a tidy email and phone, and a blank phone as none", async () => {
  let { call, did } = auth();
  let res = await call("signup", { fullName: "New", email: " New@Mail.com ", password: "secret12", phone: "011-2345 6789" });
  assert.equal(res.code, 201);
  assert.deepEqual(res.body, { message: "Account created successfully!", userId: "new-user" });
  assert.deepEqual(did("addUser"), [["addUser", "New", "new@mail.com", "secret12", "+601123456789"]]);
  ({ call, did } = auth());
  await call("signup", { fullName: "New", email: "new@mail.com", password: "secret12", phone: "  " });
  assert.equal(did("addUser")[0][4], null);
});

test("sign up turns Supabase account errors into clear messages", async () => {
  const cases = [
    [Object.assign(new Error("exists"), { code: "email_exists" }), 400, "Email already registered"],
    [Object.assign(new Error("Password should be at least 6 characters"), { code: "weak_password" }), 400, "Password should be at least 6 characters"],
    [new Error("network"), 500, "Server error"],
  ];
  for (const [addUserError, code, error] of cases) {
    const res = await auth({ addUserError }).call("signup", { fullName: "N", email: "n@mail.com", password: "secret12" });
    assert.equal(res.code, code);
    assert.equal(res.body.error, error);
  }
});

// ---------- Login (one step) ----------

test("login needs an email or phone and a password", async () => {
  for (const body of [{}, { identifier: "alice@mail.com" }, { password: "right-pass" }]) {
    const { call, did } = auth();
    assert.equal((await call("login", body)).code, 400);
    assert.equal(did("signIn").length, 0);
  }
});

test("a wrong password and an unknown phone get the same 401 so accounts cannot be guessed", async () => {
  for (const identifier of ["alice@mail.com", "0199999999"]) {
    const res = await auth().call("login", { identifier, password: "wrong" });
    assert.equal(res.code, 401);
    assert.equal(res.body.error, "Invalid email or password");
    assert.equal(res.body.session, undefined);
  }
});

test("logging in with a phone number signs in with the email that owns it", async () => {
  const { call, did } = auth();
  const res = await call("login", { identifier: "012-345 6789", password: "right-pass" });
  assert.equal(res.code, 200);
  assert.deepEqual(did("signIn"), [["signIn", "alice@mail.com"]]);
});

test("login returns the session and records a 7-day deadline, or 30 days with remember me", async () => {
  for (const [rememberMe, days] of [[undefined, 7], [false, 7], [true, 30], ["true", 30]]) {
    const { call, did } = auth();
    const before = Date.now();
    const res = await call("login", { email: " Alice@Mail.com ", password: "right-pass", rememberMe });
    assert.equal(res.code, 200);
    assert.equal(res.body.otpRequired, false);
    assert.equal(res.body.session.refresh_token, "refresh-s1");
    assert.deepEqual(res.body.user, { id: "u1", userId: "u1", email: "alice@mail.com", fullName: "Alice" });
    assert.deepEqual(res.body.profile, { full_name: "Alice", bilik_id: 3 });
    const [[, sessionId, userId, remembered, deadline]] = did("sessionCreated");
    assert.deepEqual([sessionId, userId, remembered], ["s1", "u1", days === 30]);
    assert.ok(Math.abs(deadline - (before + days * DAY)) < 2000);
    assert.equal(res.body.sessionExpiresAt, new Date(deadline).toISOString());
  }
});

test("login fails safely when the user's profile row is missing", async () => {
  const res = await auth({ noProfile: true }).call("login", { identifier: "alice@mail.com", password: "right-pass" });
  assert.equal(res.code, 500);
  assert.equal(res.body.session, undefined);
});

// ---------- Login with OTP ----------

test("with OTP on, a right password sends a code instead of a session", async () => {
  const { call, did } = auth({ otpLogin: true });
  const res = await call("login", { identifier: "alice@mail.com", password: "right-pass", rememberMe: true });
  assert.equal(res.code, 200);
  assert.equal(res.body.otpRequired, true);
  assert.equal(res.body.session, undefined, "no session until the code is checked");
  assert.equal(did("sessionCreated").length, 0);
  assert.deepEqual(did("email"), [["email", "alice@mail.com", "654321", "login"]]);
  assert.equal(res.body.destinationHint, "al***@mail.com");
  assert.deepEqual(res.body.availableChannels, ["email", "sms"]);
  const claims = jwt.verify(res.body.challengeToken, OTP_SECRET);
  assert.deepEqual([claims.userId, claims.purpose, claims.remembered], ["u1", "login", true]);
  assert.deepEqual(did("otpCreated")[0].slice(1, 4), ["u1", "login", "alice@mail.com"]);
});

test("the code goes by SMS when a phone was typed, with only the last 2 digits shown", async () => {
  const { call, did } = auth({ otpLogin: true });
  const res = await call("login", { identifier: "0123456789", password: "right-pass" });
  assert.equal(res.body.channel, "sms");
  assert.equal(res.body.destinationHint, "**********89");
  assert.deepEqual(did("sms"), [["sms", "+60123456789", "654321", "login"]]);
});

test("asking for SMS on an account without a phone falls back to email", async () => {
  const { call, did } = auth({ otpLogin: true, passwords: { "bob@mail.com": "pw" } });
  const res = await call("login", { identifier: "bob@mail.com", password: "pw", otpChannel: "sms" });
  assert.equal(res.body.channel, "email");
  assert.deepEqual(res.body.availableChannels, ["email"]);
  assert.equal(did("sms").length, 0);
});

test("over the daily code limit, login stops with 429 and closes the unused session", async () => {
  const { call, did } = auth({ otpLogin: true, otp: { overLimit: true } });
  const res = await call("login", { identifier: "alice@mail.com", password: "right-pass" });
  assert.equal(res.code, 429);
  assert.equal(res.body.code, "SMS_DAILY_LIMIT");
  assert.deepEqual(did("revoke"), [["revoke", "s1"]]);
  assert.equal(did("otpCreated").length, 0);
});

test("if the code cannot be sent, login answers 502 and cancels the code", async () => {
  const { call, did } = auth({ otpLogin: true, delivered: false, otp: { parked: [session("s1")] } });
  const res = await call("login", { identifier: "alice@mail.com", password: "right-pass" });
  assert.equal(res.code, 502);
  assert.equal(res.body.challengeToken, undefined);
  assert.deepEqual(did("otpCancelled"), [["otpCancelled", "u1", "login"]]);
  assert.deepEqual(did("revoke"), [["revoke", "s1"]]);
});

// ---------- Checking the login code ----------

test("checking a login code needs a valid, unexpired login challenge", async () => {
  const bad = [
    [{ code: "123456" }, 400],
    [{ challengeToken: "x" }, 400],
    [{ challengeToken: "not-a-token", code: "123456" }, 401],
    [{ challengeToken: challenge({ userId: "u1", purpose: "login" }, "wrong-secret"), code: "123456" }, 401],
    [{ challengeToken: challenge({ userId: "u1", purpose: "password_reset" }), code: "123456" }, 401],
    [{ challengeToken: challenge({ userId: "u1", purpose: "login" }, OTP_SECRET, -10), code: "123456" }, 401],
  ];
  for (const [body, code] of bad) {
    const { call, did } = auth();
    assert.equal((await call("verifyLoginOtp", body)).code, code, JSON.stringify(body));
    assert.equal(did("otpChecked").length, 0);
  }
});

test("each failed code check gets the right status and closes any dropped session", async () => {
  for (const [result, code, error] of [
    [{ valid: false, reason: "expired", droppedSession: session("s9") }, 400, "Code expired, please request a new one"],
    [{ valid: false, reason: "too_many_attempts", droppedSession: session("s9") }, 429, "Too many incorrect attempts, please request a new code"],
    [{ valid: false, reason: "no_active_code" }, 400, "No active code, please request one"],
    [{ valid: false, reason: "incorrect", attemptsLeft: 3 }, 401, "Incorrect code"],
  ]) {
    const { call, did } = auth({ otp: { result } });
    const res = await call("verifyLoginOtp", { challengeToken: challenge({ userId: "u1", purpose: "login" }), code: "000000" });
    assert.equal(res.code, code);
    assert.equal(res.body.error, error);
    if (result.reason === "incorrect") assert.equal(res.body.attemptsLeft, 3);
    assert.deepEqual(did("revoke"), result.droppedSession ? [["revoke", "s9"]] : []);
    assert.equal(did("sessionCreated").length, 0);
  }
});

test("a right code hands over a fresh session using the remember-me choice from step 1", async () => {
  const { call, did } = auth();
  const res = await call("verifyLoginOtp", { challengeToken: challenge({ userId: "u1", purpose: "login", remembered: true }), code: "123456" });
  assert.equal(res.code, 200);
  assert.equal(res.body.session.refresh_token, "refresh-s1");
  assert.equal(res.body.rememberMe, true);
  assert.deepEqual(did("refreshSession"), [["refreshSession", "refresh-s1"]]);
  assert.equal(did("sessionCreated")[0][3], true);
  assert.equal(did("phoneVerified").length, 0, "an email code proves nothing about the phone");
});

test("a right code sent by SMS also marks the phone number as verified", async () => {
  const { call, did } = auth({ otp: { result: { valid: true, pendingSession: session("s1"), destination: "+60123456789" } } });
  await call("verifyLoginOtp", { challengeToken: challenge({ userId: "u1", purpose: "login" }), code: "123456" });
  assert.deepEqual(did("phoneVerified"), [["phoneVerified", "u1"]]);
});

test("if the parked session has already ended, the right code still asks to log in again", async () => {
  const { call } = auth({ refreshed: { data: null, error: new Error("gone") } });
  const res = await call("verifyLoginOtp", { challengeToken: challenge({ userId: "u1", purpose: "login" }), code: "123456" });
  assert.equal(res.code, 401);
});

// ---------- Resending the login code ----------

test("resending is blocked during the cooldown and over the daily limit", async () => {
  const token = challenge({ userId: "u1", purpose: "login" });
  let { call, did } = auth({ otp: { cooldown: { inCooldown: true, retryAfter: 42 } } });
  let res = await call("resendLoginOtp", { challengeToken: token });
  assert.equal(res.code, 429);
  assert.equal(res.body.retryAfter, 42);
  assert.equal(did("otpCreated").length, 0);
  ({ call, did } = auth({ otp: { overLimit: true } }));
  res = await call("resendLoginOtp", { challengeToken: token });
  assert.equal(res.code, 429);
  assert.equal(res.body.code, "SMS_DAILY_LIMIT");
  assert.equal(did("otpCreated").length, 0);
});

test("resending needs a valid challenge and refuses SMS when no phone is on file", async () => {
  assert.equal((await auth().call("resendLoginOtp", {})).code, 400);
  assert.equal((await auth().call("resendLoginOtp", { challengeToken: "bad" })).code, 401);
  const res = await auth().call("resendLoginOtp", { challengeToken: challenge({ userId: "u2", purpose: "login" }), channel: "sms" });
  assert.equal(res.code, 400);
  assert.equal(res.body.error, "No phone number on file");
});

test("a resend can switch to SMS and keeps the waiting session", async () => {
  const { call, did } = auth();
  const res = await call("resendLoginOtp", { challengeToken: challenge({ userId: "u1", purpose: "login" }), channel: "sms" });
  assert.equal(res.code, 200);
  assert.equal(res.body.channel, "sms");
  assert.deepEqual(did("sms"), [["sms", "+60123456789", "654321", "login"]]);
  assert.deepEqual(plain(did("otpCreated")[0][4]), { carryPending: true });
});

// ---------- Refreshing and logging out ----------

test("refresh refuses a missing, rejected, or unknown token", async () => {
  assert.equal((await auth().call("refresh", {})).code, 400);
  let res = await auth({ refreshed: { data: null, error: new Error("invalid") } }).call("refresh", { refreshToken: "r" });
  assert.deepEqual([res.code, res.body.code], [403, "INVALID_REFRESH_TOKEN"]);
  const { call, did } = auth({ sessions: {} });
  res = await call("refresh", { refreshToken: "r" });
  assert.deepEqual([res.code, res.body.code], [403, "INVALID_REFRESH_TOKEN"]);
  assert.deepEqual(did("revoke"), [["revoke", "s1"]], "a session with no deadline row is closed");
});

test("refresh after the session deadline asks for the password again", async () => {
  const { call, did } = auth({ sessions: { s1: { expires_at: new Date(Date.now() - 1000).toISOString() } } });
  const res = await call("refresh", { refreshToken: "r" });
  assert.deepEqual([res.code, res.body.code], [403, "SESSION_EXPIRED"]);
  assert.deepEqual(did("sessionDeleted"), [["sessionDeleted", "s1"]]);
  assert.deepEqual(did("revoke"), [["revoke", "s1"]]);
});

test("refresh before the deadline returns new tokens without moving the deadline", async () => {
  const deadline = new Date(Date.now() + 3 * DAY).toISOString();
  const res = await auth({ sessions: { s1: { expires_at: deadline } } }).call("refresh", { refreshToken: "r" });
  assert.equal(res.code, 200);
  assert.equal(res.body.refreshToken, "refresh-s1");
  assert.equal(res.body.sessionExpiresAt, deadline);
  assert.equal(res.body.user.userId, "u1");
});

test("logout ends the session, and still succeeds without a token", async () => {
  const { call, did } = auth();
  assert.equal((await call("logout", { refreshToken: "r" })).code, 200);
  assert.deepEqual(did("sessionDeleted"), [["sessionDeleted", "s1"]]);
  assert.deepEqual(did("revoke"), [["revoke", "s1"]]);
  const other = auth();
  assert.equal((await other.call("logout", {})).code, 200);
  assert.equal(other.did("refreshSession").length, 0);
});

// ---------- Forgot password ----------

test("forgot password gives the same answer whether or not the account exists", async () => {
  assert.equal((await auth().call("forgotPassword", {})).code, 400);
  const unknown = auth();
  const known = auth();
  const a = await unknown.call("forgotPassword", { identifier: "nobody@mail.com" });
  const b = await known.call("forgotPassword", { identifier: "alice@mail.com" });
  assert.deepEqual([a.code, a.body], [b.code, b.body]);
  assert.equal(unknown.did("otpCreated").length, 0);
  assert.deepEqual(known.did("email"), [["email", "alice@mail.com", "654321", "reset"]]);
});

test("forgot password sends by SMS when a phone was typed", async () => {
  const { call, did } = auth();
  await call("forgotPassword", { phone: "012 345 6789" });
  assert.deepEqual(did("sms"), [["sms", "+60123456789", "654321", "reset"]]);
});

test("during the cooldown or over the limit, forgot password quietly sends nothing", async () => {
  for (const otp of [{ cooldown: { inCooldown: true, retryAfter: 10 } }, { overLimit: true }]) {
    const { call, did } = auth({ otp });
    const res = await call("forgotPassword", { identifier: "alice@mail.com" });
    assert.equal(res.code, 200);
    assert.equal(did("otpCreated").length + did("email").length, 0);
  }
});

// ---------- Reset code and new password ----------

test("checking a reset code: unknown accounts look like a wrong code", async () => {
  assert.equal((await auth().call("verifyResetOtp", { identifier: "alice@mail.com" })).code, 400);
  const res = await auth().call("verifyResetOtp", { identifier: "nobody@mail.com", code: "123456" });
  assert.deepEqual([res.code, res.body.error], [401, "Incorrect code"]);
  const wrong = await auth({ otp: { result: { valid: false, reason: "incorrect", attemptsLeft: 2 } } }).call("verifyResetOtp", { identifier: "alice@mail.com", code: "000000" });
  assert.deepEqual([wrong.code, wrong.body.attemptsLeft], [401, 2]);
});

test("a right reset code gives a reset token tied to the current password", async () => {
  const { call, did } = auth({ authStamp: "stamp-1" });
  const res = await call("verifyResetOtp", { identifier: "alice@mail.com", code: "123456" });
  assert.equal(res.code, 200);
  assert.deepEqual(did("otpChecked")[0].slice(1), ["u1", "reset", "123456"]);
  const claims = jwt.verify(res.body.resetToken, OTP_SECRET);
  assert.deepEqual([claims.userId, claims.purpose, claims.stamp], ["u1", "password_reset", "stamp-1"]);
});

test("a new password must be at least 8 characters and needs a reset token", async () => {
  const token = challenge({ userId: "u1", purpose: "password_reset", stamp: "stamp-1" });
  for (const body of [{ newPassword: "longenough" }, { resetToken: token }, { resetToken: token, newPassword: "1234567" }]) {
    const { call, did } = auth();
    assert.equal((await call("resetPassword", body)).code, 400);
    assert.equal(did("updatePassword").length, 0);
  }
});

test("only a fresh, unused reset token can change the password", async () => {
  for (const resetToken of [
    "not-a-token",
    challenge({ userId: "u1", purpose: "login", stamp: "stamp-1" }),
    challenge({ userId: "u1", purpose: "password_reset", stamp: "stamp-1" }, OTP_SECRET, -10),
    challenge({ userId: "u1", purpose: "password_reset", stamp: "old-stamp" }),
  ]) {
    const { call, did } = auth({ authStamp: "stamp-1" });
    const res = await call("resetPassword", { resetToken, newPassword: "newpassword" });
    assert.equal(res.code, 401);
    assert.equal(did("updatePassword").length, 0);
  }
});

test("a successful reset changes the password and logs out every device", async () => {
  const { call, did } = auth();
  const res = await call("resetPassword", { resetToken: challenge({ userId: "u1", purpose: "password_reset", stamp: "stamp-1" }), newPassword: "newpassword" });
  assert.equal(res.code, 200);
  assert.deepEqual(did("updatePassword"), [["updatePassword", "u1", "newpassword"]]);
  assert.deepEqual(did("allSessionsDeleted"), [["allSessionsDeleted", "u1"]]);
});

test("if Supabase rejects the new password, sessions are kept", async () => {
  const { call, did } = auth({ updateError: new Error("Password is too weak") });
  const res = await call("resetPassword", { resetToken: challenge({ userId: "u1", purpose: "password_reset", stamp: "stamp-1" }), newPassword: "newpassword" });
  assert.deepEqual([res.code, res.body.error], [400, "Password is too weak"]);
  assert.equal(did("allSessionsDeleted").length, 0);
});

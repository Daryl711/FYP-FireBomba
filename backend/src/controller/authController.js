const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const supabase = require("../config/supabase");
const createAuthClient = require("../config/supabaseAuth");
const UserProfile = require("../models/UserProfile");
const UserSession = require("../models/UserSession");
const OtpCode = require("../models/OtpCode");
const { sendOtpSms } = require("../services/smsService");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a session survives before the user must type their password again.
// "Remember me" buys the longer window; biometric unlock happens inside it.
const SESSION_DAYS_REMEMBERED = Number(process.env.SESSION_DAYS_REMEMBERED || 30);
const SESSION_DAYS_DEFAULT = Number(process.env.SESSION_DAYS_DEFAULT || 7);

// Set OTP_LOGIN_ENABLED=true to require an SMS code after password login.
// Left off by default so login keeps working for anyone who has not run
// sql/migration_sms_otp_biometric_supabase.sql or set up SMS yet.
const OTP_LOGIN_ENABLED = process.env.OTP_LOGIN_ENABLED === "true";
const OTP_CHALLENGE_SECRET = process.env.OTP_CHALLENGE_SECRET || JWT_SECRET + "_otp";
const OTP_CHALLENGE_EXPIRES_IN = "10m";

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

// Login accepts an email OR a phone number in one field. Anything containing
// "@" is an email; everything else is looked up by phone.
const findProfileByIdentifier = (rawIdentifier) =>
  String(rawIdentifier).includes("@")
    ? UserProfile.getByEmail(String(rawIdentifier).trim().toLowerCase())
    : UserProfile.getByPhone(normalisePhone(rawIdentifier));

// Short-lived token proving "password already checked, OTP still outstanding".
// Purpose claim stops it being replayed as anything else. `remembered` rides
// along because the session length is chosen at step 1 but the session is
// only handed over once the code comes back at step 2.
const issueChallengeToken = (userId, purpose, remembered = false) =>
  jwt.sign({ userId, purpose, remembered }, OTP_CHALLENGE_SECRET, {
    expiresIn: OTP_CHALLENGE_EXPIRES_IN,
  });

const verifyChallengeToken = (token, expectedPurpose) => {
  const decoded = jwt.verify(token, OTP_CHALLENGE_SECRET);

  if (decoded.purpose !== expectedPurpose) {
    throw new Error("Wrong challenge purpose");
  }
  return decoded;
};

// Only the last 2 digits are revealed, so an attacker learns nothing useful.
const maskPhone = (phone) => phone.replace(/.(?=.{2})/g, "*");

// Every Supabase access token carries the id of the login session it belongs
// to, and keeps it across refreshes - that is what the deadline is keyed on.
const sessionIdOf = (accessToken) => jwt.decode(accessToken)?.session_id;

// Best effort: ends a Supabase session nobody will ever be given, e.g. one
// parked behind an OTP that expired. Failure only means it lingers unused.
const revokeSession = async (session) => {
  if (!session?.access_token) return;
  try {
    await createAuthClient().auth.admin.signOut(session.access_token, "local");
  } catch (err) {
    console.error("Could not revoke session:", err.message);
  }
};

const revokeSessions = (sessions = []) => Promise.all(sessions.map(revokeSession));

// Records the ABSOLUTE deadline of a freshly opened Supabase session: 30 days
// with "remember me", 7 without. /refresh never moves it forward, so the app
// can unlock with biometrics only until then.
const openSession = async (session, userId, rememberMe) => {
  const sessionExpiresAt = new Date(
    Date.now() + (rememberMe ? SESSION_DAYS_REMEMBERED : SESSION_DAYS_DEFAULT) * DAY_MS
  );

  await UserSession.create(sessionIdOf(session.access_token), userId, rememberMe, sessionExpiresAt);

  return sessionExpiresAt;
};

const toAppUser = (authUser, profile) => ({
  id: authUser.id,
  userId: authUser.id,
  email: authUser.email,
  fullName: profile?.full_name,
});

// Both login paths (straight through, or after the SMS code) answer with the
// same shape.
const loginResponse = (session, authUser, profile, rememberMe, sessionExpiresAt) => ({
  message: "Login successful",
  otpRequired: false,

  user: toAppUser(authUser, profile),

  profile: {
    full_name: profile.full_name,
    bilik_id: profile.bilik_id,
  },

  session: {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  },

  rememberMe,
  sessionExpiresAt: sessionExpiresAt.toISOString(),
});

const generateTokens = (userId, email, roomId) => {
  const accessToken = jwt.sign({ userId, email, roomId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};

exports.signup = async (req, res) => {
  const { fullName, password } = req.body;
  const email = String(req.body.email || "").trim().toLowerCase();

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: "Full name, email and password are required" });
  }

  try {
    const doesEmailExist = await User.checkEmail(email);

    if (doesEmailExist) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Supabase Auth hashes the password itself.
    const userId = await User.addUser(fullName, email, password);

    return res.status(201).json({
      message: "Account created successfully!",
      userId,
    });
  } catch (error) {
    // Supabase rejects a duplicate auth email or a weak password with a 4xx.
    if (error?.code === "email_exists") {
      return res.status(400).json({ error: "Email already registered" });
    }
    if (error?.code === "weak_password") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.login = async (req, res) => {
  try {

    console.log("Did it pass through here?")
    // "identifier" is an email or a phone number; "email" stays accepted so
    // older clients keep working.
    const { identifier, email, password, rememberMe } = req.body;
    const rawIdentifier = identifier || email;

    if (!rawIdentifier || !password) {
      return res.status(400).json({
        error: "Email or phone and password are required",
      });
    }

    // Accepts a real boolean or the string "true" so a form post works too.
    const remembered = rememberMe === true || rememberMe === "true";

    // Supabase Auth signs in by email, so a phone number is first resolved to
    // the email of the account that owns it.
    let loginEmail = String(rawIdentifier).trim().toLowerCase();
    if (!loginEmail.includes("@")) {
      const owner = await UserProfile.getByPhone(normalisePhone(rawIdentifier));
      if (!owner?.email) {
        return res.status(401).json({
          error: "Invalid email or password",
        });
      }
      loginEmail = owner.email;
    }

    // 1. Authenticate with Supabase Auth
    const { data, error } = await createAuthClient().auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    const { user, session } = data;

    // 3. Get application profile
    const profile = await UserProfile.getById(user.id);

    if (!profile) {
      return res.status(500).json({
        error: "User profile not found",
      });
    }

    // Second factor: only when enabled AND the account has a phone on file.
    // The session Supabase just opened is parked with the code and only
    // handed over once the code comes back.
    if (OTP_LOGIN_ENABLED && profile.phone) {
      // The password was right, so saying why is safe. The session Supabase
      // just opened is never handed over, so it is closed straight away.
      if (await OtpCode.isOverDailyLimit(user.id)) {
        await revokeSessions([session]);
        return res.status(429).json({
          error: "Too many verification codes sent today, please try again tomorrow",
          code: "SMS_DAILY_LIMIT",
        });
      }

      const { code, droppedSessions } = await OtpCode.create(user.id, "login", profile.phone, {
        pendingSession: session,
      });
      await revokeSessions(droppedSessions);

      const delivery = await sendOtpSms(profile.phone, code, "login");

      // With a real gateway the send can fail (bad credentials, unverified
      // number, no credit). Say so rather than leaving the user waiting.
      if (!delivery.delivered) {
        await revokeSessions(await OtpCode.invalidateActive(user.id, "login"));
        return res.status(502).json({
          error: "Could not send the verification code, please try again",
        });
      }

      return res.status(200).json({
        message: "Verification code sent",
        otpRequired: true,
        challengeToken: issueChallengeToken(user.id, "login", remembered),
        phoneHint: maskPhone(profile.phone),
        expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
      });
    }

    // 4. Return login information
    const sessionExpiresAt = await openSession(session, user.id, remembered);

    return res
      .status(200)
      .json(loginResponse(session, user, profile, remembered, sessionExpiresAt));
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Internal server error",
    });
  }
};

// exports.login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     if (!email || !password) {
//       return res.status(400).json({ error: "Email and password are required" });
//     }

//     const doesEmailExist = await User.checkEmail(email);
//     if (!doesEmailExist) {
//       return res.status(400).json({ error: "User not found" });
//     }

//     const userDetails = await User.getUserDetails(email);
//     const passwordMatch = await bcrypt.compare(password, userDetails.hashedPassword);

//     if (!passwordMatch) {
//       return res.status(401).json({ error: "Incorrect password" });
//     }

//     const { accessToken, refreshToken } = generateTokens(
//       userDetails.userId,
//       userDetails.email,
//       userDetails.roomId
//     );

//     // Store refresh token in DB (expires in 7 days)
//     const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
//     await RefreshToken.save(userDetails.userId, refreshToken, expiresAt);

//     return res.status(200).json({
//       message: "Login successful!",
//       accessToken,
//       refreshToken,
//       user: {
//         userId: userDetails.userId,
//         fullName: userDetails.fullName,
//         email: userDetails.email,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ error: "Server error" });
//     console.error(error);
//   }
// };

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    // Supabase rotates the refresh token; the old one stops working.
    const { data, error } = await createAuthClient().auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return res
        .status(403)
        .json({ error: "Invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const { session, user } = data;
    const sessionId = sessionIdOf(session.access_token);
    const stored = sessionId ? await UserSession.find(sessionId) : null;

    // No deadline on record: opened before this check existed, or ended by a
    // password reset. Either way the user must sign in again.
    if (!stored) {
      await revokeSession(session);
      return res
        .status(403)
        .json({ error: "Invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    // expires_at is the absolute deadline set at password login. Past it the
    // app must stop offering biometric unlock and ask for the password again -
    // hence the distinct code the client keys off.
    const sessionExpiresAt = new Date(stored.expires_at);
    if (Date.now() > sessionExpiresAt.getTime()) {
      await revokeSession(session);
      await UserSession.deleteById(sessionId);
      return res.status(403).json({
        error: "Session expired, please login again",
        code: "SESSION_EXPIRED",
      });
    }

    const profile = await UserProfile.getById(user.id);

    return res.status(200).json({
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      user: toAppUser(user, profile),
    });
  } catch (error) {
    res.status(403).json({ error: "Invalid refresh token" });
    console.error(error);
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // The app only holds a refresh token here, and Supabase can only sign out
    // with an access token - so trade one for the other, then end it.
    if (refreshToken) {
      const { data } = await createAuthClient().auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (data?.session) {
        const sessionId = sessionIdOf(data.session.access_token);
        if (sessionId) await UserSession.deleteById(sessionId);
        await revokeSession(data.session);
      }
    }

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

// Maps an OtpCode.verify() failure onto a response. Shared by login + reset.
const otpFailureResponse = (res, result) => {
  switch (result.reason) {
    case "expired":
      return res.status(400).json({ error: "Code expired, please request a new one" });
    case "too_many_attempts":
      return res.status(429).json({ error: "Too many incorrect attempts, please request a new code" });
    case "no_active_code":
      return res.status(400).json({ error: "No active code, please request one" });
    default:
      return res.status(401).json({
        error: "Incorrect code",
        attemptsLeft: result.attemptsLeft,
      });
  }
};

// Step 2 of login: exchange the challenge token + SMS code for the session
// that was parked at step 1.
exports.verifyLoginOtp = async (req, res) => {
  try {
    const { challengeToken, code } = req.body;

    if (!challengeToken || !code) {
      return res.status(400).json({ error: "Challenge token and code are required" });
    }

    let decoded;
    try {
      decoded = verifyChallengeToken(challengeToken, "login");
    } catch {
      return res.status(401).json({ error: "Challenge expired, please log in again" });
    }

    const result = await OtpCode.verify(decoded.userId, "login", code);
    if (!result.valid) {
      await revokeSession(result.droppedSession);
      return otpFailureResponse(res, result);
    }

    // The parked access token may be minutes old, so hand over a fresh pair.
    const { data, error } = await createAuthClient().auth.refreshSession({
      refresh_token: result.pendingSession?.refresh_token,
    });

    if (error || !data?.session) {
      return res.status(401).json({ error: "Challenge expired, please log in again" });
    }

    const { session, user } = data;
    const profile = await UserProfile.getById(user.id);

    if (!profile) {
      return res.status(500).json({ error: "User profile not found" });
    }

    // "Remember me" was ticked back at step 1 and carried here on the challenge
    // token, so the deadline matches what the user actually chose.
    const remembered = decoded.remembered === true;
    const sessionExpiresAt = await openSession(session, user.id, remembered);

    await UserProfile.markPhoneVerified(user.id);

    return res
      .status(200)
      .json(loginResponse(session, user, profile, remembered, sessionExpiresAt));
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.resendLoginOtp = async (req, res) => {
  try {
    const { challengeToken } = req.body;

    if (!challengeToken) {
      return res.status(400).json({ error: "Challenge token is required" });
    }

    let decoded;
    try {
      decoded = verifyChallengeToken(challengeToken, "login");
    } catch {
      return res.status(401).json({ error: "Challenge expired, please log in again" });
    }

    const { inCooldown, retryAfter } = await OtpCode.isInCooldown(decoded.userId, "login");
    if (inCooldown) {
      return res.status(429).json({
        error: `Please wait ${retryAfter}s before requesting another code`,
        retryAfter,
      });
    }

    if (await OtpCode.isOverDailyLimit(decoded.userId)) {
      return res.status(429).json({
        error: "Too many verification codes sent today, please try again tomorrow",
        code: "SMS_DAILY_LIMIT",
      });
    }

    const profile = await UserProfile.getById(decoded.userId);
    if (!profile?.phone) {
      return res.status(400).json({ error: "No phone number on file" });
    }

    // The new code takes over the session the previous code was holding.
    const { code, droppedSessions } = await OtpCode.create(decoded.userId, "login", profile.phone, {
      carryPending: true,
    });
    await revokeSessions(droppedSessions);

    const delivery = await sendOtpSms(profile.phone, code, "login");

    if (!delivery.delivered) {
      await revokeSessions(await OtpCode.invalidateActive(decoded.userId, "login"));
      return res.status(502).json({
        error: "Could not send the verification code, please try again",
      });
    }

    return res.status(200).json({
      message: "Verification code sent",
      phoneHint: maskPhone(profile.phone),
      expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

// Step 1 of reset. Always answers the same way so an attacker cannot use this
// endpoint to discover which accounts exist.
exports.forgotPassword = async (req, res) => {
  const genericResponse = {
    message: "If that account exists, a reset code has been sent to the phone on file",
    expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
  };

  try {
    const { identifier, phone, email } = req.body;
    const rawIdentifier = identifier || phone || email;

    if (!rawIdentifier) {
      return res.status(400).json({ error: "Email or phone number is required" });
    }

    const profile = await findProfileByIdentifier(rawIdentifier);

    // An account with no phone on file cannot be reset by SMS. Answer the same
    // way regardless, so this endpoint never reveals which accounts exist.
    if (!profile?.phone) {
      return res.status(200).json(genericResponse);
    }

    const { inCooldown } = await OtpCode.isInCooldown(profile.user_id, "reset");
    // Same generic answer when capped, so this never reveals the account exists.
    if (inCooldown || (await OtpCode.isOverDailyLimit(profile.user_id))) {
      return res.status(200).json(genericResponse);
    }

    const { code } = await OtpCode.create(profile.user_id, "reset", profile.phone);
    await sendOtpSms(profile.phone, code, "reset");

    return res.status(200).json(genericResponse);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

// Step 2 of reset: code and new password in one call, so there is no
// intermediate "password change is authorised" token to steal.
exports.resetPassword = async (req, res) => {
  try {
    const { identifier, phone, email, code, newPassword } = req.body;
    const rawIdentifier = identifier || phone || email;

    if (!rawIdentifier || !code || !newPassword) {
      return res.status(400).json({ error: "Email or phone, code and new password are required" });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const profile = await findProfileByIdentifier(rawIdentifier);

    if (!profile) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const result = await OtpCode.verify(profile.user_id, "reset", code);
    if (!result.valid) {
      return otpFailureResponse(res, result);
    }

    const { error } = await supabase.auth.admin.updateUserById(profile.user_id, {
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Any session opened with the old password is no longer trusted: without
    // its deadline row, /refresh refuses it.
    await UserSession.deleteByUserId(profile.user_id);

    return res.status(200).json({ message: "Password reset successfully, please log in" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};



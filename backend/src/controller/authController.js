const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const OtpCode = require("../models/OtpCode");
const { sendOtpSms } = require("../services/smsService");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a session survives before the user must type their password again.
// "Remember me" buys the longer window; biometric unlock happens inside it.
const SESSION_DAYS_REMEMBERED = Number(process.env.SESSION_DAYS_REMEMBERED || 30);
const SESSION_DAYS_DEFAULT = Number(process.env.SESSION_DAYS_DEFAULT || 7);

// Set OTP_LOGIN_ENABLED=true to require an SMS code after password login.
// Left off by default so the existing app and testing/simulate.js keep working.
const OTP_LOGIN_ENABLED = process.env.OTP_LOGIN_ENABLED === "true";
const OTP_CHALLENGE_SECRET = process.env.OTP_CHALLENGE_SECRET || JWT_SECRET + "_otp";
const OTP_CHALLENGE_EXPIRES_IN = "10m";

const sessionDeadline = (rememberMe) => {
  const deadline = new Date(
    Date.now() +
      (rememberMe ? SESSION_DAYS_REMEMBERED : SESSION_DAYS_DEFAULT) * DAY_MS
  );
  // MySQL DATETIME truncates milliseconds, so drop them here too - otherwise
  // login and refresh report deadlines that differ by a fraction of a second.
  deadline.setMilliseconds(0);
  return deadline;
};

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

// Short-lived token proving "password already checked, OTP still outstanding".
// Purpose claim stops it being replayed against authMiddleware as an access token.
// `remembered` rides along because the session length is chosen at step 1 but
// the session itself is only opened once the code comes back at step 2.
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

// `sessionExpiresAt` is an ABSOLUTE deadline set at password login. Every
// rotation carries the same deadline forward instead of granting a fresh
// window, otherwise an app that refreshes every 15 minutes would keep the
// session alive forever and neither the 30-day nor the 7-day rule would fire.
const generateTokens = (userId, email, roomId, sessionExpiresAt) => {
  // RefreshTokens.token is UNIQUE and iat/exp only have one-second resolution,
  // so without a random jti two logins by the same user in the same second
  // produce a byte-identical JWT and the second one dies on ER_DUP_ENTRY.
  const accessToken = jwt.sign(
    { userId, email, roomId, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  // exp is set explicitly (not via expiresIn) so the JWT dies exactly when the
  // session does.
  const refreshToken = jwt.sign(
    {
      userId,
      jti: crypto.randomUUID(),
      exp: Math.floor(sessionExpiresAt.getTime() / 1000),
    },
    JWT_REFRESH_SECRET
  );

  return { accessToken, refreshToken };
};

// Opens a session. Both login paths end here - straight through when OTP is
// off, after the code is verified when it is on - so the deadline rule lives
// in exactly one place.
const issueSession = async (userDetails, rememberMe) => {
  const sessionExpiresAt = sessionDeadline(rememberMe);

  const { accessToken, refreshToken } = generateTokens(
    userDetails.userId,
    userDetails.email,
    userDetails.roomId,
    sessionExpiresAt
  );

  await RefreshToken.save(userDetails.userId, refreshToken, sessionExpiresAt);

  return { accessToken, refreshToken, sessionExpiresAt };
};

exports.signup = async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  try {
    // Without these checks a missing field reached bcrypt.hash(undefined) and
    // came back to the app as a bare 500 "Server error".
    if (!fullName || !password) {
      return res
        .status(400)
        .json({ error: "Full name and password are required" });
    }

    // Phone is the account identifier. Many longhouse residents are elderly and
    // either have no email address or never check one, so email is optional.
    const normalisedPhone = normalisePhone(phone);

    if (!normalisedPhone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const cleanName = String(fullName).trim();
    // Only validated and checked for uniqueness when one was actually supplied.
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (String(password).length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    if (await User.checkPhone(normalisedPhone)) {
      return res.status(409).json({ error: "Phone number already registered" });
    }

    if (cleanEmail && (await User.checkEmail(cleanEmail))) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.addUser(
      cleanName,
      cleanEmail,
      hashedPassword,
      normalisedPhone,
      "User"
    );

    return res.status(201).json({
      message: "Account created successfully!",
      userId,
    });
  } catch (error) {
    // Two signups racing on the same address or number hit the UNIQUE index
    // instead of the checks above.
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Email or phone number already registered" });
    }
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.login = async (req, res) => {
  try {
    // "identifier" is the field going forward; "email"/"phone" stay accepted so
    // the existing app screen and testing/simulate.js keep working unchanged.
    const { identifier, email, phone, password, rememberMe } = req.body;
    const rawIdentifier = identifier || email || phone;

    if (!rawIdentifier || !password) {
      return res
        .status(400)
        .json({ error: "Email or phone and password are required" });
    }

    // Accepts a real boolean or the string "true" so a form post works too.
    const remembered = rememberMe === true || rememberMe === "true";

    // A phone can be typed as 012-345 6789 or +60123456789; both must match the
    // single normalised form in the database. An email is looked up lowercased,
    // the same way signup stores it.
    const lookup = String(rawIdentifier).includes("@")
      ? String(rawIdentifier).trim().toLowerCase()
      : normalisePhone(rawIdentifier);

    // One lookup, and the same message whether the account is missing or the
    // password is wrong, so the endpoint can't be used to discover which
    // addresses and numbers have accounts.
    const userDetails = await User.getUserDetailsByIdentifier(lookup);

    const passwordMatch =
      userDetails &&
      (await bcrypt.compare(password, userDetails.hashedPassword));

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Second factor: only when enabled AND the account has a phone on file.
    // Accounts without a phone fall through to the normal session below.
    if (OTP_LOGIN_ENABLED) {
      const phoneRecord = await User.getPhone(userDetails.userId);

      if (phoneRecord && phoneRecord.phone) {
        const { code } = await OtpCode.create(userDetails.userId, "login", phoneRecord.phone);
        const delivery = await sendOtpSms(phoneRecord.phone, code, "login");

        // With a real gateway the send can fail (bad credentials, unverified
        // number, no credit). Say so rather than leaving the user waiting.
        if (!delivery.delivered) {
          await OtpCode.invalidateActive(userDetails.userId, "login");
          return res.status(502).json({
            error: "Could not send the verification code, please try again",
          });
        }

        return res.status(200).json({
          message: "Verification code sent",
          otpRequired: true,
          challengeToken: issueChallengeToken(userDetails.userId, "login", remembered),
          phoneHint: maskPhone(phoneRecord.phone),
          expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
        });
      }
    }

    // 30 days with "remember me", 7 without. This is when the password must be
    // typed again; the app unlocks with biometrics until then.
    const { accessToken, refreshToken, sessionExpiresAt } = await issueSession(
      userDetails,
      remembered
    );

    return res.status(200).json({
      message: "Login successful!",
      otpRequired: false,
      accessToken,
      refreshToken,
      rememberMe: remembered,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      user: {
        userId: userDetails.userId,
        fullName: userDetails.fullName,
        email: userDetails.email,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    // Check if refresh token exists in DB
    const stored = await RefreshToken.find(refreshToken);
    if (!stored) {
      return res
        .status(403)
        .json({ error: "Invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    // expires_at holds the absolute session deadline set at password login.
    // Past it, the app must stop offering biometric unlock and ask for the
    // password again - hence the distinct code the client keys off.
    const sessionExpiresAt = new Date(stored.expires_at);
    if (Date.now() > sessionExpiresAt.getTime()) {
      await RefreshToken.deleteByToken(refreshToken);
      return res.status(403).json({
        error: "Session expired, please login again",
        code: "SESSION_EXPIRED",
      });
    }

    // Verify the token signature
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (err) {
      // Stored but no longer valid (expired or signed with an old secret) -
      // drop the row so it can't pile up.
      await RefreshToken.deleteByToken(refreshToken);
      return res
        .status(403)
        .json({ error: "Invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    const userDetails = await User.getUserDetailsById(decoded.userId);
    if (!userDetails) {
      await RefreshToken.deleteByToken(refreshToken);
      return res
        .status(403)
        .json({ error: "Invalid refresh token", code: "INVALID_REFRESH_TOKEN" });
    }

    // Rotate the token but keep the original deadline - the session does not
    // get extended just because the app refreshed.
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      userDetails.userId,
      userDetails.email,
      userDetails.roomId,
      sessionExpiresAt
    );

    await RefreshToken.deleteByToken(refreshToken);
    await RefreshToken.save(userDetails.userId, newRefreshToken, sessionExpiresAt);

    return res.status(200).json({
      accessToken,
      refreshToken: newRefreshToken,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      user: {
        userId: userDetails.userId,
        fullName: userDetails.fullName,
        email: userDetails.email,
      },
    });
  } catch (error) {
    res.status(403).json({ error: "Invalid refresh token" });
    console.error(error);
  }
};

exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.deleteByToken(refreshToken);
    }
    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

// Resolves an email OR a phone number to an account. The OTP itself always
// goes to the phone on file, whichever identifier was typed.
const findByIdentifier = async (rawIdentifier) => {
  const lookup = String(rawIdentifier).includes("@")
    ? String(rawIdentifier).trim().toLowerCase()
    : normalisePhone(rawIdentifier);

  return User.getUserDetailsByIdentifier(lookup);
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

// Step 2 of login: exchange the challenge token + SMS code for real tokens.
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
      return otpFailureResponse(res, result);
    }

    const userDetails = await User.getUserDetailsById(decoded.userId);
    if (!userDetails) {
      return res.status(401).json({ error: "Challenge expired, please log in again" });
    }

    // "Remember me" was ticked back at step 1 and carried here on the challenge
    // token, so the deadline matches what the user actually chose.
    const remembered = decoded.remembered === true;

    const { accessToken, refreshToken, sessionExpiresAt } = await issueSession(
      userDetails,
      remembered
    );

    await User.markPhoneVerified(decoded.userId);

    return res.status(200).json({
      message: "Login successful!",
      accessToken,
      refreshToken,
      rememberMe: remembered,
      sessionExpiresAt: sessionExpiresAt.toISOString(),
      user: {
        userId: userDetails.userId,
        fullName: userDetails.fullName,
        email: userDetails.email,
      },
    });
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

    const phoneRecord = await User.getPhone(decoded.userId);
    if (!phoneRecord || !phoneRecord.phone) {
      return res.status(400).json({ error: "No phone number on file" });
    }

    const { code } = await OtpCode.create(decoded.userId, "login", phoneRecord.phone);
    const delivery = await sendOtpSms(phoneRecord.phone, code, "login");

    if (!delivery.delivered) {
      await OtpCode.invalidateActive(decoded.userId, "login");
      return res.status(502).json({
        error: "Could not send the verification code, please try again",
      });
    }

    return res.status(200).json({
      message: "Verification code sent",
      phoneHint: maskPhone(phoneRecord.phone),
      expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

// Step 1 of reset. Always answers the same way so an attacker cannot use this
// endpoint to discover which phone numbers have accounts.
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

    const userDetails = await findByIdentifier(rawIdentifier);

    // An account with no phone on file cannot be reset by SMS. Answer the same
    // way regardless, so this endpoint never reveals which accounts exist.
    if (!userDetails || !userDetails.phone) {
      return res.status(200).json(genericResponse);
    }

    const { inCooldown } = await OtpCode.isInCooldown(userDetails.userId, "reset");
    if (inCooldown) {
      return res.status(200).json(genericResponse);
    }

    const { code } = await OtpCode.create(userDetails.userId, "reset", userDetails.phone);
    await sendOtpSms(userDetails.phone, code, "reset");

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

    const userDetails = await findByIdentifier(rawIdentifier);

    if (!userDetails) {
      return res.status(400).json({ error: "Invalid code" });
    }

    const result = await OtpCode.verify(userDetails.userId, "reset", code);
    if (!result.valid) {
      return otpFailureResponse(res, result);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.updatePassword(userDetails.userId, hashedPassword);

    // Any session opened with the old password is no longer trusted.
    await RefreshToken.deleteByUserId(userDetails.userId);

    return res.status(200).json({ message: "Password reset successfully, please log in" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

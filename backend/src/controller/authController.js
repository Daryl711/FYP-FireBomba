const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const OtpCode = require("../models/OtpCode");
const { sendOtpSms } = require("../services/smsService");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

// Set OTP_LOGIN_ENABLED=true to require an SMS code after password login.
// Left off by default so the existing app and testing/simulate.js keep working.
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

// Short-lived token proving "password already checked, OTP still outstanding".
// Purpose claim stops it being replayed against authMiddleware as an access token.
const issueChallengeToken = (userId, purpose) =>
  jwt.sign({ userId, purpose }, OTP_CHALLENGE_SECRET, { expiresIn: OTP_CHALLENGE_EXPIRES_IN });

const verifyChallengeToken = (token, expectedPurpose) => {
  const decoded = jwt.verify(token, OTP_CHALLENGE_SECRET);

  if (decoded.purpose !== expectedPurpose) {
    throw new Error("Wrong challenge purpose");
  }
  return decoded;
};

// Only the last 2 digits are revealed, so an attacker learns nothing useful.
const maskPhone = (phone) => phone.replace(/.(?=.{2})/g, "*");

const issueSession = async (userDetails) => {
  const { accessToken, refreshToken } = generateTokens(
    userDetails.userId,
    userDetails.email,
    userDetails.roomId
  );

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.save(userDetails.userId, refreshToken, expiresAt);

  return { accessToken, refreshToken };
};

const generateTokens = (userId, email, roomId) => {
  const accessToken = jwt.sign(
    { userId, email, roomId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  const refreshToken = jwt.sign(
    { userId },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
};

exports.signup = async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  try {
    if (!fullName || !password) {
      return res.status(400).json({ error: "Full name and password are required" });
    }

    // Phone is the account identifier. Many longhouse residents are elderly and
    // either have no email address or never check one, so email is optional.
    const normalisedPhone = normalisePhone(phone);

    if (!normalisedPhone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    if (await User.checkPhone(normalisedPhone)) {
      return res.status(400).json({ error: "Phone number already registered" });
    }

    // Only enforce email uniqueness when one was actually supplied.
    const trimmedEmail = email ? String(email).trim() : null;

    if (trimmedEmail && await User.checkEmail(trimmedEmail)) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.addUser(fullName, trimmedEmail, hashedPassword, normalisedPhone);

    return res.status(201).json({
      message: "Account created successfully!",
      userId,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.login = async (req, res) => {
  try {
    // "identifier" is the field going forward; "email"/"phone" stay accepted so
    // the existing app screen and testing/simulate.js keep working unchanged.
    const { identifier, email, phone, password } = req.body;
    const rawIdentifier = identifier || email || phone;

    if (!rawIdentifier || !password) {
      return res.status(400).json({ error: "Email or phone and password are required" });
    }

    // A phone can be typed as 012-345 6789 or +60123456789; both must match the
    // single normalised form in the database. An email is looked up as given.
    const lookup = String(rawIdentifier).includes("@")
      ? String(rawIdentifier).trim()
      : normalisePhone(rawIdentifier);

    const userDetails = await User.getUserDetailsByIdentifier(lookup);
    if (!userDetails) {
      return res.status(400).json({ error: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(password, userDetails.hashedPassword);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password" });
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
          challengeToken: issueChallengeToken(userDetails.userId, "login"),
          phoneHint: maskPhone(phoneRecord.phone),
          expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
        });
      }
    }

    const { accessToken, refreshToken } = await issueSession(userDetails);

    return res.status(200).json({
      message: "Login successful!",
      otpRequired: false,
      accessToken,
      refreshToken,
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
      return res.status(403).json({ error: "Invalid refresh token" });
    }

    // Check if refresh token is expired in DB
    if (new Date() > new Date(stored.expires_at)) {
      await RefreshToken.deleteByToken(refreshToken);
      return res.status(403).json({ error: "Refresh token expired, please login again" });
    }

    // Verify the token signature
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    const userDetails = await User.getUserDetailsById(decoded.userId);

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(
      userDetails.userId,
      userDetails.email,
      userDetails.roomId
    );

    // Rotate refresh token - delete old, save new
    await RefreshToken.deleteByToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.save(userDetails.userId, newRefreshToken, expiresAt);

    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
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
    ? String(rawIdentifier).trim()
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
    const { accessToken, refreshToken } = await issueSession(userDetails);

    await User.markPhoneVerified(decoded.userId);

    return res.status(200).json({
      message: "Login successful!",
      accessToken,
      refreshToken,
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

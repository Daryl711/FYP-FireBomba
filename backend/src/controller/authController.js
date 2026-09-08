const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";

const DAY_MS = 24 * 60 * 60 * 1000;

// How long a session survives before the user must type their password again.
// "Remember me" buys the longer window; biometric unlock happens inside it.
const SESSION_DAYS_REMEMBERED = Number(process.env.SESSION_DAYS_REMEMBERED || 30);
const SESSION_DAYS_DEFAULT = Number(process.env.SESSION_DAYS_DEFAULT || 7);

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

exports.signup = async (req, res) => {
  const { fullName, email, password } = req.body;

  try {
    // Without these checks a missing field reached bcrypt.hash(undefined) and
    // came back to the app as a bare 500 "Server error".
    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ error: "Full name, email and password are required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanName = String(fullName).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (String(password).length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });
    }

    const doesEmailExist = await User.checkEmail(cleanEmail);

    if (doesEmailExist) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.addUser(cleanName, cleanEmail, hashedPassword, "User");

    return res.status(201).json({
      message: "Account created successfully!",
      userId,
    });
  } catch (error) {
    // Two signups racing on the same address hit the UNIQUE index instead of
    // the check above.
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: "Server error" });
    console.error(error);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Accepts a real boolean or the string "true" so a form post works too.
    const remembered = rememberMe === true || rememberMe === "true";

    const cleanEmail = String(email).trim().toLowerCase();

    // One lookup instead of checkEmail() + getUserDetails(), and the same
    // message either way so the endpoint can't be used to discover which
    // addresses have accounts.
    const userDetails = await User.getUserDetails(cleanEmail);

    const passwordMatch =
      userDetails &&
      (await bcrypt.compare(password, userDetails.hashedPassword));

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 30 days with "remember me", 7 without. This is when the password must be
    // typed again; the app unlocks with biometrics until then.
    const sessionExpiresAt = sessionDeadline(remembered);

    const { accessToken, refreshToken } = generateTokens(
      userDetails.userId,
      userDetails.email,
      userDetails.roomId,
      sessionExpiresAt
    );

    await RefreshToken.save(userDetails.userId, refreshToken, sessionExpiresAt);

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

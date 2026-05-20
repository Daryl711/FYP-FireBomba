const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "15m";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

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
  const { fullName, email, password } = req.body;

  try {
    const doesEmailExist = await User.checkEmail(email);

    if (doesEmailExist) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await User.addUser(fullName, email, hashedPassword);

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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const doesEmailExist = await User.checkEmail(email);
    if (!doesEmailExist) {
      return res.status(400).json({ error: "User not found" });
    }

    const userDetails = await User.getUserDetails(email);
    const passwordMatch = await bcrypt.compare(password, userDetails.hashedPassword);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    const { accessToken, refreshToken } = generateTokens(
      userDetails.userId,
      userDetails.email,
      userDetails.roomId
    );

    // Store refresh token in DB (expires in 7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.save(userDetails.userId, refreshToken, expiresAt);

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

    // Rotate refresh token — delete old, save new
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

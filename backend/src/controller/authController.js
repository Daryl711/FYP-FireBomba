const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

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

    if (!passwordMatch)
      return res.status(401).json({ error: "Incorrect password" });

    const token = jwt.sign(
      { userId: userDetails.userId, email: userDetails.email, roomId: userDetails.roomId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );

    return res.status(200).json({
      message: "Login successful!",
      token,
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

exports.logout = (req, res) => {
  res.json({ message: "Logged out successfully" });
};

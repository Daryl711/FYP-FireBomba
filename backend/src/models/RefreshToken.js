const db = require("../config/database");

exports.save = async (userId, token, expiresAt) => {
  await db.query(
    "INSERT INTO RefreshTokens (user_id, token, expires_at) VALUES (?, ?, ?)",
    [userId, token, expiresAt]
  );
};

exports.find = async (token) => {
  const [rows] = await db.query(
    "SELECT * FROM RefreshTokens WHERE token = ?",
    [token]
  );
  return rows[0] || null;
};

exports.deleteByToken = async (token) => {
  await db.query("DELETE FROM RefreshTokens WHERE token = ?", [token]);
};

exports.deleteByUserId = async (userId) => {
  await db.query("DELETE FROM RefreshTokens WHERE user_id = ?", [userId]);
};

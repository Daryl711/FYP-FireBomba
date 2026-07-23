const db = require("../config/database");

exports.save = async (userId, token, expiresAt) => {
  try {
    await db.query(
      "INSERT INTO RefreshTokens (user_id, token, expires_at) VALUES (?, ?, ?)",
      [userId, token, expiresAt]
    );
  } catch (error) {
    // Two requests in the same second for the same user produce an
    // identical JWT (payload + iat + exp match), so a concurrent refresh
    // can try to insert the same token twice. The row already holding
    // that exact token is what we wanted stored, so this isn't a failure.
    if (error.code !== "ER_DUP_ENTRY") throw error;
  }
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

const db = require("../config/database");


exports.checkEmail = async (email) => {
  const sql = "SELECT * FROM Users WHERE email = ?";
  const [result] = await db.query(
    sql, [email],
  );

  if (result.length > 0) {
    return true;
  } 
  return false;

}

exports.addUser = async(fullName, email, hashedPassword, role = "User") => {
  // `role` is NOT NULL with no default in the schema. Leaving it out inserted
  // an empty string on MariaDB and failed outright on any strict-mode server.
  const sql = "INSERT INTO Users (room_id, full_name, email, password, role) VALUES (?, ?, ?, ?, ?)";
  const [result] = await db.query(
    sql, [1, fullName, email, hashedPassword, role],
  );

  return result.insertId;
}


exports.getUserDetails = async (email) => {
  const sql = "SELECT * FROM Users WHERE email = ?";
  const [result] = await db.query(sql, [email]);

  // Returns null instead of throwing when the row isn't there, so callers can
  // answer with a clean 401 rather than a 500.
  if (result.length === 0) {
    return null;
  }

  return {
    userId: result[0].user_id,
    hashedPassword: result[0].password,
    fullName: result[0].full_name,
    email: result[0].email,
    roomId: result[0].room_id,
    role: result[0].role,
  };
};

exports.getUserDetailsById = async (userId) => {
  const sql = "SELECT * FROM Users WHERE user_id = ?";
  const [result] = await db.query(sql, [userId]);

  if (result.length === 0) {
    return null;
  }

  return {
    userId: result[0].user_id,
    fullName: result[0].full_name,
    email: result[0].email,
    roomId: result[0].room_id,
  };
};
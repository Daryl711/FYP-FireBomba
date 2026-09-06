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

exports.addUser = async(fullName, email, hashedPassword, phone = null) => {
  const sql = "INSERT INTO Users (room_id, full_name, email, password, phone) VALUES (?, ?, ?, ?, ?)";
  const [result] = await db.query(
    sql, [1, fullName, email || null, hashedPassword, phone],
  );

  return result.insertId;
}


exports.getUserDetails = async (email) => {
  const sql = "SELECT * FROM Users WHERE email = ?";
  const [result] = await db.query(sql, [email]);

  const userId = result[0].user_id;
  const hashedPassword = result[0].password;
  const fullName = result[0].full_name;
  const roomId = result[0].room_id;

  return { userId, hashedPassword, fullName, email, roomId };
};

exports.getUserDetailsById = async (userId) => {
  const sql = "SELECT * FROM Users WHERE user_id = ?";
  const [result] = await db.query(sql, [userId]);

  return {
    userId: result[0].user_id,
    fullName: result[0].full_name,
    email: result[0].email,
    roomId: result[0].room_id,
  };
};

exports.getUserDetailsByPhone = async (phone) => {
  const sql = "SELECT * FROM Users WHERE phone = ?";
  const [result] = await db.query(sql, [phone]);

  if (result.length === 0) {
    return null;
  }

  return {
    userId: result[0].user_id,
    fullName: result[0].full_name,
    email: result[0].email,
    phone: result[0].phone,
    roomId: result[0].room_id,
  };
};

exports.getPhone = async (userId) => {
  const sql = "SELECT phone, phone_verified FROM Users WHERE user_id = ?";
  const [result] = await db.query(sql, [userId]);

  if (result.length === 0) {
    return null;
  }

  return { phone: result[0].phone, phoneVerified: !!result[0].phone_verified };
};

exports.setPhone = async (userId, phone) => {
  const sql = "UPDATE Users SET phone = ?, phone_verified = FALSE WHERE user_id = ?";
  await db.query(sql, [phone, userId]);
};

exports.markPhoneVerified = async (userId) => {
  const sql = "UPDATE Users SET phone_verified = TRUE WHERE user_id = ?";
  await db.query(sql, [userId]);
};

exports.updatePassword = async (userId, hashedPassword) => {
  const sql = "UPDATE Users SET password = ? WHERE user_id = ?";
  await db.query(sql, [hashedPassword, userId]);
};


exports.checkPhone = async (phone) => {
  const sql = "SELECT user_id FROM Users WHERE phone = ?";
  const [result] = await db.query(sql, [phone]);

  return result.length > 0;
};

// Login accepts either an email or a phone number in the same field.
// Anything containing "@" is treated as an email, everything else as a phone.
exports.getUserDetailsByIdentifier = async (identifier) => {
  const column = String(identifier).includes("@") ? "email" : "phone";
  const sql = `SELECT * FROM Users WHERE ${column} = ?`;
  const [result] = await db.query(sql, [identifier]);

  if (result.length === 0) {
    return null;
  }

  return {
    userId: result[0].user_id,
    hashedPassword: result[0].password,
    fullName: result[0].full_name,
    email: result[0].email,
    phone: result[0].phone,
    roomId: result[0].room_id,
  };
};

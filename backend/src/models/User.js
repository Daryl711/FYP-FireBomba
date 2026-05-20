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

exports.addUser = async(fullName, email, hashedPassword) => {
  const sql = "INSERT INTO Users (room_id, full_name, email, password) VALUES (?, ?, ?, ?)";
  const [result] = await db.query(
    sql, [1, fullName, email, hashedPassword],
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
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
  const sql = "INSERT INTO Users (full_name, email, password) VALUES (?, ?, ?)";
  const [result] = await db.query(
    sql, [fullName, email, hashedPassword],
  );

  return result.insertId;
}


exports.getUserDetails = async (email) => {
  const sql = "SELECT * FROM Users WHERE email = ?";
  const [result] = await db.query(
    sql, [email],
  );

  const userId = result[0].id;
  const hashedPassword = result[0].password;
  const fullName = result[0].full_name;

  return {
    userId,
    hashedPassword,
    fullName,
    email,
  };

}
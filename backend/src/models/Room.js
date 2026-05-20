const db = require("../config/database");

exports.getRoomData = async (roomId) => {
  const sql = "SELECT * FROM Rooms WHERE room_id = ?";
  const [result] = await db.query(sql, [roomId]);

  const name = result[0].name;
  const status = result[0].status;

  return {
    roomId,
    name,
    status,
  };
};

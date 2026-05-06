const Room = require("../models/Room");
const SensorReading = require("../models/SensorReading");

exports.getRoomData = async (req, res) => {
  try {
    const roomId = req.user.roomId;

    const roomData = await Room.getRoomData(roomId);

    return res.status(200).json(roomData);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getRoomTemperature = async (req, res) => {
  try {
    const roomId = req.user.roomId;

    const temperature = await SensorReading.getRoomTemperature(roomId);

    return res.status(200).json({ roomId, temperature });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

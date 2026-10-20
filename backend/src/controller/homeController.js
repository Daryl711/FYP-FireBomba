const Room = require("../models/Room");
const SensorReading = require("../models/SensorReading");

exports.getBilikData = async (req, res) => {
  try {
    const bilik = await Room.getBilikData(req.user.id);
    return res.status(200).json(bilik);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getRoomsByBilik = async (req, res) => {
  try {
    const rooms = await Room.getRoomsByBilik(req.params.bilikId, req.user.id);
    return res.status(200).json(rooms);
  } catch (error) {
    console.error(error);
    return res
      .status(error.status || 500)
      .json({ error: error.message || "Server error" });
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

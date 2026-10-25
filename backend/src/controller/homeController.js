const Bilik = require("../models/Bilik");
const SensorReading = require("../models/SensorReading");

exports.getBilikData = async (req, res) => {
  try {
    const bilik = await Bilik.getBilikData(req.user.bilikId);
    return res.status(200).json(bilik);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getRoomsByBilik = async (req, res) => {
  try {
    const bilikId = Number(req.params.bilikId);
    if (!Number.isSafeInteger(bilikId) || bilikId <= 0) {
      return res.status(400).json({ error: "Invalid Bilik id." });
    }
    if (req.user.bilikId == null || bilikId !== Number(req.user.bilikId)) {
      return res.status(403).json({ error: "Access denied to this Bilik." });
    }
    const rooms = await Bilik.getRoomsByBilik(bilikId);
    return res.status(200).json(rooms.map(Bilik.formatRoom));
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

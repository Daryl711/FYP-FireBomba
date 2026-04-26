const db = require("../config/database");
const SensorReading = require("../models/SensorReading");

exports.getLatestReading = async (req, res) => {
  try {
    const sensorReadings = await SensorReading.getLatestReading();

    console.log(sensorReadings);
    return res.status(200).json(sensorReadings);

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error",
    });
  }
};

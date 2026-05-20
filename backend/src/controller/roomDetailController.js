const { mqttEvents, publishMessage } = require("../services/mqttService");
const SensorReading = require("../models/SensorReading");
const Actuator = require("../models/Actuator");

const roomPattern = /^home\/room-(\d+)\/sensor-data$/;

let latestRoomData = {};

mqttEvents.on("new-reading", async ({ topic, data }) => {
  const match = topic.match(roomPattern);
  if (match) {
    const roomNumber = match[1];

    latestRoomData[roomNumber] = data;

    try {
      await SensorReading.insertSensorReading(data);
    } catch (error) {
      console.log(error);
    }
  }
});

exports.getLatestReading = async (req, res) => {
  try {
    const roomId = String(req.user.roomId);

    if (roomId) {
      return res
        .status(200)
        .json(latestRoomData[roomId] || { message: "No data yet" });
    }

    return res.status(404).json({ message: "No room found" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.controlWaterPump = async (req, res) => {
  try {
    const { waterPumpStatus } = req.body;
    const roomId = req.user.roomId;

    const actualWaterPumpStatus = await Actuator.getWaterPumpStatus(roomId);

    if (waterPumpStatus === actualWaterPumpStatus) {
      return res.status(422).json({ message: "Invalid water pump operation!" });
    }

    await Actuator.updateWaterPumpStatus(waterPumpStatus, roomId);

    const topic = `home/room-${roomId}/pump-control`;

    const message = {
      command: waterPumpStatus,
      timestamp: new Date().toISOString(),
    };

    publishMessage(topic, message);

    return res.status(200).json({
      message: "Command sent",
      command: waterPumpStatus,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getWaterPumpStatus = async (req, res) => {
  try {
    const roomId = req.user.roomId;
    const waterPumpStatus = await Actuator.getWaterPumpStatus(roomId);

    return res.status(200).json({
      waterPumpStatus,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

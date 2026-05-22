const { mqttEvents, publishMessage } = require("../services/mqttService");
const SensorReading = require("../models/SensorReading");
const Actuator = require("../models/Actuator");
const SensorAggregate = require("../models/SensorAggregate");

const roomPattern = /^home\/room-(\d+)\/sensor-data$/;
const waterPumpPattern = /^home\/room-(\d+)\/pump-control$/;

let latestRoomData = {};

mqttEvents.on("new-reading", async ({ topic, data }) => {
  const matchRoomPattern = topic.match(roomPattern);
  const matchWaterPumpPattern = topic.match(waterPumpPattern);
  if (matchRoomPattern) {
    const roomNumber = matchRoomPattern[1];

    latestRoomData[roomNumber] = data;

    try {
      await SensorReading.insertSensorReading(data);
    } catch (error) {
      console.error(error);
    }
  } else if (matchWaterPumpPattern) {
    const roomNumber = matchWaterPumpPattern[1];
    
    const waterPumpStatus = data.command;

    const actualWaterPumpStatus = await Actuator.getWaterPumpStatus(roomNumber);

    if (waterPumpStatus !== actualWaterPumpStatus) {
      await Actuator.updateWaterPumpStatus(waterPumpStatus, roomNumber);
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

exports.getSensorAggregates = async (req, res) => {
  try {
    const roomId = req.user.roomId;
    const limit = Number(req.query.limit) || 10;

    const data = await SensorAggregate.getLatestByRoom(roomId, limit);

    return res.status(200).json({ data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

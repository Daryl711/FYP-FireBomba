const { mqttEvents, publishMessage } = require("../services/mqttService");
// const SensorReading = require("../models/SensorReading");
const Actuator = require("../models/Actuator");
const SensorReading = require("../models/SensorReading");
const SensorAggregate = require("../models/SensorAggregate");

// const roomPattern = /^firebomba\/room\/(\d+)\/sensor-data$/;
const waterPumpStatusPattern = /^firebomba\/room\/(\d+)\/pump\/status$/;

let latestWaterPumpStatus = {};

mqttEvents.on("pump-status", async ({ topic, data }) => {
  // const matchRoomPattern = topic.match(roomPattern);
  const matchWaterPumpPattern = topic.match(waterPumpStatusPattern);
  // if (matchRoomPattern) {
  //   const roomNumber = matchRoomPattern[1];

  //   latestRoomData[roomNumber] = data;

  //   try {
  //     await SensorReading.insertSensorReading(data);
  //   } catch (error) {
  //     console.error(error);
  //   }
  // } else
  if (matchWaterPumpPattern) {
    const roomId = matchWaterPumpPattern[1];

    const waterPumpStatus = data.status;
    const waterPumpState = data.state;

    latestWaterPumpStatus[roomId] = {
      status: waterPumpStatus,
      state: waterPumpState,
      updatedAt: new Date().toISOString(),
    };

    // pending verify
    if (waterPumpStatus === "FAILED") {
      const currentWaterPumpState = Actuator.getWaterPumpStatus(roomId);
      await Actuator.updateWaterPumpStatus(!currentWaterPumpState, roomId);
    }
  }
});

exports.getLatestReading = async (req, res) => {
  try {
    const roomId = String(req.user.roomId);

    if (roomId) {
      const data = await SensorReading.getLatestSensorReading(roomId);

      return res.status(200).json(data);
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
    latestWaterPumpStatus[String(roomId)] = null;

    const topic = `firebomba/room/${roomId}/pump/command`;

    const message = {
      roomId: roomId,
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
      operationStatus: latestWaterPumpStatus[String(roomId)] || null,
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

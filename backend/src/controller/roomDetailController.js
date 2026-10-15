const { mqttEvents, publishMessage } = require("../services/mqttService");
// const SensorReading = require("../models/SensorReading");
const Actuator = require("../models/Actuator");
const Room = require("../models/Room");
const SensorReading = require("../models/SensorReading");
const SensorAggregate = require("../models/SensorAggregate");
const sensorReadingStream = require("../services/sensorReadingStream");
const sensorAggregateStream = require("../services/sensorAggregateStream");

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
    const roomId = Number(req.query.roomId);
    if (!Number.isInteger(roomId) || roomId < 1) {
      return res.status(400).json({ error: "A valid roomId is required" });
    }

    if (!(await Room.userCanAccessRoom(roomId, req.user.id))) {
      return res.status(403).json({ error: "Room access denied" });
    }

    const data = await SensorReading.getLatestSensorReading(roomId);
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.streamSensorReadings = async (req, res) => {
  const roomId = Number(req.query.roomId);
  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ error: "A valid roomId is required" });
  }

  try {
    if (!(await Room.userCanAccessRoom(roomId, req.user.id))) {
      return res.status(403).json({ error: "Room access denied" });
    }

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 5000\n\n");

    const unsubscribe = sensorReadingStream.subscribeToRoom(roomId, res);
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(": keep-alive\n\n");
      }
    }, 25000);
    let closed = false;

    const closeStream = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    res.on("close", closeStream);
    req.on("close", closeStream);

    const recentReadings = await SensorReading.getRecentSensorReadings(roomId);
    if (!closed) {
      for (const reading of recentReadings) {
        sensorReadingStream.sendSensorReading(res, reading);
      }
    }
  } catch (error) {
    console.error("Failed to stream sensor readings:", error);
    if (res.headersSent) {
      res.write(
        `event: stream-error\ndata: ${JSON.stringify({ error: "Sensor stream failed" })}\n\n`,
      );
      res.end();
      return;
    }
    return res.status(500).json({ error: "Server error" });
  }
};

exports.streamSensorAggregates = async (req, res) => {
  const roomId = Number(req.query.roomId);
  if (!Number.isInteger(roomId) || roomId < 1) {
    return res.status(400).json({ error: "A valid roomId is required" });
  }

  try {
    if (!(await Room.userCanAccessRoom(roomId, req.user.id))) {
      return res.status(403).json({ error: "Room access denied" });
    }

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 5000\n\n");

    const unsubscribe = sensorAggregateStream.subscribeToRoom(roomId, res);
    const heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) {
        res.write(": keep-alive\n\n");
      }
    }, 25000);
    let closed = false;

    const closeStream = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    res.on("close", closeStream);
    req.on("close", closeStream);

    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const recentAggregates = await SensorAggregate.getRecentByRoom(roomId, since);
    if (!closed) {
      for (const aggregate of recentAggregates) {
        sensorAggregateStream.sendSensorAggregate(res, aggregate);
      }
    }
  } catch (error) {
    console.error("Failed to stream sensor aggregates:", error);
    if (res.headersSent) {
      res.write(
        `event: stream-error\ndata: ${JSON.stringify({ error: "Sensor aggregate stream failed" })}\n\n`,
      );
      res.end();
      return;
    }
    return res.status(500).json({ error: "Server error" });
  }
};

exports.controlWaterPump = async (req, res) => {
  try {
    const { waterPumpStatus } = req.body;
    const roomId = req.body.roomId;

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
    const roomId = req.query.roomId;
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
    const roomId = req.query.roomId;
    const limit = Number(req.query.limit) || 10;

    const data = await SensorAggregate.getLatestByRoom(roomId, limit);

    return res.status(200).json({ data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

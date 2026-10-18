const Room = require("../models/Room");
const SensorReading = require("../models/SensorReading");
const Actuator = require("../models/Actuator");
const AlertNotification = require("../models/AlertNotification");
const THRESHOLDS = require("../config/thresholds");
const { client: mqttClient } = require("../services/mqttService");
const AuditLog = require("../models/auditLog");
const Avatar = require("../models/Avatar");
const PushToken = require("../models/PushToken");
const { sendTestAlarm, isAlarmSound } = require("../services/pushService");

exports.updateCameraStatus = async (req, res) => {
  try {
    const { cameraStatus } = req.body;
    const roomId = req.user.roomId;

    const actualCameraStatus = await Room.getCameraStatus(roomId);

    if (cameraStatus === actualCameraStatus) {
      return res.status(422).json({ message: "Invalid operation!" });
    }

    await Room.updateCameraStatus(cameraStatus, roomId);

    const roomName = await Room.getRoomName(roomId);
    const newStatus = cameraStatus ? "Enabled" : "Disabled";
    await AuditLog.createLog({
      userId: req.user.userId,
      performedBy: req.user.email,
      action: `Camera ${newStatus}`,
      sensorType: "Camera",
      roomName,
      details: `Camera in ${roomName} was ${newStatus.toLowerCase()} by ${req.user.email}`,
    });

    return res.status(200).json({
      message: "Update successful.",
      cameraStatus,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.getCameraStatus = async (req, res) => {
  try {
    const roomId = req.user.roomId;

    const cameraStatus = await Room.getCameraStatus(roomId);

    return res.status(200).json({
      roomId,
      cameraStatus,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Sniff the real format from the first bytes rather than trusting the
// client-sent type, so only genuine JPEG/PNG files are stored.
const detectImageType = (buffer) => {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
};

exports.getAvatar = async (req, res) => {
  try {
    const avatarUrl = await Avatar.getUrl(req.user.userId);
    return res.status(200).json({ avatarUrl });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.updateAvatar = async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return res.status(400).json({ error: "No image provided." });
    }

    const buffer = Buffer.from(imageBase64, "base64");
    if (buffer.length > Avatar.MAX_BYTES) {
      return res.status(413).json({ error: "Image is too large (max 5 MB)." });
    }

    const mimeType = detectImageType(buffer);
    if (!mimeType) {
      return res.status(415).json({ error: "Only JPEG or PNG images are allowed." });
    }

    const avatarUrl = await Avatar.upload(req.user.userId, buffer, mimeType);
    return res.status(200).json({ message: "Profile picture updated.", avatarUrl });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.savePushToken = async (req, res) => {
  try {
    const { pushToken, platform, alarmSound } = req.body || {};
    if (typeof pushToken !== "string" || !pushToken.startsWith("ExponentPushToken[")) {
      return res.status(400).json({ error: "A valid Expo push token is required" });
    }
    if (alarmSound != null && !isAlarmSound(alarmSound)) {
      return res.status(400).json({ error: "Unknown alarm sound" });
    }

    await PushToken.saveToken(req.user.userId, pushToken, platform ?? null, alarmSound ?? null);
    return res.status(200).json({ message: "Push token saved" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.deletePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body || {};
    if (typeof pushToken !== "string") {
      return res.status(400).json({ error: "pushToken is required" });
    }

    await PushToken.deleteToken(req.user.userId, pushToken);
    return res.status(200).json({ message: "Push token removed" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Rings only the device that asked, and only if that device is registered to
// this account, so it cannot be used to ring someone else's phone.
exports.sendTestAlarm = async (req, res) => {
  try {
    const { pushToken } = req.body || {};
    if (typeof pushToken !== "string") {
      return res.status(400).json({ error: "pushToken is required" });
    }

    const device = await PushToken.getUserToken(req.user.userId, pushToken);
    if (!device) {
      return res.status(404).json({ error: "This device is not registered for alerts" });
    }

    const sent = await sendTestAlarm(device);
    if (!sent) {
      return res.status(502).json({ error: "Could not send the test alarm, please try again" });
    }

    return res.status(200).json({ message: "Test alarm sent" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// The Pi syncs every ~10 s; a room silent for longer than this is offline.
const SENSOR_OFFLINE_AFTER_MS = 2 * 60 * 1000;
const FIRE_EVENTS_WINDOW_DAYS = 30;

const isFlame = (value) =>
  value === true || value === 1 || value === "1" || value === "true";

// Read-only health of every room in the user's bilik, plus the summary the
// Home and Profile tiles show.
exports.getSystemHealth = async (req, res) => {
  try {
    const rooms =
      req.user.bilikId == null ? [] : await Room.getRoomsByBilik(req.user.bilikId);
    const now = Date.now();

    const roomHealth = await Promise.all(
      rooms.map(async (room) => {
        const [reading, pumpOn] = await Promise.all([
          SensorReading.getLatestSensorReading(room.room_id),
          Actuator.getWaterPumpStatus(room.room_id),
        ]);
        const lastReadingAt = reading?.timestamp ?? reading?.created_at ?? null;
        const online =
          lastReadingAt !== null &&
          now - new Date(lastReadingAt).getTime() <= SENSOR_OFFLINE_AFTER_MS;

        return {
          roomId: room.room_id,
          name: room.name,
          spaceType: room.space_type,
          online,
          lastReadingAt,
          reading: reading
            ? {
                temperature: reading.temperature,
                humidity: reading.humidity,
                smoke: reading.smoke,
                gas: reading.co,
                flame: isFlame(reading.flame_detected),
              }
            : null,
          cameraEnabled: room.camera_enabled === true,
          pumpOn,
        };
      })
    );

    const since = new Date(now - FIRE_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const fireEvents = await AlertNotification.countSince(
      rooms.map((room) => room.room_id),
      since
    );

    const roomsOnline = roomHealth.filter((room) => room.online).length;
    const flameNow = roomHealth.some((room) => room.online && room.reading?.flame);

    return res.status(200).json({
      summary: {
        roomsTotal: roomHealth.length,
        roomsOnline,
        camerasOn: roomHealth.filter((room) => room.cameraEnabled).length,
        fireEvents,
        fireEventsWindowDays: FIRE_EVENTS_WINDOW_DAYS,
        allOperational:
          roomHealth.length > 0 && roomsOnline === roomHealth.length && !flameNow,
      },
      server: {
        brokerConnected: mqttClient.connected === true,
      },
      offlineAfterSeconds: SENSOR_OFFLINE_AFTER_MS / 1000,
      thresholds: THRESHOLDS,
      rooms: roomHealth,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

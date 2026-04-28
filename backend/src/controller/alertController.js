const Alert = require("../models/Alert");
const db = require("../config/database");

// Thresholds that trigger a warning alert
const THRESHOLDS = {
  temperature: 60.0,
  smoke: 300.0,
  gas: 500.0,
};

exports.getAlerts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const alerts = await Alert.getAlertsByUser(userId);

    const formatted = alerts.map((a) => ({
      id: a.id,
      room: a.room_name || "Unknown Room",
      roomId: a.room_id,
      sensorType: a.sensor_type,
      description: a.description,
      type: a.type,
      unread: !a.is_read,
      time: formatRelativeTime(a.created_at),
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.markAlertRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const affected = await Alert.markRead(id, userId);

    if (affected === 0) return res.status(404).json({ error: "Alert not found" });
    return res.status(200).json({ message: "Alert marked as read" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.markAllAlertsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    await Alert.markAllRead(userId);
    return res.status(200).json({ message: "All alerts marked as read" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const affected = await Alert.deleteAlert(id, userId);

    if (affected === 0) return res.status(404).json({ error: "Alert not found" });
    return res.status(200).json({ message: "Alert deleted" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.listRooms = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, name, user_id, status FROM rooms ORDER BY id");
    return res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Room name is required" });
    }
    const [result] = await db.query(
      "INSERT INTO rooms (user_id, name) VALUES (?, ?)",
      [userId, name.trim()]
    );
    return res.status(201).json({ roomId: result.insertId, name: name.trim() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Called by IoT devices (or test scripts) — checks thresholds and auto-generates fire alerts.
// sensor_reading hardware logging (which needs real sensor IDs) is handled separately by IoT firmware.
exports.processSensorReading = async (req, res) => {
  try {
    const { roomId, sensorType, value } = req.body;

    if (!roomId || !sensorType || value === undefined) {
      return res.status(400).json({ error: "roomId, sensorType, and value are required" });
    }

    const validTypes = ["temperature", "smoke", "gas", "flame"];
    if (!validTypes.includes(sensorType)) {
      return res.status(400).json({ error: `sensorType must be one of: ${validTypes.join(", ")}` });
    }

    // Find the room owner to attach the alert
    const [roomRows] = await db.query("SELECT user_id, name FROM rooms WHERE id = ?", [roomId]);
    if (roomRows.length === 0) return res.status(404).json({ error: "Room not found" });

    const { user_id: userId, name: roomName } = roomRows[0];

    let alertId = null;

    if (sensorType === "flame" && value === 1) {
      const desc = `Flame detected in ${roomName}! Immediate action required.`;
      alertId = await Alert.createAlert(userId, roomId, "flame", "warning", desc);
    } else if (THRESHOLDS[sensorType] !== undefined && value >= THRESHOLDS[sensorType]) {
      const desc = buildThresholdDesc(sensorType, value, roomName);
      alertId = await Alert.createAlert(userId, roomId, sensorType, "warning", desc);
    }

    return res.status(201).json({ message: "Reading received", alertCreated: alertId !== null, alertId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

function buildThresholdDesc(sensorType, value, roomName) {
  switch (sensorType) {
    case "temperature":
      return `High temperature (${value}°C) detected in ${roomName}. Threshold: ${THRESHOLDS.temperature}°C.`;
    case "smoke":
      return `Smoke level (${value} ppm) exceeded threshold in ${roomName}. Threshold: ${THRESHOLDS.smoke} ppm.`;
    case "gas":
      return `Dangerous gas level (${value} ppm) detected in ${roomName}. Threshold: ${THRESHOLDS.gas} ppm.`;
    default:
      return `Sensor alert in ${roomName}: ${sensorType} = ${value}`;
  }
}

function getUnit(sensorType) {
  switch (sensorType) {
    case "temperature": return "°C";
    case "smoke":
    case "gas": return "ppm";
    default: return "";
  }
}

function formatRelativeTime(timestamp) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const Room = require("../models/Room");
const AuditLog = require("../models/auditLog");
const Avatar = require("../models/Avatar");

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

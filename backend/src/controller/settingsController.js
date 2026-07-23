const Room = require("../models/Room");
const AuditLog = require("../models/auditLog");

exports.updateCameraStatus = async (req, res) => {
  try {
    const { cameraStatus } = req.body;
    const roomId = req.user.roomId;

    const actualCameraStatus = await Room.getCameraStatus(roomId);

    if (cameraStatus === actualCameraStatus) {
      return res.status(422).json({ message: "Invalid operation!" });
    }

    await Room.updateCameraStatus(cameraStatus, roomId);

    const room = await Room.getRoomData(roomId);
    const newStatus = cameraStatus ? "Enabled" : "Disabled";
    await AuditLog.createLog({
      userId: req.user.userId,
      performedBy: req.user.email,
      action: `Camera ${newStatus}`,
      sensorType: "Camera",
      roomName: room.name,
      details: `Camera in ${room.name} was ${newStatus.toLowerCase()} by ${req.user.email}`,
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

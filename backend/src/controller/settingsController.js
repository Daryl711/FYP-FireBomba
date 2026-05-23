const Room = require("../models/Room");

exports.updateCameraStatus = async (req, res) => {
  try {
    const { cameraStatus } = req.body;
    const roomId = req.user.roomId;

    const actualCameraStatus = await Room.getCameraStatus(roomId);

    if (cameraStatus === actualCameraStatus) {
      return res.status(422).json({ message: "Invalid operation!" });
    }

    await Room.updateCameraStatus(cameraStatus, roomId);

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

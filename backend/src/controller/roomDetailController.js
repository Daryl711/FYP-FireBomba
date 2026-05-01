const { mqttEvents } = require("../services/mqttService");

const roomPattern = /^home\/room-(\d+)\/sensor-data$/;

let latestRoomData = {};

mqttEvents.on("new-reading", ({ topic, data }) => {
  const match = topic.match(roomPattern);
  if (match) {
    const roomNumber = match[1];
    latestRoomData[roomNumber] = data;
  }
});

exports.getLatestReading = async (req, res) => {
  try {
    const roomId = String(req.user.roomId);
    console.log(latestRoomData);

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

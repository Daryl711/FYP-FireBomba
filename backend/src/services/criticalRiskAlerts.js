const Alert = require("../models/AlertNotification");

// One notification per room's critical episode, despite QoS redelivery and
// five-second risk updates. A lower-risk result re-arms the next episode.
const criticalRooms = new Map();

async function handleRiskStatus(roomId, data) {
  const id = Number(roomId);
  if (!Number.isSafeInteger(id) || id < 1) return;
  if (data.risk_level !== "Critical") {
    criticalRooms.delete(id);
    return;
  }
  let episode = criticalRooms.get(id);
  if (!episode) {
    episode = { pending: false, notified: false };
    criticalRooms.set(id, episode);
  }
  if (episode.pending || episode.notified) return;
  episode.pending = true;
  try {
    await Alert.createAlert({ roomId: id, warningTitles: "Critical Fire Risk" });
    episode.notified = true;
  } catch (error) {
    // Retry on the next valid critical update if persistence failed.
    console.error("Failed to create critical risk alert:", error);
  } finally {
    episode.pending = false;
  }
}

module.exports = { handleRiskStatus };

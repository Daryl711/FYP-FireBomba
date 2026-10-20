const roomClients = new Map();
const latestRisk = new Map();
const MAX_AGE_MS = 30000;

function sendRiskStatus(response, risk) {
  response.write(`event: risk-status\ndata: ${JSON.stringify(risk)}\n\n`);
}

function publishRiskStatus(roomId, data) {
  if (!data || typeof data.risk_score !== "number" ||
      !Number.isFinite(data.risk_score) || data.risk_score < 0 || data.risk_score > 1 ||
      !["Normal", "Warning", "Critical"].includes(data.risk_level)) {
    return false;
  }
  const timestamp = Date.parse(data.timestamp);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_AGE_MS ||
      timestamp > Date.now() + 5000) return false;

  const roomKey = String(roomId);
  const previous = latestRisk.get(roomKey);
  if (previous && Date.parse(previous.timestamp) > timestamp) return false;
  const risk = {
    room_id: roomKey,
    risk_score: data.risk_score,
    score: Math.round(data.risk_score * 1000) / 10,
    severity: data.risk_level,
    timestamp: new Date(timestamp).toISOString(),
  };
  latestRisk.set(roomKey, risk);
  const clients = roomClients.get(roomKey);
  if (clients) {
    for (const response of clients) {
      if (response.destroyed || response.writableEnded) clients.delete(response);
      else sendRiskStatus(response, risk);
    }
  }
  return true;
}

function subscribeToRoom(roomId, response) {
  const roomKey = String(roomId);
  if (!roomClients.has(roomKey)) roomClients.set(roomKey, new Set());
  const clients = roomClients.get(roomKey);
  clients.add(response);
  const risk = latestRisk.get(roomKey);
  if (risk && Date.now() - Date.parse(risk.timestamp) <= MAX_AGE_MS) {
    sendRiskStatus(response, risk);
  }
  return () => {
    clients.delete(response);
    if (!clients.size) roomClients.delete(roomKey);
  };
}

module.exports = { publishRiskStatus, subscribeToRoom };

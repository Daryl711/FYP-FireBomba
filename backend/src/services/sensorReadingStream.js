const roomClients = new Map();

exports.subscribeToRoom = (roomId, response) => {
  const roomKey = String(roomId);
  let clients = roomClients.get(roomKey);

  if (!clients) {
    clients = new Set();
    roomClients.set(roomKey, clients);
  }

  clients.add(response);

  return () => {
    clients.delete(response);
    if (clients.size === 0) {
      roomClients.delete(roomKey);
    }
  };
};

exports.sendSensorReading = (response, reading) => {
  response.write(`event: sensor-reading\ndata: ${JSON.stringify(reading)}\n\n`);
};

exports.publishSensorReading = (reading) => {
  const clients = roomClients.get(String(reading.room_id));
  if (!clients) return;

  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response);
      continue;
    }

    exports.sendSensorReading(response, reading);
  }

  if (clients.size === 0) {
    roomClients.delete(String(reading.room_id));
  }
};

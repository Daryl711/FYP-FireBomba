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

exports.sendSensorAggregate = (response, aggregate) => {
  response.write(
    `event: sensor-aggregate\ndata: ${JSON.stringify(aggregate)}\n\n`,
  );
};

exports.publishSensorAggregate = (aggregate) => {
  const roomKey = String(aggregate.room_id);
  const clients = roomClients.get(roomKey);
  if (!clients) return;

  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response);
      continue;
    }

    exports.sendSensorAggregate(response, aggregate);
  }

  if (clients.size === 0) {
    roomClients.delete(roomKey);
  }
};

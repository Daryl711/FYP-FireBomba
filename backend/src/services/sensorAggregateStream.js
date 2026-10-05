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
  const clients = roomClients.get(String(aggregate.room_id));
  if (!clients) return;

  publishToClients(clients, (response) => {
    exports.sendSensorAggregate(response, aggregate);
  }, String(aggregate.room_id));
};

exports.publishSensorPrediction = (roomId, predictions) => {
  const roomKey = String(roomId);
  const clients = roomClients.get(roomKey);
  if (!clients) return;

  publishToClients(clients, (response) => {
    response.write(
      `event: sensor-prediction\ndata: ${JSON.stringify(predictions)}\n\n`,
    );
  }, roomKey);
};

function publishToClients(clients, publish, roomKey) {
  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response);
      continue;
    }

    publish(response);
  }

  if (clients.size === 0) {
    roomClients.delete(roomKey);
  }
};

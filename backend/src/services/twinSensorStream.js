// The twin watches all rooms through its own SSE subscribers.
const clients = new Set();

exports.sendSensorReading = (response, reading) => {
  response.write(`event: sensor-reading\ndata: ${JSON.stringify(reading)}\n\n`);
};

exports.subscribe = (response) => {
  clients.add(response);
  return () => clients.delete(response);
};

exports.publishSensorReading = (reading) => {
  for (const response of clients) {
    if (response.destroyed || response.writableEnded) {
      clients.delete(response);
      continue;
    }
    exports.sendSensorReading(response, reading);
  }
};

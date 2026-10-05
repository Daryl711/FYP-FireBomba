const mqtt = require("mqtt");
const mqttConfig = require("../config/mqtt");
const EventEmitter = require("events");

const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;

const mqttEvents = new EventEmitter();
const sensorPredictionTopicPattern =
  /^fire\/room\/([1-9]\d*)\/sensor-prediction$/;

const client = mqtt.connect(brokerUrl, mqttConfig);

client.on("connect", () => {
  console.log("Connected to AWS IoT Core MQTT broker");

  client.subscribe("firebomba/room/+/pump/status", { qos: 1 }, (err) => {
    if (!err) {
      console.log("Subscribed to firebomba/room/+/pump/status");
    } else {
      console.error("MQTT subscription error:", err);
    }
  });
  client.subscribe("fire/room/+/sensor-prediction", { qos: 1 }, (err) => {
    if (!err) {
      console.log("Subscribed to fire/room/+/sensor-prediction");
    } else {
      console.error("MQTT subscription error:", err);
    }
  });
});

client.on("error", (err) => {
  console.error("========== MQTT ERROR ==========");
  console.error(err);
});

client.on("disconnect", (packet) => {
  console.log("========== MQTT DISCONNECT ==========");
  console.log(packet);
});

client.on("offline", () => {
  console.log("========== MQTT OFFLINE ==========");
});

client.on("close", () => {
  console.log("========== MQTT CLOSED ==========");
});

client.on("reconnect", () => {
  console.log("========== MQTT RECONNECTING ==========");
});

client.on("message", (topic, message) => {
  const predictionMatch = topic.match(sensorPredictionTopicPattern);
  if (predictionMatch) {
    try {
      const predictions = JSON.parse(message.toString());
      if (!Array.isArray(predictions)) {
        console.error("Invalid sensor prediction payload: expected an array");
        return;
      }

      mqttEvents.emit("sensor-prediction", {
        roomId: predictionMatch[1],
        predictions,
      });
    } catch (err) {
      console.error("Invalid sensor prediction JSON:", err.message);
    }
    return;
  }

  if (!/^firebomba\/room\/\d+\/pump\/status$/.test(topic)) {
    return;
  }

  try {
    const data = JSON.parse(message.toString());

    mqttEvents.emit("pump-status", { topic, data });
  } catch (err) {
    console.error("Invalid JSON:", err.message);
  }
});

const publishMessage = (topic, message) => {
  const payload = JSON.stringify(message);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    }
  });
};

module.exports = { client, mqttEvents, publishMessage };

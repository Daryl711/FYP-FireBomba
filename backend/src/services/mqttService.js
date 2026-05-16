const EventEmitter = require("events");
const mqttConfig = require("../config/mqtt");

const mqttEvents = new EventEmitter();

if (!mqttConfig.host) {
  console.warn("[MQTT] MQTT_HOST not set — MQTT disabled (running without Raspberry Pi)");
  module.exports = { client: null, mqttEvents, publishMessage: () => {} };
} else {
  const mqtt = require("mqtt");
  const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;
  const client = mqtt.connect(brokerUrl, mqttConfig);

  client.on("connect", () => {
    console.log("[MQTT] Connected to broker");
    client.subscribe("home/room-1/#", (err) => {
      if (!err) console.log("[MQTT] Subscribed to home/room-1/#");
    });
  });

  client.on("message", (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      mqttEvents.emit("new-reading", { topic, data });
    } catch (err) {
      console.error("[MQTT] Invalid JSON:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error("[MQTT] Error:", err.message);
  });

  const publishMessage = (topic, message) => {
    client.publish(topic, JSON.stringify(message), { qos: 1 }, (err) => {
      if (err) console.error("[MQTT] Publish error:", err);
    });
  };

  module.exports = { client, mqttEvents, publishMessage };
}

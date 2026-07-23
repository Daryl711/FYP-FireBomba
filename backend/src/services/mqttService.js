const mqtt = require("mqtt");
const mqttConfig = require("../config/mqtt");
const EventEmitter = require("events");

const mqttEvents = new EventEmitter();

let client = null;

const publishMessage = (topic, message) => {
  if (!client) return;

  const payload = JSON.stringify(message);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    }
  });
};

if (!mqttConfig.enabled) {
  console.log("[MQTT] MQTT_ENABLED is not \"true\" (or MQTT_HOST unset) — MQTT disabled (running without Raspberry Pi)");
} else {
  const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;
  client = mqtt.connect(brokerUrl, mqttConfig);

  client.on("connect", () => {
    console.log("Connected to MQTT broker");

    client.subscribe("home/room-1/#", (err) => {
      if (!err) {
        console.log("Subscribed to home/room-1/#");
      }
    });
  });

  client.on("message", (topic, message) => {
    try {
      const data = JSON.parse(message.toString());

      mqttEvents.emit("new-reading", { topic, data });
    } catch (err) {
      console.error("Invalid JSON:", err.message);
    }
  });

  client.on("error", (err) => {
    console.error("MQTT Error:", err);
  });
}

module.exports = { client, mqttEvents, publishMessage };

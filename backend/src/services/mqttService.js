require("dotenv").config();

const mqtt = require("mqtt");
const EventEmitter = require("events");

const mqttEvents = new EventEmitter();

// Set MQTT_ENABLED=true in .env once the Raspberry Pi broker is reachable.
const mqttEnabled = process.env.MQTT_ENABLED === "true";

let client = null;

if (mqttEnabled) {
  const mqttConfig = require("../config/mqtt");
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
} else {
  console.log("MQTT disabled (MQTT_ENABLED is not \"true\"). Running backend without a broker.");
}

const publishMessage = (topic, message) => {
  const payload = JSON.stringify(message);

  if (!client) {
    console.log(`MQTT disabled, skipped publish to ${topic}:`, payload);
    return;
  }

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    } 
  });
};

module.exports = { client, mqttEvents, publishMessage };

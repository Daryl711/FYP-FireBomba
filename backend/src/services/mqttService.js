const mqtt = require("mqtt");
const mqttConfig = require("../config/mqtt");
const EventEmitter = require("events");

// Always live, whether or not the broker is connected, so the controllers can
// subscribe to it at require time.
const mqttEvents = new EventEmitter();

let client = null;

if (!mqttConfig.enabled) {
  console.log(
    "MQTT disabled (MQTT_ENABLED is not \"true\") - running without the Raspberry Pi broker."
  );
} else if (!mqttConfig.host) {
  console.warn("MQTT enabled but MQTT_HOST is not set - skipping broker connection.");
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
    console.error("MQTT Error:", err.message);
  });
}

const publishMessage = (topic, message) => {
  if (!client) {
    console.log(`MQTT disabled - skipped publish to ${topic}:`, message);
    return;
  }

  const payload = JSON.stringify(message);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    } 
  });
};

module.exports = { client, mqttEvents, publishMessage };

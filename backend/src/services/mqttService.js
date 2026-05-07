const mqtt = require("mqtt");
const mqttConfig = require("../config/mqtt");
const EventEmitter = require("events");

const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;

const mqttEvents = new EventEmitter();

const client = mqtt.connect(brokerUrl, mqttConfig);

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

const publishMessage = (topic, message) => {
  const payload = JSON.stringify(message);

  client.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    } 
  });
};

module.exports = { client, mqttEvents, publishMessage };

const mqtt = require("mqtt");
const mqttConfig = require("../config/mqtt");
const EventEmitter = require("events");
const riskStatusStream = require("./riskStatusStream");

const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}`;

const mqttEvents = new EventEmitter();
const client = mqtt.connect(brokerUrl, mqttConfig);

client.on("connect", () => {
  console.log("Connected to AWS IoT Core MQTT broker");

  client.subscribe(
    ["firebomba/room/+/pump/status", "firebomba/room/+/risk"],
    { qos: 1 },
    (err, granted) => {
      if (err) {
        console.error("MQTT subscription error:", err);
        return;
      }

      console.log("MQTT subscriptions granted:", granted);
    },
  );
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
  const riskMatch = /^firebomba\/room\/(\d+)\/risk$/.exec(topic);
  const isSensorData = /^firebomba\/room\/\d+\/sensor-data$/.test(topic);
  if (
    !riskMatch &&
    !isSensorData &&
    !/^firebomba\/room\/\d+\/pump\/status$/.test(topic)
  ) {
    return;
  }

  try {
    const data = JSON.parse(message.toString());

    if (riskMatch) {
      riskStatusStream.publishRiskStatus(riskMatch[1], data);
    } else if (isSensorData) {
      mqttEvents.emit("sensor-data", { topic, data });
    } else {
      mqttEvents.emit("pump-status", { topic, data });
    }
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

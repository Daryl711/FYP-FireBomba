require("dotenv").config();

const fs = require("fs");

const config = {
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocol: "mqtts",
};

try {
    config.ca = fs.readFileSync("./ca.crt");
} catch {
    // No ca.crt — fall back to unencrypted MQTT
    config.protocol = "mqtt";
}

module.exports = config;
require("dotenv").config();

const fs = require("fs");

const enabled = process.env.MQTT_ENABLED === "true" && !!process.env.MQTT_HOST;

module.exports = {
    enabled,
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,

    protocol: "mqtts",

    ca: enabled ? fs.readFileSync("./ca.crt") : null
};
require("dotenv").config();

const fs = require("fs");

module.exports = {
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,

    protocol: "mqtts",

    ca: fs.readFileSync("./ca.crt")
};
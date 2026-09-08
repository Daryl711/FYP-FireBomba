require("dotenv").config();

const fs = require("fs");
const path = require("path");

// The broker lives on the team's Raspberry Pi, which isn't always reachable.
// MQTT_ENABLED gates the whole MQTT stack so the backend can run standalone.
const enabled = String(process.env.MQTT_ENABLED).toLowerCase() === "true";

// Resolved against the backend folder, not the shell's cwd, so `node
// src/../server.js` from anywhere still finds the certificate.
const caPath = path.resolve(__dirname, "../../ca.crt");

let ca;
if (enabled) {
    try {
        ca = fs.readFileSync(caPath);
    } catch (err) {
        console.warn(`MQTT: could not read CA certificate at ${caPath} - ${err.message}`);
    }
}

module.exports = {
    enabled,
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,

    protocol: "mqtts",

    ca,
};

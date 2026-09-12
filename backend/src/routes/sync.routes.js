const express = require("express");
const syncController = require("../controller/syncController");

const syncRouter = express.Router();

syncRouter.post("/insert-sensor-readings", syncController.insertSensorReading);

module.exports = syncRouter;
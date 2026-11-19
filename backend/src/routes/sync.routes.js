const express = require("express");
const syncController = require("../controller/syncController");

const syncRouter = express.Router();

syncRouter.post(
  "/insert-sensor-readings/bulk",
  syncController.insertSensorReadingsBulk,
);

syncRouter.post(
  "/insert-sensor-aggregates",
  syncController.insertSensorAggregate,
);

module.exports = syncRouter;
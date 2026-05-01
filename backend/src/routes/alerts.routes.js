const express = require("express");
const alertRouter = express.Router();
const alertController = require("../controller/alertController");
const authMiddleware = require("../middleware/auth");

alertRouter.get("/", authMiddleware, alertController.getAlerts);
alertRouter.patch("/read-all", authMiddleware, alertController.markAllAlertsRead);
alertRouter.patch("/:id/read", authMiddleware, alertController.markAlertRead);
alertRouter.delete("/:id", authMiddleware, alertController.deleteAlert);

// // IoT devices post sensor readings here — alerts are auto-generated on threshold breach
// alertRouter.post("/sensor-reading", alertController.processSensorReading);

// // Dev helper — list all rooms (used by simulate.js)
// alertRouter.get("/rooms", alertController.listRooms);

// // Create a room for the logged-in user
// alertRouter.post("/rooms", authMiddleware, alertController.createRoom);

module.exports = alertRouter;

const express = require("express");
const alertRouter = express.Router();
const alertController = require("../controller/alertController");
const authMiddleware = require("../middleware/auth");

alertRouter.get("/alerts", authMiddleware, alertController.getAlerts);
alertRouter.patch("/alerts/read-all", authMiddleware, alertController.markAllAlertsRead);
alertRouter.patch("/alerts/:id/read", authMiddleware, alertController.markAlertRead);
alertRouter.delete("/alerts/:id", authMiddleware, alertController.deleteAlert);

// IoT devices post sensor readings here — alerts are auto-generated on threshold breach
alertRouter.post("/sensor-reading", alertController.processSensorReading);

// Dev helper — list all rooms (used by simulate.js)
alertRouter.get("/rooms", alertController.listRooms);

// Create a room for the logged-in user
alertRouter.post("/rooms", authMiddleware, alertController.createRoom);

module.exports = alertRouter;

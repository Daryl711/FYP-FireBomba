const express = require("express");
const homeRouter = express.Router();
const homeController = require("../controller/homeController");
const authMiddleware = require("../middleware/auth");

homeRouter.get("/bilik-data", authMiddleware, homeController.getBilikData);
homeRouter.get(
  "/bilik/:bilikId/rooms",
  authMiddleware,
  homeController.getRoomsByBilik,
);
homeRouter.get(
  "/room-temperature",
  authMiddleware,
  homeController.getRoomTemperature,
);

module.exports = homeRouter;

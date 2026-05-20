const express = require('express');
const homeRouter = express.Router();
const homeController = require('../controller/homeController');
const authMiddleware = require('../middleware/auth');

homeRouter.get('/room-data', authMiddleware, homeController.getRoomData)
homeRouter.get('/room-temperature', authMiddleware, homeController.getRoomTemperature)

module.exports = homeRouter;

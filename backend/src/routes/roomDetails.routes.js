const express = require('express');
const roomDetailRouter = express.Router();
const roomDetailController = require('../controller/roomDetailController');
const authMiddleware = require('../middleware/auth');



roomDetailRouter.get('/get-latest-readings', authMiddleware, roomDetailController.getLatestReading);

roomDetailRouter.get('/sensor-aggregates', authMiddleware, roomDetailController.getSensorAggregates);

roomDetailRouter.get('/get-water-pump-status', authMiddleware, roomDetailController.getWaterPumpStatus)

roomDetailRouter.put('/control-water-pump', authMiddleware, roomDetailController.controlWaterPump);


module.exports = roomDetailRouter;
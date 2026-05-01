const express = require('express');
const roomDetailRouter = express.Router();
const roomDetailController = require('../controller/roomDetailController');
const authMiddleware = require('../middleware/auth');



roomDetailRouter.get('/get-latest-readings', authMiddleware, roomDetailController.getLatestReading);


module.exports = roomDetailRouter;
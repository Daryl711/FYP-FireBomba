const express = require('express');
const roomDetailRouter = express.Router();
const roomDetailController = require('../controller/roomDetailController')



roomDetailRouter.get('/get-latest-readings', roomDetailController.getLatestReading);


module.exports = roomDetailRouter;
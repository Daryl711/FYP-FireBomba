const express = require('express');
const twinRouter = express.Router();
const twinController = require('../controller/twinController');

twinRouter.get('/layout', twinController.getLayout);
twinRouter.get('/stream', twinController.streamSensors);

module.exports = twinRouter;

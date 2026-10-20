const express = require('express');
const twinRouter = express.Router();
const twinController = require('../controller/twinController');

twinRouter.get('/layout', twinController.getLayout);

module.exports = twinRouter;

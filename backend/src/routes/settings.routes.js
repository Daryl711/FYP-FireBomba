const express = require('express');
const settingsRouter = express.Router();
const settingsController = require('../controller/settingsController');
const authMiddleware = require('../middleware/auth');



settingsRouter.put('/update-camera-status', authMiddleware, settingsController.updateCameraStatus);

settingsRouter.get('/get-camera-status', authMiddleware, settingsController.getCameraStatus);


module.exports = settingsRouter;
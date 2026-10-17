const express = require('express');
const settingsRouter = express.Router();
const settingsController = require('../controller/settingsController');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

// Each test is a real push with the alarm sound; a few per 10 minutes is plenty.
const testAlarmLimiter = rateLimit.createRateLimiter({
  name: 'test-alarm',
  windowMs: 10 * 60 * 1000,
  max: 3,
  key: (req) => req.user?.userId ?? null,
  message: 'Too many test alarms',
});



settingsRouter.put('/update-camera-status', authMiddleware, settingsController.updateCameraStatus);

settingsRouter.get('/get-camera-status', authMiddleware, settingsController.getCameraStatus);

settingsRouter.get('/avatar', authMiddleware, settingsController.getAvatar);
settingsRouter.put('/avatar', authMiddleware, settingsController.updateAvatar);

settingsRouter.put('/push-token', authMiddleware, settingsController.savePushToken);
settingsRouter.delete('/push-token', authMiddleware, settingsController.deletePushToken);
settingsRouter.post('/test-alarm', authMiddleware, testAlarmLimiter, settingsController.sendTestAlarm);


module.exports = settingsRouter;
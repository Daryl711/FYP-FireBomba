const express = require('express');
const profileRouter = express.Router();
const profileController = require('../controller/profileController');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

profileRouter.get('/', authMiddleware, profileController.getProfile);
profileRouter.patch('/', authMiddleware, profileController.updateProfile);

// SMS code to prove the phone on file belongs to the user
profileRouter.post(
  '/phone/send-code',
  authMiddleware,
  rateLimit.otpResendLimiter,
  profileController.sendPhoneCode
);
profileRouter.post(
  '/phone/verify',
  authMiddleware,
  rateLimit.otpVerifyLimiter,
  profileController.verifyPhoneCode
);

module.exports = profileRouter;

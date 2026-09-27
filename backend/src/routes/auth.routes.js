const express = require('express');
const authRouter = express.Router();
const authController = require('../controller/authController');
const authMiddleware = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

authRouter.post('/signup', authController.signup);
authRouter.post(
  '/login',
  rateLimit.loginIpLimiter,
  rateLimit.loginAccountLimiter,
  authController.login
);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

// SMS OTP - login second factor
authRouter.post('/login/verify-otp', rateLimit.otpVerifyLimiter, authController.verifyLoginOtp);
authRouter.post('/login/resend-otp', rateLimit.otpResendLimiter, authController.resendLoginOtp);

// SMS OTP - password reset
authRouter.post(
  '/forgot-password',
  rateLimit.forgotPasswordIpLimiter,
  rateLimit.forgotPasswordAccountLimiter,
  authController.forgotPassword
);
authRouter.post('/reset-password', rateLimit.resetPasswordLimiter, authController.resetPassword);

module.exports = authRouter;

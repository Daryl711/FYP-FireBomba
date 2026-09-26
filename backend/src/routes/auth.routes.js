const express = require('express');
const authRouter = express.Router();
const authController = require('../controller/authController');
const authMiddleware = require('../middleware/auth');

authRouter.post('/signup', authController.signup);
authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

// SMS OTP - login second factor
authRouter.post('/login/verify-otp', authController.verifyLoginOtp);
authRouter.post('/login/resend-otp', authController.resendLoginOtp);

// SMS OTP - password reset
authRouter.post('/forgot-password', authController.forgotPassword);
authRouter.post('/reset-password', authController.resetPassword);

module.exports = authRouter;

const express = require('express');
const authRouter = express.Router();
const authController = require('../controller/authController');
const authMiddleware = require('../middleware/auth');

authRouter.post('/signup', authController.signup);
authRouter.post('/login', authController.login);
authRouter.post('/logout', authMiddleware, authController.logout); // protected

module.exports = authRouter;

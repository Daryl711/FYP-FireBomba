const express = require('express');
const authRouter = express.Router();
const authController = require('../controller/authController');
const authMiddleware = require('../middleware/auth');

authRouter.post('/signup', authController.signup);
authRouter.post('/login', authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);

module.exports = authRouter;

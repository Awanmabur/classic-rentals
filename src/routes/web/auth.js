
const express = require('express');
const controller = require('../../controllers/web/authPageController');
const { authenticateOptional } = require('../../middlewares/auth');

const router = express.Router();
router.get('/login', controller.showLogin);
router.post('/login', controller.loginAction);
router.get('/register', controller.showRegister);
router.post('/register', controller.registerAction);
router.post('/logout', authenticateOptional, controller.logoutAction);
router.get('/forgot-password', controller.showForgotPassword);
router.post('/forgot-password', controller.forgotPasswordAction);
router.get('/reset-password/:token?', controller.showResetPassword);
router.post('/reset-password/:token', controller.resetPasswordAction);
module.exports = router;

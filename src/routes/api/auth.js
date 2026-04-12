const express = require('express');
const controller = require('../../controllers/api/authController');
const { authenticateRequired, authenticateOptional } = require('../../middlewares/auth');
const { authLimiter } = require('../../middlewares/rateLimiters');

const router = express.Router();

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', authenticateOptional, controller.logout);
router.get('/me', authenticateRequired, controller.me);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password/:token', authLimiter, controller.resetPassword);
router.get('/verify-email/:token', controller.verifyEmail);
router.post('/resend-verification', authenticateRequired, authLimiter, controller.resendVerification);

module.exports = router;

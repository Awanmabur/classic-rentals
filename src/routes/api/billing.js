const express = require('express');
const controller = require('../../controllers/api/billingController');
const { authenticateRequired } = require('../../middlewares/auth');

const router = express.Router();
router.get('/plans', controller.getPlans);
router.get('/me', authenticateRequired, controller.getMySubscription);
router.post('/start', authenticateRequired, controller.startSubscription);
router.post('/cancel', authenticateRequired, controller.cancelMySubscription);
module.exports = router;

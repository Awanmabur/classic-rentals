const express = require('express');
const controller = require('../../controllers/api/paymentController');
const { authenticateRequired } = require('../../middlewares/auth');

const router = express.Router();

router.get('/me', authenticateRequired, controller.getMine);
router.get('/pesapal/callback', controller.pesapalCallback);
router.get('/pesapal/ipn', controller.pesapalIpn);
router.post('/pesapal/ipn', controller.pesapalIpn);

module.exports = router;

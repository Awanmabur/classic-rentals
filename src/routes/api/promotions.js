const express = require('express');
const controller = require('../../controllers/api/promotionController');
const { authenticateRequired } = require('../../middlewares/auth');

const router = express.Router();

router.get('/me', authenticateRequired, controller.getMine);
router.post('/listing/:listingId', authenticateRequired, controller.promoteListing);

module.exports = router;

const express = require('express');
const controller = require('../../controllers/api/inquiryController');
const { authenticateRequired, authenticateOptional } = require('../../middlewares/auth');
const { inquiryLimiter } = require('../../middlewares/rateLimiters');

const router = express.Router();

router.get('/me', authenticateRequired, controller.getMyInquiries);
router.post('/listing/:listingId', inquiryLimiter, authenticateOptional, controller.createInquiry);
router.patch('/:id/status', authenticateRequired, controller.updateInquiryStatus);

module.exports = router;

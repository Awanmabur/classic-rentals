const express = require('express');
const controller = require('../../controllers/api/reviewController');
const { authenticateRequired, authenticateOptional } = require('../../middlewares/auth');
const authorize = require('../../middlewares/authorize');

const router = express.Router();

router.get('/listing/:listingId', authenticateOptional, controller.getListingReviews);
router.post('/listing/:listingId', authenticateRequired, controller.createReview);
router.patch('/:id/moderate', authenticateRequired, authorize('super-admin', 'admin'), controller.moderateReview);

module.exports = router;

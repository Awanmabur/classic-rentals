const express = require('express');
const controller = require('../../controllers/api/reportController');
const { authenticateOptional, authenticateRequired } = require('../../middlewares/auth');
const authorize = require('../../middlewares/authorize');

const router = express.Router();

router.post('/listing/:listingId', authenticateOptional, controller.createReport);
router.get('/', authenticateRequired, authorize('super-admin', 'admin'), controller.getReports);
router.patch('/:id/resolve', authenticateRequired, authorize('super-admin', 'admin'), controller.resolveReport);

module.exports = router;

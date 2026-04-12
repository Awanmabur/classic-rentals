const express = require('express');
const controller = require('../../controllers/api/dashboardController');
const { authenticateRequired } = require('../../middlewares/auth');

const router = express.Router();
router.get('/summary', authenticateRequired, controller.getDashboardSummary);
module.exports = router;

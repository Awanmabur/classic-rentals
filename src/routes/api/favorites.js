const express = require('express');
const controller = require('../../controllers/api/favoriteController');
const { authenticateRequired } = require('../../middlewares/auth');

const router = express.Router();

router.get('/me', authenticateRequired, controller.getMyFavorites);
router.post('/:listingId/toggle', authenticateRequired, controller.toggleFavorite);

module.exports = router;

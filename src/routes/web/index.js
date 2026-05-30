const express = require('express');
const homeController = require('../../controllers/web/homeController');
const promotionController = require('../../controllers/web/promotionPageController');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const listingRoutes = require('./listings');

const router = express.Router();

router.get('/', homeController.index);
router.get('/p/:token', promotionController.redirectPromotion);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/listings', listingRoutes);

module.exports = router;

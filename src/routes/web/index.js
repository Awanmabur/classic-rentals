const express = require('express');
const homeController = require('../../controllers/web/homeController');
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const listingRoutes = require('./listings');

const router = express.Router();

router.get('/', homeController.index);
router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/listings', listingRoutes);

module.exports = router;

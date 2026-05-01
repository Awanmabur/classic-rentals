const express = require('express');
const authRoutes = require('./auth');
const listingRoutes = require('./listings');
const favoriteRoutes = require('./favorites');
const inquiryRoutes = require('./inquiries');
const reportRoutes = require('./reports');
const reviewRoutes = require('./reviews');
const adminRoutes = require('./admin');
const dashboardRoutes = require('./dashboard');
const userRoutes = require('./users');
const billingRoutes = require('./billing');
const paymentRoutes = require('./payments');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/inquiries', inquiryRoutes);
router.use('/reports', reportRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/billing', billingRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;

const express = require('express');
const authRoutes = require('./auth');
const productRoutes = require('./products');
const categoryRoutes = require('./categories');
const cartRoutes = require('./cart');
const orderRoutes = require('./orders');
const paymentRoutes = require('./payments');
const { auth, optionalAuth } = require('../middlewares/auth');
const reviewRoutes = require('./reviews');
const wishlistRoutes = require('./wishlist');
const notificationRoutes = require('./notifications');
const recommendationRoutes = require('./recommendations');
const historyRoutes = require('./history');
const webhookRoutes = require('./webhook');
const adminRoutes = require('./admin');
const invoiceRoutes = require('./invoices');
const shipmentRoutes = require('./shipments');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/notifications', notificationRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/history', historyRoutes);
router.use('/webhook-status', webhookRoutes);
router.use('/admin', adminRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/shipments', shipmentRoutes);

module.exports = router;

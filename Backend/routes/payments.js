const express = require('express');
const { optionalAuth } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.post('/paypal/create', optionalAuth, paymentController.createPaypalOrder);
router.post('/paypal/capture', optionalAuth, paymentController.capturePaypalOrder);
router.post('/stripe/session', optionalAuth, paymentController.createStripeSession);
router.post('/stripe/order', optionalAuth, paymentController.createStripeOrder);
router.post('/razorpay/create', optionalAuth, paymentController.createRazorpayOrder);
router.post('/razorpay/verify', optionalAuth, paymentController.verifyRazorpayPayment);
router.get('/config', paymentController.getPaymentConfig);

module.exports = router;

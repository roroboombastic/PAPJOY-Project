const express = require('express');
const { auth, optionalAuth, verifyAdmin } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');
const { validateRazorpayCreate, validateRazorpayVerify } = require('../validations/paymentValidation');

const router = express.Router();

router.get('/config', paymentController.getPaymentConfig);

router.post('/razorpay/create', optionalAuth, paymentController.createRazorpayOrder);
router.post('/razorpay/verify', optionalAuth, paymentController.verifyRazorpayPayment);
router.get('/razorpay/status/:orderId', paymentController.getRazorpayPaymentStatus);

router.post('/upi/qr', optionalAuth, paymentController.createUPIQR);

router.post('/refund', auth, verifyAdmin, paymentController.initiateRefund);

router.post('/webhook/razorpay', paymentController.razorpayWebhook);

module.exports = router;

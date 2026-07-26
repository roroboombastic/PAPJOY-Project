const express = require('express');
const rateLimit = require('express-rate-limit');
const { optionalAuth, auth } = require('../middlewares/auth');
const orderController = require('../controllers/orderController');
const { validateCreateOrder } = require('../validations/orderValidation');

const router = express.Router();

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many order requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', optionalAuth, orderLimiter, validateCreateOrder, orderController.createOrder);
router.post('/:orderId/cancel', auth, orderController.cancelOrder);
router.get('/', auth, orderController.getOrders);
router.get('/mine', auth, orderController.getUserOrders);
router.get('/:orderId/tracking', optionalAuth, orderController.getOrderTracking);
router.get('/:orderId', optionalAuth, orderController.getOrder);

module.exports = router;

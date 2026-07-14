const express = require('express');
const { optionalAuth, auth } = require('../middlewares/auth');
const orderController = require('../controllers/orderController');

const router = express.Router();

router.post('/', optionalAuth, orderController.createOrder);
router.get('/', auth, orderController.getOrders);
router.get('/mine', auth, orderController.getUserOrders);
router.get('/:orderId/tracking', optionalAuth, orderController.getOrderTracking);
router.get('/:orderId', optionalAuth, orderController.getOrder);

module.exports = router;

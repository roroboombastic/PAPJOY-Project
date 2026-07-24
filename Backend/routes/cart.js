const express = require('express');
const { auth } = require('../middlewares/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.get('/', auth, cartController.getCart);
router.post('/item', auth, cartController.addCartItem);
router.post('/sync', auth, cartController.syncCart);
router.put('/', auth, cartController.syncCart);
router.patch('/item/:productId', auth, cartController.updateCartItem);
router.delete('/item/:productId', auth, cartController.removeCartItem);
router.delete('/', auth, cartController.clearCart);

module.exports = router;

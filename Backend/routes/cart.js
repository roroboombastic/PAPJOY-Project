const express = require('express');
const { auth } = require('../middlewares/auth');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.get('/', auth, cartController.getCart);
router.post('/item', auth, cartController.addCartItem);
router.post('/sync', auth, cartController.syncCart);
router.put('/', auth, cartController.syncCart);

module.exports = router;

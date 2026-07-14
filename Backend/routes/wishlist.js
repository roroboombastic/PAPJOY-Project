const express = require('express');
const { auth } = require('../middlewares/auth');
const wishlistController = require('../controllers/wishlistController');

const router = express.Router();

router.get('/', auth, wishlistController.getWishlist);
router.post('/', auth, wishlistController.addWishlist);
router.delete('/:productId', auth, wishlistController.removeWishlist);
router.post('/sync', auth, wishlistController.syncWishlist);

module.exports = router;

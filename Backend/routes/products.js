const express = require('express');
const productController = require('../controllers/productController');
const reviewController = require('../controllers/reviewController');
const { auth, verifyAdmin } = require('../middlewares/auth');

const router = express.Router();

router.get('/', productController.listProducts);
router.get('/search', productController.searchProducts);
router.get('/filters', productController.getFilterOptions);
router.get('/filters/options', productController.getFilterOptions);
router.get('/:productId/rating-summary', reviewController.getRatingSummary);
router.get('/:slug', productController.getProduct);

router.post('/', auth, verifyAdmin, productController.createProduct);
router.put('/:id', auth, verifyAdmin, productController.updateProduct);
router.delete('/:id', auth, verifyAdmin, productController.deleteProduct);
router.post('/bulk-upload', auth, verifyAdmin, productController.bulkUpload);

module.exports = router;

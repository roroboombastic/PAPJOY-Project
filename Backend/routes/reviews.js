const express = require('express');
const { auth } = require('../middlewares/auth');
const reviewController = require('../controllers/reviewController');
const { validateCreateReview } = require('../validations/reviewValidation');

const router = express.Router();

router.post('/', auth, validateCreateReview, reviewController.createReview);
router.get('/:productId', reviewController.getReviews);
router.get('/:productId/summary', reviewController.getRatingSummary);

module.exports = router;

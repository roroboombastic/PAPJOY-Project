const { Review, Order, Product } = require('../models');
const logger = require('../utils/logger');

async function createReview(req, res) {
  try {
    const { productId, orderId, rating, title, comment, images = [] } = req.body;
    if (!productId || !rating || !comment) return res.status(400).json({ error: 'Missing required fields' });
    const purchase = await Order.findOne({ userId: req.userId, 'items.productId': productId, status: { $in: ['delivered', 'shipped', 'completed'] } });
    const isVerified = Boolean(purchase);
    const review = await Review.create({ userId: req.userId, productId, orderId: orderId || (purchase?.id || null), rating, title, comment, images, isVerified, status: 'approved' });
    const reviews = await Review.find({ productId, status: 'approved' });
    const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
    await Product.findByIdAndUpdate(productId, { rating: Number(avgRating.toFixed(1)), reviewCount: reviews.length });
    res.json(review);
  } catch (err) {
    logger.error('Create review failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create review' });
  }
}

async function getReviews(req, res) {
  try {
    const { productId } = req.params;
    const { limit = 10, page = 1, sort = 'newest' } = req.query;
    const query = { productId, status: 'approved', isVerified: true };
    let sortObj = { createdAt: -1 };
    if (sort === 'helpful') sortObj = { helpful: -1, createdAt: -1 };
    else if (sort === 'rating-high') sortObj = { rating: -1 };
    else if (sort === 'rating-low') sortObj = { rating: 1 };
    const reviews = await Review.find(query).sort(sortObj).limit(Number(limit)).skip((Number(page) - 1) * Number(limit)).lean();
    const total = await Review.countDocuments(query);
    res.json({ reviews, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Fetch reviews failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
}

async function getRatingSummary(req, res) {
  try {
    const { productId } = req.params;
    const reviews = await Review.find({ productId, status: 'approved', isVerified: true }).lean();
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((review) => { breakdown[review.rating] += 1; });
    const averageRating = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    res.json({ averageRating: Number(averageRating.toFixed(1)), totalReviews: reviews.length, breakdown });
  } catch (err) {
    logger.error('Rating summary failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch rating summary' });
  }
}

module.exports = {
  createReview,
  getReviews,
  getRatingSummary
};

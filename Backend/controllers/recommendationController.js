const { User, Product, Order } = require('../models');
const logger = require('../utils/logger');

async function getRecommendations(req, res) {
  try {
    const { productId } = req.query;
    const history = req.query.history ? [].concat(req.query.history) : [];
    const categoryIds = [];

    if (req.userId) {
      const user = await User.findById(req.userId).lean();
      if (user?.browsingHistory?.length) {
        const historyProducts = await Product.find({ _id: { $in: user.browsingHistory } }).select('categoryId').lean();
        categoryIds.push(...historyProducts.map((p) => p.categoryId).filter(Boolean));
      }
      const recentOrders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(5).lean();
      recentOrders.forEach((order) => {
        (order.items || []).forEach((item) => {
          if (item?.productId?.categoryId) {
            categoryIds.push(item.productId.categoryId);
          }
        });
      });
    }

    if (history.length) {
      const historyProducts = await Product.find({ _id: { $in: history } }).select('categoryId').lean();
      categoryIds.push(...historyProducts.map((p) => p.categoryId).filter(Boolean));
    }
    if (productId) {
      const product = await Product.findById(productId).select('categoryId').lean();
      if (product?.categoryId) categoryIds.push(product.categoryId);
    }

    const uniqueCategoryIds = [...new Set(categoryIds.map(String))].slice(0, 3);
    let recommendations = [];
    if (uniqueCategoryIds.length) {
      const query = { categoryId: { $in: uniqueCategoryIds }, isActive: true };
      if (productId) query._id = { $ne: productId };
      recommendations = await Product.find(query).sort({ isFeatured: -1, createdAt: -1 }).limit(10).lean();
    }
    if (!recommendations.length) {
      recommendations = await Product.find({ isActive: true, _id: { $ne: productId } }).sort({ isFeatured: -1, createdAt: -1 }).limit(10).lean();
    }
    res.json({ recommendations });
  } catch (err) {
    logger.error('Recommendations failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load recommendations' });
  }
}

module.exports = {
  getRecommendations
};

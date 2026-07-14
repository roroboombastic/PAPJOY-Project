const { Wishlist, Product } = require('../models');
const logger = require('../utils/logger');

async function getWishlist(req, res) {
  try {
    let wishlist = await Wishlist.findOne({ userId: req.userId }).populate('items.productId');
    if (!wishlist) wishlist = await Wishlist.create({ userId: req.userId, items: [] });
    res.json(wishlist);
  } catch (err) {
    logger.error('Get wishlist failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load wishlist' });
  }
}

async function addWishlist(req, res) {
  try {
    const { productId, variant } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID required' });
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const wishlist = await Wishlist.findOneAndUpdate(
      { userId: req.userId },
      { $setOnInsert: { userId: req.userId }, $addToSet: { items: { productId: product._id, variant: variant || 'Standard' } } },
      { upsert: true, new: true }
    ).populate('items.productId');
    res.json(wishlist);
  } catch (err) {
    logger.error('Add wishlist failed', { error: err.message });
    res.status(500).json({ error: 'Failed to add to wishlist' });
  }
}

async function removeWishlist(req, res) {
  try {
    const { productId } = req.params;
    const variant = req.query.variant || 'Standard';
    const wishlist = await Wishlist.findOneAndUpdate({ userId: req.userId }, { $pull: { items: { productId, variant } } }, { new: true }).populate('items.productId');
    res.json(wishlist || { items: [] });
  } catch (err) {
    logger.error('Remove wishlist failed', { error: err.message });
    res.status(500).json({ error: 'Failed to remove wishlist item' });
  }
}

async function syncWishlist(req, res) {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Wishlist items must be an array' });
    let wishlist = await Wishlist.findOne({ userId: req.userId });
    if (!wishlist) wishlist = await Wishlist.create({ userId: req.userId, items: [] });
    const map = new Map();
    wishlist.items.forEach((item) => map.set(`${item.productId}-${item.variant || 'Standard'}`, item));
    items.forEach((item) => map.set(`${item.productId}-${item.variant || 'Standard'}`, { productId: item.productId, variant: item.variant || 'Standard', addedAt: item.addedAt || new Date() }));
    wishlist.items = Array.from(map.values());
    await wishlist.save();
    await wishlist.populate('items.productId');
    res.json(wishlist);
  } catch (err) {
    logger.error('Sync wishlist failed', { error: err.message });
    res.status(500).json({ error: 'Failed to sync wishlist' });
  }
}

module.exports = {
  getWishlist,
  addWishlist,
  removeWishlist,
  syncWishlist
};

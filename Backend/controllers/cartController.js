const { Cart, Product } = require('../models');
const logger = require('../utils/logger');

async function getCart(req, res) {
  try {
    const cart = await Cart.findOne({ userId: req.userId }).populate('items.productId');
    res.json(cart || { items: [] });
  } catch (err) {
    logger.error('Fetch cart failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
}

async function addCartItem(req, res) {
  try {
    const { productId, variant, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    let availableStock = product.inventory?.quantity || 0;
    if (variant) {
      const variantItem = product.variants?.find((v) => v.value === variant);
      if (variantItem) availableStock = variantItem.inventory || availableStock;
    }
    if (availableStock < quantity) {
      return res.status(400).json({ error: `Only ${availableStock} items available` });
    }

    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) cart = new Cart({ userId: req.userId, items: [] });
    const existing = cart.items.find((item) => item.productId.toString() === productId && item.variant === variant);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > availableStock) {
        return res.status(400).json({ error: `Only ${availableStock} items available` });
      }
    } else {
      cart.items.push({ productId, variant, quantity, price: product.price });
    }
    await cart.save();
    await cart.populate('items.productId');
    res.json(cart);
  } catch (err) {
    logger.error('Add cart item failed', { error: err.message });
    res.status(500).json({ error: 'Failed to add item to cart' });
  }
}

async function syncCart(req, res) {
  try {
    const incomingItems = Array.isArray(req.body.cart) ? req.body.cart : [];
    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) cart = new Cart({ userId: req.userId, items: [] });
    const synced = [];
    for (const item of incomingItems) {
      const productId = item.productId || item.id || item._id;
      if (!productId) continue;
      const product = await Product.findById(productId);
      if (!product) continue;
      synced.push({ productId: product._id, variant: item.variant || 'Standard', quantity: Math.max(1, Number(item.quantity) || 1), price: Number(item.price) || product.price });
    }
    cart.items = synced;
    await cart.save();
    await cart.populate('items.productId');
    res.json(cart);
  } catch (err) {
    logger.error('Sync cart failed', { error: err.message });
    res.status(500).json({ error: 'Failed to sync cart' });
  }
}

module.exports = {
  getCart,
  addCartItem,
  syncCart
};

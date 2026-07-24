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

function findVariant(product, variantName) {
  if (!variantName) return null;
  return product.variants?.find((v) => v.name === variantName || v.value === variantName);
}

function getAvailableStock(product, variantName) {
  if (variantName) {
    const variantItem = findVariant(product, variantName);
    if (variantItem) return variantItem.inventory || 0;
  }
  return product.inventory?.quantity || 0;
}

async function addCartItem(req, res) {
  try {
    const { productId, variant, quantity = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const availableStock = getAvailableStock(product, variant);
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
    if (!incomingItems.length) {
      let cart = await Cart.findOne({ userId: req.userId });
      if (cart) {
        cart.items = [];
        await cart.save();
      }
      return res.json({ success: true });
    }

    const productIds = incomingItems.map(item => item.productId || item.id || item._id).filter(Boolean);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) cart = new Cart({ userId: req.userId, items: [] });

    cart.items = incomingItems.map(item => {
      const pid = item.productId || item.id || item._id;
      if (!pid) return null;
      const product = productMap.get(pid.toString());
      if (!product) return null;
      return { productId: product._id, variant: item.variant || 'Standard', quantity: Math.max(1, Number(item.quantity) || 1), price: Number(item.price) || product.price };
    }).filter(Boolean);

    await cart.save();
    res.json({ success: true });
  } catch (err) {
    logger.error('Sync cart failed', { error: err.message });
    res.status(500).json({ error: 'Failed to sync cart' });
  }
}

async function updateCartItem(req, res) {
  try {
    const { productId } = req.params;
    const { quantity, variant } = req.body;
    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const availableStock = getAvailableStock(product, variant);
    if (quantity > availableStock) {
      return res.status(400).json({ error: `Only ${availableStock} items available` });
    }

    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    const existing = cart.items.find((item) => item.productId.toString() === productId && item.variant === (variant || 'Standard'));
    if (!existing) return res.status(404).json({ error: 'Item not found in cart' });

    existing.quantity = quantity;
    existing.price = product.price;
    await cart.save();
    await cart.populate('items.productId');
    res.json(cart);
  } catch (err) {
    logger.error('Update cart item failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update cart item' });
  }
}

async function removeCartItem(req, res) {
  try {
    const { productId } = req.params;
    const variant = req.query.variant || 'Standard';

    let cart = await Cart.findOne({ userId: req.userId });
    if (!cart) return res.status(404).json({ error: 'Cart not found' });

    const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId && item.variant === variant);
    if (itemIndex === -1) return res.status(404).json({ error: 'Item not found in cart' });

    cart.items.splice(itemIndex, 1);
    await cart.save();
    res.json(cart);
  } catch (err) {
    logger.error('Remove cart item failed', { error: err.message });
    res.status(500).json({ error: 'Failed to remove cart item' });
  }
}

async function clearCart(req, res) {
  try {
    await Cart.findOneAndUpdate(
      { userId: req.userId },
      { $set: { items: [] } }
    );
    res.json({ success: true, items: [] });
  } catch (err) {
    logger.error('Clear cart failed', { error: err.message });
    res.status(500).json({ error: 'Failed to clear cart' });
  }
}

module.exports = {
  getCart,
  addCartItem,
  syncCart,
  updateCartItem,
  removeCartItem,
  clearCart
};

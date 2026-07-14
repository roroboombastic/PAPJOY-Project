const { User, Product } = require('../models');

async function saveHistory(req, res) {
  const { productId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Product ID is required for history tracking' });
  }

  try {
    const product = await Product.findById(productId).select('_id');
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const existingUser = await User.findById(req.userId);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    existingUser.browsingHistory = existingUser.browsingHistory || [];
    existingUser.browsingHistory = existingUser.browsingHistory.filter(
      (id) => id.toString() !== productId
    );
    existingUser.browsingHistory.unshift(product._id);
    existingUser.browsingHistory = existingUser.browsingHistory.slice(0, 20);

    await existingUser.save();
    res.json({ message: 'Browsing history updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save browsing history' });
  }
}

module.exports = {
  saveHistory
};

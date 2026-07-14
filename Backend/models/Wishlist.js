const mongoose = require('mongoose');

const wishlistItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variant: String,
  addedAt: { type: Date, default: Date.now }
}, { _id: false });

const wishlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: 'My Wishlist' },
  items: [wishlistItemSchema],
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

wishlistSchema.index({ userId: 1 });

module.exports = mongoose.model('Wishlist', wishlistSchema);

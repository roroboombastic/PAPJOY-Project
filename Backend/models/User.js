const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  type: { type: String, enum: ['billing', 'shipping'], required: true },
  name: { type: String, required: true },
  phone: String,
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true, default: 'India' },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const shippingAddressSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  line1: String,
  line2: String,
  city: String,
  state: String,
  postalCode: String,
  country: { type: String, default: 'India' }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: function () { return !this.oauthProvider; } },
  phone: { type: String, trim: true, unique: true, sparse: true },
  avatar: String,
  role: { type: String, enum: ['customer', 'seller', 'warehouse_manager', 'admin', 'super_admin'], default: 'customer' },
  isActive: { type: Boolean, default: true },
  marketingOptIn: { type: Boolean, default: false },
  oauthProvider: String,
  oauthId: String,
  gstin: String,
  companyName: String,
  shippingAddress: shippingAddressSchema,
  preferredPaymentMethod: { type: String, enum: ['card', 'paypal', 'bank_transfer', 'cod', 'upi', 'bnpl', 'wallet'], default: 'cod' },
  addresses: [addressSchema],
  browsingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  preferences: {
    currency: { type: String, default: 'INR' },
    language: { type: String, default: 'en' },
    notifications: { type: Boolean, default: true }
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('User', userSchema);

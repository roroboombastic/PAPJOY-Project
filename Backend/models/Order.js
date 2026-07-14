const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  variant: String,
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  gstRate: { type: Number, default: 18 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  igst: { type: Number, default: 0 }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  street: String,
  city: String,
  state: String,
  zipCode: String,
  country: String
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  carrier: String,
  trackingNumber: String,
  trackingUrl: String,
  estimatedDelivery: Date,
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'refunded', 'cancelled'], default: 'pending' },
  events: [{
    timestamp: { type: Date, default: Date.now },
    location: String,
    message: String,
    status: String
  }]
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  invoiceNumber: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'],
    default: 'pending'
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true, min: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  gstTotal: { type: Number, default: 0 },
  shipping: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  paymentMethod: { type: String, enum: ['card', 'paypal', 'bank_transfer', 'cod', 'upi', 'bnpl', 'wallet', 'web'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  shipment: shipmentSchema,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

orderSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

orderSchema.index({ userId: 1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);

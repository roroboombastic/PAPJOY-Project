const mongoose = require('mongoose');

const shipmentEventSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  location: String,
  message: String,
  status: String
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderNumber: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  carrier: String,
  trackingNumber: String,
  trackingUrl: String,
  estimatedDelivery: Date,
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'returned', 'refunded', 'cancelled'], default: 'pending' },
  events: [shipmentEventSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

shipmentSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

shipmentSchema.index({ orderId: 1 });
shipmentSchema.index({ orderNumber: 1 });
shipmentSchema.index({ userId: 1 });

module.exports = mongoose.model('Shipment', shipmentSchema);

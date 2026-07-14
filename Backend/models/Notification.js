const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['order', 'payment', 'delivery', 'promotion', 'system'], default: 'order' },
  channel: { type: String, enum: ['email', 'sms', 'app'], default: 'app' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

notificationSchema.index({ userId: 1 });
notificationSchema.index({ orderId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

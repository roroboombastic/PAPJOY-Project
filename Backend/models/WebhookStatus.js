const mongoose = require('mongoose');

const webhookStatusSchema = new mongoose.Schema({
  lastEvent: String,
  lastReceivedAt: Date,
  lastError: String,
  count: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('WebhookStatus', webhookStatusSchema);

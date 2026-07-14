const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  address: String,
  city: String,
  state: String,
  postalCode: String,
  country: { type: String, default: 'India' },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

warehouseSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Warehouse', warehouseSchema);

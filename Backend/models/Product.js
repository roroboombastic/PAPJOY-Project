const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  alt: String,
  isPrimary: { type: Boolean, default: false }
}, { _id: false });

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  value: { type: String, required: true },
  priceModifier: { type: Number, default: 0 },
  sku: String,
  barcode: String,
  inventory: { type: Number, default: 0 }
}, { _id: false });

const stockMovementSchema = new mongoose.Schema({
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  quantity: { type: Number, required: true },
  type: { type: String, enum: ['inbound', 'outbound', 'return', 'adjustment'], required: true },
  reference: String,
  note: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const warehouseInventorySchema = new mongoose.Schema({
  warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantity: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, required: true },
  shortDescription: String,
  price: { type: Number, required: true, min: 0 },
  comparePrice: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: String,
  sku: { type: String, unique: true, sparse: true },
  barcode: String,
  hsnCode: String,
  sacCode: String,
  gstPercentage: { type: Number, default: 18 },
  inventory: {
    quantity: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 10 },
    trackInventory: { type: Boolean, default: true }
  },
  warehouseInventory: [warehouseInventorySchema],
  images: [imageSchema],
  videos: [String],
  variants: [variantSchema],
  attributes: [{ name: String, value: String }],
  tags: [String],
  seo: {
    title: String,
    description: String,
    keywords: [String]
  },
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  stockMovements: [stockMovementSchema]
});

productSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

productSchema.index({ categoryId: 1 });
productSchema.index({ tags: 1 });

module.exports = mongoose.model('Product', productSchema);

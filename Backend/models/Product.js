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
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  brand: String,
  sku: { type: String, unique: true, sparse: true },
  barcode: String,
  hsnCode: String,
  sacCode: String,
  gstPercentage: { type: Number, default: 18 },
  shippingCharge: { type: Number, default: 0, min: 0 },
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

function generateEan13() {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
  const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

productSchema.pre('save', function () {
  this.updatedAt = Date.now();
  if (!this.barcode) this.barcode = generateEan13();
});

productSchema.index({ categoryId: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ brand: 1 });
productSchema.index({ price: 1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);

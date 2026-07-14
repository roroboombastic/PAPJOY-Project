const mongoose = require('mongoose');
const { BUSINESS_NAME, BUSINESS_GSTIN } = require('../utils/gst');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderNumber: { type: String, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment' },
  
  // Customer Details
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String, required: true },
  billingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },

  // Company Details
  companyName: { type: String, default: BUSINESS_NAME },
  companyEmail: { type: String, default: 'support@papjoy.com' },
  companyPhone: { type: String, default: '+91-XXXXX-XXXXX' },
  companyAddress: {
    street: { type: String, default: 'New Delhi, India' },
    city: { type: String, default: 'New Delhi' },
    state: { type: String, default: 'DL' },
    zipCode: { type: String, default: '110001' },
    country: { type: String, default: 'India' }
  },
  companyGSTIN: { type: String, default: BUSINESS_GSTIN },
  companyLogo: { type: String, default: 'https://via.placeholder.com/150?text=PAPJOY' },

  // Order Items
  items: [{
    productName: String,
    quantity: Number,
    unitPrice: Number,
    total: Number,
    gstRate: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    _id: false
  }],

  // Amounts
  subtotal: { type: Number, required: true, min: 0 },
  cgstTotal: { type: Number, default: 0 },
  sgstTotal: { type: Number, default: 0 },
  igstTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  shippingCharges: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true, min: 0 },

  // Payment Details
  paymentMethod: { type: String, enum: ['card', 'paypal', 'bank_transfer', 'cod', 'upi', 'bnpl', 'wallet', 'web'] },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentDate: Date,
  transactionId: String,

  // QR Code
  qrCodeData: String, // Will store order details as JSON for QR code

  // Dates
  invoiceDate: { type: Date, default: Date.now },
  dueDate: Date,
  refundDate: Date,

  // Status
  status: { type: String, enum: ['draft', 'issued', 'viewed', 'paid', 'partially_paid', 'refunded', 'cancelled'], default: 'draft' },
  notes: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

invoiceSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

invoiceSchema.index({ orderId: 1 });
invoiceSchema.index({ userId: 1 });
invoiceSchema.index({ status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);

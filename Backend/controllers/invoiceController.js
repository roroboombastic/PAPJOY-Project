const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const User = require('../models/User');
const InvoiceSequence = require('../models/InvoiceSequence');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const { calculateOrderTotals, roundMoney, BUSINESS_GSTIN, BUSINESS_NAME, GST_PERCENT, GST_STATE, GST_RETURN_POLICY, CUSTOMER_SUPPORT } = require('../utils/gst');
const { ADMIN_EMAILS } = require('../config');

const PAPJOY_LOGO_URL = 'https://cdn.phototourl.com/free/2026-07-26-69fc6ff4-f369-46df-91d3-e8ca8e11dda2.jpg';

function fetchImageBuffer(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageBuffer(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Image fetch timeout')); });
  });
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function generateInvoiceNumber(invoiceDate = new Date()) {
  const year = invoiceDate.getFullYear();
  const sequenceDoc = await InvoiceSequence.findOneAndUpdate(
    { year },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `PAP-INV-${year}-${String(sequenceDoc.sequence).padStart(6, '0')}`;
}

function buildAddressLine(address = {}) {
  return [address.street, address.city, address.state, address.zipCode, address.country].filter(Boolean).join(', ');
}

function canAccessInvoice(invoice, req, guestEmail = '') {
  if (req.userEmail && ADMIN_EMAILS.includes(normalizeEmail(req.userEmail))) return true;
  if (invoice.userId && req.userId) {
    const invoiceUserId = (invoice.userId._id || invoice.userId).toString();
    return invoiceUserId === req.userId.toString();
  }
  if (!invoice.userId) {
    return normalizeEmail(guestEmail) && normalizeEmail(guestEmail) === normalizeEmail(invoice.customerEmail);
  }
  return false;
}

// Generate invoice after successful payment
async function generateInvoice(orderId) {
  try {
    const order = await Order.findById(orderId).populate('userId').populate('shipmentId');
    if (!order) {
      throw new Error('Order not found');
    }

    // Check if invoice already exists
    let invoice = await Invoice.findOne({ orderId });
    if (invoice) {
      return invoice;
    }

    const invoiceDate = new Date(order.createdAt || Date.now());
    const invoiceNumber = await generateInvoiceNumber(invoiceDate);
    const user = order.userId && order.userId.name ? order.userId : null;
    const customerName = user?.name || order.shippingAddress?.name || order.billingAddress?.name || 'Guest Customer';
    const customerEmail = user?.email || order.shippingAddress?.email || order.billingAddress?.email || 'guest@papjoy.com';
    const customerPhone = user?.phone || order.shippingAddress?.phone || order.billingAddress?.phone || '';

    const totals = calculateOrderTotals({
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? item.price ?? 0,
        price: item.price ?? item.unitPrice ?? 0,
        gstRate: item.gstRate || GST_PERCENT
      })),
      shipping: order.shipping,
      discount: order.discount,
      billingState: order.billingAddress?.state,
      sellerState: GST_STATE
    });

    const items = totals.items.map((item) => ({
      productName: item.name,
      variant: item.variant || 'Standard',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      gstRate: item.gstRate,
      cgst: item.cgst,
      sgst: item.sgst,
      igst: item.igst
    }));

    // Create QR code data
    const qrData = {
      invoiceNumber,
      orderId: orderId.toString(),
      total: totals.total,
      gstin: BUSINESS_GSTIN,
      businessName: BUSINESS_NAME,
      paymentStatus: order.paymentStatus,
      date: invoiceDate.toISOString()
    };

    // Create invoice
    const invoiceData = new Invoice({
      invoiceNumber,
      orderId,
      orderNumber: order.orderNumber,
      userId: order.userId?._id || order.userId || null,
      shipmentId: order.shipmentId?._id || order.shipmentId || order.shipment?.shipmentId || null,
      customerName,
      customerEmail,
      customerPhone,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
      items,
      subtotal: totals.subtotal,
      cgstTotal: totals.cgstTotal,
      sgstTotal: totals.sgstTotal,
      igstTotal: totals.igstTotal,
      taxTotal: totals.taxTotal,
      shippingCharges: totals.shipping,
      discount: totals.discount,
      total: totals.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      qrCodeData: JSON.stringify(qrData),
      status: order.paymentStatus === 'paid' ? 'paid' : 'issued',
      notes: `GST ${GST_PERCENT}% | ${BUSINESS_GSTIN}`,
      invoiceDate
    });

    await invoiceData.save();

    // Update order with invoice reference
    order.invoiceId = invoiceData._id;
    order.invoiceNumber = invoiceNumber;
    order.subtotal = totals.subtotal;
    order.cgstTotal = totals.cgstTotal;
    order.sgstTotal = totals.sgstTotal;
    order.igstTotal = totals.igstTotal;
    order.gstTotal = totals.gstTotal;
    order.tax = totals.taxTotal;
    order.shipping = totals.shipping;
    order.discount = totals.discount;
    order.total = totals.total;
    await order.save();

    logger.info('Invoice generated', { invoiceNumber, orderId, userId: order.userId?._id || order.userId || null });

    if (customerEmail) {
      emailService.sendMail({
        to: customerEmail,
        subject: `Invoice #${invoiceNumber} for your PAP-JOY order`,
        html: emailService.invoiceEmailTemplate(invoiceData)
      });
    }

    return invoiceData;
  } catch (err) {
    logger.error('Generate invoice failed', { error: err.message });
    throw err;
  }
}

// Get invoice by orderId
async function getInvoice(req, res) {
  try {
    const { orderId } = req.params;
    const invoice = await Invoice.findOne({ orderId }).populate('userId', 'name email phone');
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!canAccessInvoice(invoice, req, req.query.email)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(invoice);
  } catch (err) {
    logger.error('Fetch invoice failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
}

// Download invoice as PDF
async function downloadInvoicePDF(req, res) {
  try {
    const { orderId } = req.params;
    const invoice = await Invoice.findOne({ orderId });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!canAccessInvoice(invoice, req, req.query.email)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const pdf = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
    const filename = `invoice-${invoice.invoiceNumber}.pdf`;
    const buffers = [];
    let responseSent = false;
    pdf.on('data', (chunk) => buffers.push(chunk));
    pdf.on('end', async () => {
      if (responseSent) return;
      responseSent = true;
      const pdfBuffer = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(pdfBuffer);

      // Update invoice status to viewed
      await Invoice.updateOne({ _id: invoice._id }, { status: 'viewed' }).catch(err => {
        logger.error('Failed to update invoice status', { error: err.message });
      });
    });

    pdf.on('error', (err) => {
      if (responseSent) return;
      responseSent = true;
      logger.error('PDF generation error', { error: err.message });
      res.status(500).json({ error: 'Failed to generate PDF' });
    });

    const qrBuffer = invoice.qrCodeData ? await QRCode.toBuffer(invoice.qrCodeData, { width: 140, margin: 1 }) : null;
    const billingAddress = invoice.billingAddress || {};
    const shippingAddress = invoice.shippingAddress || {};
    const isSameAddress = JSON.stringify(billingAddress) === JSON.stringify(shippingAddress);
    const logoX = 36;
    const logoY = 32;
    const pageWidth = 520;

    let logoBuffer = null;
    try {
      logoBuffer = await fetchImageBuffer(PAPJOY_LOGO_URL, 4000);
    } catch (logoErr) {
      logger.debug('Logo fetch failed, using fallback', { error: logoErr.message });
    }

    if (logoBuffer && logoBuffer.length > 500) {
      try {
        pdf.image(logoBuffer, logoX, logoY, { width: 44, height: 44, fit: 'contain' });
      } catch (_) {
        pdf.roundedRect(logoX, logoY, 44, 44, 10).fillAndStroke('#1f4b3f', '#1f4b3f');
        pdf.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('PJ', logoX + 8, logoY + 10);
      }
    } else {
      pdf.roundedRect(logoX, logoY, 44, 44, 10).fillAndStroke('#1f4b3f', '#1f4b3f');
      pdf.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('PJ', logoX + 8, logoY + 10);
    }
    pdf.fillColor('#111111');
    pdf.fontSize(20).font('Helvetica-Bold').text(BUSINESS_NAME, 92, 36);
    pdf.fontSize(9).font('Helvetica').fillColor('#555555').text('Premium footwear and accessories', 92, 58);
    pdf.fillColor('#111111');

    pdf.fontSize(15).font('Helvetica-Bold').text('Tax Invoice', 400, 36, { align: 'right', width: 120 });
    pdf.fontSize(9).font('Helvetica').text(`Invoice #: ${invoice.invoiceNumber}`, 392, 58, { align: 'right', width: 128 });
    pdf.text(`Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 392, 72, { align: 'right', width: 128 });
    pdf.text(`GSTIN: ${BUSINESS_GSTIN}`, 392, 86, { align: 'right', width: 128 });

    pdf.moveTo(36, 108).lineTo(556, 108).strokeColor('#d9d9d9').stroke();

    pdf.fontSize(10).font('Helvetica-Bold').text('Seller', 36, 120);
    pdf.fontSize(9).font('Helvetica')
      .text(BUSINESS_NAME, 36, 136)
      .text(`GSTIN: ${BUSINESS_GSTIN}`, 36, 150)
      .text(`State: ${GST_STATE}`, 36, 164)
      .text(`Support: ${CUSTOMER_SUPPORT}`, 36, 178);

    pdf.fontSize(10).font('Helvetica-Bold').text('Customer', 280, 120);
    pdf.fontSize(9).font('Helvetica')
      .text(invoice.customerName, 280, 136)
      .text(invoice.customerEmail, 280, 150)
      .text(invoice.customerPhone, 280, 164)
      .text(buildAddressLine(billingAddress) || 'N/A', 280, 178);

    pdf.fontSize(10).font('Helvetica-Bold').text('Order', 36, 212);
    pdf.fontSize(9).font('Helvetica')
      .text(`Order Number: ${invoice.orderNumber || invoice.orderId}`, 36, 228)
      .text(`Order Date: ${new Date(invoice.invoiceDate).toLocaleString()}`, 36, 242)
      .text(`Payment Method: ${(invoice.paymentMethod || 'cod').toUpperCase()}`, 36, 256)
      .text(`Payment Status: ${(invoice.paymentStatus || 'pending').toUpperCase()}`, 36, 270);

    if (!isSameAddress) {
      pdf.fontSize(10).font('Helvetica-Bold').text('Shipping', 280, 212);
      pdf.fontSize(9).font('Helvetica')
        .text(buildAddressLine(shippingAddress) || 'N/A', 280, 228);
    }

    const tableTop = 304;
    const col = { item: 36, variant: 228, qty: 318, unit: 362, gst: 440, amount: 490 };
    pdf.fontSize(10).font('Helvetica-Bold');
    pdf.text('Product', col.item, tableTop);
    pdf.text('Variant', col.variant, tableTop);
    pdf.text('Qty', col.qty, tableTop);
    pdf.text('Unit Price', col.unit, tableTop);
    pdf.text('GST', col.gst, tableTop);
    pdf.text('Line Total', col.amount, tableTop);
    pdf.moveTo(36, tableTop + 14).lineTo(556, tableTop + 14).stroke();

    let y = tableTop + 24;
    pdf.fontSize(9).font('Helvetica');
    for (const item of invoice.items) {
      pdf.text(String(item.productName || '').slice(0, 26), col.item, y, { width: 170 });
      pdf.text(String(item.variant || 'Standard').slice(0, 18), col.variant, y, { width: 78 });
      pdf.text(String(item.quantity), col.qty, y);
      pdf.text(`₹${roundMoney(item.unitPrice || 0).toLocaleString('en-IN')}`, col.unit, y, { width: 74, align: 'right' });
      pdf.text(`${item.gstRate || GST_PERCENT}%`, col.gst, y, { width: 40, align: 'right' });
      pdf.text(`₹${roundMoney(item.total || 0).toLocaleString('en-IN')}`, col.amount, y, { width: 66, align: 'right' });
      y += 18;
    }

    pdf.moveTo(36, y).lineTo(556, y).stroke();
    y += 14;

    const summaryLeft = 330;
    pdf.fontSize(10).font('Helvetica');
    pdf.text(`Subtotal`, summaryLeft, y, { width: 120 });
    pdf.text(`₹${roundMoney(invoice.subtotal).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
    y += 16;
    pdf.text(`CGST (9%)`, summaryLeft, y, { width: 120 });
    pdf.text(`₹${roundMoney(invoice.cgstTotal).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
    y += 16;
    pdf.text(`SGST (9%)`, summaryLeft, y, { width: 120 });
    pdf.text(`₹${roundMoney(invoice.sgstTotal).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
    y += 16;
    if (roundMoney(invoice.igstTotal) > 0) {
      pdf.text(`IGST`, summaryLeft, y, { width: 120 });
      pdf.text(`₹${roundMoney(invoice.igstTotal).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
      y += 16;
    }
    pdf.text(`Shipping`, summaryLeft, y, { width: 120 });
    pdf.text(`₹${roundMoney(invoice.shippingCharges).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
    y += 16;
    pdf.text(`Discount`, summaryLeft, y, { width: 120 });
    pdf.text(`-₹${roundMoney(invoice.discount).toLocaleString('en-IN')}`, 470, y, { width: 86, align: 'right' });
    y += 16;
    pdf.font('Helvetica-Bold');
    pdf.text(`Grand Total`, summaryLeft, y + 2, { width: 120 });
    pdf.text(`₹${roundMoney(invoice.total).toLocaleString('en-IN')}`, 470, y + 2, { width: 86, align: 'right' });

    pdf.fontSize(9).font('Helvetica').text(`GST Collected: ₹${roundMoney(invoice.taxTotal).toLocaleString('en-IN')}`, 36, 510);

    pdf.fontSize(10).font('Helvetica-Bold').text('Payment Details', 36, 540);
    pdf.fontSize(9).font('Helvetica')
      .text(`Method: ${(invoice.paymentMethod || 'cod').toUpperCase()}`, 36, 556)
      .text(`Status: ${(invoice.paymentStatus || 'pending').toUpperCase()}`, 36, 570)
      .text(`Invoice Status: ${(invoice.status || 'issued').toUpperCase()}`, 36, 584);

    if (qrBuffer) {
      pdf.image(qrBuffer, 430, 530, { width: 100, height: 100 });
      pdf.fontSize(8).fillColor('#555555').text('Scan to verify invoice details', 420, 636, { width: 120, align: 'center' });
      pdf.fillColor('#111111');
    }

    pdf.fontSize(8).fillColor('#555555').text(`Terms & Conditions: ${GST_RETURN_POLICY}`, 36, 700, { width: pageWidth, align: 'left' });
    pdf.text(`Customer Support: ${CUSTOMER_SUPPORT}`, 36, 712, { width: pageWidth, align: 'left' });
    pdf.fillColor('#111111');
    pdf.end();
  } catch (err) {
    logger.error('Download invoice PDF failed', { error: err.message });
    res.status(500).json({ error: 'Failed to download invoice' });
  }
}

// Get invoice preview (HTML)
async function getInvoicePreview(req, res) {
  try {
    const { orderId } = req.params;
    const invoice = await Invoice.findOne({ orderId });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (!canAccessInvoice(invoice, req, req.query.email)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({ invoice });
  } catch (err) {
    logger.error('Get invoice preview failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch invoice preview' });
  }
}

// List user invoices
async function listUserInvoices(req, res) {
  try {
    const invoices = await Invoice.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ invoices });
  } catch (err) {
    logger.error('List invoices failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
}

async function listAllInvoices(req, res) {
  try {
    const { page = 1, limit = 50, status, search = '' } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { invoiceNumber: { $regex: safeSearch, $options: 'i' } },
        { customerName: { $regex: safeSearch, $options: 'i' } },
        { customerEmail: { $regex: safeSearch, $options: 'i' } },
        { customerPhone: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const invoices = await Invoice.find(query).sort({ createdAt: -1 }).limit(Number(limit)).skip((Number(page) - 1) * Number(limit));
    const total = await Invoice.countDocuments(query);
    res.json({ invoices, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (err) {
    logger.error('Admin invoice list failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
}

module.exports = {
  generateInvoice,
  getInvoice,
  downloadInvoicePDF,
  getInvoicePreview,
  listUserInvoices,
  listAllInvoices,
  generateInvoiceNumber
};

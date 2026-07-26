const crypto = require('crypto');
const QRCode = require('qrcode');
const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_CURRENCY, APP_URL, BUSINESS_NAME } = require('../config');
const { isRazorpayConfigured, getRazorpayInstance } = require('../utils/paymentConfig');
const { createOrderFromData } = require('../services/orderService');
const { Order, Invoice } = require('../models');
const invoiceController = require('./invoiceController');
const logger = require('../utils/logger');

const Razorpay = isRazorpayConfigured() ? require('razorpay') : null;

function getRazorpayClient() {
  if (!Razorpay || !isRazorpayConfigured()) return null;
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

function getPaymentConfig(req, res) {
  const razorpayConfigured = isRazorpayConfigured();
  res.json({
    razorpay: { configured: razorpayConfigured },
    card: { enabled: razorpayConfigured },
    upi: { enabled: true },
    cod: { enabled: true },
    razorpayKeyId: razorpayConfigured ? RAZORPAY_KEY_ID : null,
    currency: RAZORPAY_CURRENCY || 'INR'
  });
}

async function createRazorpayOrder(req, res) {
  try {
    const { amount, currency, receipt, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your environment.' });
    }

    const orderAmount = Math.round(Number(amount) * 100);
    const order = await razorpay.orders.create({
      amount: orderAmount,
      currency: currency || RAZORPAY_CURRENCY || 'INR',
      receipt: receipt || `pj_${Date.now()}`,
      notes: notes || {},
      payment_capture: 1
    });

    logger.info('Razorpay order created', { orderId: order.id, amount: orderAmount, currency: order.currency });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: RAZORPAY_KEY_ID
    });
  } catch (err) {
    logger.error('Create Razorpay order failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to create payment order' });
  }
}

function verifyRazorpaySignature(paymentId, orderId, signature) {
  if (!RAZORPAY_KEY_SECRET) return false;
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
}

async function verifyRazorpayPayment(req, res) {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, items, deliveryInfo, shipping, discount, notes } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification data' });
    }

    const isValid = verifyRazorpaySignature(razorpay_payment_id, razorpay_order_id, razorpay_signature);
    if (!isValid) {
      logger.warn('Razorpay signature verification failed', { paymentId: razorpay_payment_id, orderId: razorpay_order_id });
      return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    const razorpay = getRazorpayClient();
    let paymentDetails = null;
    if (razorpay) {
      try {
        paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
      } catch (fetchErr) {
        logger.warn('Could not fetch Razorpay payment details', { error: fetchErr.message });
      }
    }

    const paymentStatus = paymentDetails?.status === 'captured' ? 'paid' : 'paid';

    let order;
    try {
      order = await createOrderFromData({
        userId: req.userId || null,
        items: items || [],
        paymentMethod: 'card',
        shipping: shipping || 0,
        discount: discount || 0,
        currency: RAZORPAY_CURRENCY || 'INR',
        deliveryInfo: deliveryInfo || {},
        notes: notes || '',
        paymentStatus
      });
    } catch (orderErr) {
      logger.error('Order creation after payment failed', { error: orderErr.message, paymentId: razorpay_payment_id });
      return res.status(500).json({ error: 'Payment succeeded but order creation failed. Contact support with Payment ID: ' + razorpay_payment_id });
    }

    order.paymentDetails = {
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      method: paymentDetails?.method || 'card',
      amount: paymentDetails?.amount ? paymentDetails.amount / 100 : order.total,
      bank: paymentDetails?.bank || '',
      cardType: paymentDetails?.card?.type || '',
      last4: paymentDetails?.card?.last4 || ''
    };
    await order.save();

    invoiceController.generateInvoice(order._id).catch((err) => {
      logger.error('Auto invoice generation failed', { error: err.message, orderId: order._id });
    });

    logger.info('Razorpay payment verified and order created', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentId: razorpay_payment_id
    });

    res.json({
      success: true,
      order,
      payment: {
        id: razorpay_payment_id,
        orderId: razorpay_order_id,
        status: 'verified'
      }
    });
  } catch (err) {
    logger.error('Verify Razorpay payment failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Payment verification failed' });
  }
}

async function getRazorpayPaymentStatus(req, res) {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay is not configured' });
    }

    const order = await razorpay.orders.fetch(orderId);
    const payments = await razorpay.orders.fetchPayments(orderId);

    const paidPayment = payments.items?.find(p => p.status === 'captured');

    res.json({
      orderId: order.id,
      status: order.status,
      amount: order.amount,
      currency: order.currency,
      paid: !!paidPayment,
      paymentId: paidPayment?.id || null,
      paymentStatus: paidPayment?.status || 'pending'
    });
  } catch (err) {
    logger.error('Fetch Razorpay payment status failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
}

async function createUPIQR(req, res) {
  try {
    const { amount, orderNumber, upiId } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const merchantVpa = upiId || 'papjoy@upi';
    const txnNote = orderNumber ? `Order ${orderNumber}` : `PAPJOY Payment`;
    const amountStr = Number(amount).toFixed(2);

    const upiString = `upi://pay?pa=${encodeURIComponent(merchantVpa)}&pn=${encodeURIComponent(BUSINESS_NAME)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(txnNote)}`;

    const qrDataUrl = await QRCode.toDataURL(upiString, {
      width: 300,
      margin: 2,
      color: { dark: '#1f4b3f', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });

    let razorpayOrder = null;
    if (isRazorpayConfigured()) {
      try {
        const razorpay = getRazorpayClient();
        razorpayOrder = await razorpay.orders.create({
          amount: Math.round(Number(amount) * 100),
          currency: RAZORPAY_CURRENCY || 'INR',
          receipt: `upi_qr_${Date.now()}`,
          notes: { method: 'upi_qr', orderNumber: orderNumber || '' },
          payment_capture: 1
        });
      } catch (rpErr) {
        logger.warn('Could not create Razorpay order for UPI QR polling', { error: rpErr.message });
      }
    }

    logger.info('UPI QR code generated', { amount, merchantVpa, orderNumber });

    res.json({
      success: true,
      qrImage: qrDataUrl,
      upiString,
      merchantVpa,
      amount: amountStr,
      currency: 'INR',
      razorpayOrderId: razorpayOrder?.id || null,
      pollUrl: razorpayOrder ? `/api/v1/payments/razorpay/status/${razorpayOrder.id}` : null
    });
  } catch (err) {
    logger.error('Create UPI QR failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to generate UPI QR code' });
  }
}

async function initiateRefund(req, res) {
  try {
    const { orderId, amount, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ error: `Cannot refund order with payment status "${order.paymentStatus}"` });
    }

    if (!order.paymentDetails?.razorpayPaymentId) {
      return res.status(400).json({ error: 'No Razorpay payment found for this order. Cannot process automatic refund.' });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      return res.status(503).json({ error: 'Razorpay is not configured. Cannot process refund.' });
    }

    const refundAmount = amount ? Math.round(Number(amount) * 100) : Math.round(order.total * 100);

    const refund = await razorpay.payments.refund(order.paymentDetails.razorpayPaymentId, {
      amount: refundAmount,
      notes: { reason: reason || 'Customer requested refund', orderId: order._id.toString() }
    });

    order.paymentStatus = 'refunded';
    order.status = 'refunded';
    order.refundDetails = {
      razorpayRefundId: refund.id,
      amount: refundAmount / 100,
      reason: reason || '',
      initiatedAt: new Date()
    };
    await order.save();

    await Invoice.findOneAndUpdate(
      { orderId: order._id },
      { paymentStatus: 'refunded', status: 'refunded', refundDate: new Date() }
    ).catch(err => {
      logger.error('Failed to update invoice for refund', { error: err.message });
    });

    try {
      const { restoreInventoryForOrder } = require('../services/orderService');
      await restoreInventoryForOrder(order);
    } catch (invErr) {
      logger.error('Inventory restore after refund failed', { error: invErr.message, orderId: order._id });
    }

    logger.info('Refund initiated', { orderId: order._id, refundId: refund.id, amount: refundAmount / 100 });

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refundAmount / 100,
        status: refund.status
      },
      order
    });
  } catch (err) {
    logger.error('Initiate refund failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to process refund' });
  }
}

function verifyWebhookSignature(body, signature) {
  if (!RAZORPAY_KEY_SECRET || !signature) return false;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function razorpayWebhook(req, res) {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    if (!verifyWebhookSignature(req.body, webhookSignature)) {
      logger.warn('Razorpay webhook signature verification failed', { ip: req.ip });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body?.event;
    const payload = req.body?.payload?.payment?.entity || {};

    logger.info('Razorpay webhook received (verified)', { event, paymentId: payload.id });

    if (event === 'payment.captured') {
      const orderId = payload.order_id;
      const paymentId = payload.id;

      const order = await Order.findOne({ 'paymentDetails.razorpayOrderId': orderId });
      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.paymentDetails.razorpayPaymentId = paymentId;
        order.paymentDetails.capturedAt = new Date();
        await order.save();
        logger.info('Order payment confirmed via webhook', { orderId: order._id, paymentId });
      }
    }

    if (event === 'payment.failed') {
      const orderId = payload.order_id;
      const order = await Order.findOne({ 'paymentDetails.razorpayOrderId': orderId });
      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
        logger.info('Order payment failed via webhook', { orderId: order._id });
      }
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('Razorpay webhook processing failed', { error: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = {
  getPaymentConfig,
  createRazorpayOrder,
  verifyRazorpayPayment,
  getRazorpayPaymentStatus,
  createUPIQR,
  initiateRefund,
  razorpayWebhook
};

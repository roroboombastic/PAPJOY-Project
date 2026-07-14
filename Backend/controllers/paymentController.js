const paypal = require('@paypal/checkout-server-sdk');
const Stripe = require('stripe');
const Razorpay = require('razorpay');
const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_MODE, PAYPAL_SUCCESS_URL, PAYPAL_CANCEL_URL, STRIPE_SECRET_KEY, RAZORPAY_KEY, RAZORPAY_SECRET, RAZORPAY_CURRENCY, APP_URL } = require('../config');
const { Notification } = require('../models');
const { createOrderFromData } = require('../services/orderService');
const { calculateOrderTotals } = require('../utils/gst');
const invoiceController = require('./invoiceController');
const logger = require('../utils/logger');
const { getPaymentProviderStatus } = require('../utils/paymentConfig');

const paymentStatus = getPaymentProviderStatus({
  razorpayKey: RAZORPAY_KEY,
  razorpaySecret: RAZORPAY_SECRET,
  stripeSecretKey: STRIPE_SECRET_KEY,
  paypalClientId: PAYPAL_CLIENT_ID,
  paypalClientSecret: PAYPAL_CLIENT_SECRET
});

const stripe = paymentStatus.stripe.enabled ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-11-15' }) : null;
const razorpayClient = paymentStatus.razorpay.enabled ? new Razorpay({ key_id: RAZORPAY_KEY, key_secret: RAZORPAY_SECRET }) : null;

function getPaypalClient() {
  const env = PAYPAL_MODE === 'live'
    ? new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    : new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
  return new paypal.core.PayPalHttpClient(env);
}

function calculateTotals(items = [], options = {}) {
  const totals = calculateOrderTotals({
    items,
    shipping: options.shipping || 0,
    discount: options.discount || 0,
    billingState: options.billingState || '',
    sellerState: options.sellerState || ''
  });
  const lineItems = totals.items.map((item) => ({
    name: item.name || 'Item',
    unit_amount: { currency_code: (item.currency || 'INR').toUpperCase(), value: Number(item.unitPrice || item.price || 0).toFixed(2) },
    quantity: String(Math.max(1, Number(item.quantity) || 1))
  }));
  return { ...totals, lineItems };
}

async function createPaypalOrder(req, res) {
  try {
    if (!paymentStatus.paypal.enabled) {
      return res.status(503).json({ success: false, provider: 'paypal', enabled: false, message: 'PayPal is not configured yet. Add API credentials to enable payments.' });
    }
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Cart empty' });
    const totals = calculateTotals(items, {
      shipping: req.body.shipping || 0,
      discount: req.body.discount || 0,
      billingState: req.body.deliveryInfo?.state
    });
    const client = getPaypalClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'INR',
          value: totals.total.toFixed(2),
          breakdown: {
            item_total: { currency_code: 'INR', value: totals.subtotal.toFixed(2) },
            shipping: { currency_code: 'INR', value: totals.shipping.toFixed(2) },
            tax_total: { currency_code: 'INR', value: totals.taxTotal.toFixed(2) }
          }
        },
        items: totals.lineItems
      }],
      application_context: { brand_name: 'PAP-JOY', user_action: 'PAY_NOW', return_url: PAYPAL_SUCCESS_URL, cancel_url: PAYPAL_CANCEL_URL }
    });
    const response = await client.execute(request);
    const approvalUrl = response.result.links.find((link) => link.rel === 'approve')?.href;
    if (!approvalUrl) return res.status(500).json({ error: 'PayPal approval URL unavailable' });
    res.json({ approvalUrl, orderId: response.result.id });
  } catch (err) {
    logger.error('Create PayPal order failed', { error: err.message });
    res.status(500).json({ error: 'Unable to create PayPal order' });
  }
}

async function capturePaypalOrder(req, res) {
  try {
    const paypalOrderId = req.body.orderId || req.body.token;
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!paypalOrderId) return res.status(400).json({ error: 'PayPal order ID is required' });
    const client = getPaypalClient();
    const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});
    const captureResponse = await client.execute(request);
    const totals = calculateTotals(items, {
      shipping: req.body.shipping || 0,
      discount: req.body.discount || 0,
      billingState: req.body.deliveryInfo?.state
    });
    const checkoutItems = items.length ? items : [];
    const order = await createOrderFromData({
      userId: req.userId || null,
      items: checkoutItems,
      paymentMethod: 'paypal',
      shipping: totals.shipping,
      tax: totals.taxTotal,
      discount: totals.discount,
      currency: 'INR',
      deliveryInfo: req.body.deliveryInfo || {},
      amount: totals.total,
      notes: captureResponse.result.id,
      paymentStatus: 'paid'
    });
    
    // Generate invoice after successful payment
    try {
      await invoiceController.generateInvoice(order._id);
    } catch (invoiceErr) {
      logger.error('Invoice generation failed after PayPal payment', { error: invoiceErr.message });
      // Don't fail the payment if invoice generation fails
    }
    
    if (req.userId) {
      await Notification.create({ userId: req.userId, orderId: order._id, type: 'payment', channel: 'app', title: 'Payment received', message: `Payment for order ${order.orderNumber} was successful.` });
    }
    res.json({ order });
  } catch (err) {
    logger.error('Capture PayPal failed', { error: err.message });
    res.status(500).json({ error: 'Unable to capture PayPal payment' });
  }
}

async function createStripeSession(req, res) {
  if (!paymentStatus.stripe.enabled || !stripe) {
    return res.status(503).json({ success: false, provider: 'stripe', enabled: false, message: 'Stripe is not configured yet. Add API credentials to enable payments.' });
  }
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Cart empty' });
    const totals = calculateTotals(items);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: items.map((item) => ({ price_data: { currency: 'inr', product_data: { name: item.name || 'Item' }, unit_amount: Math.round((Number(item.price) || 0) * 100) }, quantity: Math.max(1, Number(item.quantity) || 1) })),
      mode: 'payment',
      success_url: `${APP_URL}/success.html?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout.html?stripe=canceled`,
      metadata: { userId: req.userId ? String(req.userId) : 'guest' }
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    logger.error('Create Stripe session failed', { error: err.message });
    res.status(500).json({ error: 'Unable to create Stripe checkout session' });
  }
}

async function createStripeOrder(req, res) {
  if (!paymentStatus.stripe.enabled || !stripe) {
    return res.status(503).json({ success: false, provider: 'stripe', enabled: false, message: 'Stripe is not configured yet. Add API credentials to enable payments.' });
  }
  try {
    const { sessionId, items = [] } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Stripe session ID is required' });
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Stripe payment not completed' });
    const lineItems = items.length ? items : (session.line_items?.data || []).map((item) => ({ productId: item.price?.product || item.productId || item.id, name: item.description || item.name || 'Product', variant: 'Standard', quantity: item.quantity || 1, price: Number(item.price?.unit_amount || 0) / 100, total: (Number(item.price?.unit_amount || 0) / 100) * (item.quantity || 1) }));
    const subtotal = lineItems.reduce((sum, it) => sum + it.total, 0);
    const totals = calculateTotals(lineItems, {
      shipping: req.body.shipping || 0,
      discount: req.body.discount || 0,
      billingState: req.body.deliveryInfo?.state
    });
    const order = await createOrderFromData({
      userId: req.userId || null,
      items: lineItems,
      paymentMethod: 'stripe',
      shipping: totals.shipping,
      tax: totals.taxTotal,
      discount: totals.discount,
      currency: session.currency?.toUpperCase() || 'INR',
      deliveryInfo: req.body.deliveryInfo || {},
      amount: totals.total,
      notes: `stripe_session:${sessionId}`,
      paymentStatus: 'paid'
    });
    
    // Generate invoice after successful payment
    try {
      await invoiceController.generateInvoice(order._id);
    } catch (invoiceErr) {
      logger.error('Invoice generation failed after Stripe payment', { error: invoiceErr.message });
      // Don't fail the payment if invoice generation fails
    }
    
    if (req.userId) {
      await Notification.create({ userId: req.userId, orderId: order._id, type: 'payment', channel: 'app', title: 'Stripe payment received', message: `Your Stripe payment for ${order.orderNumber} has been confirmed.` });
    }
    res.json({ order });
  } catch (err) {
    logger.error('Create Stripe order failed', { error: err.message });
    res.status(500).json({ error: 'Unable to confirm Stripe order' });
  }
}

async function createRazorpayOrder(req, res) {
  try {
    if (!paymentStatus.razorpay.enabled || !razorpayClient) {
      return res.status(503).json({ success: false, provider: 'razorpay', enabled: false, message: 'Razorpay is not configured yet. Add API credentials to enable payments.' });
    }
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const totals = items.length
      ? calculateTotals(items, {
          shipping: req.body.shipping || 0,
          discount: req.body.discount || 0,
          billingState: req.body.deliveryInfo?.state
        })
      : null;
    const amount = totals ? totals.total : Number(req.body.amount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid order amount' });
    const order = await razorpayClient.orders.create({ amount: Math.round(amount * 100), currency: RAZORPAY_CURRENCY, receipt: `receipt_${Date.now()}`, payment_capture: 1, notes: { userId: req.userId ? String(req.userId) : 'guest' } });
    res.json({ order, key_id: RAZORPAY_KEY });
  } catch (err) {
    logger.error('Create Razorpay order failed', { error: err.message });
    res.status(500).json({ error: 'Unable to create Razorpay order' });
  }
}

async function verifyRazorpayPayment(req, res) {
  try {
    if (!paymentStatus.razorpay.enabled || !razorpayClient) {
      return res.status(503).json({ success: false, provider: 'razorpay', enabled: false, message: 'Razorpay is not configured yet. Add API credentials to enable payments.' });
    }
    const { paymentId, orderId, signature, products = [], amount } = req.body;
    if (!paymentId || !orderId || !signature) return res.status(400).json({ error: 'Missing Razorpay payment details' });
    const generated = require('crypto').createHmac('sha256', RAZORPAY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
    if (generated !== signature) return res.status(400).json({ error: 'Signature mismatch' });
    const lineItems = [];
    for (const item of products) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price || 0);
      const total = quantity * price;
      lineItems.push({ productId: item.productId || item.id, name: item.name || 'Product', variant: item.variant || 'Standard', quantity, price, unitPrice: price, total, gstRate: Number(item.gstRate || 18) });
    }
    if (!lineItems.length) return res.status(400).json({ error: 'No valid order items found' });
    const totals = calculateTotals(lineItems, {
      shipping: req.body.shipping || 0,
      discount: req.body.discount || 0,
      billingState: req.body.deliveryInfo?.state
    });
    const total = Number(amount || totals.total);
    const order = await createOrderFromData({
      userId: req.userId || null,
      items: lineItems,
      paymentMethod: 'razorpay',
      shipping: totals.shipping,
      tax: totals.taxTotal,
      discount: totals.discount,
      currency: RAZORPAY_CURRENCY,
      deliveryInfo: req.body.deliveryInfo || {},
      amount: total,
      notes: `paymentId:${paymentId}`,
      paymentStatus: 'paid'
    });
    
    // Generate invoice after successful payment
    try {
      await invoiceController.generateInvoice(order._id);
    } catch (invoiceErr) {
      logger.error('Invoice generation failed after payment', { error: invoiceErr.message });
      // Don't fail the payment if invoice generation fails
    }
    
    if (req.userId) {
      await Notification.create({ userId: req.userId, orderId: order._id, type: 'payment', channel: 'app', title: 'Razorpay payment received', message: `Payment for ${order.orderNumber} is verified.` });
    }
    res.json({ order });
  } catch (err) {
    logger.error('Razorpay verification failed', { error: err.message });
    res.status(500).json({ error: 'Unable to verify payment' });
  }
}

module.exports = {
  createPaypalOrder,
  capturePaypalOrder,
  createStripeSession,
  createStripeOrder,
  createRazorpayOrder,
  verifyRazorpayPayment
};

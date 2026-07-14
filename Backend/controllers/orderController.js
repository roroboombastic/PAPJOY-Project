const { Order, User } = require('../models');
const logger = require('../utils/logger');
const { createOrderFromData } = require('../services/orderService');
const invoiceController = require('./invoiceController');

async function createOrder(req, res) {
  try {
    const order = await createOrderFromData({
      userId: req.userId || null,
      items: req.body.items || [],
      paymentMethod: req.body.paymentMethod || 'web',
      shipping: req.body.shipping || 0,
      tax: req.body.tax || 0,
      discount: req.body.discount || 0,
      currency: req.body.currency || 'INR',
      deliveryInfo: req.body.deliveryInfo || {},
      amount: req.body.amount,
      notes: req.body.notes || '',
      paymentStatus: req.body.paymentStatus
    });

    // Auto-generate an invoice for every created order,
    // including COD orders and pre-paid orders.
    invoiceController.generateInvoice(order._id).catch((invoiceErr) => {
      logger.error('Auto invoice generation failed', { error: invoiceErr.message, orderId: order._id });
    });

    res.status(201).json({ success: true, order });
  } catch (err) {
    logger.error('Order creation failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Order failed' });
  }
}

async function getUserOrders(req, res) {
  try {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    logger.error('Fetch user orders failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

async function getOrders(req, res) {
  try {
    const user = await User.findById(req.userId).select('role');
    const filter = user?.role === 'admin' || user?.role === 'super_admin' ? {} : { userId: req.userId };
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    logger.error('Fetch orders failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

async function getOrder(req, res) {
  try {
    const lookup = /^[0-9a-fA-F]{24}$/.test(req.params.orderId)
      ? { _id: req.params.orderId }
      : { orderNumber: req.params.orderId };

    const order = await Order.findOne(lookup);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId) {
      if (order.userId.toString() !== req.userId?.toString()) {
        const user = await User.findById(req.userId).select('role');
        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    res.json(order);
  } catch (err) {
    logger.error('Get order failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch order' });
  }
}

async function getOrderTracking(req, res) {
  try {
    const lookup = /^[0-9a-fA-F]{24}$/.test(req.params.orderId)
      ? { _id: req.params.orderId }
      : { orderNumber: req.params.orderId };

    const order = await Order.findOne(lookup);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId) {
      if (order.userId.toString() !== req.userId?.toString()) {
        const user = await User.findById(req.userId).select('role');
        if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    res.json({
      orderId: order._id,
      status: order.status,
      shipment: order.shipment || null,
      estimatedDelivery: order.shipment?.estimatedDelivery || null
    });
  } catch (err) {
    logger.error('Get order tracking failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch shipment tracking' });
  }
}

module.exports = {
  createOrder,
  getOrders,
  getUserOrders,
  getOrder,
  getOrderTracking
};

const { Order, User } = require('../models');
const logger = require('../utils/logger');
const { createOrderFromData, restoreInventoryForOrder } = require('../services/orderService');
const invoiceController = require('./invoiceController');
const emailService = require('../services/emailService');
const { ADMIN_EMAILS } = require('../config');

async function createOrder(req, res) {
  try {
    const order = await createOrderFromData({
      userId: req.userId || null,
      items: req.body.items || [],
      paymentMethod: req.body.paymentMethod || 'cod',
      shipping: req.body.shipping || 0,
      tax: req.body.tax || 0,
      discount: req.body.discount || 0,
      currency: req.body.currency || 'INR',
      deliveryInfo: req.body.deliveryInfo || {},
      amount: req.body.amount,
      notes: req.body.notes || '',
      paymentStatus: req.body.paymentStatus
    });

    // Auto-generate an invoice for every created order
    invoiceController.generateInvoice(order._id).catch((invoiceErr) => {
      logger.error('Auto invoice generation failed', { error: invoiceErr.message, orderId: order._id });
    });

    const customerEmail = order.deliveryInfo?.email || req.body?.deliveryInfo?.email || '';
    if (customerEmail) {
      emailService.sendMail({
        to: customerEmail,
        subject: `Order Confirmed - #${order.orderNumber || order._id}`,
        html: emailService.orderConfirmationTemplate(order)
      });
    }

    // Notify admin(s) of new order
    const adminEmails = ADMIN_EMAILS.length ? ADMIN_EMAILS : ['papp.joyy@gmail.com'];
    adminEmails.forEach(adminEmail => {
      emailService.sendMail({
        to: adminEmail,
        subject: `New Order #${order.orderNumber || order._id} — ₹${(order.total || order.amount || 0).toFixed(2)}`,
        html: `<p>A new order has been placed.</p><p>Order: #${order.orderNumber || order._id}</p><p>Amount: ₹${(order.total || order.amount || 0).toFixed(2)}</p>`
      });
    });

    res.status(201).json({ success: true, order });
  } catch (err) {
    logger.error('Order creation failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Order failed' });
  }
}

async function getUserOrders(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    const total = await Order.countDocuments({ userId: req.userId });
    res.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    logger.error('Fetch user orders failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

async function getOrders(req, res) {
  try {
    const user = await User.findById(req.userId).select('role');
    const filter = user?.role === 'admin' || user?.role === 'super_admin' ? {} : { userId: req.userId };
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const orders = await Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    const total = await Order.countDocuments(filter);
    res.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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

    const isOwner = order.userId && req.userId
      ? order.userId.toString() === req.userId.toString()
      : false;

    if (!isOwner && order.userId && req.userId) {
      const user = await User.findById(req.userId).select('role');
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    if (order.userId && !req.userId) {
      const email = (req.query.email || req.body?.email || '').toLowerCase().trim();
      if (!email) {
        return res.status(403).json({ error: 'Email required to track this order' });
      }
      const orderEmail = (order.billingAddress?.email || order.shippingAddress?.email || '').toLowerCase().trim();
      if (orderEmail && orderEmail !== email) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      shipment: order.shipment || null,
      estimatedDelivery: order.shipment?.estimatedDelivery || null,
      createdAt: order.createdAt,
      items: order.items,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    });
  } catch (err) {
    logger.error('Get order tracking failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch shipment tracking' });
  }
}

async function cancelOrder(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId && order.userId.toString() !== req.userId?.toString()) {
      const user = await User.findById(req.userId).select('role');
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ error: `Cannot cancel order with status "${order.status}". Only pending or confirmed orders can be cancelled.` });
    }

    order.status = 'cancelled';
    order.shipment = order.shipment || {};
    order.shipment.status = 'cancelled';
    order.shipment.events = order.shipment.events || [];
    order.shipment.events.push({
      status: 'cancelled',
      message: req.body.reason || 'Cancelled by customer',
      timestamp: new Date()
    });
    await order.save();

    try {
      await restoreInventoryForOrder(order);
    } catch (invErr) {
      logger.error('Inventory restore failed after cancellation', { error: invErr.message, orderId: order._id });
    }

    logger.info('Order cancelled', { orderId: order._id, orderNumber: order.orderNumber, userId: req.userId });
    res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (err) {
    logger.error('Cancel order failed', { error: err.message });
    res.status(500).json({ error: 'Failed to cancel order' });
  }
}

module.exports = {
  createOrder,
  getOrders,
  getUserOrders,
  getOrder,
  getOrderTracking,
  cancelOrder
};

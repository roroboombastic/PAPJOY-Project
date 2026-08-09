const { Notification, User, Wishlist } = require('../models');
const { sseManager } = require('../utils/sse');
const logger = require('../utils/logger');

function pushNotification(notification) {
  if (!notification || !notification.userId) return;
  sseManager.sendToUser(notification.userId, {
    type: 'notification',
    notification: {
      _id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      orderId: notification.orderId,
      data: notification.data || {},
      isRead: false,
      createdAt: notification.createdAt || new Date()
    }
  }, 'notification');
}

async function userAllowsNotifications(userId) {
  try {
    const user = await User.findById(userId).select('preferences').lean();
    if (!user) return false;
    return user.preferences?.notifications !== false;
  } catch (_) {
    return true;
  }
}

async function createNotification({ userId, orderId, type = 'order', channel = 'app', title, message, data = {} }) {
  if (!userId || !title || !message) return null;
  const allowed = await userAllowsNotifications(userId);
  if (!allowed) return null;
  try {
    const notification = await Notification.create({ userId, orderId: orderId || undefined, type, channel, title, message, data });
    pushNotification(notification);
    return notification;
  } catch (err) {
    logger.error('Notification create failed', { error: err.message, userId });
    return null;
  }
}

function orderLink(orderNumber) {
  return orderNumber ? `/tracking.html?orderNumber=${encodeURIComponent(orderNumber)}` : '';
}

async function notifyOrderPlaced(order) {
  if (!order || !order.userId) return null;
  return createNotification({
    userId: order.userId,
    orderId: order._id,
    type: 'order',
    title: 'Order placed',
    message: `Your order ${order.orderNumber} has been placed successfully. We'll keep you updated on its progress.`,
    data: { orderId: order._id, orderNumber: order.orderNumber, link: orderLink(order.orderNumber) }
  });
}

async function notifyPaymentReceived(order) {
  if (!order || !order.userId) return null;
  return createNotification({
    userId: order.userId,
    orderId: order._id,
    type: 'payment',
    title: 'Payment received',
    message: `Payment for order ${order.orderNumber} received. Thank you for shopping with PAP-JOY!`,
    data: { orderId: order._id, orderNumber: order.orderNumber, link: orderLink(order.orderNumber) }
  });
}

async function getWishlistUserIds(productId) {
  try {
    const wishlists = await Wishlist.find({ 'items.productId': productId }).select('userId').lean();
    return [...new Set(wishlists.map((w) => String(w.userId)))];
  } catch (_) {
    return [];
  }
}

function productLink(product) {
  return product && product.slug
    ? `/product-detail.html?slug=${encodeURIComponent(product.slug)}`
    : product && product._id
      ? `/product-detail.html?id=${product._id}`
      : '';
}

async function notifyBackInStock(product) {
  if (!product || !product._id) return;
  const userIds = await getWishlistUserIds(product._id);
  if (!userIds.length) return;
  const link = productLink(product);
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: 'promotion',
      title: 'Back in stock!',
      message: `${product.name} is back in stock. Grab it before it sells out!`,
      data: { productId: product._id, link }
    });
  }
}

async function notifyPriceDrop(product, oldPrice) {
  if (!product || !product._id) return;
  const newPrice = Number(product.price);
  const previous = Number(oldPrice);
  if (!(newPrice > 0 && previous > newPrice)) return;
  const userIds = await getWishlistUserIds(product._id);
  if (!userIds.length) return;
  const link = productLink(product);
  for (const userId of userIds) {
    await createNotification({
      userId,
      type: 'promotion',
      title: 'Price dropped!',
      message: `${product.name} is now ₹${newPrice} (was ₹${previous}). Great time to grab it!`,
      data: { productId: product._id, link }
    });
  }
}

module.exports = {
  pushNotification,
  createNotification,
  userAllowsNotifications,
  notifyOrderPlaced,
  notifyPaymentReceived,
  notifyBackInStock,
  notifyPriceDrop
};

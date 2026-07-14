const { Notification } = require('../models');
const logger = require('../utils/logger');

async function getNotifications(req, res) {
  try {
    const notifications = await Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(50).lean();
    res.json(notifications);
  } catch (err) {
    logger.error('Get notifications failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load notifications' });
  }
}

async function markAsRead(req, res) {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.notificationId, userId: req.userId }, { isRead: true }, { new: true }).lean();
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json(notification);
  } catch (err) {
    logger.error('Mark notification read failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update notification' });
  }
}

module.exports = {
  getNotifications,
  markAsRead
};

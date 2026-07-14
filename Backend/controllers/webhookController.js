const { WebhookStatus } = require('../models');
const logger = require('../utils/logger');

async function getStatus(req, res) {
  try {
    let status = await WebhookStatus.findOne().sort({ updatedAt: -1 });
    if (!status) {
      status = await WebhookStatus.create({ lastEvent: null, lastReceivedAt: null, lastError: null, count: 0 });
    }
    res.json({ webhookStatus: status });
  } catch (err) {
    logger.error('Webhook status fetch error', { error: err.message });
    res.status(500).json({ error: 'Unable to fetch webhook status.' });
  }
}

async function recordEvent(eventName, error) {
  try {
    const status = await WebhookStatus.findOne().sort({ updatedAt: -1 });
    const lastReceivedAt = new Date();
    if (status) {
      status.lastEvent = eventName || status.lastEvent;
      status.lastReceivedAt = lastReceivedAt;
      status.lastError = error || null;
      status.count = (status.count || 0) + 1;
      await status.save();
      return status;
    }
    return WebhookStatus.create({ lastEvent: eventName, lastReceivedAt, lastError: error || null, count: 1 });
  } catch (err) {
    logger.error('Record webhook event failed', { error: err.message });
    return null;
  }
}

module.exports = {
  getStatus,
  recordEvent
};

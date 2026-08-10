const { Order, Shipment, User } = require('../models');
const logger = require('../utils/logger');

async function linkGuestOrdersToUsers() {
  const unlinked = await Order.find({ userId: null }).select('billingAddress shippingAddress deliveryInfo userId orderNumber').lean();
  let linked = 0;
  for (const order of unlinked) {
    const email = (order.billingAddress?.email || order.shippingAddress?.email || order.deliveryInfo?.email || '').trim().toLowerCase();
    if (!email) continue;
    const user = await User.findOne({ email }).select('_id').lean();
    if (!user) continue;
    await Order.updateOne({ _id: order._id }, { $set: { userId: user._id } });
    await Shipment.updateMany({ orderId: order._id }, { $set: { userId: user._id } });
    linked++;
  }
  return { total: unlinked.length, linked };
}

async function runOrderAccountBackfill() {
  try {
    const { total, linked } = await linkGuestOrdersToUsers();
    if (total > 0) {
      logger.info('Order-to-account backfill completed', { total, linked });
    }
  } catch (err) {
    logger.error('Order-to-account backfill failed', { error: err.message });
  }
}

module.exports = {
  linkGuestOrdersToUsers,
  runOrderAccountBackfill
};

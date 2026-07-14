const { Order, Shipment } = require('../models');
const { restoreInventoryForOrder } = require('../services/orderService');
const logger = require('../utils/logger');

async function getShipments(req, res) {
  try {
    const query = {};
    if (req.userId) query.userId = req.userId;
    const shipments = await Shipment.find(query)
      .populate('orderId', 'orderNumber status total paymentStatus')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ shipments });
  } catch (err) {
    logger.error('Get shipments failed', { error: err.message });
    res.status(500).json({ error: 'Failed to load shipments' });
  }
}

async function updateShipmentStatus(req, res) {
  try {
    const { orderNumber } = req.params;
    const { shippingStatus, trackingNumber, carrier, estimatedDelivery } = req.body;
    let shipment = await Shipment.findOne({ orderNumber });
    if (!shipment) {
      const order = await Order.findOne({ orderNumber });
      if (!order) return res.status(404).json({ error: 'Order not found' });
      shipment = await Shipment.create({
        orderId: order._id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        status: shippingStatus || 'pending',
        trackingNumber: trackingNumber || order.shipment?.trackingNumber || '',
        carrier: carrier || order.shipment?.carrier || '',
        estimatedDelivery: estimatedDelivery || order.shipment?.estimatedDelivery || null,
        events: [{ status: shippingStatus || 'pending', message: 'Shipment record created and status updated.' }]
      });
    } else {
      shipment.status = shippingStatus || shipment.status;
      shipment.trackingNumber = trackingNumber || shipment.trackingNumber;
      shipment.carrier = carrier || shipment.carrier;
      shipment.estimatedDelivery = estimatedDelivery || shipment.estimatedDelivery;
      shipment.events.push({ status: shipment.status, message: 'Shipment status updated.', timestamp: new Date() });
      await shipment.save();
    }

    const order = await Order.findOneAndUpdate(
      { orderNumber },
      {
        shipment: {
          status: shipment.status,
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          estimatedDelivery: shipment.estimatedDelivery,
          events: shipment.events
        },
        shipmentId: shipment._id,
        status: shipment.status === 'cancelled' || shipment.status === 'refunded' ? shipment.status : undefined
      },
      { new: true, omitUndefined: true }
    ).lean();

    if (order && ['cancelled', 'refunded', 'returned'].includes(shipment.status)) {
      await restoreInventoryForOrder(order);
    }

    res.json({ shipment, order });
  } catch (err) {
    logger.error('Update shipment failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update shipment' });
  }
}

module.exports = {
  getShipments,
  updateShipmentStatus
};

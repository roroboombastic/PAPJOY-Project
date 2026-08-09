const { Order, Shipment, User, Notification } = require('../models');
const { restoreInventoryForOrder } = require('../services/orderService');
const { sseManager } = require('../utils/sse');
const { estimateETA } = require('../utils/geo');
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
    const { shippingStatus, trackingNumber, carrier, estimatedDelivery, message } = req.body;
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
        events: [{ status: shippingStatus || 'pending', message: message || 'Shipment record created and status updated.' }]
      });
    } else {
      shipment.status = shippingStatus || shipment.status;
      shipment.trackingNumber = trackingNumber || shipment.trackingNumber;
      shipment.carrier = carrier || shipment.carrier;
      shipment.estimatedDelivery = estimatedDelivery || shipment.estimatedDelivery;
      shipment.events.push({
        status: shipment.status,
        message: message || 'Shipment status updated.',
        timestamp: new Date()
      });
      await shipment.save();
    }

    const statusMessages = {
      confirmed: 'Your order has been confirmed!',
      processing: 'Your order is being processed.',
      packed: 'Your order has been packed and is ready for shipping.',
      shipped: `Your order has been shipped!${carrier ? ` via ${carrier}` : ''}${trackingNumber ? `. Tracking: ${trackingNumber}` : ''}`,
      out_for_delivery: 'Your order is out for delivery and will arrive soon!',
      delivered: 'Your order has been delivered successfully!',
      cancelled: 'Your order has been cancelled.',
      refunded: 'Your order has been refunded.',
      returned: 'Your order has been returned.'
    };

    if (shipment.userId && statusMessages[shipment.status]) {
      const notification = await Notification.create({
        userId: shipment.userId,
        orderId: shipment.orderId,
        type: 'order',
        channel: 'app',
        title: `Order ${shipment.status.replace(/_/g, ' ')}`,
        message: statusMessages[shipment.status],
        data: { orderId: shipment.orderId, orderNumber, link: `/tracking.html?orderNumber=${encodeURIComponent(orderNumber)}` }
      }).catch(err => {
        logger.error('Failed to create tracking notification', { error: err.message });
      });

      if (notification) {
        sseManager.sendToUser(shipment.userId, {
          type: 'notification',
          notification: {
            _id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            orderId: notification.orderId,
            isRead: false,
            createdAt: notification.createdAt,
          }
        }, 'notification');
      }
    }

    sseManager.sendToOrder(orderNumber, {
      type: 'status',
      orderNumber,
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      estimatedDelivery: shipment.estimatedDelivery,
      events: shipment.events.slice(-10),
    }, 'tracking');

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

async function updateShipmentLocation(req, res) {
  try {
    const { orderNumber } = req.params;
    const { latitude, longitude, address, deliveryPartner } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const shipment = await Shipment.findOne({ orderNumber });
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    shipment.currentLocation = {
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: address || '',
      updatedAt: new Date()
    };

    if (deliveryPartner) {
      shipment.deliveryPartner = {
        name: deliveryPartner.name || shipment.deliveryPartner?.name,
        phone: deliveryPartner.phone || shipment.deliveryPartner?.phone,
        vehicleType: deliveryPartner.vehicleType || shipment.deliveryPartner?.vehicleType,
        vehicleNumber: deliveryPartner.vehicleNumber || shipment.deliveryPartner?.vehicleNumber,
        photo: deliveryPartner.photo || shipment.deliveryPartner?.photo
      };
    }

    shipment.events.push({
      status: shipment.status,
      message: address ? `Location updated: ${address}` : 'Location updated.',
      timestamp: new Date(),
      location: address || `${latitude}, ${longitude}`
    });

    await shipment.save();

    await Order.findOneAndUpdate(
      { orderNumber },
      { shipmentId: shipment._id }
    ).catch(() => {});

    const hasDest = shipment.deliveryAddress && shipment.deliveryAddress.latitude && shipment.deliveryAddress.longitude;
    let etaInfo = null;
    if (hasDest) {
      etaInfo = estimateETA(
        { lat: Number(latitude), lng: Number(longitude) },
        { lat: shipment.deliveryAddress.latitude, lng: shipment.deliveryAddress.longitude }
      );
    }

    const gpsPayload = {
      type: 'gps',
      orderNumber,
      currentLocation: { lat: Number(latitude), lng: Number(longitude), address: address || '' },
      eta: etaInfo,
      status: shipment.status,
    };
    sseManager.sendToOrder(orderNumber, gpsPayload, 'gps');
    sseManager.sendToOrder(`gps:${orderNumber}`, gpsPayload, 'gps');

    res.json({ success: true, shipment, eta: etaInfo });
  } catch (err) {
    logger.error('Update shipment location failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update location' });
  }
}

async function getShipmentTracking(req, res) {
  try {
    const { orderNumber } = req.params;
    const shipment = await Shipment.findOne({ orderNumber })
      .populate('orderId', 'orderNumber status total items paymentMethod paymentStatus')
      .lean();

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const isOwner = shipment.userId && req.userId
      ? shipment.userId.toString() === req.userId.toString()
      : false;

    if (!isOwner && shipment.userId && req.userId) {
      const user = await User.findById(req.userId).select('role');
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({
      orderNumber: shipment.orderNumber,
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      estimatedDelivery: shipment.estimatedDelivery,
      currentLocation: shipment.currentLocation || null,
      deliveryPartner: shipment.deliveryPartner || null,
      deliveryAddress: shipment.deliveryAddress || null,
      events: shipment.events || [],
      order: shipment.orderId || null
    });
  } catch (err) {
    logger.error('Get shipment tracking failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch tracking' });
  }
}

module.exports = {
  getShipments,
  updateShipmentStatus,
  updateShipmentLocation,
  getShipmentTracking
};

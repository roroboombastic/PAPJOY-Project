const { Order, Shipment, Notification } = require('../models');
const shiprocketService = require('../services/shiprocketService');
const { sseManager } = require('../utils/sse');
const logger = require('../utils/logger');
const config = require('../config');

function isConfigured() {
  return shiprocketService.isConfigured();
}

function requireConfigured() {
  if (!isConfigured()) {
    const error = new Error('Shiprocket is not configured. Add SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD to your environment.');
    error.status = 503;
    error.code = 'SHIPROCKET_NOT_CONFIGURED';
    throw error;
  }
}

async function getPickupLocations(req, res) {
  try {
    requireConfigured();
    const locations = await shiprocketService.getPickupLocations();
    res.json({ locations });
  } catch (err) {
    logger.error('Shiprocket pickup locations failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

function aggregateDimensions(items = []) {
  let weight = 0.5;
  let length = 1;
  let breadth = 1;
  let height = 1;
  const validItems = (items || []).filter(it => it && Number(it.weight) > 0);
  if (validItems.length) {
    weight = validItems.reduce((sum, it) => sum + Number(it.weight) * Math.max(1, Number(it.quantity) || 1), 0);
    length = Math.max(...validItems.map(it => Number(it.length) || 1));
    breadth = Math.max(...validItems.map(it => Number(it.breadth) || 1));
    height = Math.max(...validItems.map(it => Number(it.height) || 1));
  }
  return { weight, length, breadth, height };
}

async function getRates(req, res) {
  try {
    requireConfigured();

    const {
      deliveryPostcode,
      cod = false,
      items = [],
      declaredValue = 0
    } = req.body || {};

    if (!deliveryPostcode) {
      return res.status(400).json({ error: 'deliveryPostcode is required' });
    }
    if (!config.shiprocket.pickupPincode) {
      return res.status(400).json({ error: 'SHIPROCKET_PICKUP_PINCODE is not configured' });
    }

    const { weight, length, breadth, height } = aggregateDimensions(items);

    const data = await shiprocketService.checkServiceability({
      pickupPostcode: config.shiprocket.pickupPincode,
      deliveryPostcode,
      cod: Boolean(cod),
      weight,
      length,
      breadth,
      height,
      declaredValue
    });

    const rates = Array.isArray(data.data)
      ? data.data.map(courier => ({
          courierId: courier.courier_id,
          courierName: courier.courier_name,
          rate: Number(courier.rate) || 0,
          estimatedDelivery: courier.etd || '',
          deliveryBy: courier.etd ? `~${courier.etd} days` : ''
        }))
        .filter(c => c.rate > 0)
        .sort((a, b) => a.rate - b.rate)
      : [];

    res.json({ success: true, rates, cheapest: rates[0] || null, raw: data });
  } catch (err) {
    logger.error('Shiprocket rates failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

function applyShiprocketOrderData(order, shiprocketData) {
  const shiprocket = order.shiprocket || {};
  shiprocket.shipmentId = shiprocketData.shipment_id || shiprocket.shipmentId || '';
  shiprocket.courierName = shiprocketData.courier_name || shiprocket.courierName || '';
  shiprocket.courierId = shiprocketData.courier_id || shiprocket.courierId || '';
  shiprocket.error = null;
  shiprocket.updatedAt = new Date();
  order.shiprocket = shiprocket;
  return order;
}

async function createShiprocketOrder(req, res) {
  try {
    requireConfigured();

    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.shiprocket?.shipmentId) {
      return res.status(400).json({ error: `Order already sent to Shiprocket (shipment_id: ${order.shiprocket.shipmentId}).` });
    }

    const data = await shiprocketService.createOrderForPapjoyOrder({ order });
    if (!data || !data.shipment_id) {
      throw new Error('Shiprocket did not return a shipment_id');
    }

    applyShiprocketOrderData(order, data);
    await order.save();

    await Shipment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          'shiprocket.shipmentId': String(data.shipment_id),
          'shiprocket.courierName': data.courier_name || '',
          'shiprocket.courierId': data.courier_id ? String(data.courier_id) : ''
        }
      },
      { new: true }
    ).catch(() => null);

    logger.info('Shiprocket order created', { orderNumber: order.orderNumber, shipmentId: data.shipment_id });

    res.json({ success: true, order, shiprocket: data });
  } catch (err) {
    logger.error('Create Shiprocket order failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function generatePickup(req, res) {
  try {
    requireConfigured();

    const { id } = req.params;
    const { pickupDate } = req.body || {};
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const shipmentId = order.shiprocket?.shipmentId;
    if (!shipmentId) {
      return res.status(400).json({ error: 'Order has not been sent to Shiprocket yet. Create the Shiprocket order first.' });
    }

    const data = await shiprocketService.generatePickup({ shipmentId, pickupDate });

    order.shiprocket = order.shiprocket || {};
    order.shiprocket.pickupStatus = data.pickup_created === true || data.pickup_created === 1 ? 'scheduled' : 'pending';
    order.shiprocket.pickupScheduledDate = data.pickup_scheduled_date ? new Date(data.pickup_scheduled_date) : order.shiprocket.pickupScheduledDate;
    order.shiprocket.error = null;
    order.shiprocket.updatedAt = new Date();
    await order.save();

    res.json({ success: true, order, shiprocket: data });
  } catch (err) {
    logger.error('Shiprocket pickup failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function assignAWB(req, res) {
  try {
    requireConfigured();

    const { id } = req.params;
    const { courierId } = req.body || {};
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const shipmentId = order.shiprocket?.shipmentId;
    if (!shipmentId) {
      return res.status(400).json({ error: 'Order has not been sent to Shiprocket yet. Create the Shiprocket order first.' });
    }

    const data = await shiprocketService.assignAWB({ shipmentId, courierId });

    const awbData = data.awb_assign_data || data;
    const awbCode = awbData.awb_code || data.awb_code || '';
    if (!awbCode) {
      throw new Error('Shiprocket did not return an AWB code');
    }

    order.shiprocket = order.shiprocket || {};
    order.shiprocket.awbCode = awbCode;
    order.shiprocket.courierName = awbData.courier_name || order.shiprocket.courierName || '';
    order.shiprocket.courierId = String(awbData.courier_id || courierId || order.shiprocket.courierId || '');
    order.shiprocket.labelUrl = awbData.label_url || order.shiprocket.labelUrl || '';
    order.shiprocket.manifestUrl = awbData.manifest_url || order.shiprocket.manifestUrl || '';
    order.shiprocket.error = null;
    order.shiprocket.updatedAt = new Date();

    order.shipment = order.shipment || {};
    order.shipment.carrier = order.shiprocket.courierName || order.shipment.carrier || 'Shiprocket';
    order.shipment.trackingNumber = awbCode;
    order.shipment.trackingUrl = awbData.tracking_url || `https://www.shiprocket.in/tracking?awb=${encodeURIComponent(awbCode)}`;
    if (!order.shipment.events) order.shipment.events = [];
    order.shipment.events.push({
      timestamp: new Date(),
      status: order.status || 'processing',
      message: `AWB assigned: ${awbCode}${order.shiprocket.courierName ? ` via ${order.shiprocket.courierName}` : ''}`,
      location: ''
    });

    await order.save();

    await Shipment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          'shiprocket.awbCode': awbCode,
          'shiprocket.courierName': order.shiprocket.courierName,
          'shiprocket.courierId': order.shiprocket.courierId,
          'shiprocket.labelUrl': order.shiprocket.labelUrl,
          'shiprocket.manifestUrl': order.shiprocket.manifestUrl,
          carrier: order.shipment.carrier,
          trackingNumber: awbCode,
          trackingUrl: order.shipment.trackingUrl
        },
        $push: { events: { timestamp: new Date(), status: order.status || 'processing', message: `AWB assigned: ${awbCode}`, location: '' } }
      },
      { new: true }
    ).catch(() => null);

    logger.info('Shiprocket AWB assigned', { orderNumber: order.orderNumber, awbCode });

    res.json({ success: true, order, shiprocket: data, awbCode, trackingUrl: order.shipment.trackingUrl });
  } catch (err) {
    logger.error('Shiprocket AWB assign failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function generateLabel(req, res) {
  try {
    requireConfigured();

    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const shipmentId = order.shiprocket?.shipmentId;
    if (!shipmentId) {
      return res.status(400).json({ error: 'Order has not been sent to Shiprocket yet. Create the Shiprocket order first.' });
    }

    const data = await shiprocketService.generateLabel({ shipmentId });

    order.shiprocket = order.shiprocket || {};
    order.shiprocket.labelUrl = data.label_url || order.shiprocket.labelUrl || '';
    order.shiprocket.manifestUrl = data.manifest_url || order.shiprocket.manifestUrl || '';
    order.shiprocket.error = null;
    order.shiprocket.updatedAt = new Date();
    await order.save();

    await Shipment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          'shiprocket.labelUrl': order.shiprocket.labelUrl,
          'shiprocket.manifestUrl': order.shiprocket.manifestUrl
        }
      },
      { new: true }
    ).catch(() => null);

    res.json({ success: true, order, shiprocket: data, labelUrl: order.shiprocket.labelUrl });
  } catch (err) {
    logger.error('Shiprocket label generation failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function trackOrder(req, res) {
  try {
    requireConfigured();

    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const awbCode = order.shiprocket?.awbCode;
    if (!awbCode) {
      return res.status(400).json({ error: 'No AWB code assigned yet. Assign AWB first.' });
    }

    const data = await shiprocketService.trackShipment({ awbCode });

    const trackingData = data.tracking_data || data;
    const trackStatus = trackingData.track_status || trackingData.status || '';
    const shipmentTrack = Array.isArray(trackingData.shipment_track) ? trackingData.shipment_track : [];
    const etd = trackingData.etd || '';

    const events = shipmentTrack
      .filter(entry => entry && entry.status)
      .map(entry => ({
        status: entry.status,
        message: entry.activity || entry.location || entry.status,
        location: entry.location || '',
        timestamp: entry.date || entry.created_at || new Date().toISOString()
      }));

    res.json({ success: true, awbCode, trackStatus, etd, events, raw: data });
  } catch (err) {
    logger.error('Shiprocket tracking failed', { error: err.message });
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function syncTrackingToOrder(order, events, trackStatus, etd) {
  order.shipment = order.shipment || {};
  order.shipment.events = order.shipment.events || [];
  let added = 0;
  for (const event of events) {
    const exists = order.shipment.events.some(e =>
      (e.message && e.message === event.message) ||
      (event.timestamp && e.timestamp && new Date(e.timestamp).toISOString() === new Date(event.timestamp).toISOString())
    );
    if (!exists) {
      order.shipment.events.push({
        timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
        location: event.location || '',
        message: event.message || event.status || 'Shipment update',
        status: event.status || order.status || 'processing'
      });
      added += 1;
    }
  }
  if (trackStatus) order.shipment.status = trackStatus;
  if (etd) order.shipment.estimatedDelivery = new Date(etd) || order.shipment.estimatedDelivery;
  return added;
}

async function handleWebhook(req, res) {
  try {
    const secret = req.query?.secret || req.headers?.['x-shiprocket-secret'] || req.headers?.['x-webhook-secret'] || req.headers?.['x-api-key'] || '';
    if (config.shiprocket.webhookSecret && secret !== config.shiprocket.webhookSecret) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const body = req.body || {};
    const orderNumber = body.order_id || body.orderNumber || body.order_no || '';
    const awbCode = body.awb || body.awb_code || body.tracking_number || '';
    const trackStatus = body.status || body.current_status || body.track_status || '';
    const etd = body.etd || body.estimated_delivery || '';
    const rawEvents = Array.isArray(body.shipment_track) ? body.shipment_track : (Array.isArray(body.tracking_data?.shipment_track) ? body.tracking_data.shipment_track : []);
    const events = rawEvents.map(entry => ({
      status: entry.status,
      message: entry.activity || entry.message || entry.status,
      location: entry.location || '',
      timestamp: entry.date || entry.timestamp || new Date().toISOString()
    }));

    const query = orderNumber ? { orderNumber } : (awbCode ? { 'shiprocket.awbCode': awbCode } : null);
    if (!query) {
      return res.status(400).json({ error: 'No order reference in webhook payload' });
    }

    const order = await Order.findOne(query);
    if (!order) {
      logger.warn('Shiprocket webhook for unknown order', { orderNumber, awbCode });
      return res.status(404).json({ error: 'Order not found' });
    }

    order.shiprocket = order.shiprocket || {};
    if (awbCode) order.shiprocket.awbCode = awbCode;

    const added = await syncTrackingToOrder(order, events, trackStatus, etd);
    await order.save();

    await Shipment.findOneAndUpdate(
      { orderId: order._id },
      {
        $set: {
          'shiprocket.awbCode': order.shiprocket.awbCode || awbCode,
          status: order.shipment.status || order.status || 'processing',
          trackingNumber: order.shiprocket.awbCode || order.shipment.trackingNumber || awbCode
        },
        $push: { events: { timestamp: new Date(), status: order.shipment.status || 'processing', message: 'Shiprocket tracking update received', location: '' } }
      },
      { new: true }
    ).catch(() => null);

    if (added > 0) {
      sseManager.sendToOrder(order.orderNumber, {
        type: 'status',
        orderNumber: order.orderNumber,
        status: order.shipment.status || order.status,
        carrier: order.shipment.carrier || order.shiprocket.courierName || 'Shiprocket',
        trackingNumber: order.shiprocket.awbCode || order.shipment.trackingNumber || '',
        events: (order.shipment.events || []).slice(-10)
      }, 'tracking');

      if (order.userId) {
        const notification = await Notification.create({
          userId: order.userId,
          orderId: order._id,
          type: 'order',
          channel: 'app',
          title: 'Shipment update',
          message: (events[events.length - 1]?.message || `Shipment status: ${trackStatus || 'updated'}`).slice(0, 180),
          data: { orderId: order._id, orderNumber: order.orderNumber }
        }).catch(() => null);
        if (notification) {
          sseManager.sendToUser(order.userId, {
            type: 'notification',
            notification: {
              _id: notification._id,
              title: notification.title,
              message: notification.message,
              type: notification.type,
              orderId: notification.orderId,
              isRead: false,
              createdAt: notification.createdAt
            }
          }, 'notification');
        }
      }
    }

    res.json({ success: true, received: true });
  } catch (err) {
    logger.error('Shiprocket webhook failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  isConfigured,
  getPickupLocations,
  getRates,
  createShiprocketOrder,
  generatePickup,
  assignAWB,
  generateLabel,
  trackOrder,
  handleWebhook
};

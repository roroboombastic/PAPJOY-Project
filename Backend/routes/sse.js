const express = require('express');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');
const { sseManager } = require('../utils/sse');
const { Shipment, User } = require('../models');
const { estimateETA } = require('../utils/geo');
const logger = require('../utils/logger');

const router = express.Router();

function setupSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(':connected\n\n');
}

function extractUserFromRequest(req) {
  const cookieToken = req.cookies?.['papjoy-auth'];
  const headerToken = req.headers.authorization?.split(' ')[1];
  const token = headerToken || cookieToken;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'papjoy' });
    return { userId: decoded.id, userEmail: decoded.email };
  } catch (_) {
    return null;
  }
}

router.get('/notifications', (req, res) => {
  const user = extractUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required for notifications stream' });
  }
  setupSSEHeaders(res);
  sseManager.addUserConnection(user.userId, res);
  logger.debug('Notification SSE connected', { userId: user.userId });
});

router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const user = extractUserFromRequest(req);

    const shipment = await Shipment.findOne({ orderNumber }).lean();
    if (!shipment) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (shipment.userId && user?.userId) {
      const isOwner = shipment.userId.toString() === user.userId.toString();
      if (!isOwner) {
        const dbUser = await User.findById(user.userId).select('role').lean();
        if (!dbUser || (dbUser.role !== 'admin' && dbUser.role !== 'super_admin')) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    setupSSEHeaders(res);
    sseManager.addOrderConnection(orderNumber, res);

    if (user?.userId) {
      sseManager.addUserConnection(user.userId, res);
    }

    const initialData = {
      type: 'initial',
      orderNumber: shipment.orderNumber,
      status: shipment.status,
      currentLocation: shipment.currentLocation || null,
      deliveryPartner: shipment.deliveryPartner || null,
      estimatedDelivery: shipment.estimatedDelivery || null,
      events: (shipment.events || []).slice(-10),
    };
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    logger.debug('Order tracking SSE connected', { orderNumber, userId: user?.userId });
  } catch (err) {
    logger.error('Order SSE connection failed', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish tracking stream' });
    }
  }
});

router.get('/gps/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const user = extractUserFromRequest(req);

    const shipment = await Shipment.findOne({ orderNumber }).lean();
    if (!shipment) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (shipment.userId && user?.userId) {
      const isOwner = shipment.userId.toString() === user.userId.toString();
      if (!isOwner) {
        const dbUser = await User.findById(user.userId).select('role').lean();
        if (!dbUser || (dbUser.role !== 'admin' && dbUser.role !== 'super_admin')) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
    }

    setupSSEHeaders(res);

    const gpsKey = `gps:${orderNumber}`;
    sseManager.addOrderConnection(gpsKey, res);

    const loc = shipment.currentLocation;
    const deliveryAddr = shipment.deliveryAddress;
    const hasLoc = loc && loc.latitude && loc.longitude;
    const hasDest = deliveryAddr && deliveryAddr.latitude && deliveryAddr.longitude;

    let etaInfo = null;
    if (hasLoc && hasDest) {
      etaInfo = estimateETA(
        { lat: loc.latitude, lng: loc.longitude },
        { lat: deliveryAddr.latitude, lng: deliveryAddr.longitude }
      );
    }

    const initialData = {
      type: 'gps_initial',
      orderNumber,
      currentLocation: hasLoc ? { lat: loc.latitude, lng: loc.longitude, address: loc.address } : null,
      destination: hasDest ? { lat: deliveryAddr.latitude, lng: deliveryAddr.longitude, address: deliveryAddr.address || '' } : null,
      eta: etaInfo,
      status: shipment.status,
    };
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    logger.debug('GPS SSE connected', { orderNumber });
  } catch (err) {
    logger.error('GPS SSE connection failed', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish GPS stream' });
    }
  }
});

module.exports = router;

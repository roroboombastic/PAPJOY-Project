const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_REFRESH_SECRET, ADMIN_EMAILS } = require('../config');
const { User } = require('../models');
const logger = require('../utils/logger');

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'papjoy' });
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    logger.warn('Invalid auth token', { error: err.message });
    res.status(401).json({ error: 'Invalid authentication token' });
  }
}

async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'papjoy' });
    req.userId = decoded.id;
    req.userEmail = decoded.email;
    const user = await User.findById(req.userId).lean();
    if (user) {
      req.user = user;
      req.userRole = user.role;
      req.isAdmin = user.role === 'admin' || user.role === 'super_admin' || ADMIN_EMAILS.includes((user.email || '').toLowerCase());
    }
  } catch (err) {
    logger.debug('Optional auth ignored invalid token', { error: err.message });
  }
  next();
}

async function verifyAdmin(req, res, next) {
  if (!req.userId) return res.status(403).json({ error: 'Admin access required' });
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(403).json({ error: 'User not found' });
  if (user.role === 'admin' || user.role === 'super_admin' || ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
    req.user = user;
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized' });
}

function verifyRole(...allowedRoles) {
  return async function (req, res, next) {
    if (!req.userId) return res.status(403).json({ error: 'Role access required' });
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(403).json({ error: 'User not found' });
    if (allowedRoles.includes(user.role)) {
      req.user = user;
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = {
  auth,
  optionalAuth,
  verifyAdmin,
  verifyRole
};

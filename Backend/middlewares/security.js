const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const config = require('../config');

function createSecurityMiddleware(app) {
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https:'],
        fontSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: ['self']
    }
  }));

  const corsOrigins = config.cors.origin;
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
        if (config.isProd) {
          console.warn('[WARN] CORS allows all origins in production');
        }
        return callback(null, true);
      }
      if (corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      console.warn('[WARN] CORS origin rejected', { origin, allowedOrigins: corsOrigins });
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    optionsSuccessStatus: 204
  };
  console.log('[INFO] CORS origins configured', JSON.stringify({ origins: corsOrigins }));
  app.use(cors(corsOptions));
  app.use(compression());
  
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' }
  });
  app.use(generalLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' }
  });
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/register', authLimiter);
  app.use('/api/v1/auth/forgot-password', authLimiter);
  
  app.use((req, res, next) => {
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (key.startsWith('$')) {
          delete obj[key];
        } else if (typeof obj[key] === 'object') {
          sanitize(obj[key]);
        }
      }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    next();
  });
  app.use(hpp());

  if (config.https.force) {
    app.use((req, res, next) => {
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      if (!secure && req.hostname && !req.hostname.startsWith('localhost')) {
        return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
      }
      next();
    });
  }
}

module.exports = { createSecurityMiddleware };

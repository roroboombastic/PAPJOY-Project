const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const config = require('../config');
const logger = require('../utils/logger');

function createSecurityMiddleware(app) {
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://js.stripe.com", "https://accounts.google.com", "https://apis.google.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "https://papjoy-project.onrender.com", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", "https://checkout.razorpay.com"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
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
    },
    crossOriginEmbedderPolicy: false
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

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin requests, please try again later' }
  });
  app.use('/api/v1/admin', adminLimiter);

  const webhookLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many webhook requests' }
  });
  app.use('/api/v1/payments/webhook', webhookLimiter);
  
  app.use(mongoSanitize());
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

  app.use((req, res, next) => {
    const timeoutMs = 30000;
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout' });
      }
    }, timeoutMs);
    res.on('finish', () => clearTimeout(timer));
    next();
  });
}

module.exports = { createSecurityMiddleware };

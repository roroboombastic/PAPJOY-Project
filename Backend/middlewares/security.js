const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const { TRUST_PROXY, CORS_ORIGIN, NODE_ENV, FORCE_HTTPS, DEFAULT_DEV_ORIGINS } = require('../config');

function createSecurityMiddleware(app) {
  if (TRUST_PROXY) {
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

  const origins = Array.from(new Set([
    ...DEFAULT_DEV_ORIGINS,
    ...(Array.isArray(CORS_ORIGIN) ? CORS_ORIGIN : String(CORS_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean))
  ]));
  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      if (origins.length === 0 || origins.includes('*') || origins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
  console.log('[INFO] CORS origins configured', JSON.stringify({ origins }));
  app.use(cors(corsOptions));
  app.use(compression());
  
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
  
  // mongoSanitize disabled due to Express 5 incompatibility - query property is read-only
  // app.use(mongoSanitize({ replaceWith: '_' }));
  app.use(hpp());

  if (FORCE_HTTPS) {
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

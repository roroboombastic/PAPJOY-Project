const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { initializeDatabase } = require('./db');
const { createSecurityMiddleware } = require('./middlewares/security');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const gridfs = require('./utils/gridfs');
const { startCleanupScheduler } = require('./services/cleanupOrphanedUploads');

const app = express();
createSecurityMiddleware(app);
app.use(cookieParser());

// Parse JSON bodies before routing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled rejection', { error: error.message, stack: error.stack });
  process.exit(1);
});

app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomBytes(16).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://*.razorpay.com https://*.paypal.com https://js.stripe.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; connect-src 'self' https:; frame-src https://*.razorpay.com https://*.paypal.com https://js.stripe.com;");
  next();
});

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/') && !req.originalUrl.startsWith(config.apiBasePath)) {
    req.url = `${config.apiBasePath}${req.originalUrl.slice(5)}`;
  }
  next();
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.originalUrl.startsWith(config.apiBasePath) && mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: 'Database unavailable',
      message: 'The database is temporarily unavailable. Please try again in a moment.'
    });
  }
  next();
});

app.use(`${config.apiBasePath}`, routes);
logger.info('Routes mounted', { apiBasePath: config.apiBasePath });

app.get('/health', (req, res) => {
  const readyStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const database = readyStates[mongoose.connection.readyState] || 'unknown';
  const status = database === 'connected' ? 'ok' : 'degraded';
  res.json({
    status,
    uptime: process.uptime(),
    database,
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Image uploads: serve from the local filesystem first, then fall back to GridFS.
// Images are embedded cross-site (www.papjoy.com), so they must be embeddable cross-origin.
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '30d',
  immutable: true,
  dotfiles: 'allow',
  index: false
}));

app.use('/uploads', async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const relative = req.path.replace(/^\/+/, '');
  if (!relative) return next();
  try {
    const files = await gridfs.fileExists(relative);
    if (files && files.length > 0) {
      const file = files[0];
      if (file.contentType) res.type(file.contentType);
      else res.type(path.extname(relative) || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      if (req.method === 'HEAD') return res.end();
      const stream = gridfs.openDownloadStreamByName(relative);
      stream.on('error', () => {
        if (!res.headersSent) res.status(404).end();
        else res.end();
      });
      stream.pipe(res);
      return;
    }
  } catch (err) {
    logger.warn('GridFS read failed', { file: relative, error: err.message });
  }
  next();
});

app.get('/debug/uploads', (req, res) => {
  try {
    const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    const productsDir = path.join(uploadsDir, 'products');
    const productFiles = fs.existsSync(productsDir) ? fs.readdirSync(productsDir) : [];
    res.json({
      uploadsDir,
      exists: fs.existsSync(uploadsDir),
      productsDir,
      productsExists: fs.existsSync(productsDir),
      files,
      productFiles
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const staticRoot = path.join(__dirname, '../frontend');
app.use(express.static(staticRoot, {
  maxAge: config.isProd ? '30d' : 0,
  immutable: config.isProd,
  etag: true
}));

app.use((req, res, next) => {
  if (req.originalUrl.startsWith(config.apiBasePath) || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  next();
});

app.use(errorHandler);

function handleServerError(error) {
  const meta = { port: config.port, code: error.code, message: error.message, timestamp: new Date().toISOString() };
  if (error.code === 'EADDRINUSE') {
    logger.error('Port already in use', meta);
  } else if (error.code === 'EACCES') {
    logger.error('Permission denied while binding port', meta);
  } else {
    logger.error('Server error', meta);
  }
  process.exit(1);
}

function startHttpServer(port) {
  const httpServer = app.listen(port, '0.0.0.0', () => {
    logger.info('Server listening', { port, appUrl: config.appUrl });
    logger.info('Uploads directory configured', { uploadsDir });
  });

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < 3050) {
      logger.warn('Port busy, retrying with a different port', { attemptedPort: port, nextPort: port + 1 });
      startHttpServer(port + 1);
      return;
    }
    handleServerError(error);
  });
}

function getMongoHost(uri) {
  try {
    const parsed = new URL(uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://') ? uri : `mongodb://${uri}`);
    return parsed.hostname;
  } catch {
    return 'unknown';
  }
}

async function start() {
  await initializeDatabase();
  const mongoHost = mongoose.connection.host || getMongoHost(config.database.mongoUri);
  const dbName = mongoose.connection.name || 'papjoy';
  logger.info('Startup diagnostics', {
    port: config.port,
    appUrl: config.appUrl,
    nodeEnv: config.nodeEnv,
    mongoHost,
    dbName,
    uploadsDir,
    timestamp: new Date().toISOString()
  });

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  startCleanupScheduler();

  if (config.https.enabled) {
    try {
      const sslOptions = {
        key: fs.readFileSync(path.resolve(config.https.keyPath)),
        cert: fs.readFileSync(path.resolve(config.https.certPath))
      };
      if (config.https.caPath) {
        sslOptions.ca = fs.readFileSync(path.resolve(config.https.caPath));
      }

      const httpsServer = https.createServer(sslOptions, app);
      httpsServer.on('error', handleServerError);
      httpsServer.on('listening', () => logger.info('HTTPS server listening', { port: config.port, appUrl: config.appUrl }));
      httpsServer.listen(config.port, '0.0.0.0');
      return;
    } catch (err) {
      logger.error('Failed to start HTTPS server', { error: err.message, stack: err.stack });
      process.exit(1);
    }
  }

  startHttpServer(config.port);
}

start().catch((err) => {
  logger.error('Application startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const { initializeDatabase } = require('./db');
const { createSecurityMiddleware } = require('./middlewares/security');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const { User, Product, Order } = require('./models');
const mongoose = require('mongoose');
const logger = require('./utils/logger');

const app = express();
createSecurityMiddleware(app);

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
  next();
});

app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/') && !req.originalUrl.startsWith(config.apiBasePath)) {
    req.url = `${config.apiBasePath}${req.url.slice(4)}`;
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
    timestamp: new Date().toISOString()
  });

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

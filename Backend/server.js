// Simplified Backend - Using Local Filesystem for Image Storage

const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { initializeDatabase } = require('./db');
const { createSecurityMiddleware } = require('./middlewares/security');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();
createSecurityMiddleware(app);
app.use(cookieParser());

// Clean up connection error handling
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error('Unhandled rejection', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Parse JSON bodies before routing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic request tracking
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || Math.random().toString(36).substring(2, 15);
  res.setHeader('X-Request-ID', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Handle API base path routing
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/') && !req.originalUrl.startsWith(config.apiBasePath)) {
    req.url = `${config.apiBasePath}${req.originalUrl.slice(5)}`;
  }
  next();
});

// Database status check for API routes
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.originalUrl.startsWith(config.apiBasePath)) {
    return res.status(503).json({
      success: false,
      error: 'Database unavailable',
      message: 'The database is temporarily unavailable. Please try again in a moment.'
    });
  }
  next();
});

// Mount API routes
app.use(`${config.apiBasePath}`, routes);
logger.info('Routes mounted', { apiBasePath: config.apiBasePath });

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Image uploads - SERVED FROM LOCAL FILESYSTEM
const uploadsDir = path.join(__dirname, '../uploads');
console.log('Serving uploads from:', uploadsDir);
console.log('Uploads directory exists:', fs.existsSync(uploadsDir));

// Serve uploads directory statically
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '30d',
  immutable: true,
  dotfiles: 'allow',
  index: false
}));

// Optional: Add a test endpoint to check uploads directory
app.get('/debug/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
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

// Frontend static files
const staticRoot = path.join(__dirname, '../frontend');
app.use(express.static(staticRoot, {
  maxAge: config.isProd ? '30d' : 0,
  immutable: config.isProd,
  etag: true
}));

// Handle client-side routing for frontend
app.use((req, res, next) => {
  if (req.originalUrl.startsWith(config.apiBasePath) || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  next();
});

// Global error handler
app.use(errorHandler);

function handleServerError(error) {
  if (error.code === 'EADDRINUSE') {
    logger.error('Port already in use', { port: config.port });
  } else if (error.code === 'EACCES') {
    logger.error('Permission denied while binding port', { port: config.port });
  } else {
    logger.error('Server error', { error: error.message, port: config.port });
  }
  process.exit(1);
}

function startHttpServer(port) {
  const httpServer = app.listen(port, '0.0.0.0', () => {
    logger.info('Server listening', { port, appUrl: config.appUrl });
    logger.info('Uploads directory configured', { uploadsDir });
    logger.info('Frontend static files', { staticRoot });
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

async function start() {
  // Initialize database connection
  await initializeDatabase();
  
  // Verify uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    logger.warn('Uploads directory does not exist. Creating...', { uploadsDir });
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const mongoHost = mongoose.connection.host || 'unknown';
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

  if (config.https.enabled) {
    try {
      const sslOptions = {
        key: fs.readFileSync(path.resolve(config.https.keyPath)),
        cert: fs.readFileSync(path.resolve(config.https.certPath))
      };
      if (config.https.caPath) {
        sslOptions.ca = fs.readFileSync(path.resolve(config.https.caPath));
      }

      const httpsServer = require('https').createServer(sslOptions, app);
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
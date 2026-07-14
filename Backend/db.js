const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { MONGO_URI, LOCAL_MONGO_URI, ALLOW_LOCAL_MONGO_FALLBACK } = require('./config');

mongoose.set('strictQuery', true);

function getConnectionMeta() {
  return {
    timestamp: new Date().toISOString(),
    readyState: mongoose.connection.readyState,
    db: mongoose.connection.name || 'unknown',
    host: mongoose.connection.host || 'unknown'
  };
}

mongoose.connection.on('connecting', () => {
  logger.info('MongoDB connecting', getConnectionMeta());
});

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected', getConnectionMeta());
});

mongoose.connection.on('reconnecting', () => {
  logger.info('MongoDB reconnecting', getConnectionMeta());
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected', getConnectionMeta());
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected', getConnectionMeta());
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', {
    ...getConnectionMeta(),
    error: err.message,
    stack: err.stack
  });
});

function getDatabaseLabel(uri) {
  if (!uri) return 'unknown';
  try {
    const url = new URL(uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://') ? uri : `mongodb://${uri}`);
    return url.hostname;
  } catch {
    return uri;
  }
}

function sanitizeMongoUri(uri) {
  if (!uri) return 'unknown';
  try {
    const parsed = new URL(uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://') ? uri : `mongodb://${uri}`);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

async function connectDatabase(uri) {
  const targetUri = uri || MONGO_URI || LOCAL_MONGO_URI;
  if (!targetUri) {
    logger.warn('MongoDB URI is not configured');
    return false;
  }

  try {
    await mongoose.connect(targetUri, {
      dbName: 'papjoy',
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
      retryWrites: true
    });
    logger.info('MongoDB connected', {
      uri: getDatabaseLabel(targetUri),
      readyState: mongoose.connection.readyState,
      db: mongoose.connection.name
    });
    return true;
  } catch (err) {
    logger.error('MongoDB connection error', {
      uri: getDatabaseLabel(targetUri),
      error: err.message
    });
    return false;
  }
}

async function initializeDatabase() {
  const usingAtlas = Boolean(MONGO_URI && MONGO_URI !== LOCAL_MONGO_URI);
  logger.info('Initializing MongoDB connection', {
    usingAtlas,
    allowFallback: ALLOW_LOCAL_MONGO_FALLBACK
  });

  const connected = await connectDatabase(MONGO_URI);
  if (!connected && usingAtlas && ALLOW_LOCAL_MONGO_FALLBACK) {
    logger.warn('Atlas connection failed. Falling back to local MongoDB.');
    return connectDatabase(LOCAL_MONGO_URI);
  }

  if (!connected && usingAtlas) {
    logger.error('Atlas connection failed and fallback is disabled.');
  }

  return connected;
}

module.exports = {
  connectDatabase,
  initializeDatabase
};

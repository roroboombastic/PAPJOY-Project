const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isDev = NODE_ENV === 'development';

/**
 * Safely retrieve environment variable with validation
 * @param {string} key - Environment variable name
 * @param {any} defaultValue - Default value if not set
 * @param {object} options - { required: boolean, validate: function }
 */
function getEnv(key, defaultValue = undefined, options = {}) {
  const value = process.env[key];
  const finalValue = value !== undefined ? value : defaultValue;

  // Check if required but missing - don't throw here, let validateConfiguration handle it
  if (options.required && !finalValue) {
    console.warn(`⚠️ WARNING: Missing required environment variable: ${key}`);
    return undefined;
  }

  // Custom validation
  if (options.validate && finalValue) {
    const validationResult = options.validate(finalValue);
    if (!validationResult.valid) {
      console.error(`❌ CRITICAL: Invalid value for ${key}: ${validationResult.message}`);
      return undefined;
    }
  }

  return finalValue;
}

/**
 * Parse and validate positive integer
 */
function getPositiveNumber(key, defaultValue = 3000) {
  const value = Number(process.env[key] || defaultValue);
  if (isNaN(value) || value <= 0 || !Number.isInteger(value)) {
    console.error(`❌ CRITICAL: ${key} must be a positive integer, got: ${value}`);
    return defaultValue;
  }
  return value;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse CORS origins - handle comma-separated or single URL
 */
function parseCorsOrigins(input, appUrl) {
  if (!input) {
    return isDev ? [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:5504',
      'http://127.0.0.1:5504'
    ] : [appUrl];
  }

  return input
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

// ============================================================================
// PARSE CONFIGURATION
// ============================================================================

const PORT = getPositiveNumber('PORT', 3000);
const APP_URL = getEnv('APP_URL', `http://127.0.0.1:${PORT}`);

const config = {
  // ========== SERVER ==========
  nodeEnv: NODE_ENV,
  isDev,
  isProd,
  port: PORT,
  appUrl: APP_URL,
  apiBasePath: '/api/v1',
  trustProxy: process.env.TRUST_PROXY === 'true',

  // ========== HTTPS/SSL ==========
  https: {
    enabled: process.env.HTTPS_ENABLED === 'true',
    force: process.env.FORCE_HTTPS === 'true',
    keyPath: process.env.SSL_KEY_PATH || '',
    certPath: process.env.SSL_CERT_PATH || '',
    caPath: process.env.SSL_CA_PATH || ''
  },

  // ========== CORS ==========
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGIN, APP_URL)
  },

  // ========== DATABASE ==========
  database: {
    mongoUri: getEnv(
      'MONGO_URI',
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/papjoy'
    ),
    localMongoUri: getEnv('LOCAL_MONGO_URI', 'mongodb://127.0.0.1:27017/papjoy'),
    allowLocalFallback: process.env.MONGO_FALLBACK_TO_LOCAL !== 'false'
  },

  // ========== JWT ==========
  jwt: {
    secret: getEnv('JWT_SECRET', undefined, {
      required: isProd,
      validate: (val) => ({
        valid: val && val.length >= 32 && val !== 'supersecretkey_dev_only',
        message: isProd ? 'Must be at least 32 characters in production' : ''
      })
    }) || 'dev-secret-key-do-not-use-in-production',
    expire: getEnv('JWT_EXPIRE', '7d'),
    refreshSecret: getEnv('JWT_REFRESH_SECRET', undefined, {
      required: isProd,
      validate: (val) => ({
        valid: val && val.length >= 32 && val !== 'supersecretrefresh_dev_only',
        message: isProd ? 'Must be at least 32 characters in production' : ''
      })
    }) || 'dev-refresh-secret-do-not-use-in-production',
    refreshExpire: getEnv('JWT_REFRESH_EXPIRE', '30d')
  },

  // ========== BUSINESS ==========
  business: {
    name: getEnv('BUSINESS_NAME', 'PAP-JOY'),
    gstin: getEnv('BUSINESS_GSTIN', undefined, {
      required: isProd,
      validate: (val) => ({
        valid: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/.test(val),
        message: 'Invalid GSTIN format'
      })
    }) || '',
    gst: {
      percent: getPositiveNumber('GST_PERCENT', 18),
      state: getEnv('GST_STATE', 'Delhi'),
      returnPolicy: getEnv(
        'GST_RETURN_POLICY',
        'Returns accepted within 7 days for unused items in original packaging.'
      )
    },
    supportEmail: getEnv('CUSTOMER_SUPPORT', 'support@papjoy.com', {
      validate: (val) => ({
        valid: isValidEmail(val),
        message: 'Invalid email format'
      })
    }),
    adminEmails: (getEnv('ADMIN_EMAILS', '') || '')
      .split(',')
      .map(e => e.trim())
      .filter(e => e.length > 0)
      .map(e => {
        if (!isValidEmail(e)) {
          console.error(`❌ CRITICAL: Invalid admin email format: ${e}`);
          return null;
        }
        return e.toLowerCase();
      })
      .filter(e => e !== null)
  },

  // ========== GOOGLE OAUTH ==========
  google: {
    clientId: getEnv('GOOGLE_CLIENT_ID', '')
  }
};

// ============================================================================
// VALIDATION
// ============================================================================

function validateConfiguration() {
  const errors = [];

  // Essential variables check (enforced in production only)
  if (isProd && !config.database.mongoUri) {
    errors.push('MONGO_URI must be set in production');
  }

  if (!config.jwt.secret || config.jwt.secret === 'dev-secret-key-do-not-use-in-production') {
    if (isProd) {
      errors.push('JWT_SECRET must be set to a secure value in production');
    }
  }

  // Production-specific validations
  if (isProd) {
    // Business information
    if (!config.business.gstin) {
      errors.push('BUSINESS_GSTIN must be set in production');
    }

    // HTTPS should be enabled
    if (!config.https.enabled) {
      console.warn('⚠️ WARNING: HTTPS is not enabled in production');
    }
  }

  if (errors.length > 0) {
    console.error('❌ Configuration Validation Failed:');
    errors.forEach(err => console.error(`   - ${err}`));
    process.exit(1);
  }

  console.log('✅ Configuration validated successfully');
}

validateConfiguration();

// ============================================================================
// LOGGING
// ============================================================================

console.log('[INFO] Environment loaded', JSON.stringify({
  nodeEnv: config.nodeEnv,
  port: config.port,
  appUrl: config.appUrl,
  corsOrigins: config.cors.origin,
  httpsEnabled: config.https.enabled
}, null, 2));

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = config;

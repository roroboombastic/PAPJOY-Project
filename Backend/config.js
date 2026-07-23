const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isDev = NODE_ENV === 'development';
const PORT = Number(process.env.PORT) || 3000;
const APP_URL = process.env.APP_URL || `http://127.0.0.1:${PORT}`;
const API_BASE_PATH = '/api/v1';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const FORCE_HTTPS = process.env.FORCE_HTTPS === 'true';
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const SSL_CA_PATH = process.env.SSL_CA_PATH || '';
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5504',
  'http://127.0.0.1:5504'
];
const DEFAULT_PROD_ORIGINS = [
  APP_URL,
  'https://papjoy-project.vercel.app',
  'https://www.papjoy.com'
];
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? DEFAULT_PROD_ORIGINS.join(',') : DEFAULT_DEV_ORIGINS.join(','));
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/papjoy';
const LOCAL_MONGO_URI = process.env.LOCAL_MONGO_URI || 'mongodb://127.0.0.1:27017/papjoy';
const ALLOW_LOCAL_MONGO_FALLBACK = process.env.MONGO_FALLBACK_TO_LOCAL !== 'false';
const BUSINESS_NAME = process.env.BUSINESS_NAME || 'PAP-JOY';
const BUSINESS_GSTIN = process.env.BUSINESS_GSTIN || '09CZDPK9498Q1Z2';
const GST_PERCENT = Number(process.env.GST_PERCENT || 18);
const GST_STATE = process.env.GST_STATE || 'Delhi';
const GST_RETURN_POLICY = process.env.GST_RETURN_POLICY || 'Returns accepted within 7 days for unused items in original packaging.';
const CUSTOMER_SUPPORT = process.env.CUSTOMER_SUPPORT || 'support@papjoy.com';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey_dev_only';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefresh_dev_only';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '30d';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET || '';
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_SUCCESS_URL = process.env.PAYPAL_SUCCESS_URL || `${APP_URL}/success.html?provider=paypal`;
const PAYPAL_CANCEL_URL = process.env.PAYPAL_CANCEL_URL || `${APP_URL}/checkout.html?paypal=canceled`;
process.env.PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || process.env.PAYPAL_SECRET || '';
process.env.PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY || '';
process.env.RAZORPAY_KEY = process.env.RAZORPAY_KEY_ID;
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || '';
process.env.RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_KEY = RAZORPAY_KEY_ID;
const RAZORPAY_SECRET = RAZORPAY_KEY_SECRET;
const RAZORPAY_CURRENCY = process.env.RAZORPAY_CURRENCY || 'INR';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);

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

  // Custom validation - accept boolean or { valid, message }
  if (options.validate && finalValue) {
    const rawResult = options.validate(finalValue);

    // Boolean validator
    if (typeof rawResult === 'boolean') {
      if (!rawResult) {
        console.error(`❌ CRITICAL: Invalid value for ${key}`);
        return undefined;
      }
    } else if (rawResult && typeof rawResult === 'object') {
      const valid = Boolean(rawResult.valid);
      const message = rawResult.message || '';
      if (!valid) {
        console.error(`❌ CRITICAL: Invalid value for ${key}: ${message}`);
        return undefined;
      }
    } else {
      // unexpected validator result
      console.error(`❌ CRITICAL: Validator for ${key} returned an unexpected result`);
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
    return isDev ? DEFAULT_DEV_ORIGINS : DEFAULT_PROD_ORIGINS;
  }

  return input
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

// ============================================================================
// PARSE CONFIGURATION
// ============================================================================

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

module.exports = {
  ...config,
  NODE_ENV,
  PORT,
  APP_URL,
  API_BASE_PATH,
  TRUST_PROXY,
  FORCE_HTTPS,
  HTTPS_ENABLED,
  SSL_KEY_PATH,
  SSL_CERT_PATH,
  SSL_CA_PATH,
  CORS_ORIGIN,
  MONGO_URI,
  LOCAL_MONGO_URI,
  ALLOW_LOCAL_MONGO_FALLBACK,
  JWT_SECRET,
  JWT_EXPIRE,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRE,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_MODE,
  PAYPAL_SUCCESS_URL,
  PAYPAL_CANCEL_URL,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_KEY,
  RAZORPAY_SECRET,
  RAZORPAY_CURRENCY,
  STRIPE_SECRET_KEY,
  GOOGLE_CLIENT_ID,
  ADMIN_EMAILS,
  DEFAULT_DEV_ORIGINS,
  BUSINESS_NAME,
  BUSINESS_GSTIN,
  GST_PERCENT,
  GST_STATE,
  GST_RETURN_POLICY,
  CUSTOMER_SUPPORT
};

// expose internals for testing
module.exports._internals = {
  getEnv,
  getPositiveNumber,
  isValidEmail,
  parseCorsOrigins,
  validateConfiguration
};

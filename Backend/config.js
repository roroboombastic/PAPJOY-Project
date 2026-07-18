const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
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
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? APP_URL : DEFAULT_DEV_ORIGINS.join(','));
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
const RAZORPAY_KEY = process.env.RAZORPAY_KEY || '';
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET || '';
const RAZORPAY_CURRENCY = process.env.RAZORPAY_CURRENCY || 'INR';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);

const requiredEnvVars = [
  'MONGO_URI',
  'JWT_SECRET',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'STRIPE_SECRET_KEY',
  'RAZORPAY_KEY',
  'RAZORPAY_SECRET'
];

function validateEnvironment() {
  const missing = requiredEnvVars.filter((name) => !process.env[name] || process.env[name].trim() === '');
  if (missing.length > 0) {
    console.warn(`⚠️ Missing environment variables: ${missing.join(', ')}`);
    if (NODE_ENV === 'production') {
      console.error('❌ FATAL: Required environment variables are not set for production.');
      process.exit(1);
    }
  }
  if (NODE_ENV === 'production' && (!JWT_SECRET || JWT_SECRET === 'supersecretkey_dev_only')) {
    console.error('❌ CRITICAL: JWT_SECRET must be set securely in production.');
    process.exit(1);
  }
}

validateEnvironment();

console.log('[INFO] Environment loaded', JSON.stringify({
  nodeEnv: NODE_ENV,
  port: PORT,
  appUrl: APP_URL,
  apiBasePath: API_BASE_PATH,
  corsOrigin: CORS_ORIGIN
}));

module.exports = {
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

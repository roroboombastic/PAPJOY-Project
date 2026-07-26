const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('../config');

function looksConfigured(value) {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const placeholderMarkers = ['dummy', 'test', 'your_', 'your-', 'placeholder', 'changeme', 'replace_me', 'example'];
  return !placeholderMarkers.some((marker) => normalized.includes(marker));
}

function isRazorpayConfigured() {
  return looksConfigured(RAZORPAY_KEY_ID) && looksConfigured(RAZORPAY_KEY_SECRET);
}

function getPaymentProviderStatus() {
  const razorpayReady = isRazorpayConfigured();
  return {
    razorpay: {
      enabled: razorpayReady,
      configured: razorpayReady,
      keyId: razorpayReady ? RAZORPAY_KEY_ID : null
    },
    card: { enabled: razorpayReady },
    upi: { enabled: razorpayReady || true },
    cod: { enabled: true }
  };
}

function isPaymentConfigured() {
  return isRazorpayConfigured();
}

function getRazorpayInstance() {
  if (!isRazorpayConfigured()) return null;
  const Razorpay = require('razorpay');
  return new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
  });
}

module.exports = {
  getPaymentProviderStatus,
  isPaymentConfigured,
  isRazorpayConfigured,
  getRazorpayInstance
};

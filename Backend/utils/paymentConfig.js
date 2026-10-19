const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = require('../config');

function looksConfigured(value) {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length < 8) return false;
  const placeholderMarkers = ['your_', 'your-', 'placeholder', 'changeme', 'replace_me'];
  if (placeholderMarkers.some((marker) => normalized.includes(marker))) return false;
  if (normalized === 'dummy' || normalized === 'test') return false;
  return true;
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
<<<<<<< HEAD
  isPaymentConfigured,
  isRazorpayConfigured,
  getRazorpayInstance
=======
  isPaymentConfigured
>>>>>>> 5b221d0 (Add header, footer, admin styles, and footwear products)
};

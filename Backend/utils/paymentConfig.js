function looksConfigured(value) {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const placeholderMarkers = ['dummy', 'test', 'your_', 'your-', 'placeholder', 'changeme', 'replace_me', 'example'];
  return !placeholderMarkers.some((marker) => normalized.includes(marker));
}

function getPaymentProviderStatus(env = {}) {
  const razorpay = {
    enabled: looksConfigured(env.razorpayKey) && looksConfigured(env.razorpaySecret),
    key: env.razorpayKey || '',
    secretConfigured: looksConfigured(env.razorpaySecret)
  };

  const stripe = {
    enabled: looksConfigured(env.stripeSecretKey),
    secretConfigured: looksConfigured(env.stripeSecretKey)
  };

  const paypal = {
    enabled: looksConfigured(env.paypalClientId) && looksConfigured(env.paypalClientSecret),
    clientIdConfigured: looksConfigured(env.paypalClientId),
    secretConfigured: looksConfigured(env.paypalClientSecret)
  };

  return { razorpay, stripe, paypal };
}

function isPaymentConfigured(status) {
  return Boolean(status?.razorpay?.enabled || status?.stripe?.enabled || status?.paypal?.enabled);
}

module.exports = {
  getPaymentProviderStatus,
  isPaymentConfigured
};

const paymentProviders = {
  paypal:
    !!PAYPAL_CLIENT_ID &&
    !!PAYPAL_CLIENT_SECRET,

  razorpay:
    !!RAZORPAY_KEY &&
    !!RAZORPAY_SECRET,

  stripe:
    !!STRIPE_SECRET_KEY
};

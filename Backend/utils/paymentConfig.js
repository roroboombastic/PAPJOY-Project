function looksConfigured(value) {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  const placeholderMarkers = ['dummy', 'test', 'your_', 'your-', 'placeholder', 'changeme', 'replace_me', 'example'];
  return !placeholderMarkers.some((marker) => normalized.includes(marker));
}

function getPaymentProviderStatus(env = {}) {
  const hasOwnEnv = (key) => Object.prototype.hasOwnProperty.call(env, key);
  const razorpayKey = hasOwnEnv('razorpayKey') ? env.razorpayKey : '';
  const razorpaySecret = hasOwnEnv('razorpaySecret') ? env.razorpaySecret : '';
  const stripeSecretKey = hasOwnEnv('stripeSecretKey') ? env.stripeSecretKey : '';
  const paypalClientId = hasOwnEnv('paypalClientId') ? env.paypalClientId : '';
  const paypalClientSecret = hasOwnEnv('paypalClientSecret') ? env.paypalClientSecret : '';

  const razorpay = {
    enabled: looksConfigured(razorpayKey) && looksConfigured(razorpaySecret),
    key: razorpayKey,
    secretConfigured: looksConfigured(razorpaySecret)
  };

  const stripe = {
    enabled: looksConfigured(stripeSecretKey),
    secretConfigured: looksConfigured(stripeSecretKey)
  };

  const paypal = {
    enabled: looksConfigured(paypalClientId) && looksConfigured(paypalClientSecret),
    clientIdConfigured: looksConfigured(paypalClientId),
    secretConfigured: looksConfigured(paypalClientSecret)
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

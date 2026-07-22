const test = require('node:test');
const assert = require('node:assert/strict');
const { getPaymentProviderStatus, isPaymentConfigured } = require('../utils/paymentConfig');

test('reports disabled payment providers when API keys are missing', () => {
  const status = getPaymentProviderStatus({});

  assert.equal(status.razorpay.enabled, false);
  assert.equal(status.stripe.enabled, false);
  assert.equal(status.paypal.enabled, false);
  assert.equal(isPaymentConfigured(status), false);
});

test('reports enabled providers when required keys are present', () => {
  const status = getPaymentProviderStatus({
    razorpayKey: 'rzp_live_123',
    razorpaySecret: 'supersecret',
    stripeSecretKey: 'sk_live_123',
    paypalClientId: 'paypal-client',
    paypalClientSecret: 'paypal-secret'
  });

  assert.equal(status.razorpay.enabled, true);
  assert.equal(status.stripe.enabled, true);
  assert.equal(status.paypal.enabled, true);
  assert.equal(isPaymentConfigured(status), true);
});

test('config reads Razorpay credentials from the canonical env names', () => {
  const configPath = require.resolve('../config');
  delete require.cache[configPath];
  process.env.RAZORPAY_KEY_ID = 'rzp_live_456';
  process.env.RAZORPAY_KEY_SECRET = 'live-secret';
  delete process.env.RAZORPAY_KEY;
  delete process.env.RAZORPAY_SECRET;

  const config = require('../config');

  assert.equal(config.RAZORPAY_KEY, 'rzp_live_456');
  assert.equal(config.RAZORPAY_SECRET, 'live-secret');
});

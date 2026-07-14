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
    razorpaySecret: 'secret',
    stripeSecretKey: 'sk_live_123',
    paypalClientId: 'paypal-client',
    paypalClientSecret: 'paypal-secret'
  });

  assert.equal(status.razorpay.enabled, true);
  assert.equal(status.stripe.enabled, true);
  assert.equal(status.paypal.enabled, true);
  assert.equal(isPaymentConfigured(status), true);
});

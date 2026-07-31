const test = require('node:test');
const assert = require('node:assert/strict');

test('reports payment provider status based on env config', () => {
  const { getPaymentProviderStatus, isRazorpayConfigured } = require('../utils/paymentConfig');
  const status = getPaymentProviderStatus();

  assert.ok(status.razorpay, 'razorpay status should exist');
  assert.ok(status.card, 'card status should exist');
  assert.ok(status.upi, 'upi status should exist');
  assert.ok(status.cod, 'cod status should exist');
  assert.equal(typeof status.razorpay.configured, 'boolean');
  assert.equal(status.cod.enabled, true);
  assert.equal(status.upi.enabled, true);
});

test('UPI and COD are always enabled', () => {
  const { getPaymentProviderStatus } = require('../utils/paymentConfig');
  const status = getPaymentProviderStatus();
  assert.equal(status.upi.enabled, true);
  assert.equal(status.cod.enabled, true);
});

test('config reads Razorpay credentials from the canonical env names', () => {
  const configPath = require.resolve('../config');
  delete require.cache[configPath];
  process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_placeholder_12345';
  process.env.RAZORPAY_KEY_SECRET = 'dummy-placeholder-secret';
  delete process.env.RAZORPAY_KEY;
  delete process.env.RAZORPAY_SECRET;

  const config = require('../config');

  assert.equal(config.RAZORPAY_KEY, 'rzp_test_dummy_placeholder_12345');
  assert.equal(config.RAZORPAY_SECRET, 'dummy-placeholder-secret');
});

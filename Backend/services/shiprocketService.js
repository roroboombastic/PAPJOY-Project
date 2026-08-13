const config = require('../config');
const logger = require('../utils/logger');

let cachedToken = null;
let tokenExpiry = 0;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // refresh well before Shiprocket's ~10 day expiry

let cachedPickupLocations = null;
let pickupLocationsExpiry = 0;
const PICKUP_LOCATIONS_TTL_MS = 60 * 60 * 1000;

// Set once a configured static token is rejected, so we stop retrying it and
// fall back to email/password login instead.
let staticTokenInvalid = false;

function looksConfigured(value) {
  if (typeof value !== 'string') return Boolean(value);
  const normalized = value.trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  const exactPlaceholders = ['dummy', 'test', 'example', 'placeholder', 'changeme', 'replace_me', 'your_email', 'your_password'];
  if (exactPlaceholders.includes(lower)) return false;
  if (/\b(changeme|replace[_-]?me|your[-_ ]?email|your[-_ ]?password|xxxx+)\b/.test(lower)) return false;
  return true;
}

function staticToken() {
  return String(config.shiprocket.apiToken || '').trim();
}

function isConfigured() {
  if (staticToken()) return true;
  return looksConfigured(config.shiprocket.email) && looksConfigured(config.shiprocket.password);
}

function getConfigStatus() {
  const email = config.shiprocket.email;
  const password = config.shiprocket.password;
  const pickup = config.shiprocket.pickupPincode;
  const token = staticToken();
  const emailSet = looksConfigured(email);
  const passwordSet = looksConfigured(password);
  const pickupSet = Boolean(String(pickup || '').trim());
  const apiTokenSet = Boolean(token);
  const configured = apiTokenSet || (emailSet && passwordSet);
  const issues = [];
  if (!configured) issues.push('Shiprocket credentials are not configured. Set SHIPROCKET_API_TOKEN, or SHIPROCKET_API_EMAIL + SHIPROCKET_API_PASSWORD.');
  if (!apiTokenSet && !emailSet) issues.push('SHIPROCKET_API_EMAIL is missing or looks like a placeholder');
  if (!apiTokenSet && !passwordSet) issues.push('SHIPROCKET_API_PASSWORD is missing or looks like a placeholder');
  if (!pickupSet) issues.push('SHIPROCKET_PICKUP_PINCODE is not set (required for rate quotes and order creation)');
  return {
    configured,
    emailSet,
    passwordSet,
    pickupPincodeSet: pickupSet,
    apiTokenSet,
    liveRatesEnabled: Boolean(config.shiprocket.liveRates),
    issues
  };
}

async function login() {
  if (!isConfigured()) {
    const error = new Error('Shiprocket is not configured. Add SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD to your environment.');
    error.code = 'SHIPROCKET_NOT_CONFIGURED';
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${config.shiprocket.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.shiprocket.email,
        password: config.shiprocket.password
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(`Shiprocket login failed (${response.status}): ${text.slice(0, 300)}`);
      error.code = 'SHIPROCKET_AUTH_FAILED';
      throw error;
    }

    const data = await response.json();
    if (!data.token) {
      const error = new Error('Shiprocket login returned no token. Check your API user email/password.');
      error.code = 'SHIPROCKET_AUTH_FAILED';
      throw error;
    }

    cachedToken = data.token;
    tokenExpiry = Date.now() + TOKEN_TTL_MS;
    logger.info('Shiprocket token refreshed', { expiresInDays: Math.round(TOKEN_TTL_MS / (24 * 60 * 60 * 1000)) });
    return cachedToken;
  } catch (err) {
    if (err.code) throw err;
    const error = new Error(`Could not reach Shiprocket: ${err.message}`);
    error.code = 'SHIPROCKET_NETWORK';
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getToken() {
  const token = staticToken();
  if (token && !staticTokenInvalid) {
    cachedToken = token;
    tokenExpiry = 0;
    return token;
  }
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  return login();
}

async function apiRequest(path, { method = 'GET', body, _authAttempt = 0 } = {}) {
  const token = await getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${config.shiprocket.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      if (response.status === 401) {
        if (_authAttempt >= 1) {
          const error = new Error(`Shiprocket authentication failed (401) at ${path}. Check SHIPROCKET_API_TOKEN or SHIPROCKET_API_EMAIL/SHIPROCKET_API_PASSWORD.`);
          error.code = 'SHIPROCKET_AUTH_FAILED';
          error.status = 401;
          error.details = data;
          throw error;
        }
        if (staticToken() && !staticTokenInvalid) {
          // The configured static token was rejected. Invalidate it and fall back
          // to email/password login (if configured) so a stale/wrong token does
          // not permanently block the integration.
          staticTokenInvalid = true;
          cachedToken = null;
          tokenExpiry = 0;
          if (looksConfigured(config.shiprocket.email) && looksConfigured(config.shiprocket.password)) {
            try {
              await login();
              return apiRequest(path, { method, body, _authAttempt: 1 });
            } catch (loginErr) {
              const error = new Error(
                `Shiprocket rejected the configured API token and login also failed: ${loginErr.message}. ` +
                `Regenerate the token (Shiprocket → My Profile → API & Webhooks) or fix SHIPROCKET_API_EMAIL/SHIPROCKET_API_PASSWORD.`
              );
              error.code = 'SHIPROCKET_AUTH_FAILED';
              error.status = 401;
              error.details = data;
              throw error;
            }
          }
          const error = new Error(
            `Shiprocket API token rejected (401) at ${path}. The SHIPROCKET_API_TOKEN value is invalid. ` +
            `Regenerate it in the Shiprocket dashboard (My Profile → API & Webhooks), ` +
            `or set SHIPROCKET_API_EMAIL + SHIPROCKET_API_PASSWORD instead.`
          );
          error.code = 'SHIPROCKET_AUTH_FAILED';
          error.status = 401;
          error.details = data;
          throw error;
        }
        cachedToken = null;
        tokenExpiry = 0;
        await login();
        return apiRequest(path, { method, body, _authAttempt: 1 });
      }
      let message = (data && (data.message || data.error)) || `Shiprocket request failed (${response.status})`;
      if (data && data.errors && typeof data.errors === 'object') {
        const detail = Object.entries(data.errors)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
          .join('; ');
        if (detail) message = `${message} — ${detail}`;
      }
      message = `${message} (at ${path})`;
      const error = new Error(message);
      error.code = data && data.error_code ? data.error_code : 'SHIPROCKET_API_ERROR';
      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.code) throw err;
    const error = new Error(`Could not reach Shiprocket: ${err.message}`);
    error.code = 'SHIPROCKET_NETWORK';
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function ensureNumeric(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function limitText(value, max = 190) {
  return String(value || '').trim().slice(0, max);
}

function formatShiprocketDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildShiprocketAddress(address = {}) {
  return {
    name: address.name || '',
    address: address.street || address.address || '',
    city: address.city || '',
    state: address.state || '',
    country: address.country || 'India',
    pin_code: address.zipCode || address.pincode || address.postalCode || '',
    phone: address.phone || '',
    email: address.email || ''
  };
}

async function getPickupLocations() {
  if (cachedPickupLocations && Date.now() < pickupLocationsExpiry) return cachedPickupLocations;
  const data = await apiRequest('/settings/company/pickup-location');
  const locations = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
  cachedPickupLocations = locations;
  pickupLocationsExpiry = Date.now() + PICKUP_LOCATIONS_TTL_MS;
  return locations;
}

function pickupLocationNameOf(location) {
  return String(location && (location.pickup_location || location.name || location.pickup_code) || '').trim();
}

async function resolvePickupLocationName() {
  const override = config.shiprocket.pickupLocationName;
  if (override && String(override).trim()) return String(override).trim();

  const locations = await getPickupLocations();
  if (!locations.length) return '';

  const pincode = String(config.shiprocket.pickupPincode || '').trim();
  if (pincode) {
    const byPin = locations.find(loc => String(loc.pin_code || '').trim() === pincode && pickupLocationNameOf(loc));
    if (byPin) return pickupLocationNameOf(byPin);
  }

  const active = locations.find(loc => String(loc.status) === '1' && pickupLocationNameOf(loc));
  if (active) return pickupLocationNameOf(active);

  const any = locations.find(loc => pickupLocationNameOf(loc));
  if (any) return pickupLocationNameOf(any);

  return '';
}

async function checkServiceability({ pickupPostcode, deliveryPostcode, cod = false, weight = 0.5, length = 0, breadth = 0, height = 0, declaredValue = 0 }) {
  const params = new URLSearchParams({
    pickup_postcode: String(pickupPostcode || ''),
    delivery_postcode: String(deliveryPostcode || ''),
    cod: cod ? 1 : 0,
    weight: ensureNumeric(weight, 0.5),
    length: ensureNumeric(length),
    breadth: ensureNumeric(breadth),
    height: ensureNumeric(height),
    declared_value: ensureNumeric(declaredValue)
  });
  return apiRequest(`/courier/serviceability/?${params.toString()}`, { method: 'GET' });
}

function aggregateDimensions(items = []) {
  let weight = 0.5;
  let length = 1;
  let breadth = 1;
  let height = 1;
  const validItems = (items || []).filter(it => it && Number(it.weight) > 0);
  if (validItems.length) {
    weight = validItems.reduce((sum, it) => sum + Number(it.weight) * Math.max(1, Number(it.quantity) || 1), 0);
    length = Math.max(...validItems.map(it => Number(it.length) || 1));
    breadth = Math.max(...validItems.map(it => Number(it.breadth) || 1));
    height = Math.max(...validItems.map(it => Number(it.height) || 1));
  }
  return { weight, length, breadth, height };
}

async function estimateShipping({ deliveryPostcode, cod = false, items = [] }) {
  if (!isConfigured() || !config.shiprocket.pickupPincode || !deliveryPostcode) {
    return null;
  }
  const { weight, length, breadth, height } = aggregateDimensions(items);
  const declaredValue = (items || []).reduce(
    (sum, it) => sum + Number(it.price || 0) * Math.max(1, Number(it.quantity) || 1),
    0
  );
  const data = await checkServiceability({
    pickupPostcode: config.shiprocket.pickupPincode,
    deliveryPostcode,
    cod: Boolean(cod),
    weight,
    length,
    breadth,
    height,
    declaredValue
  });
  const companies = data && Array.isArray(data.available_courier_companies)
    ? data.available_courier_companies
    : [];
  const rates = companies
    .map(courier => Number(courier.rate) || 0)
    .filter(rate => rate > 0)
    .sort((a, b) => a - b);
  if (!rates.length) return null;
  return Math.round(rates[0]);
}

function buildOrderPayload({ order, pickupLocation = null }) {
  const shippingAddress = buildShiprocketAddress(order.shippingAddress || order.billingAddress || {});
  const billingAddress = buildShiprocketAddress(order.billingAddress || order.shippingAddress || {});
  const cod = (order.paymentMethod || 'cod') === 'cod';

  const items = (order.items || []).map(item => {
    const unitWeight = ensureNumeric(item.weight, 0.5);
    const unitLength = ensureNumeric(item.length);
    const unitBreadth = ensureNumeric(item.breadth);
    const unitHeight = ensureNumeric(item.height);
    return {
      name: item.name || 'Item',
      sku: item.sku || item.productId?.toString?.() || `SKU-${String(item.productId || '').slice(-8)}`,
      units: Math.max(1, Number(item.quantity) || 1),
      selling_price: Number(item.price) || 0,
      discount: 0,
      tax: (item.cgst || 0) + (item.sgst || 0) + (item.igst || 0),
      hsn: item.hsnCode || '',
      weight: unitWeight,
      length: unitLength,
      breadth: unitBreadth,
      height: unitHeight
    };
  });

  const totalWeight = items.reduce((sum, it) => sum + it.weight * it.units, 0) || 0.5;

  return {
    order_id: order.orderNumber,
    order_date: formatShiprocketDate(order.createdAt || Date.now()),
    pickup_location: pickupLocation || config.shiprocket.pickupPincode,
    channel_id: '',
    comment: limitText(order.notes, 500) || '',
    billing_customer_name: limitText(billingAddress.name, 70),
    billing_last_name: '',
    billing_address: limitText(billingAddress.address),
    billing_city: limitText(billingAddress.city, 60),
    billing_pincode: limitText(billingAddress.pin_code, 10),
    billing_state: limitText(billingAddress.state, 60),
    billing_country: limitText(billingAddress.country, 60),
    billing_email: limitText(billingAddress.email, 120),
    billing_phone: limitText(billingAddress.phone, 20),
    shipping_is_billing: false,
    shipping_customer_name: limitText(shippingAddress.name, 70),
    shipping_last_name: '',
    shipping_address: limitText(shippingAddress.address),
    shipping_city: limitText(shippingAddress.city, 60),
    shipping_pincode: limitText(shippingAddress.pin_code, 10),
    shipping_state: limitText(shippingAddress.state, 60),
    shipping_country: limitText(shippingAddress.country, 60),
    shipping_email: limitText(shippingAddress.email, 120),
    shipping_phone: limitText(shippingAddress.phone, 20),
    order_items: items,
    payment_method: cod ? 'COD' : 'Prepaid',
    shipping_charges: Number(order.shipping) || 0,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: Number(order.discount) || 0,
    sub_total: Number(order.subtotal) || 0,
    length: Math.max(...items.map(it => it.length), 1),
    breadth: Math.max(...items.map(it => it.breadth), 1),
    height: Math.max(...items.map(it => it.height), 1),
    weight: totalWeight
  };
}

async function createOrderForPapjoyOrder({ order, pickupLocation = null }) {
  let name = pickupLocation;
  if (!name) name = await resolvePickupLocationName();
  if (!name) {
    const error = new Error('Could not resolve a Shiprocket pickup location. Add SHIPROCKET_PICKUP_LOCATION (the pickup location name) or ensure SHIPROCKET_PICKUP_PINCODE matches an active pickup location in your Shiprocket account.');
    error.code = 'SHIPROCKET_PICKUP_LOCATION_MISSING';
    throw error;
  }
  const payload = buildOrderPayload({ order, pickupLocation: name });
  const data = await apiRequest('/orders/create/adhoc', { method: 'POST', body: payload });
  return data;
}

async function generatePickup({ shipmentId, pickupDate }) {
  const name = await resolvePickupLocationName();
  const body = {
    shipment_id: String(shipmentId),
    pickup_location: name || config.shiprocket.pickupPincode
  };
  if (pickupDate) body.fixed_pickup_date = pickupDate;
  return apiRequest('/courier/generate/pickup', { method: 'POST', body });
}

async function assignAWB({ shipmentId, courierId }) {
  const body = { shipment_id: String(shipmentId) };
  if (courierId) body.courier_id = String(courierId);
  return apiRequest('/courier/assign/awb', { method: 'POST', body });
}

async function generateLabel({ shipmentId }) {
  return apiRequest('/courier/generate/label', { method: 'POST', body: { shipment_id: String(shipmentId) } });
}

async function trackShipment({ awbCode }) {
  return apiRequest(`/courier/track/awb/${encodeURIComponent(awbCode)}`);
}

async function cancelOrder({ shipmentId }) {
  return apiRequest('/orders/cancel', {
    method: 'POST',
    body: { ids: [String(shipmentId)] }
  });
}

module.exports = {
  isConfigured,
  getConfigStatus,
  login,
  getToken,
  apiRequest,
  getPickupLocations,
  resolvePickupLocationName,
  checkServiceability,
  estimateShipping,
  createOrderForPapjoyOrder,
  buildOrderPayload,
  generatePickup,
  assignAWB,
  generateLabel,
  trackShipment,
  cancelOrder
};

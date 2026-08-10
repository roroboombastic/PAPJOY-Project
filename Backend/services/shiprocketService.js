const config = require('../config');
const logger = require('../utils/logger');

let cachedToken = null;
let tokenExpiry = 0;
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // refresh well before Shiprocket's ~10 day expiry

let cachedPickupLocations = null;
let pickupLocationsExpiry = 0;
const PICKUP_LOCATIONS_TTL_MS = 60 * 60 * 1000;

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

function isConfigured() {
  return looksConfigured(config.shiprocket.email) && looksConfigured(config.shiprocket.password);
}

function getConfigStatus() {
  const email = config.shiprocket.email;
  const password = config.shiprocket.password;
  const pickup = config.shiprocket.pickupPincode;
  const emailSet = looksConfigured(email);
  const passwordSet = looksConfigured(password);
  const pickupSet = Boolean(String(pickup || '').trim());
  const issues = [];
  if (!emailSet) issues.push('SHIPROCKET_API_EMAIL is missing or looks like a placeholder');
  if (!passwordSet) issues.push('SHIPROCKET_API_PASSWORD is missing or looks like a placeholder');
  if (!pickupSet) issues.push('SHIPROCKET_PICKUP_PINCODE is not set (required for rate quotes and order creation)');
  return {
    configured: emailSet && passwordSet,
    emailSet,
    passwordSet,
    pickupPincodeSet: pickupSet,
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
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  return login();
}

async function apiRequest(path, { method = 'GET', body } = {}) {
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
        cachedToken = null;
        tokenExpiry = 0;
        const token = await login();
        return apiRequest(path, { method, body, _token: token });
      }
      const message = (data && (data.message || data.error)) || `Shiprocket request failed (${response.status})`;
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
  return apiRequest('/courier/serviceability/', {
    method: 'POST',
    body: {
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      cod: cod,
      weight: ensureNumeric(weight, 0.5),
      length: ensureNumeric(length),
      breadth: ensureNumeric(breadth),
      height: ensureNumeric(height),
      declared_value: ensureNumeric(declaredValue)
    }
  });
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
  const rates = Array.isArray(data.data)
    ? data.data
        .map(courier => Number(courier.rate) || 0)
        .filter(rate => rate > 0)
        .sort((a, b) => a - b)
    : [];
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
    order_date: new Date(order.createdAt || Date.now()).toISOString(),
    pickup_location: pickupLocation || config.shiprocket.pickupPincode,
    channel_id: '',
    comment: order.notes || '',
    billing_customer_name: billingAddress.name,
    billing_last_name: '',
    billing_address: billingAddress.address,
    billing_city: billingAddress.city,
    billing_pincode: billingAddress.pin_code,
    billing_state: billingAddress.state,
    billing_country: billingAddress.country,
    billing_email: billingAddress.email,
    billing_phone: billingAddress.phone,
    shipping_is_billing: false,
    shipping_customer_name: shippingAddress.name,
    shipping_last_name: '',
    shipping_address: shippingAddress.address,
    shipping_city: shippingAddress.city,
    shipping_pincode: shippingAddress.pin_code,
    shipping_state: shippingAddress.state,
    shipping_country: shippingAddress.country,
    shipping_email: shippingAddress.email,
    shipping_phone: shippingAddress.phone,
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

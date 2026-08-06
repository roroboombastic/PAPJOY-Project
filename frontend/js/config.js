let cacheExpiry = 5 * 60 * 1000;
const PRODUCT_PLACEHOLDER_SVG = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">' +
  '<rect width="600" height="600" fill="#f3f1ea"/>' +
  '<g fill="none" stroke="#b5ad97" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M225 250h150l-26 190H251z"/>' +
  '<path d="M225 250l25-55c10-22 45-22 55 0l25 55"/>' +
  '</g>' +
  '<text x="300" y="500" font-family="Georgia, serif" font-size="42" letter-spacing="10" fill="#9a9379" text-anchor="middle">PAP-JOY</text>' +
  '<text x="300" y="540" font-family="Arial, sans-serif" font-size="18" fill="#c2bba6" text-anchor="middle">Image coming soon</text>' +
  '</svg>'
);
const PRODUCT_FALLBACK_IMAGES = [PRODUCT_PLACEHOLDER_SVG];
const PRODUCT_FALLBACK_IMAGE = PRODUCT_PLACEHOLDER_SVG;
function getNextFallbackImage() {
  return PRODUCT_PLACEHOLDER_SVG;
}
const GST_RATE = 0;

function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.__PAPJOY_API_BASE_URL) return window.__PAPJOY_API_BASE_URL;
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:3000';
  const h = window.location.hostname;
  if (h === '127.0.0.1' || h === 'localhost' || h === '0.0.0.0') return 'http://127.0.0.1:3000';
  if (h === 'papjoy.com' || h === 'www.papjoy.com') return 'https://papjoy-project.onrender.com';
  return 'https://papjoy-project.onrender.com';
}

const API_BASE_URL = getDefaultApiBaseUrl();

function apiUrl(path) {
  if (!path) return API_BASE_URL;
  return path.startsWith('http') ? path : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function safeParseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return { __invalidJson: true, status: response.status, statusText: response.statusText, rawText: text, error: 'Invalid JSON response from server' };
  }
}

async function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  options.credentials = options.credentials || 'include';
  try {
    const response = await fetch(url, options);
    const data = await safeParseJson(response);
    return { response, data };
  } catch (error) {
    console.error('API request failed', { url, method: options.method || 'GET', error: error.message });
    throw error;
  }
}

const localeRegionMap = {
  IN: { locale: 'en-IN', currency: 'INR', label: 'India (₹)' },
  US: { locale: 'en-US', currency: 'USD', label: 'United States ($)' },
  GB: { locale: 'en-GB', currency: 'GBP', label: 'United Kingdom (£)' },
  EU: { locale: 'en-IE', currency: 'EUR', label: 'Europe (€)' },
  AU: { locale: 'en-AU', currency: 'AUD', label: 'Australia (A$)' },
  CA: { locale: 'en-CA', currency: 'CAD', label: 'Canada (C$)' },
  AE: { locale: 'ar-AE', currency: 'AED', label: 'UAE (د.إ)' },
};

const regionRates = {
  INR: 1,
  USD: 0.012,
  EUR: 0.011,
  GBP: 0.0095,
  AUD: 0.018,
  CAD: 0.016,
  AED: 0.044,
};
const FALLBACK_REGION_RATES = { ...regionRates };
const RATES_CACHE_KEY = 'papjoy-fx-rates';
const RATES_CACHE_TTL = 6 * 60 * 60 * 1000;

function inferRegionFromBrowser() {
  const locale = navigator.language || navigator.userLanguage || 'en-IN';
  const [, region] = locale.split(/[-_]/);
  if (region && localeRegionMap[region.toUpperCase()]) return region.toUpperCase();
  return locale.startsWith('en-US') ? 'US' : locale.startsWith('en-GB') ? 'GB' : locale.startsWith('en-AU') ? 'AU' : locale.startsWith('en-CA') ? 'CA' : 'IN';
}

let selectedRegion = localStorage.getItem('papjoy-region') || 'IN';
let currentLocale = localeRegionMap[selectedRegion]?.locale || 'en-IN';
let currentCurrency = localeRegionMap[selectedRegion]?.currency || 'INR';
let currencyFormatter = new Intl.NumberFormat(currentLocale, { style: 'currency', currency: currentCurrency, maximumFractionDigits: 0 });

function getCurrentLocaleRegion() {
  return localeRegionMap[selectedRegion] || localeRegionMap.IN;
}

function updateCurrencyFormatter() {
  selectedRegion = localStorage.getItem('papjoy-region') || 'IN';
  const region = getCurrentLocaleRegion();
  currentLocale = region.locale;
  currentCurrency = region.currency;
  currencyFormatter = new Intl.NumberFormat(currentLocale, { style: 'currency', currency: region.currency, maximumFractionDigits: 0 });
  window.selectedRegion = selectedRegion;
  window.currentLocale = currentLocale;
  window.currentCurrency = currentCurrency;
  window.currencyFormatter = currencyFormatter;
}

function formatCurrency(amount) {
  const rate = regionRates[currentCurrency] ?? 1;
  const converted = Math.round((Number(amount) || 0) * rate);
  return currencyFormatter.format(converted);
}

function formatINR(amount) {
  const value = Math.round(Number(amount) || 0);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  } catch (e) {
    return '₹' + value;
  }
}

function loadCachedRates() {
  try {
    const raw = localStorage.getItem(RATES_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !cached.rates || Date.now() - cached.ts > RATES_CACHE_TTL) return null;
    return cached.rates;
  } catch (e) {
    return null;
  }
}

async function refreshLiveRates() {
  try {
    const cached = loadCachedRates();
    if (cached) {
      regionRates = { ...FALLBACK_REGION_RATES, ...cached };
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://open.er-api.com/v6/latest/INR', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.result === 'success' && data.rates) {
      const live = {};
      Object.keys(FALLBACK_REGION_RATES).forEach((code) => {
        const rate = Number(data.rates[code]);
        if (rate && rate > 0) live[code] = rate;
      });
      live.INR = 1;
      regionRates = { ...FALLBACK_REGION_RATES, ...live };
      try {
        localStorage.setItem(RATES_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates: regionRates }));
      } catch (e) { /* storage unavailable */ }
    }
  } catch (e) {
    /* keep fallback rates on network failure */
  }
}

refreshLiveRates();

window.PRODUCT_FALLBACK_IMAGE = PRODUCT_FALLBACK_IMAGE;
window.PRODUCT_FALLBACK_IMAGES = PRODUCT_FALLBACK_IMAGES;
window.PRODUCT_PLACEHOLDER_SVG = PRODUCT_PLACEHOLDER_SVG;
window.getNextFallbackImage = getNextFallbackImage;
window.GST_RATE = GST_RATE;
window.cacheExpiry = cacheExpiry;
window.API_BASE_URL = API_BASE_URL;
window.getDefaultApiBaseUrl = getDefaultApiBaseUrl;
window.apiUrl = apiUrl;
window.safeParseJson = safeParseJson;
window.apiFetch = apiFetch;
window.localeRegionMap = localeRegionMap;
window.regionRates = regionRates;
window.FALLBACK_REGION_RATES = FALLBACK_REGION_RATES;
window.selectedRegion = selectedRegion;
window.currentLocale = currentLocale;
window.currentCurrency = currentCurrency;
window.currencyFormatter = currencyFormatter;
window.getCurrentLocaleRegion = getCurrentLocaleRegion;
window.inferRegionFromBrowser = inferRegionFromBrowser;
window.updateCurrencyFormatter = updateCurrencyFormatter;
window.formatCurrency = formatCurrency;
window.formatINR = formatINR;
window.refreshLiveRates = refreshLiveRates;

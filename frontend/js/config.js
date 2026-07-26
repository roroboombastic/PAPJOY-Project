let cacheExpiry = 5 * 60 * 1000;
const PRODUCT_FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1539185441755-769473a23570?w=600&h=600&fit=crop',
  'https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=600&h=600&fit=crop'
];
const PRODUCT_FALLBACK_IMAGE = PRODUCT_FALLBACK_IMAGES[0];
let _fallbackIndex = 0;
function getNextFallbackImage() {
  const img = PRODUCT_FALLBACK_IMAGES[_fallbackIndex % PRODUCT_FALLBACK_IMAGES.length];
  _fallbackIndex++;
  return img;
}
const GST_RATE = 0.18;

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

function inferRegionFromBrowser() {
  const locale = navigator.language || navigator.userLanguage || 'en-IN';
  const [, region] = locale.split(/[-_]/);
  if (region && localeRegionMap[region.toUpperCase()]) return region.toUpperCase();
  return locale.startsWith('en-US') ? 'US' : locale.startsWith('en-GB') ? 'GB' : locale.startsWith('en-AU') ? 'AU' : locale.startsWith('en-CA') ? 'CA' : 'IN';
}

let selectedRegion = localStorage.getItem('papjoy-region') || inferRegionFromBrowser();
let currentLocale = localeRegionMap[selectedRegion]?.locale || 'en-IN';
let currentCurrency = localeRegionMap[selectedRegion]?.currency || 'INR';
let currencyFormatter = new Intl.NumberFormat(currentLocale, { style: 'currency', currency: currentCurrency, maximumFractionDigits: 0 });

function getCurrentLocaleRegion() {
  return localeRegionMap[selectedRegion] || localeRegionMap.IN;
}

function updateCurrencyFormatter() {
  const region = getCurrentLocaleRegion();
  selectedRegion = localStorage.getItem('papjoy-region') || selectedRegion;
  currentLocale = region.locale;
  currentCurrency = region.currency;
  currencyFormatter = new Intl.NumberFormat(currentLocale, { style: 'currency', currency: region.currency, maximumFractionDigits: 0 });
}

function formatCurrency(amount) {
  return currencyFormatter.format(Math.round(Number(amount) || 0));
}

window.PRODUCT_FALLBACK_IMAGE = PRODUCT_FALLBACK_IMAGE;
window.PRODUCT_FALLBACK_IMAGES = PRODUCT_FALLBACK_IMAGES;
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
window.selectedRegion = selectedRegion;
window.currentLocale = currentLocale;
window.currentCurrency = currentCurrency;
window.currencyFormatter = currencyFormatter;
window.getCurrentLocaleRegion = getCurrentLocaleRegion;
window.inferRegionFromBrowser = inferRegionFromBrowser;
window.updateCurrencyFormatter = updateCurrencyFormatter;
window.formatCurrency = formatCurrency;

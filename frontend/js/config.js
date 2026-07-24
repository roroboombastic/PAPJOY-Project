let cacheExpiry = 5 * 60 * 1000;
const PRODUCT_FALLBACK_IMAGE = 'https://via.placeholder.com/800x800?text=PAP-JOY';
const GST_RATE = 0.18;

function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.__PAPJOY_API_BASE_URL) return window.__PAPJOY_API_BASE_URL;
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:3000';
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.hostname === '0.0.0.0') return 'http://127.0.0.1:3000';
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
  try {
    const response = await fetch(url, options);
    const data = await safeParseJson(response);
    return { response, data };
  } catch (error) {
    console.error('API request failed', { url, method: options.method || 'GET', error: error.message });
    throw error;
  }
}

const validPromoCodes = {
  WELCOME10: { discount: 0.10, label: '10% off' },
  SAVE20: { discount: 0.20, label: '20% off' },
  SUMMER15: { discount: 0.15, label: '15% off summer collection' },
  NEWUSER5: { discount: 0.05, label: 'Welcome 5% off' }
};

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

const availableLanguages = {
  en: { label: 'English' },
  hi: { label: 'हिन्दी' },
  es: { label: 'Español' },
  fr: { label: 'Français' },
  ar: { label: 'العربية' },
};

function inferLanguageFromBrowserLang() {
  const locale = navigator.language || navigator.userLanguage || 'en';
  const [lang] = locale.split(/[-_]/);
  return availableLanguages[lang] ? lang : 'en';
}

let selectedLanguage = localStorage.getItem('papjoy-lang') || inferLanguageFromBrowserLang();

window.PRODUCT_FALLBACK_IMAGE = PRODUCT_FALLBACK_IMAGE;
window.GST_RATE = GST_RATE;
window.cacheExpiry = cacheExpiry;
window.API_BASE_URL = API_BASE_URL;
window.getDefaultApiBaseUrl = getDefaultApiBaseUrl;
window.apiUrl = apiUrl;
window.safeParseJson = safeParseJson;
window.apiFetch = apiFetch;
window.validPromoCodes = validPromoCodes;
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
window.availableLanguages = availableLanguages;
window.selectedLanguage = selectedLanguage;
window.inferLanguageFromBrowserLang = inferLanguageFromBrowserLang;

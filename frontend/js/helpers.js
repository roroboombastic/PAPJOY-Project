function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const externalSignal = options.signal;
  const timer = setTimeout(() => controller.abort(), timeout);
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getProductImageUrls(product) {
  if (!product) return [];
  if (Array.isArray(product.images)) {
    return product.images
      .map((img) => {
        if (typeof img === 'string') return img;
        return img?.url || img?.src || '';
      })
      .filter(Boolean);
  }
  if (typeof product.image === 'string' && product.image) {
    return [product.image];
  }
  return [];
}

function normalizeVariantName(variantName) {
  return String(variantName || 'Standard').trim() || 'Standard';
}

function getItemIdentity(item, variantName = 'Standard') {
  const id = item?.id || item?._id || item?.productId || item?.product?.id || item?.product?._id || '';
  return `${String(id)}:${normalizeVariantName(variantName || item?.variant || 'Standard')}`;
}

function dedupeItemsByKey(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeProduct(product) {
  if (!product) return null;
  const images = getProductImageUrls(product);
  const details = Array.isArray(product.details)
    ? product.details
    : Array.isArray(product.attributes)
      ? product.attributes.map((attr) => `${attr.name}: ${attr.value}`)
      : [];
  const variants = Array.isArray(product.variants) && product.variants.length
    ? product.variants.map((variant) => ({
        name: variant.name || variant.value || 'Standard',
        priceDelta: variant.priceModifier ?? variant.priceDelta ?? 0
      }))
    : [{ name: 'Standard', priceDelta: 0 }];
  const subtitle = product.subtitle || product.shortDescription || (typeof product.description === 'string' ? product.description.slice(0, 80) : '');
  return {
    ...product,
    id: product.id || product._id || product.slug,
    _id: product._id || product.id || product.slug,
    slug: product.slug || product.id,
    category: product.category || (typeof product.categoryId === 'object' && product.categoryId?.name) || product.categoryId?.name || 'Uncategorized',
    subtitle,
    description: product.description || '',
    image: images[0] || product.image || window.PRODUCT_FALLBACK_IMAGE,
    images: images.length ? images : [product.image || window.PRODUCT_FALLBACK_IMAGE],
    details,
    variants,
    price: Number(product.price || 0),
    isFeatured: Boolean(product.isFeatured),
    isNewArrival: Boolean(product.isNewArrival || product.newArrival || product.isNew || false),
    inventory: product.inventory || { quantity: 0, lowStockThreshold: 10 }
  };
}

function getInventoryStatus(product) {
  const quantity = product.inventory?.quantity || 0;
  const threshold = product.inventory?.lowStockThreshold || 10;
  if (quantity === 0) return { status: 'Out of Stock', class: 'out-of-stock', color: '#d32f2f' };
  if (quantity <= threshold) return { status: `Limited: ${quantity} left`, class: 'low-stock', color: '#f57c00' };
  return { status: 'In Stock', class: 'in-stock', color: '#388e3c' };
}

function getProductLink(product) {
  return product.slug ? `product-detail.html?slug=${product.slug}` : `product-detail.html?id=${product.id}`;
}

function getProductById(productId) {
  return products.find((product) =>
    String(product._id) === String(productId) ||
    String(product.id) === String(productId) ||
    String(product.slug) === String(productId)
  );
}

function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

async function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

window.debounce = debounce;
window.fetchWithTimeout = fetchWithTimeout;
window.getProductImageUrls = getProductImageUrls;
window.normalizeVariantName = normalizeVariantName;
window.getItemIdentity = getItemIdentity;
window.dedupeItemsByKey = dedupeItemsByKey;
window.normalizeProduct = normalizeProduct;
window.getInventoryStatus = getInventoryStatus;
window.getProductLink = getProductLink;
window.getProductById = getProductById;
window.getQueryParams = getQueryParams;
window.loadScript = loadScript;

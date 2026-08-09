function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

const IMAGE_RETRY_DELAYS = [1500, 4000, 8000];
function handleProductImageError(img) {
  if (!img || typeof img.dataset === 'undefined') return;
  if (img.dataset.fb) {
    img.style.display = 'none';
    return;
  }
  const orig = img.dataset.orig || img.src || '';
  img.dataset.orig = orig;
  const pathOnly = orig.replace(/^https?:\/\/[^/]+/i, '');
  const isUploadPath = pathOnly.indexOf('/uploads/') === 0;
  const isRenderOrigin = /onrender\.com/i.test(orig);

  if (isUploadPath && !isRenderOrigin && !img.dataset.rendered) {
    img.dataset.rendered = '1';
    img.dataset.retry = '0';
    setTimeout(() => {
      if (!img.dataset.fb) {
        img.src = 'https://papjoy-project.onrender.com' + pathOnly;
      }
    }, 400);
    return;
  }

  const attempt = (parseInt(img.dataset.retry || '0', 10) || 0) + 1;
  img.dataset.retry = String(attempt);
  if (attempt <= IMAGE_RETRY_DELAYS.length) {
    const delay = IMAGE_RETRY_DELAYS[attempt - 1];
    setTimeout(() => {
      if (!img.dataset.fb) {
        img.src = '';
        img.src = orig;
      }
    }, delay);
  } else {
    img.dataset.fb = '1';
    img.src = (typeof getNextFallbackImage === 'function' ? getNextFallbackImage() : window.PRODUCT_FALLBACK_IMAGE) || '';
    if (typeof revealProductImage === 'function') revealProductImage(img);
    if (!img.src) img.style.display = 'none';
  }
}

function revealProductImage(img) {
  if (!img) return;
  img.classList.add('img-loaded');
  const container = img.closest ? img.closest('.product-image') : null;
  if (container) container.classList.add('img-has-image');
}

function resolveProductImageUrl(url) {
  if (!url) return '';
  const str = String(url);
  if (/^(data:|blob:)/i.test(str)) return str;
  if (/^https?:\/\//i.test(str)) {
    if (/^https:\/\/papjoy-project\.onrender\.com\/uploads\//i.test(str)) {
      return str.replace(/^https:\/\/papjoy-project\.onrender\.com/i, '');
    }
    return str;
  }
  if (str.startsWith('/')) return str;
  return str;
}

function getProductImageUrls(product) {
  if (!product) return [];
  if (Array.isArray(product.images)) {
    return product.images
      .map((img) => {
        if (typeof img === 'string') return resolveProductImageUrl(img);
        return resolveProductImageUrl(img?.url || img?.src || '');
      })
      .filter(Boolean);
  }
  if (product.images && typeof product.images === 'object') {
    return [resolveProductImageUrl(product.images?.url || product.images?.src || '')].filter(Boolean);
  }
  if (typeof product.image === 'string' && product.image) {
    return [resolveProductImageUrl(product.image)];
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
  const quantity = Number(product.inventory?.quantity);
  const threshold = Number(product.inventory?.lowStockThreshold) || 10;
  if (quantity <= 0) {
    return { status: 'Out of Stock', class: 'out-of-stock', color: 'var(--danger)', label: 'Out of Stock', qty: 0, outOfStock: true, lowStock: false, inStock: false };
  }
  if (quantity <= threshold) {
    return { status: `Only ${quantity} left`, class: 'low-stock', color: 'var(--warning)', label: `Only ${quantity} left`, qty: quantity, outOfStock: false, lowStock: true, inStock: false };
  }
  return { status: 'In Stock', class: 'in-stock', color: 'var(--success)', label: '', qty: quantity, outOfStock: false, lowStock: false, inStock: true };
}

function getProductLink(product) {
  return product.slug ? `product-detail.html?slug=${product.slug}` : `product-detail.html?id=${product.id}`;
}

function getProductById(productId) {
  if (typeof products === 'undefined') return undefined;
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
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

window.debounce = debounce;
window.escapeHTML = escapeHTML;
window.fetchWithTimeout = fetchWithTimeout;
window.handleProductImageError = handleProductImageError;
window.revealProductImage = revealProductImage;
window.getProductImageUrls = getProductImageUrls;
window.resolveProductImageUrl = resolveProductImageUrl;
window.normalizeVariantName = normalizeVariantName;
window.getItemIdentity = getItemIdentity;
window.dedupeItemsByKey = dedupeItemsByKey;
window.normalizeProduct = normalizeProduct;
window.getInventoryStatus = getInventoryStatus;
window.getProductLink = getProductLink;
window.getProductById = getProductById;
window.getQueryParams = getQueryParams;
window.loadScript = loadScript;
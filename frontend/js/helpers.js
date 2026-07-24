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

const fallbackProducts = [
  {
    id: 'jetblack-runner',
    slug: 'jetblack-runner',
    name: 'JetBlack Runner',
    category: 'Street Performance',
    subtitle: 'Lightweight sneakers built for speed, comfort, and everyday style.',
    description: 'A versatile running sneaker with breathable knit upper, responsive cushioning, and a sleek, all-black profile designed for both streetwear and training.',
    price: 7999,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1528701800489-20db3000e734?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80'
    ],
    details: ['Breathable knit upper', 'Responsive EVA midsole', 'Slip-resistant rubber outsole', 'Ergonomic fit for all-day wear'],
    variants: [
      { name: 'Black / Standard', priceDelta: 0 },
      { name: 'Black / Wide', priceDelta: 500 }
    ],
    isFeatured: true,
    inventory: { quantity: 18, lowStockThreshold: 5 }
  },
  {
    id: 'sunset-sole',
    slug: 'sunset-sole',
    name: 'Sunset Sole',
    category: 'Casual Comfort',
    subtitle: 'A relaxed fit sneaker with warm tones and cushioned support.',
    description: 'An everyday lifestyle shoe with soft suede accents, memory foam footbed, and a textured outsole for confident summer style.',
    price: 8999,
    image: 'https://images.unsplash.com/photo-1528701800489-20db3000e734?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1528701800489-20db3000e734?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1552346154-d71229018c9f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1519741498540-c3b7d4f4b9cd?auto=format&fit=crop&w=800&q=80'
    ],
    details: ['Soft suede overlays', 'Memory foam footbed', 'Flexible grooved outsole', 'Perfect for city strolls'],
    variants: [
      { name: 'Sand / Standard', priceDelta: 0 },
      { name: 'Sand / Premium', priceDelta: 700 }
    ],
    isFeatured: true,
    inventory: { quantity: 24, lowStockThreshold: 6 }
  },
  {
    id: 'nova-trail',
    slug: 'nova-trail',
    name: 'Nova Trail',
    category: 'Active Explorer',
    subtitle: 'Durable hiking footwear engineered for unpredictable terrain.',
    description: 'A rugged trail shoe with weather-resistant uppers, reinforced heel support, and a grippy outsole that keeps you confident on the move.',
    price: 10999,
    image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=800&q=80'
    ],
    details: ['Water-resistant upper', 'Trail-ready rubber outsole', 'Reinforced arch support', 'Stabilizing heel counter'],
    variants: [
      { name: 'Oak / Standard', priceDelta: 0 },
      { name: 'Oak / Wide', priceDelta: 600 }
    ],
    isNewArrival: true,
    inventory: { quantity: 12, lowStockThreshold: 4 }
  },
  {
    id: 'crimson-sneak',
    slug: 'crimson-sneak',
    name: 'Crimson Sneak',
    category: 'Modern Streetwear',
    subtitle: 'Bold red sneakers with a sleek silhouette and premium detailing.',
    description: 'A fashion-forward sneaker with plush cushioning, tonal design accents, and a flexible sole that moves with every step.',
    price: 8499,
    image: 'https://images.unsplash.com/photo-1519741498540-c3b7d4f4b9cd?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1519741498540-c3b7d4f4b9cd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1528701800489-20db3000e734?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80'
    ],
    details: ['Bold color-block finish', 'Cushioned tongue and collar', 'Flexible outsole geometry', 'Street-ready comfort'],
    variants: [
      { name: 'Red / Standard', priceDelta: 0 },
      { name: 'Red / Premium', priceDelta: 650 }
    ],
    isNewArrival: true,
    inventory: { quantity: 10, lowStockThreshold: 3 }
  }
];

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

function getAvailableCategories() {
  return Array.from(new Set(products.map((product) => product.category))).filter(Boolean);
}

window.debounce = debounce;
window.fetchWithTimeout = fetchWithTimeout;
window.fallbackProducts = fallbackProducts;
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
window.getAvailableCategories = getAvailableCategories;

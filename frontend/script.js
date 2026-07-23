// Global variables
let products = [];
let currentProduct = null;
let productsCache = null;
let cacheExpiry = 5 * 60 * 1000; // 5 minutes
let productsLoadPromise = null;
let productRenderCount = 0;

function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.__PAPJOY_API_BASE_URL) return window.__PAPJOY_API_BASE_URL;

  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }
  if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost' || window.location.hostname === '0.0.0.0') {
    return 'http://127.0.0.1:3000';
  }

  return 'https://papjoy-project.onrender.com';
}

const API_BASE_URL = getDefaultApiBaseUrl();

function apiUrl(path) {
  if (!path) return API_BASE_URL;
  return path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function safeParseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      __invalidJson: true,
      status: response.status,
      statusText: response.statusText,
      rawText: text,
      error: 'Invalid JSON response from server',
    };
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

function onPageError(event) {
  console.error('Frontend runtime error', event.error || event.message || event);
}
function onUnhandledRejection(event) {
  console.error('Unhandled promise rejection', event.reason);
}
window.addEventListener('error', onPageError);
window.addEventListener('unhandledrejection', onUnhandledRejection);

window.addEventListener('pagehide', () => {
  window.removeEventListener('error', onPageError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  if (syncCartTimer) clearTimeout(syncCartTimer);
  if (trackingInterval) clearInterval(trackingInterval);
});

// GST configuration (18% default). Use CGST/SGST split for display.
const GST_RATE = 0.18;

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
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
    image: images[0] || product.image || 'https://via.placeholder.com/800x800?text=PAP-JOY',
    images: images.length ? images : [product.image || 'https://via.placeholder.com/800x800?text=PAP-JOY'],
    details,
    variants,
    price: Number(product.price || 0),
    isFeatured: Boolean(product.isFeatured),
    isNewArrival: Boolean(product.isNewArrival || product.newArrival || product.isNew || false),
    inventory: product.inventory || { quantity: 0, lowStockThreshold: 10 }
  };
}

// ================== API FUNCTIONS ==================

// Load products from API with caching
async function loadProducts() {
  if (productsLoadPromise) {
    return productsLoadPromise;
  }

  productsLoadPromise = (async () => {
    const now = Date.now();
    const cached = localStorage.getItem('papjoy-products-cache');
    let cachedProducts = [];

    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Array.isArray(data) && data.length && now - timestamp < cacheExpiry) {
          cachedProducts = data.map(normalizeProduct).filter(Boolean);
        }
      } catch (error) {
        localStorage.removeItem('papjoy-products-cache');
      }
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products`, { timeout: 5000 });
      if (!response.ok) {
        throw new Error(`Product API returned ${response.status}`);
      }

      const data = await response.json();
      const receivedProducts = Array.isArray(data.products) ? data.products : [];

      const loadedProducts = receivedProducts.map(normalizeProduct).filter(Boolean);

      products = loadedProducts;
      if (loadedProducts.length) {
        localStorage.setItem('papjoy-products-cache', JSON.stringify({ data: products, timestamp: now }));
      }
      renderProducts();
      return products;
    } catch (error) {
      console.error('Failed to load products:', error);

      if (cachedProducts.length) {
        products = cachedProducts;
      } else {
        localStorage.removeItem('papjoy-products-cache');
        products = fallbackProducts;
      }
      renderProducts();
      return products;
    }
  })();

  try {
    return await productsLoadPromise;
  } finally {
    productsLoadPromise = null;
  }
}

// Get product by slug from the API
async function getProductBySlug(slug) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/products/${slug}`);
    if (!response.ok) return null;
    const product = await response.json();
    return normalizeProduct(product);
  } catch (error) {
    console.error('Failed to fetch product:', error);
    return null;
  }
}

// 🔍 Search products with filters
async function searchProducts(searchParams = {}) {
  const {
    q = '',
    category = '',
    priceMin = 0,
    priceMax = 500000,
    size = '',
    color = '',
    brand = '',
    sort = 'newest',
    limit = 20,
    page = 1,
    inStock = false
  } = searchParams;

  const queryParams = new URLSearchParams({
    q, category, priceMin, priceMax, size, color, brand, sort, limit, page,
    inStock: inStock ? 'true' : 'false'
  });

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/search?${queryParams.toString()}`, { timeout: 5000 });
    if (!response.ok) return { products: [], pagination: {} };
    return await response.json();
  } catch (error) {
    console.error('Search failed:', error);
    return { products: [], pagination: {} };
  }
}

// 🏷️ Load available filters
async function loadFilterOptions(category = '') {
  const queryParams = category ? `?category=${encodeURIComponent(category)}` : '';
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/filters/options${queryParams}`, { timeout: 5000 });
    if (!response.ok) return { brands: [], sizes: [], colors: [], priceRange: { min: 0, max: 0 } };
    return await response.json();
  } catch (error) {
    console.error('Failed to load filters:', error);
    return { brands: [], sizes: [], colors: [], priceRange: { min: 0, max: 0 } };
  }
}

// Helper to format inventory status
function getInventoryStatus(product) {
  const quantity = product.inventory?.quantity || 0;
  const threshold = product.inventory?.lowStockThreshold || 10;
  if (quantity === 0) return { status: 'Out of Stock', class: 'out-of-stock', color: '#d32f2f' };
  if (quantity <= threshold) return { status: `Limited: ${quantity} left`, class: 'low-stock', color: '#f57c00' };
  return { status: 'In Stock', class: 'in-stock', color: '#388e3c' };
}

// ================== REVIEWS & RATINGS ==================

async function loadProductReviews(productId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/reviews/${productId}`, { timeout: 5000 });
    if (!response.ok) return { reviews: [], pagination: {} };
    return await response.json();
  } catch (error) {
    console.error('Failed to load reviews:', error);
    return { reviews: [], pagination: {} };
  }
}

async function loadRatingSummary(productId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/${productId}/rating-summary`, { timeout: 5000 });
    if (!response.ok) return { averageRating: 0, totalReviews: 0, breakdown: {} };
    return await response.json();
  } catch (error) {
    console.error('Failed to load rating summary:', error);
    return { averageRating: 0, totalReviews: 0, breakdown: {} };
  }
}

async function submitReview(productId, { rating, title, comment, images = [] }) {
  const user = getCurrentUser();
  if (!user) {
    showToast('❌ Please sign in to leave a review');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ productId, rating: Number(rating), title, comment, images })
    });

    if (!response.ok) {
      const err = await response.json();
      showToast(`❌ ${err.error || 'Failed to submit review'}`);
      return false;
    }

    showToast('✅ Review submitted successfully!');
    return true;
  } catch (error) {
    console.error('Review submission error:', error);
    showToast('❌ Error submitting review');
    return false;
  }
}

function renderReviewForm(productId) {
  const container = document.getElementById('review-form-container');
  if (!container) return;

  container.innerHTML = `
    <div class="review-form">
      <h3>Leave a Review</h3>
      <form id="product-review-form">
        <div class="form-group">
          <label>Rating *</label>
          <div class="rating-input" id="rating-selector">
            ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-rating="${i}">★</span>`).join('')}
          </div>
          <input type="hidden" id="review-rating" value="5" required />
        </div>
        
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="review-title" placeholder="Summarize your experience" required maxlength="100" />
        </div>
        
        <div class="form-group">
          <label>Comment *</label>
          <textarea id="review-comment" placeholder="Share your detailed thoughts" required maxlength="1000" rows="4"></textarea>
        </div>
        
        <button type="submit" class="btn btn-primary">Submit Review</button>
      </form>
    </div>
  `;

  const ratingSelector = document.getElementById('rating-selector');
  const ratingInput = document.getElementById('review-rating');
  
  if (ratingSelector) {
    ratingSelector.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', () => {
        const rating = star.dataset.rating;
        ratingInput.value = rating;
        ratingSelector.querySelectorAll('.star').forEach(s => {
          s.classList.toggle('active', s.dataset.rating <= rating);
        });
      });
    });
  }

  const form = document.getElementById('product-review-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rating = document.getElementById('review-rating').value;
      const title = document.getElementById('review-title').value;
      const comment = document.getElementById('review-comment').value;
      
      if (await submitReview(productId, { rating, title, comment })) {
        form.reset();
        ratingInput.value = 5;
      }
    });
  }
}

function renderReviews(reviews = []) {
  const container = document.getElementById('reviews-container');
  if (!container) return;

  if (!reviews.length) {
    container.innerHTML = '<p style="text-align:center; color: var(--text-muted);">No reviews yet. Be the first to review!</p>';
    return;
  }

  container.innerHTML = reviews.map(review => `
    <div class="review-item">
      <div class="review-header">
        <div class="review-author">
          <strong>${review.userId?.name || 'Anonymous'}</strong>
          ${review.isVerified ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
        </div>
        <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
      </div>
      ${review.title ? `<h4 class="review-title">${review.title}</h4>` : ''}
      <p class="review-comment">${review.comment}</p>
      <small class="review-date">${new Date(review.createdAt).toLocaleDateString()}</small>
    </div>
  `).join('');
}

// ================== DELIVERY TRACKING ==================

async function loadOrderTracking(orderId) {
  if (!orderId) return null;
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(apiUrl(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`), {
      headers
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load tracking:', error);
    return null;
  }
}

function renderTrackingTimeline(tracking) {
  if (!tracking) return '';
  const timeline = Array.isArray(tracking.timeline)
    ? tracking.timeline
    : Array.isArray(tracking.events)
      ? tracking.events.map((event) => ({
          label: event.message || event.status || 'Update',
          date: event.timestamp || event.date || new Date().toISOString(),
          completed: event.status === 'delivered' || event.status === 'completed',
          current: !event.completed && !event.isPast,
        }))
      : [];

  if (!timeline.length) {
    return `
      <div class="tracking-timeline">
        <h3>Order Status Timeline</h3>
        <div class="timeline">
          <div class="timeline-step active">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-label">${tracking.status ? tracking.status.replace(/_/g, ' ') : 'Processing'}</div>
              <div class="timeline-date">${tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery).toLocaleDateString() : ''}</div>
            </div>
          </div>
        </div>
        ${tracking.trackingUrl ? `<a href="${tracking.trackingUrl}" target="_blank" class="btn btn-secondary">Track with ${tracking.carrier || 'Carrier'}</a>` : ''}
      </div>
    `;
  }

  return `
    <div class="tracking-timeline">
      <h3>Order Status Timeline</h3>
      <div class="timeline">
        ${timeline.map((step) => `
          <div class="timeline-item ${step.completed ? 'completed' : step.current ? 'active' : 'pending'}">
            <div class="timeline-icon">•</div>
            <div class="timeline-content">
              <h4>${step.label}</h4>
              <p>${step.current ? 'Current step' : step.completed ? 'Completed' : 'Pending'}</p>
              <span class="timeline-time">${new Date(step.date).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
      ${tracking.trackingUrl ? `<a href="${tracking.trackingUrl}" target="_blank" class="btn btn-secondary">Track with ${tracking.carrier || 'Carrier'}</a>` : ''}
    </div>
  `;
}

// ================== RENDER FUNCTIONS ==================

function getProductLink(product) {
  return product.slug ? `product-detail.html?slug=${product.slug}` : `product-detail.html?id=${product.id}`;
}

// Render products on the main page with document fragment for efficiency
function renderProducts() {
  const page = document.body.dataset.page;
  if (page === 'shop') return;

  const productGrid = document.querySelector('.product-grid');
  if (!productGrid) {
    return;
  }

  const renderStart = performance.now();
  productRenderCount += 1;
  const fragment = document.createDocumentFragment();
  products.forEach((product) => {
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    productCard.onclick = () => {
      window.location.href = getProductLink(product);
    };

    const imageUrls = getProductImageUrls(product);
    const primaryImage = imageUrls[0] || product.image || 'https://via.placeholder.com/800x800?text=PAP-JOY';
    const invStatus = getInventoryStatus(product);

    productCard.innerHTML = `
      <div class="product-image">
        <img src="${primaryImage}" alt="${product.name}" loading="lazy">
        ${product.isFeatured ? '<div class="badge featured">Featured</div>' : ''}
        <div class="badge ${invStatus.class}" style="background-color: ${invStatus.color}">${invStatus.status}</div>
      </div>
      <div class="product-info">
        <div class="category">${product.category}</div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-subtitle">${product.subtitle || (product.description || '').slice(0, 80) + '...'}</p>
        <div class="price">${formatCurrency(product.price)}</div>
        <div class="product-actions">
          <button class="btn btn-primary add-to-cart-btn" type="button" data-product-id="${product.id || product._id}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
            <i class="fas fa-cart-plus"></i> ${product.inventory?.quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
          </button>
          <button class="btn btn-secondary buy-now-btn" type="button" data-product-id="${product.id || product._id}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
            <i class="fas fa-bolt"></i> Buy Now
          </button>
        </div>
      </div>
    `;

    attachProductCardListeners(productCard);

    fragment.appendChild(productCard);
  });

  productGrid.innerHTML = '';
  productGrid.appendChild(fragment);
  const renderedCount = products.length;
  const renderDuration = performance.now() - renderStart;
  console.debug('Product render count:', productRenderCount);
  console.debug('Products rendered:', renderedCount);
  console.debug('Render duration (ms):', renderDuration.toFixed(2));
}

let cart = JSON.parse(localStorage.getItem('papjoy-cart')) || [];
let selectedCategory = '';
let searchQuery = '';
let selectedSort = 'featured';
let selectedFeaturedFilter = 'all';
let filtersInitialized = false;
let featuredControlsInitialized = false;

// Promo codes, saved items and personalization
let savedItems = JSON.parse(localStorage.getItem('papjoy-saved')) || [];
let browsingHistory = JSON.parse(localStorage.getItem('papjoy-history')) || [];
let appliedPromoCode = localStorage.getItem('papjoy-promo') || '';
let remoteCartLoaded = false;
let adminCategories = [];
const validPromoCodes = {
  'WELCOME10': { discount: 0.10, label: '10% off' },
  'SAVE20': { discount: 0.20, label: '20% off' },
  'SUMMER15': { discount: 0.15, label: '15% off summer collection' },
  'NEWUSER5': { discount: 0.05, label: 'Welcome 5% off' }
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

let selectedRegion = localStorage.getItem('papjoy-region') || inferRegionFromBrowser();
let currentLocale = localeRegionMap[selectedRegion]?.locale || 'en-IN';
let currentCurrency = localeRegionMap[selectedRegion]?.currency || 'INR';
let currencyFormatter = new Intl.NumberFormat(currentLocale, {
  style: 'currency',
  currency: currentCurrency,
  maximumFractionDigits: 0,
});

function getCurrentLocaleRegion() {
  return localeRegionMap[selectedRegion] || localeRegionMap.IN;
}

function inferRegionFromBrowser() {
  const locale = navigator.language || navigator.userLanguage || 'en-IN';
  const [, region] = locale.split(/[-_]/);
  if (region && localeRegionMap[region.toUpperCase()]) {
    return region.toUpperCase();
  }
  return locale.startsWith('en-US') ? 'US' : locale.startsWith('en-GB') ? 'GB' : locale.startsWith('en-AU') ? 'AU' : locale.startsWith('en-CA') ? 'CA' : 'IN';
}

function updateCurrencyFormatter() {
  const region = getCurrentLocaleRegion();
  selectedRegion = localStorage.getItem('papjoy-region') || selectedRegion;
  currentLocale = region.locale;
  currentCurrency = 'INR';
  currencyFormatter = new Intl.NumberFormat(currentLocale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
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

let selectedLanguage = localStorage.getItem('papjoy-lang') || inferLanguageFromBrowserLang();

const translations = {
  en: {
    'selector.region': 'Region',
    'selector.language': 'Language',
    'nav.home': 'Home',
    'nav.shop': 'Shop',
    'nav.products': 'Products',
    'nav.cart': 'Cart',
    'nav.signin': 'Sign In',
    'nav.signout': 'Sign out',
    'nav.checkout': 'Checkout',
    'hero.eyebrow': 'Premium Performance',
    'hero.heading': 'Step into comfort with elevated style.',
    'hero.text': 'Shop handcrafted footwear built for modern movement, bold streetwear, and everyday adventures.',
    'hero.cta': 'Shop the collection',
    'hero.join': 'Join PAP-JOY',
    'featured.eyebrow': 'Featured styles',
    'featured.heading': 'Discover our best sellers',
    'featured.viewall': 'View all products',
    'info.fastshipping.title': 'Fast shipping',
    'info.fastshipping.text': 'Free delivery on orders above 20,000 and same-day dispatch on select picks.',
    'info.premiummaterials.title': 'Premium materials',
    'info.premiummaterials.text': 'Durable soles, breathable textiles, and comfort that keeps every step feeling effortless.',
    'info.securecheckout.title': 'Secure checkout',
    'info.securecheckout.text': 'Trusted payment options and a simple cart flow built for every shopper.',
    'product.eyebrow': 'Full collection',
    'product.heading': 'Shop all styles',
    'product.intro': 'Browse every shoe, compare features, and add your favorites to the cart.',
    'product.details': 'View details',
    'product.notFound': 'Product not found. Return to the shop.',
    'product.addToCart': 'Add to cart',
    'cart.eyebrow': 'Your cart',
    'cart.heading': 'Review your selection',
    'cart.subtotal': 'Subtotal',
    'cart.shipping': 'Shipping',
    'cart.tax': 'Tax',
    'cart.total': 'Total',
    'cart.continue': 'Continue to payment',
    'cart.clear': 'Clear cart',
    'cart.empty': 'Your cart is empty. Add something beautiful.',
    'checkout.eyebrow': 'Checkout',
    'checkout.heading': 'Choose your payment method',
    'checkout.text': 'Complete your order securely with Stripe, PayPal, or our quick checkout option.',
    'checkout.summary': 'Order summary',
    'checkout.items': 'Items',
    'checkout.subtotal': 'Subtotal',
    'checkout.shipping': 'Shipping',
    'checkout.tax': 'Tax',
    'checkout.total': 'Total',
    'checkout.stripe.title': 'Pay with Stripe',
    'checkout.stripe.text': 'Fast checkout with card payments and secure hosted sessions.',
    'checkout.stripe.button': 'Pay with Stripe',
    'checkout.paypal.title': 'Pay with PayPal',
    'checkout.paypal.text': 'Use PayPal to complete the purchase quickly and safely.',
    'checkout.paypal.button': 'Pay with PayPal',
    'checkout.razorpay.title': 'Pay with Razorpay',
    'checkout.razorpay.text': "Pay securely in INR with Razorpay's checkout experience.",
    'checkout.razorpay.button': 'Pay with Razorpay',
    'checkout.web.title': 'Quick web order',
    'checkout.web.text': 'Place your order directly and save it in our store.',
    'checkout.web.button': 'Place order',
    'checkout.message': 'Preparing your checkout...',
    'signin.eyebrow': 'Member access',
    'signin.heading': 'Sign in to your PAP-JOY account',
    'signin.emailLabel': 'Email address',
    'signin.emailPlaceholder': 'you@example.com',
    'signin.passwordLabel': 'Password',
    'signin.passwordPlaceholder': 'Enter password',
    'signin.continue': 'Continue',
    'signin.alreadySignedIn': 'Already signed in as {email}. Redirecting to home...',
    'signin.enterCredentials': 'Enter both email and password to continue.',
    'signin.invalidCredentials': 'Invalid email or password. Please try again.',
    'signin.loginError': 'Unable to sign in right now. Please try again later.',
    'signin.loggingIn': 'Verifying your details...',
    'signin.showPassword': 'Show',
    'signin.hidePassword': 'Hide',
    'signup.eyebrow': 'Create your account',
    'signup.heading': 'Start your PAP-JOY journey',
    'signup.nameLabel': 'Full name',
    'signup.namePlaceholder': 'Your name',
    'signup.confirmPasswordLabel': 'Confirm password',
    'signup.confirmPasswordPlaceholder': 'Confirm password',
    'signup.addressHeading': 'Shipping details',
    'signup.fullNameLabel': 'Recipient name',
    'signup.fullNamePlaceholder': 'Full recipient name',
    'signup.line1Label': 'Address line 1',
    'signup.line1Placeholder': 'Street address',
    'signup.line2Label': 'Address line 2',
    'signup.line2Placeholder': 'Apartment, suite, etc. (optional)',
    'signup.cityLabel': 'City',
    'signup.stateLabel': 'State / region',
    'signup.postalCodeLabel': 'Postal code',
    'signup.countryLabel': 'Country',
    'signup.phoneLabel': 'Phone number',
    'signup.submit': 'Create account',
    'signup.alreadyHaveAccount': 'Already have an account?',
    'signup.signIn': 'Sign In',
    'signup.passwordMismatch': 'Passwords do not match.',
    'signup.registerError': 'Unable to create account. Please try again.',
    'signup.registering': 'Creating your account...',
    'signup.success': 'Account created. Redirecting...',
    'account.eyebrow': 'Account details',
    'account.heading': 'Manage your profile and shipping',
    'account.emailLabel': 'Email',
    'account.nameLabel': 'Name',
    'account.shippingHeading': 'Shipping address',
    'account.fullNameLabel': 'Recipient name',
    'account.line1Label': 'Address line 1',
    'account.line1Placeholder': 'Street address',
    'account.line2Label': 'Address line 2',
    'account.cityLabel': 'City',
    'account.stateLabel': 'State / region',
    'account.postalCodeLabel': 'Postal code',
    'account.countryLabel': 'Country',
    'account.phoneLabel': 'Phone number',
    'account.saveButton': 'Save changes',
    'account.updateSuccess': 'Account updated successfully.',
    'account.updateFail': 'Unable to save details. Please try again.',
    'account.notSignedIn': 'Please sign in to access your account.',
    'nav.account': 'Account',
    'success.eyebrow': 'Order complete',
    'success.heading': 'Thank you for shopping with PAP-JOY',
    'success.status': 'Validating your payment...',
    'success.continue': 'Continue shopping',
    'success.products': 'View products',
    'footer.text': '© 2026 PAP-JOY. Crafted for every journey.',
    'footer.signin': '© 2026 PAP-JOY. Ready for your next step.',
    'checkout.redirectStripe': 'Redirecting to Stripe...',
    'checkout.redirectPayPal': 'Redirecting to PayPal...',
    'checkout.preparingRazorpay': 'Preparing Razorpay checkout...',
    'checkout.submittingOrder': 'Submitting your order...',
    'checkout.addPayPal': 'Add items to your cart before paying with PayPal.',
    'checkout.addRazorpay': 'Add items to your cart before paying with Razorpay.',
    'checkout.razorpayStartFail': 'Unable to start Razorpay checkout. Please try again later.',
    'checkout.razorpayCanceled': 'Razorpay payment was canceled. Choose another option or try again.',
    'success.stripeComplete': 'Your Stripe payment is complete.',
    'success.paypalComplete': 'Your PayPal payment is complete.',
    'success.summaryProvider': 'Order provider',
    'success.summaryOrderId': 'Order ID',
    'success.summaryPaymentId': 'Payment ID',
    'success.summaryStatus': 'Status',
    'success.summaryAmount': 'Amount',
    'success.summaryItems': 'Items',
    'product.status': '{count} shoes ready to shop.',
    'cart.free': 'FREE',
    'provider.web': 'Web',
    'provider.stripe': 'Stripe',
    'provider.paypal': 'PayPal',
    'provider.razorpay': 'Razorpay',
    'provider.cod': 'Cash on Delivery',
    'provider.paytm': 'Paytm',
    'provider.creditcard': 'Credit Card',
    'provider.debitcard': 'Debit Card',
    'provider.upi': 'UPI',
    'signin.welcomeBack': 'Welcome back, {email}! Redirecting...',
    'toast.addedCart': 'Added to cart',
    'checkout.emptyCart': 'Your cart is empty. Add a product before checkout.',
    'checkout.addStripe': 'Add items to your cart before paying with Stripe.',
    'checkout.stripeFail': 'Unable to start Stripe checkout.',
    'checkout.stripeRedirectFail': 'Unable to redirect to Stripe. Please try again later.',
    'checkout.paypalFail': 'Unable to start PayPal checkout.',
    'checkout.paypalCanceled': 'PayPal checkout was canceled. Please try again.',
    'checkout.orderCanceled': 'Checkout was canceled. Please try again or choose another payment method.',
    'checkout.razorpayFail': 'Unable to create Razorpay order.',
    'checkout.verifyFail': 'Unable to verify Razorpay payment.',
    'checkout.webOrderEmpty': 'Add items before placing a web order.',
    'checkout.webFail': 'Unable to place the order right now. Please try again later.',
    'checkout.paymentFailed': 'Payment failed. Please try again or choose another method.',
    'error.loadProducts': 'Unable to load products from server.',
    'error.stripeCheckoutUrl': 'Stripe checkout URL not available.',
    'error.paypalApprovalUrl': 'PayPal approval URL not available.',
    'error.razorpayOrderFailed': 'Razorpay order creation failed.',
    'error.stripeOrderConfirmationFailed': 'Stripe order confirmation failed.',
    'error.paypalOrderCaptureFailed': 'PayPal order capture failed.',
    'error.verifyOrder': 'Unable to verify your order.',
    'success.orderPlaced': 'Your order has been placed successfully.',
    'success.orderComplete': 'Your order is complete.',
    'success.noInfo': 'No order information was found. Please return to the store.',
    'item.remove': 'Remove',
  },
  hi: {
    'selector.region': 'क्षेत्र',
    'selector.language': 'भाषा',
    'nav.home': 'होम',
    'nav.shop': 'शॉप',
    'nav.products': 'उत्पाद',
    'nav.cart': 'कार्ट',
    'nav.signin': 'साइन इन',
    'nav.signout': 'साइन आउट',
    'nav.checkout': 'चेकआउट',
    'hero.eyebrow': 'प्रीमियम प्रदर्शन',
    'hero.heading': 'आधुनिक स्टाइल के साथ आराम महसूस करें।',
    'hero.text': 'ऐसे फूटवियर खरीदें जो आधुनिक मूवमेंट, स्ट्रीटवियर और रोज़मर्रा की ज़रूरतों के लिए बनाए गए हैं।',
    'hero.cta': 'कलेक्शन देखें',
    'hero.join': 'PAP-JOY जॉइन करें',
    'featured.eyebrow': 'फीचर्ड स्टाइल',
    'featured.heading': 'हमारे बेस्ट सेलर देखें',
    'featured.viewall': 'सभी उत्पाद देखें',
    'info.fastshipping.title': 'तेज़ शिपिंग',
    'info.fastshipping.text': '20,000 से ऊपर के ऑर्डर्स पर मुफ्त डिलीवरी और चुनिंदा आइटम पर उसी दिन शिपिंग।',
    'info.premiummaterials.title': 'प्रीमियम सामग्री',
    'info.premiummaterials.text': 'टिकाऊ सोल, सांस लेने योग्य फैब्रिक्स, और हर कदम पर आराम।',
    'info.securecheckout.title': 'सुरक्षित चेकआउट',
    'info.securecheckout.text': 'विश्वसनीय भुगतान विकल्प और हर ग्राहक के लिए सरल प्रक्रिया।',
    'product.eyebrow': 'पूरा कलेक्शन',
    'product.heading': 'सभी स्टाइल देखें',
    'product.intro': 'हर शू को ब्राउज़ करें, तुलना करें, और अपनी पसंदीदा जोड़ें।',
    'product.addToCart': 'कार्ट में जोड़ें',
    'cart.eyebrow': 'आपका कार्ट',
    'cart.heading': 'अपनी चयन की समीक्षा करें',
    'cart.subtotal': 'उप-योग',
    'cart.shipping': 'शिपिंग',
    'cart.tax': 'टैक्स',
    'cart.total': 'कुल',
    'cart.continue': 'भुगतान के लिए जारी रखें',
    'cart.clear': 'कार्ट साफ़ करें',
    'cart.empty': 'आपका कार्ट खाली है। कुछ सुंदर जोड़ें।',
    'checkout.eyebrow': 'चेकआउट',
    'checkout.heading': 'अपना भुगतान तरीका चुनें',
    'checkout.text': 'Stripe, PayPal, या तेज़ चेकआउट विकल्प से सुरक्षित रूप से पूरा करें।',
    'checkout.summary': 'ऑर्डर सारांश',
    'checkout.items': 'आइटम',
    'checkout.subtotal': 'उप-योग',
    'checkout.shipping': 'शिपिंग',
    'checkout.tax': 'टैक्स',
    'checkout.total': 'कुल',
    'checkout.stripe.title': 'Stripe से भुगतान करें',
    'checkout.stripe.text': 'कार्ड भुगतान के साथ तेज़ चेकआउट और सुरक्षित सत्र।',
    'checkout.stripe.button': 'Stripe से भुगतान',
    'checkout.paypal.title': 'PayPal से भुगतान करें',
    'checkout.paypal.text': 'PayPal का उपयोग करके जल्दी और सुरक्षित रूप से खरीदारी पूरी करें।',
    'checkout.paypal.button': 'PayPal से भुगतान',
    'checkout.razorpay.title': 'Razorpay से भुगतान करें',
    'checkout.razorpay.text': 'Razorpay के साथ सुरक्षित INR भुगतान करें।',
    'checkout.razorpay.button': 'Razorpay से भुगतान',
    'checkout.web.title': 'क्विक वेब ऑर्डर',
    'checkout.web.text': 'सीधे अपना ऑर्डर जमा करें और स्टोर में सेव करें।',
    'checkout.web.button': 'ऑर्डर करें',
    'checkout.message': 'आपका चेकआउट तैयार किया जा रहा है...',
    'signin.eyebrow': 'सदस्य पहुँच',
    'signin.heading': 'अपने PAP-JOY खाते में साइन इन करें',
    'signin.emailLabel': 'ईमेल पता',
    'signin.emailPlaceholder': 'you@example.com',
    'signin.passwordLabel': 'पासवर्ड',
    'signin.passwordPlaceholder': 'पासवर्ड दर्ज करें',
    'signin.continue': 'जारी रखें',
    'signin.alreadySignedIn': 'पहले से साइन इन हैं {email}. होम पर भेजा जा रहा है...',
    'signin.enterCredentials': 'जारी रखने के लिए ईमेल और पासवर्ड दोनों दर्ज करें।',
    'success.eyebrow': 'ऑर्डर पूरा हुआ',
    'success.heading': 'PAP-JOY के साथ खरीदारी करने के लिए धन्यवाद',
    'success.status': 'आपके भुगतान का सत्यापन किया जा रहा है...',
    'success.continue': 'खरीदारी जारी रखें',
    'success.products': 'उत्पाद देखें',
    'footer.text': '© 2026 PAP-JOY। हर यात्रा के लिए तैयार।',
    'footer.signin': '© 2026 PAP-JOY। अपने अगले कदम के लिए तैयार।',
    'checkout.redirectStripe': 'Stripe के लिए रीडायरेक्ट किया जा रहा है...',
    'checkout.redirectPayPal': 'PayPal के लिए रीडायरेक्ट किया जा रहा है...',
    'checkout.preparingRazorpay': 'Razorpay चेकआउट तैयार किया जा रहा है...',
    'checkout.submittingOrder': 'आपका ऑर्डर सबमिट किया जा रहा है...',
    'checkout.addPayPal': 'PayPal से भुगतान करने से पहले अपने कार्ट में आइटम जोड़ें।',
    'checkout.addRazorpay': 'Razorpay से भुगतान करने से पहले अपने कार्ट में आइटम जोड़ें।',
    'checkout.razorpayStartFail': 'Razorpay चेकआउट शुरू करने में असमर्थ। कृपया बाद में पुन: प्रयास करें।',
    'checkout.razorpayCanceled': 'Razorpay भुगतान रद्द कर दिया गया। कृपया दूसरा विकल्प चुनें।',
    'success.stripeComplete': 'आपका Stripe भुगतान पूरा हो गया है।',
    'success.paypalComplete': 'आपका PayPal भुगतान पूरा हो गया है।',
    'signin.welcomeBack': 'स्वागत है, {email}! होम पर भेजा जा रहा है...',
    'toast.addedCart': 'कार्ट में जोड़ा गया',
    'checkout.emptyCart': 'आपका कार्ट खाली है। चेकआउट से पहले उत्पाद जोड़ें।',
    'checkout.addStripe': 'Stripe से करने से पहले अपने कार्ट में आइटम जोड़ें।',
    'checkout.stripeFail': 'Stripe चेकआउट शुरू करने में असमर्थ।',
    'checkout.stripeRedirectFail': 'Stripe पर रीडायरेक्ट करने में असमर्थ। कृपया बाद में पुन: प्रयास करें।',
    'checkout.paypalFail': 'PayPal चेकआउट शुरू करने में असमर्थ।',
    'checkout.paypalCanceled': 'PayPal चेकआउट रद्द कर दिया गया। कृपया पुन: प्रयास करें।',
    'checkout.orderCanceled': 'चेकआउट रद्द कर दिया गया है। कृपया पुन: प्रयास करें या दूसरा विकल्प चुनें।',
    'checkout.razorpayFail': 'Razorpay ऑर्डर बनाने में असमर्थ।',
    'checkout.verifyFail': 'Razorpay भुगतान सत्यापित करने में असमर्थ।',
    'checkout.webOrderEmpty': 'ऑर्डर करने से पहले आइटम जोड़ें।',
    'checkout.webFail': 'ऑर्डर करने में असमर्थ। कृपया बाद में पुन: प्रयास करें।',
    'checkout.paymentFailed': 'भुगतान विफल रहा। कृपया पुन: प्रयास करें या दूसरा तरीका चुनें।',
    'product.status': '{count} जूते शॉप करने के लिए तैयार हैं।',
    'cart.free': 'मुफ़्त',
    'provider.web': 'वेब',
    'provider.stripe': 'Stripe',
    'provider.paypal': 'PayPal',
    'provider.razorpay': 'Razorpay',
    'provider.cod': 'डिलीवरी पर नकद',
    'provider.paytm': 'Paytm',
    'provider.creditcard': 'क्रेडिट कार्ड',
    'provider.debitcard': 'डेबिट कार्ड',
    'provider.upi': 'UPI',
    'error.loadProducts': 'सर्वर से उत्पाद लोड करने में असमर्थ।',
    'error.stripeCheckoutUrl': 'Stripe चेकआउट URL उपलब्ध नहीं है।',
    'error.paypalApprovalUrl': 'PayPal अनुमोदन URL उपलब्ध नहीं है।',
    'error.razorpayOrderFailed': 'Razorpay ऑर्डर बनाने में असमर्थ।',
    'error.stripeOrderConfirmationFailed': 'Stripe ऑर्डर पुष्टि करने में असमर्थ।',
    'error.paypalOrderCaptureFailed': 'PayPal ऑर्डर कैप्चर करने में असमर्थ।',
    'error.verifyOrder': 'आपके ऑर्डर की पुष्टि करने में असमर्थ।',
    'success.orderPlaced': 'आपका ऑर्डर सफलतापूर्वक रखा गया है।',
    'success.orderComplete': 'आपका ऑर्डर पूरा हो गया है।',
    'success.noInfo': 'कोई ऑर्डर जानकारी नहीं मिली। कृपया स्टोर पर लौटें।',
    'item.remove': 'हटाएं',
  },
  es: {
    'selector.region': 'Región',
    'selector.language': 'Idioma',
    'nav.home': 'Inicio',
    'nav.shop': 'Comprar',
    'nav.products': 'Productos',
    'nav.cart': 'Carrito',
    'nav.signin': 'Iniciar sesión',
    'nav.signout': 'Cerrar sesión',
    'nav.checkout': 'Pagar',
    'hero.eyebrow': 'Rendimiento premium',
    'hero.heading': 'Pisa con comodidad y estilo elevado.',
    'hero.text': 'Compra calzado hecho a mano para el movimiento moderno, streetwear y aventuras diarias.',
    'hero.cta': 'Ver colección',
    'hero.join': 'Únete a PAP-JOY',
    'featured.eyebrow': 'Estilos destacados',
    'featured.heading': 'Descubre nuestros más vendidos',
    'featured.viewall': 'Ver todos los productos',
    'info.fastshipping.title': 'Envío rápido',
    'info.fastshipping.text': 'Entrega gratis en pedidos superiores a 20,000 y despacho el mismo día en selecciones.',
    'info.premiummaterials.title': 'Materiales premium',
    'info.premiummaterials.text': 'Suela duradera, textiles transpirables y comodidad en cada paso.',
    'info.securecheckout.title': 'Pago seguro',
    'info.securecheckout.text': 'Opciones de pago confiables y un flujo sencillo para cada comprador.',
    'product.eyebrow': 'Colección completa',
    'product.heading': 'Compra todos los estilos',
    'product.intro': 'Navega cada zapato, compara características y agrega tus favoritos al carrito.',
    'product.addToCart': 'Agregar al carrito',
    'cart.eyebrow': 'Tu carrito',
    'cart.heading': 'Revisa tu selección',
    'cart.subtotal': 'Subtotal',
    'cart.shipping': 'Envío',
    'cart.tax': 'Impuesto',
    'cart.total': 'Total',
    'cart.continue': 'Continuar al pago',
    'cart.clear': 'Vaciar carrito',
    'cart.empty': 'Tu carrito está vacío. Agrega algo bonito.',
    'checkout.eyebrow': 'Pagar',
    'checkout.heading': 'Elige tu método de pago',
    'checkout.text': 'Completa tu pedido de forma segura con Stripe, PayPal o nuestra opción rápida.',
    'checkout.summary': 'Resumen del pedido',
    'checkout.items': 'Artículos',
    'checkout.subtotal': 'Subtotal',
    'checkout.shipping': 'Envío',
    'checkout.tax': 'Impuesto',
    'checkout.total': 'Total',
    'checkout.stripe.title': 'Pagar con Stripe',
    'checkout.stripe.text': 'Pago rápido con tarjeta y sesiones seguras.',
    'checkout.stripe.button': 'Pagar con Stripe',
    'checkout.paypal.title': 'Pagar con PayPal',
    'checkout.paypal.text': 'Usa PayPal para completar la compra de forma rápida y segura.',
    'checkout.paypal.button': 'Pagar con PayPal',
    'checkout.razorpay.title': 'Pagar con Razorpay',
    'checkout.razorpay.text': 'Paga de forma segura en INR con Razorpay.',
    'checkout.razorpay.button': 'Pagar con Razorpay',
    'checkout.web.title': 'Pedido web rápido',
    'checkout.web.text': 'Realiza tu pedido directamente y guárdalo en nuestra tienda.',
    'checkout.web.button': 'Realizar pedido',
    'checkout.message': 'Preparando tu pago...',
    'signin.eyebrow': 'Acceso para miembros',
    'signin.heading': 'Inicia sesión en tu cuenta PAP-JOY',
    'signin.emailLabel': 'Correo electrónico',
    'signin.emailPlaceholder': 'you@example.com',
    'signin.passwordLabel': 'Contraseña',
    'signin.passwordPlaceholder': 'Ingresa contraseña',
    'signin.continue': 'Continuar',
    'signin.alreadySignedIn': 'Ya has iniciado sesión como {email}. Redirigiendo a inicio...',
    'signin.enterCredentials': 'Ingresa correo y contraseña para continuar.',
    'success.eyebrow': 'Pedido completado',
    'success.heading': 'Gracias por comprar en PAP-JOY',
    'success.status': 'Validando tu pago...',
    'success.continue': 'Continuar comprando',
    'success.products': 'Ver productos',
    'footer.text': '© 2026 PAP-JOY. Creado para cada viaje.',
    'footer.signin': '© 2026 PAP-JOY. Listo para tu próximo paso.',
    'checkout.redirectStripe': 'Redirigiendo a Stripe...',
    'checkout.redirectPayPal': 'Redirigiendo a PayPal...',
    'checkout.preparingRazorpay': 'Preparando el pago Razorpay...',
    'checkout.submittingOrder': 'Enviando tu pedido...',
    'checkout.addPayPal': 'Agrega artículos a tu carrito antes de pagar con PayPal.',
    'checkout.addRazorpay': 'Agrega artículos a tu carrito antes de pagar con Razorpay.',
    'checkout.razorpayStartFail': 'No se pudo iniciar el pago Razorpay. Intenta de nuevo más tarde.',
    'checkout.razorpayCanceled': 'El pago Razorpay fue cancelado. Elige otra opción.',
    'success.stripeComplete': 'Tu pago con Stripe está completo.',
    'success.paypalComplete': 'Tu pago con PayPal está completo.',
    'signin.welcomeBack': 'Bienvenido de nuevo, {email}! Redirigiendo al inicio...',
    'toast.addedCart': 'Agregado al carrito',
    'checkout.emptyCart': 'Tu carrito está vacío. Agrega un producto antes de pagar.',
    'checkout.addStripe': 'Agrega artículos al carrito antes de pagar con Stripe.',
    'checkout.stripeFail': 'No se pudo iniciar el pago de Stripe.',
    'checkout.stripeRedirectFail': 'No se pudo redirigir a Stripe. Intenta de nuevo más tarde.',
    'checkout.paypalFail': 'No se pudo iniciar el pago de PayPal.',
    'checkout.paypalCanceled': 'El pago de PayPal fue cancelado. Intenta de nuevo.',
    'checkout.orderCanceled': 'El pago fue cancelado. Intenta de nuevo o elige otra opción.',
    'checkout.razorpayFail': 'No se pudo crear el pedido de Razorpay.',
    'checkout.verifyFail': 'No se pudo verificar el pago de Razorpay.',
    'checkout.webOrderEmpty': 'Agrega artículos antes de realizar el pedido.',
    'checkout.webFail': 'No se pudo realizar el pedido. Intenta de nuevo más tarde.',
    'checkout.paymentFailed': 'Pago fallido. Intenta de nuevo o elige otro método.',
    'product.status': '{count} zapatos listos para comprar.',
    'cart.free': 'GRATIS',
    'provider.web': 'Web',
    'provider.stripe': 'Stripe',
    'provider.paypal': 'PayPal',
    'provider.razorpay': 'Razorpay',
    'provider.cod': 'Pago contra entrega',
    'provider.paytm': 'Paytm',
    'provider.creditcard': 'Tarjeta de crédito',
    'provider.debitcard': 'Tarjeta de débito',
    'provider.upi': 'UPI',
    'error.loadProducts': 'No se pudieron cargar los productos desde el servidor.',
    'error.stripeCheckoutUrl': 'URL de pago de Stripe no disponible.',
    'error.paypalApprovalUrl': 'URL de aprobación de PayPal no disponible.',
    'error.razorpayOrderFailed': 'Error al crear la orden de Razorpay.',
    'error.stripeOrderConfirmationFailed': 'Error al confirmar la orden de Stripe.',
    'error.paypalOrderCaptureFailed': 'Error al capturar la orden de PayPal.',
    'error.verifyOrder': 'No se puede verificar tu pedido.',
    'success.orderPlaced': 'Tu pedido se ha realizado con éxito.',
    'success.orderComplete': 'Tu pedido está completo.',
    'success.noInfo': 'No se encontró información de pedido. Regresa a la tienda.',
    'item.remove': 'Eliminar',
  },
  fr: {
    'selector.region': 'Région',
    'selector.language': 'Langue',
    'nav.home': 'Accueil',
    'nav.shop': 'Boutique',
    'nav.products': 'Produits',
    'nav.cart': 'Panier',
    'nav.signin': 'Connexion',
    'nav.signout': 'Déconnexion',
    'nav.checkout': 'Paiement',
    'hero.eyebrow': 'Performance premium',
    'hero.heading': 'Marchez avec confort et style.',
    'hero.text': 'Achetez des chaussures faites main pour le mouvement moderne, le streetwear et les aventures quotidiennes.',
    'hero.cta': 'Voir la collection',
    'hero.join': 'Rejoindre PAP-JOY',
    'featured.eyebrow': 'Styles en vedette',
    'featured.heading': 'Découvrez nos meilleures ventes',
    'featured.viewall': 'Voir tous les produits',
    'info.fastshipping.title': 'Livraison rapide',
    'info.fastshipping.text': 'Livraison gratuite sur les commandes supérieures à 20 000 et expédition le jour même sur une sélection.',
    'info.premiummaterials.title': 'Matériaux premium',
    'info.premiummaterials.text': 'Semelles durables, textiles respirants et confort à chaque pas.',
    'info.securecheckout.title': 'Paiement sécurisé',
    'info.securecheckout.text': 'Options de paiement fiables et un parcours simple pour chaque client.',
    'product.eyebrow': 'Collection complète',
    'product.heading': 'Achetez tous les styles',
    'product.intro': 'Parcourez chaque chaussure, comparez les caractéristiques et ajoutez vos favoris au panier.',
    'product.addToCart': 'Ajouter au panier',
    'cart.eyebrow': 'Votre panier',
    'cart.heading': 'Vérifiez votre sélection',
    'cart.subtotal': 'Sous-total',
    'cart.shipping': 'Livraison',
    'cart.tax': 'Taxes',
    'cart.total': 'Total',
    'cart.continue': 'Continuer au paiement',
    'cart.clear': 'Vider le panier',
    'cart.empty': 'Votre panier est vide. Ajoutez quelque chose de beau.',
    'checkout.eyebrow': 'Paiement',
    'checkout.heading': 'Choisissez votre méthode de paiement',
    'checkout.text': 'Complétez votre commande en toute sécurité avec Stripe, PayPal ou notre option rapide.',
    'checkout.summary': 'Résumé de la commande',
    'checkout.items': 'Articles',
    'checkout.subtotal': 'Sous-total',
    'checkout.shipping': 'Livraison',
    'checkout.tax': 'Taxes',
    'checkout.total': 'Total',
    'checkout.stripe.title': 'Payer avec Stripe',
    'checkout.stripe.text': 'Paiement rapide par carte et sessions sécurisées.',
    'checkout.stripe.button': 'Payer avec Stripe',
    'checkout.paypal.title': 'Payer avec PayPal',
    'checkout.paypal.text': 'Utilisez PayPal pour terminer l’achat rapidement et en toute sécurité.',
    'checkout.paypal.button': 'Payer avec PayPal',
    'checkout.razorpay.title': 'Payer avec Razorpay',
    'checkout.razorpay.text': 'Payez en INR en toute sécurité avec Razorpay.',
    'checkout.razorpay.button': 'Payer avec Razorpay',
    'checkout.web.title': 'Commande web rapide',
    'checkout.web.text': 'Passez votre commande directement et enregistrez-la dans notre boutique.',
    'checkout.web.button': 'Passer la commande',
    'checkout.message': 'Préparation du paiement...',
    'signin.eyebrow': 'Accès membre',
    'signin.heading': 'Connectez-vous à votre compte PAP-JOY',
    'signin.emailLabel': 'Adresse e-mail',
    'signin.emailPlaceholder': 'you@example.com',
    'signin.passwordLabel': 'Mot de passe',
    'signin.passwordPlaceholder': 'Entrez le mot de passe',
    'signin.continue': 'Continuer',
    'signin.alreadySignedIn': 'Connecté en tant que {email}. Redirection vers l’accueil...',
    'signin.enterCredentials': 'Entrez l’e-mail et le mot de passe pour continuer.',
    'success.eyebrow': 'Commande terminée',
    'success.heading': 'Merci d’avoir acheté chez PAP-JOY',
    'success.status': 'Validation de votre paiement...',
    'success.continue': 'Continuer vos achats',
    'success.products': 'Voir les produits',
    'footer.text': '© 2026 PAP-JOY. Conçu pour chaque voyage.',
    'footer.signin': '© 2026 PAP-JOY. Prêt pour votre prochaine étape.',
    'checkout.redirectStripe': 'Redirection vers Stripe...',
    'checkout.redirectPayPal': 'Redirection vers PayPal...',
    'checkout.preparingRazorpay': 'Préparation du paiement Razorpay...',
    'checkout.submittingOrder': 'Envoi de votre commande...',
    'checkout.addPayPal': 'Ajoutez des articles à votre panier avant de payer avec PayPal.',
    'checkout.addRazorpay': 'Ajoutez des articles à votre panier avant de payer avec Razorpay.',
    'checkout.razorpayStartFail': 'Impossible de démarrer le paiement Razorpay. Veuillez réessayer plus tard.',
    'checkout.razorpayCanceled': 'Le paiement Razorpay a été annulé. Choisissez une autre option.',
    'success.stripeComplete': 'Votre paiement Stripe est terminé.',
    'success.paypalComplete': 'Votre paiement PayPal est terminé.',
    'signin.welcomeBack': 'Bon retour, {email} ! Redirection vers l’accueil...',
    'toast.addedCart': 'Ajouté au panier',
    'checkout.emptyCart': 'Votre panier est vide. Ajoutez un produit avant le paiement.',
    'checkout.addStripe': 'Ajoutez des articles à votre panier avant de payer avec Stripe.',
    'checkout.stripeFail': 'Impossible de démarrer le paiement Stripe.',
    'checkout.stripeRedirectFail': 'Impossible de rediriger vers Stripe. Veuillez réessayer plus tard.',
    'checkout.paypalFail': 'Impossible de démarrer le paiement PayPal.',
    'checkout.paypalCanceled': 'Le paiement PayPal a été annulé. Veuillez réessayer.',
    'checkout.orderCanceled': 'Le paiement a été annulé. Veuillez réessayer ou choisir une autre option.',
    'checkout.razorpayFail': 'Impossible de créer la commande Razorpay.',
    'checkout.verifyFail': 'Impossible de vérifier le paiement Razorpay.',
    'checkout.webOrderEmpty': 'Ajoutez des articles avant de passer la commande.',
    'checkout.webFail': 'Impossible de passer la commande. Veuillez réessayer plus tard.',
    'product.status': '{count} paires prêtes à acheter.',
    'cart.free': 'GRATUIT',
    'provider.web': 'Web',
    'provider.stripe': 'Stripe',
    'provider.paypal': 'PayPal',
    'provider.razorpay': 'Razorpay',
    'provider.cod': 'Paiement à la livraison',
    'provider.paytm': 'Paytm',
    'provider.creditcard': 'Carte de crédit',
    'provider.debitcard': 'Carte de débit',
    'provider.upi': 'UPI',
    'error.loadProducts': 'Impossible de charger les produits depuis le serveur.',
    'error.stripeCheckoutUrl': 'URL de paiement Stripe non disponible.',
    'error.paypalApprovalUrl': 'URL d’approbation PayPal non disponible.',
    'error.razorpayOrderFailed': 'Impossible de créer la commande Razorpay.',
    'error.stripeOrderConfirmationFailed': 'Impossible de confirmer la commande Stripe.',
    'error.paypalOrderCaptureFailed': 'Impossible de capturer la commande PayPal.',
    'error.verifyOrder': 'Impossible de vérifier votre commande.',
    'success.orderPlaced': 'Votre commande a été passée avec succès.',
    'success.orderComplete': 'Votre commande est terminée.',
    'success.noInfo': 'Aucune information de commande trouvée. Veuillez retourner à la boutique.',
    'item.remove': 'Supprimer',
  },
  ar: {
    'selector.region': 'المنطقة',
    'selector.language': 'اللغة',
    'nav.home': 'الرئيسية',
    'nav.shop': 'تسوق',
    'nav.products': 'المنتجات',
    'nav.cart': 'السلة',
    'nav.signin': 'تسجيل الدخول',
    'nav.signout': 'تسجيل الخروج',
    'nav.checkout': 'الدفع',
    'hero.eyebrow': 'أداء فاخر',
    'hero.heading': 'اكتشف الراحة مع أناقة متطورة.',
    'hero.text': 'تسوق أحذية مصنوعة يدويًا للحركة العصرية، والستريت وير، والمغامرات اليومية.',
    'hero.cta': 'استعرض المجموعة',
    'hero.join': 'انضم إلى PAP-JOY',
    'featured.eyebrow': 'الأنماط المميزة',
    'featured.heading': 'اكتشف الأكثر مبيعًا',
    'featured.viewall': 'عرض جميع المنتجات',
    'info.fastshipping.title': 'شحن سريع',
    'info.fastshipping.text': 'توصيل مجاني للطلبات فوق 20,000 وشحن في نفس اليوم على اختيارات محددة.',
    'info.premiummaterials.title': 'مواد فاخرة',
    'info.premiummaterials.text': 'نعل متين، وأقمشة قابلة للتنفس، وراحة بكل خطوة.',
    'info.securecheckout.title': 'دفع آمن',
    'info.securecheckout.text': 'خيارات دفع موثوقة وتجربة سلة مبسطة لكل متسوق.',
    'product.eyebrow': 'المجموعة الكاملة',
    'product.heading': 'تسوق جميع الأنماط',
    'product.intro': 'تصفح كل حذاء، وقارن الميزات، وأضف المفضلة إلى السلة.',
    'product.addToCart': 'أضف إلى السلة',
    'cart.eyebrow': 'سلتك',
    'cart.heading': 'راجع اختيارك',
    'cart.subtotal': 'المجموع الفرعي',
    'cart.shipping': 'الشحن',
    'cart.tax': 'الضريبة',
    'cart.total': 'الإجمالي',
    'cart.continue': 'أكمل الدفع',
    'cart.clear': 'تفريغ السلة',
    'cart.empty': 'سلتك فارغة. أضف شيئًا جميلاً.',
    'checkout.eyebrow': 'الدفع',
    'checkout.heading': 'اختر طريقة الدفع',
    'checkout.text': 'أكمل طلبك بأمان عبر Stripe أو PayPal أو خيار الدفع السريع.',
    'checkout.summary': 'ملخص الطلب',
    'checkout.items': 'العناصر',
    'checkout.subtotal': 'المجموع الفرعي',
    'checkout.shipping': 'الشحن',
    'checkout.tax': 'الضريبة',
    'checkout.total': 'الإجمالي',
    'checkout.stripe.title': 'الدفع عبر Stripe',
    'checkout.stripe.text': 'دفع سريع ببطاقة وسلسلة آمنة.',
    'checkout.stripe.button': 'الدفع عبر Stripe',
    'checkout.paypal.title': 'الدفع عبر PayPal',
    'checkout.paypal.text': 'استخدم PayPal لإتمام الشراء بسرعة وأمان.',
    'checkout.paypal.button': 'الدفع عبر PayPal',
    'checkout.razorpay.title': 'الدفع عبر Razorpay',
    'checkout.razorpay.text': 'ادفع بأمان بالروبية الهندية مع Razorpay.',
    'checkout.razorpay.button': 'الدفع عبر Razorpay',
    'checkout.web.title': 'طلب ويب سريع',
    'checkout.web.text': 'قدم طلبك مباشرة واحفظه في المتجر.',
    'checkout.web.button': 'إرسال الطلب',
    'checkout.message': 'جاري إعداد الدفع...',
    'signin.eyebrow': 'دخول الأعضاء',
    'signin.heading': 'تسجيل الدخول إلى حساب PAP-JOY',
    'signin.emailLabel': 'البريد الإلكتروني',
    'signin.emailPlaceholder': 'you@example.com',
    'signin.passwordLabel': 'كلمة المرور',
    'signin.passwordPlaceholder': 'أدخل كلمة المرور',
    'signin.continue': 'متابعة',
    'signin.alreadySignedIn': 'أنت بالفعل مسجل الدخول كـ {email}. جارٍ التحويل إلى الصفحة الرئيسية...',
    'signin.enterCredentials': 'أدخل البريد الإلكتروني وكلمة المرور للمتابعة.',
    'success.eyebrow': 'اكتمل الطلب',
    'success.heading': 'شكرًا لتسوقك مع PAP-JOY',
    'success.status': 'جارٍ التحقق من الدفع...',
    'success.continue': 'متابعة التسوق',
    'success.products': 'عرض المنتجات',
    'footer.text': '© 2026 PAP-JOY. مصنوع لكل رحلة.',
    'footer.signin': '© 2026 PAP-JOY. جاهز لخطوتك القادمة.',
    'checkout.redirectStripe': 'يتم التحويل إلى Stripe...',
    'checkout.redirectPayPal': 'يتم التحويل إلى PayPal...',
    'checkout.preparingRazorpay': 'جاري إعداد دفع Razorpay...',
    'checkout.submittingOrder': 'جاري إرسال طلبك...',
    'checkout.addPayPal': 'أضف عناصر إلى السلة قبل الدفع عبر PayPal.',
    'checkout.addRazorpay': 'أضف عناصر إلى السلة قبل الدفع عبر Razorpay.',
    'checkout.razorpayStartFail': 'غير قادر على بدء دفع Razorpay. حاول مرة أخرى لاحقًا.',
    'checkout.razorpayCanceled': 'تم إلغاء دفع Razorpay. اختر خيارًا آخر.',
    'success.stripeComplete': 'تم إتمام الدفع عبر Stripe.',
    'success.paypalComplete': 'تم إتمام الدفع عبر PayPal.',
    'signin.welcomeBack': 'مرحبًا بعودتك، {email}! جارٍ التحويل...',
    'toast.addedCart': 'أضيف إلى السلة',
    'checkout.emptyCart': 'سلتك فارغة. أضف منتجًا قبل الدفع.',
    'checkout.addStripe': 'أضف عناصر إلى السلة قبل الدفع عبر Stripe.',
    'checkout.stripeFail': 'غير قادر على بدء دفع Stripe.',
    'checkout.stripeRedirectFail': 'غير قادر على التحويل إلى Stripe. حاول مرة أخرى لاحقًا.',
    'checkout.paypalFail': 'غير قادر على بدء دفع PayPal.',
    'checkout.paypalCanceled': 'تم إلغاء دفع PayPal. حاول مرة أخرى.',
    'checkout.orderCanceled': 'تم إلغاء الدفع. حاول مرة أخرى أو اختر خيارًا آخر.',
    'checkout.razorpayFail': 'غير قادر على إنشاء طلب Razorpay.',
    'checkout.verifyFail': 'غير قادر على التحقق من دفع Razorpay.',
    'checkout.webOrderEmpty': 'أضف عناصر قبل تقديم الطلب.',
    'checkout.webFail': 'غير قادر على تقديم الطلب حاليًا. حاول مرة أخرى لاحقًا.',
    'error.loadProducts': 'غير قادر على تحميل المنتجات من الخادم.',
    'error.stripeCheckoutUrl': 'رابط دفع Stripe غير متوفر.',
    'error.paypalApprovalUrl': 'رابط موافقة PayPal غير متوفر.',
    'error.razorpayOrderFailed': 'فشل إنشاء طلب Razorpay.',
    'error.stripeOrderConfirmationFailed': 'فشل تأكيد طلب Stripe.',
    'error.paypalOrderCaptureFailed': 'فشل استلام طلب PayPal.',
    'error.verifyOrder': 'غير قادر على التحقق من طلبك.',
    'success.orderPlaced': 'تم تقديم طلبك بنجاح.',
    'success.orderComplete': 'اكتمل طلبك.',
    'success.noInfo': 'لم يتم العثور على معلومات الطلب. الرجاء العودة إلى المتجر.',
    'success.summaryProvider': 'مزود الطلب',
    'success.summaryOrderId': 'معرف الطلب',
    'success.summaryPaymentId': 'معرف الدفع',
    'success.summaryStatus': 'الحالة',
    'success.summaryAmount': 'المبلغ',
    'success.summaryItems': 'العناصر',
    'product.status': '{count} أحذية جاهزة للتسوق.',
    'cart.free': 'مجاني',
    'provider.web': 'الويب',
    'provider.stripe': 'Stripe',
    'provider.paypal': 'PayPal',
    'provider.razorpay': 'Razorpay',
    'provider.cod': 'الدفع عند التسليم',
    'provider.paytm': 'Paytm',
    'provider.creditcard': 'بطاقة الائتمان',
    'provider.debitcard': 'بطاقة الخصم',
    'provider.upi': 'UPI',
    'item.remove': 'إزالة',
  },
};

function inferLanguageFromBrowserLang() {
  const locale = navigator.language || navigator.userLanguage || 'en';
  const [lang] = locale.split(/[-_]/);
  return availableLanguages[lang] ? lang : 'en';
}

function translate(key) {
  return translations[selectedLanguage]?.[key] || translations.en[key] || key;
}

function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = translate(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (key) element.placeholder = translate(key);
  });
  document.documentElement.lang = selectedLanguage;
  document.documentElement.dir = selectedLanguage === 'ar' ? 'rtl' : 'ltr';
  updateLocaleSwitcher();
  updateLanguageSwitcher();
}

function updateLanguageSwitcher() {
  const select = document.getElementById('language-selector');
  if (!select) return;
  select.value = selectedLanguage;
}

function setLanguage(lang) {
  if (!availableLanguages[lang]) return;
  selectedLanguage = lang;
  localStorage.setItem('papjoy-lang', lang);
  translatePage();
  updateUserLinks();
}

function setRegion(regionCode) {
  selectedRegion = regionCode;
  localStorage.setItem('papjoy-region', regionCode);
  updateCurrencyFormatter();
  renderProducts();
  renderCart();
  updateCartSummary();
  updateCheckoutSummary();
  updateLocaleSwitcher();
}

function saveCart() {
  localStorage.setItem('papjoy-cart', JSON.stringify(cart));
  updateCartCount();
}

const AUTH_USER_KEY = 'papjoy-user';
const AUTH_TOKEN_KEY = 'papjoy-token';
const AUTH_REFRESH_TOKEN_KEY = 'papjoy-refresh-token';

function getCurrentUser() {
  const sessionUser = JSON.parse(sessionStorage.getItem(AUTH_USER_KEY) || 'null');
  if (sessionUser) return sessionUser;
  return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
}

function getAuthToken() {
  const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken) return sessionToken;
  const localToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (localToken) return localToken;
  const user = getCurrentUser();
  return user?.token || null;
}

function getRefreshToken() {
  const sessionToken = sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (sessionToken) return sessionToken;
  const localToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (localToken) return localToken;
  const user = getCurrentUser();
  return user?.refreshToken || null;
}

function getAuthHeaders() {
  const headers = getAuthHeaders();
  return headers;
}

function setCurrentUser(user, remember = true) {
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  remoteCartLoaded = false;

  if (!user) return;

  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (user.token) {
    storage.setItem(AUTH_TOKEN_KEY, user.token);
  }
  if (user.refreshToken) {
    storage.setItem(AUTH_REFRESH_TOKEN_KEY, user.refreshToken);
  }

  updateUserLinks();
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { response, data } = await apiFetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok || !data?.token) {
      signOut();
      return null;
    }

    const currentUser = getCurrentUser() || {};
    const remember = !!localStorage.getItem(AUTH_TOKEN_KEY) || !!localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
    const updatedUser = { ...currentUser, token: data.token, refreshToken: data.refreshToken || refreshToken };
    setCurrentUser(updatedUser, remember);
    return data.token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    signOut();
    return null;
  }
}

async function apiRequest(path, options = {}, retry = true) {
  const url = apiUrl(path);
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && retry && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      return await apiRequest(path, { ...options, headers }, false);
    }
  }
  return response;
}

let syncCartTimer = null;
function syncCart() {
  const user = getCurrentUser();
  const token = getAuthToken();
  if (!user || !user.id || !token) return;
  if (syncCartTimer) clearTimeout(syncCartTimer);
  syncCartTimer = setTimeout(async () => {
    syncCartTimer = null;
    try {
      const response = await apiRequest('/api/v1/cart/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart })
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data && Array.isArray(data.items)) {
        cart = data.items.map(normalizeServerCartItem);
        saveCart();
        renderCart();
      }
    } catch (error) {
      console.error('Failed to sync cart to server:', error);
    }
  }, 300);
}

async function syncUserProfile() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(apiUrl('/api/v1/auth/me'), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return null;
    const data = await safeParseJson(response);
    if (!data || !data.email) return null;

    const remember = !!localStorage.getItem('papjoy-token');
    const currentUser = getCurrentUser() || {};
    const updatedUser = {
      ...currentUser,
      ...data,
      token,
      id: data.id || data._id || currentUser.id || currentUser._id,
      _id: data._id || data.id || currentUser._id || currentUser.id
    };
    setCurrentUser(updatedUser, remember);
    return updatedUser;
  } catch (error) {
    console.error('Failed to sync profile:', error);
    return null;
  }
}


function getLocalOrders() {
  return JSON.parse(localStorage.getItem('papjoy-orders') || '[]');
}

function saveLocalOrders(orders) {
  localStorage.setItem('papjoy-orders', JSON.stringify(orders));
}

function getLocalOrder(orderId, email) {
  const orders = getLocalOrders();
  return orders.find((order) => order.id === orderId && (!email || order.email === email));
}

function storeLocalOrder(order) {
  const orders = getLocalOrders();
  orders.push(order);
  saveLocalOrders(orders);
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

async function initGoogleSignIn(buttonId, rememberCheckboxId) {
  const buttonContainer = document.getElementById(buttonId);
  if (!buttonContainer) return;

  try {
    const { response, data: config } = await apiFetch('/api/v1/auth/google-config');
    if (!response.ok || !config?.clientId) {
      buttonContainer.style.display = 'none';
      return;
    }

    const clientId = config.clientId;
    await loadScript('https://accounts.google.com/gsi/client');
    if (!window.google?.accounts?.id) {
      buttonContainer.style.display = 'none';
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        const remember = document.getElementById(rememberCheckboxId)?.checked;
        try {
          const { response: tokenResponse, data } = await apiFetch('/api/v1/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: response.credential })
          });
          if (!tokenResponse.ok) {
            throw new Error(data?.error || data?.message || 'Google login failed');
          }
          const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
          setCurrentUser(userData, remember);
          window.location.href = 'account.html';
        } catch (error) {
          console.error('Google sign-in error:', error);
          const statusMessage = document.getElementById('auth-message');
          if (statusMessage) {
            statusMessage.textContent = 'Google sign-in failed. Please try again.';
            statusMessage.style.color = '#ff8b94';
          }
        }
      }
    });

    window.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      width: '100%'
    });
  } catch (error) {
    console.error('Google auth initialization error:', error);
    if (buttonContainer) buttonContainer.style.display = 'none';
  }
}

function normalizeServerCartItem(item) {
  const product = item.productId || {};
  return {
    id: product._id || product.slug || String(item.productId),
    productId: product._id || String(item.productId),
    name: product.name || item.name || 'Product',
    image: getProductImageUrls(product)[0] || product.image || 'https://via.placeholder.com/240',
    variant: item.variant || 'Standard',
    price: Number(item.price || product.price || 0),
    quantity: Number(item.quantity || 1),
    category: product.category || (product.categoryId && product.categoryId.name) || item.category || '',
    subtitle: product.shortDescription || product.subtitle || item.subtitle || ''
  };
}

function mergeServerCart(remoteItems) {
  const merged = [...cart];

  remoteItems.forEach((item) => {
    const normalized = normalizeServerCartItem(item);
    const existing = merged.find((entry) => entry.id === normalized.id && (entry.variant || 'Standard') === normalized.variant);
    if (existing) {
      existing.quantity = Math.max(existing.quantity, normalized.quantity);
      existing.price = normalized.price;
    } else {
      merged.push(normalized);
    }
  });

  cart = merged;
  saveCart();
}

async function loadUserCart() {
  const token = getAuthToken();
  if (!token || remoteCartLoaded) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/cart`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.items) && data.items.length) {
        mergeServerCart(data.items);
      }
    }
  } catch (error) {
    console.error('Failed to load user cart:', error);
  } finally {
    remoteCartLoaded = true;
  }
}

async function signOut() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.warn('Logout request did not complete:', error);
    }
  }

  setCurrentUser(null);
  window.location.href = 'signin.html';
}

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const countEls = document.querySelectorAll('#cart-count, #cart-count-sidebar, #sidebar-cart-count');
  countEls.forEach((el) => {
    el.textContent = count;
  });
}

function showCart() {
  window.location.href = 'cart.html';
}

function updateUserLinks() {
  const user = getCurrentUser();
  const links = Array.from(document.querySelectorAll('.site-nav a, .sidebar-nav a'));
  const updateText = (link, text) => {
    const span = link.querySelector('span');
    if (span) {
      span.textContent = text;
      return;
    }
    const icon = link.querySelector('i');
    if (icon) {
      const textNode = Array.from(link.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = ` ${text}`;
      } else {
        link.append(` ${text}`);
      }
      return;
    }
    link.textContent = text;
  };

  links.forEach((link) => {
    if (link.getAttribute('href') === 'signin.html') {
      if (user) {
        updateText(link, translate('nav.signout'));
        link.href = '#';
        link.onclick = (event) => {
          event.preventDefault();
          signOut();
        };
      } else {
        updateText(link, translate('nav.signin'));
        link.href = 'signin.html';
        link.onclick = null;
      }
    }
  });
}

function toggleMobileSidebar(forceClose = false) {
  const sidebar = document.getElementById('site-sidebar');
  const toggle = document.getElementById('mobile-menu-toggle');
  const shouldOpen = forceClose ? false : !document.body.classList.contains('mobile-nav-open');

  document.body.classList.toggle('mobile-nav-open', shouldOpen);
  sidebar?.classList.toggle('active', shouldOpen);
  toggle?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function closeMobileSidebar() {
  toggleMobileSidebar(true);
}

function createSidebar() {
  const existingSidebar = document.getElementById('site-sidebar') || document.querySelector('.site-sidebar');
  const existingHeader = document.querySelector('.site-header');
  const existingLegacyOverlay = document.getElementById('sidebar-overlay');
  const existingMobileOverlay = document.getElementById('mobile-nav-overlay');
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  if (existingHeader) {
    existingHeader.remove();
  }

  if (existingLegacyOverlay) {
    existingLegacyOverlay.remove();
  }

  const sidebar = existingSidebar || document.createElement('aside');
  if (!existingSidebar) {
    sidebar.id = 'site-sidebar';
    sidebar.className = 'site-sidebar';
    document.body.prepend(sidebar);
  } else {
    sidebar.id = 'site-sidebar';
    sidebar.className = 'site-sidebar';
  }

  const currentPage = currentPath.replace(/\.html$/i, '');
  const isActivePage = (href) => {
    const pageName = href.replace(/\.html$/i, '');
    if (pageName === 'index' || pageName === 'home') {
      return currentPage === '' || currentPage === 'index' || currentPage === 'home';
    }
    return currentPage === pageName;
  };

  sidebar.innerHTML = `
    <div class="sidebar-brand"><a href="index.html">PAP-JOY</a></div>
    <nav class="sidebar-nav">
      <a href="index.html" class="nav-link ${isActivePage('index.html') ? 'active' : ''}"><i class="fas fa-home"></i><span>Home</span></a>
      <a href="product.html" class="nav-link ${isActivePage('product.html') ? 'active' : ''}"><i class="fas fa-store"></i><span>Shop</span></a>
      <a href="cart.html" class="nav-link ${isActivePage('cart.html') ? 'active' : ''}"><i class="fas fa-shopping-cart"></i><span>Cart</span><span class="cart-badge" id="sidebar-cart-count">${cart.reduce((sum, item) => sum + item.quantity, 0)}</span></a>
      <a href="tracking.html" class="nav-link ${isActivePage('tracking.html') ? 'active' : ''}"><i class="fas fa-truck"></i><span>Track Order</span></a>
      <a href="account.html" class="nav-link ${isActivePage('account.html') ? 'active' : ''}"><i class="fas fa-user"></i><span>Account</span></a>
      <a href="signin.html" class="nav-link ${isActivePage('signin.html') ? 'active' : ''}"><i class="fas fa-sign-in-alt"></i><span>Sign In</span></a>
    </nav>
    <div class="sidebar-meta">
      <div class="sidebar-stats">
        <div class="stat-item"><div class="stat-number">12</div><div class="stat-label">Products</div></div>
        <div class="stat-item"><div class="stat-number">2.5K+</div><div class="stat-label">Premium styles</div></div>
      </div>
      <div class="sidebar-actions">
        <button class="action-btn" onclick="showCart()"><i class="fas fa-shopping-bag"></i><span>Quick Cart</span></button>
      </div>
    </div>
  `;

  let overlay = existingMobileOverlay;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mobile-nav-overlay';
    overlay.className = 'mobile-nav-overlay';
    document.body.appendChild(overlay);
  }

  const toggle = document.getElementById('mobile-menu-toggle');
  if (!toggle) {
    const toggleButton = document.createElement('button');
    toggleButton.id = 'mobile-menu-toggle';
    toggleButton.className = 'mobile-menu-toggle';
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.appendChild(toggleButton);
  }

  const activeToggle = document.getElementById('mobile-menu-toggle');
  if (activeToggle) {
    activeToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMobileSidebar();
    });
  }

  sidebar.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMobileSidebar());
  });

  overlay.addEventListener('click', () => closeMobileSidebar());
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) {
      closeMobileSidebar();
    }
  });

  document.body.classList.add('has-global-nav');
  updateCartCount();
}

function updateLocaleSwitcher() {
  const select = document.getElementById('region-selector');
  if (!select) return;
  select.value = selectedRegion;
}

function createLocaleSwitcher() {
  const header = document.querySelector('.site-header');
  if (!header || document.getElementById('region-switcher-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'region-switcher-wrapper';
  wrapper.className = 'region-switcher-wrapper';
  wrapper.innerHTML = `
    <div class="locale-controls">
      <div class="locale-group">
        <label for="region-selector" class="region-switcher-label" data-i18n="selector.region">Region</label>
        <select id="region-selector" class="region-switcher"></select>
      </div>
      <div class="locale-group">
        <label for="language-selector" class="language-switcher-label" data-i18n="selector.language">Language</label>
        <select id="language-selector" class="region-switcher"></select>
      </div>
    </div>
  `;

  const regionSelect = wrapper.querySelector('#region-selector');
  const languageSelect = wrapper.querySelector('#language-selector');

  if (regionSelect) {
    Object.entries(localeRegionMap).forEach(([code, info]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = info.label;
      regionSelect.appendChild(option);
    });

    regionSelect.value = selectedRegion;
    regionSelect.addEventListener('change', (event) => {
      setRegion(event.target.value);
    });
  }

  if (languageSelect) {
    Object.entries(availableLanguages).forEach(([code, info]) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = info.label;
      languageSelect.appendChild(option);
    });

    languageSelect.value = selectedLanguage;
    languageSelect.addEventListener('change', (event) => {
      setLanguage(event.target.value);
    });
  }

  header.appendChild(wrapper);
}

function createToastContainer() {
  if (document.getElementById('cart-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'cart-toast';
  toast.className = 'cart-toast';
  document.body.appendChild(toast);
}

function showToast(message) {
  createToastContainer();
  const toast = document.getElementById('cart-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function createPageTransitionOverlay() {
  if (document.getElementById('page-transition-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'page-transition-overlay';
  overlay.className = 'page-transition-overlay';
  document.body.appendChild(overlay);
}

function triggerPageTransition(href) {
  const overlay = document.getElementById('page-transition-overlay');
  if (!overlay) {
    window.location.href = href;
    return;
  }
  overlay.classList.add('visible');
  window.setTimeout(() => {
    window.location.href = href;
  }, 180);
}

function initPageTransitions() {
  createPageTransitionOverlay();

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
    if (href.startsWith('#')) return;

    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    if (destination.pathname === window.location.pathname && destination.hash) return;
    if (anchor.getAttribute('data-no-transition') !== null) return;

    event.preventDefault();
    triggerPageTransition(destination.href);
  });
}

function getAvailableCategories() {
  return Array.from(new Set(products.map((product) => product.category))).filter(Boolean);
}

function updateFeaturedControlState(filter) {
  const buttons = document.querySelectorAll('.section-controls .control-btn');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
}

function initFeaturedControls() {
  const buttons = document.querySelectorAll('.section-controls .control-btn');
  if (!buttons.length || featuredControlsInitialized) return;

  buttons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const filter = event.currentTarget.dataset.filter;
      if (!filter) return;
      selectedFeaturedFilter = filter;
      updateFeaturedControlState(filter);
      renderProducts();
    });
  });

  updateFeaturedControlState(selectedFeaturedFilter);
  featuredControlsInitialized = true;
}

function getProductById(productId) {
  return products.find((product) =>
    String(product._id) === String(productId) ||
    String(product.id) === String(productId) ||
    String(product.slug) === String(productId)
  );
}

async function renderProductDetailPage() {
  const params = getQueryParams();
  let product = getProductById(params.id || params.slug);

  if (!product && params.slug) {
    product = await getProductBySlug(params.slug);
    if (product) {
      products.push(product);
    }
  }

  const container = document.getElementById('product-detail');

  if (!container) return;
  if (!product) {
    container.innerHTML = `<div class="empty-state">${translate('product.notFound')}</div>`;
    return;
  }

  const activeImage = product.images && product.images.length ? product.images[0] : product.image;
  const variantButtons = (product.variants || []).map((variant, index) => `
        <button class="variant-option${index === 0 ? ' active' : ''}" data-price-delta="${variant.priceDelta}" data-variant="${variant.name}">
          ${variant.name}${variant.priceDelta ? ` +${formatCurrency(variant.priceDelta)}` : ''}
        </button>
      `).join('');
  const detailsList = (product.details || []).map((detail) => `<li>${detail}</li>`).join('');

  container.innerHTML = `
    <div class="product-detail-card">
      <div class="product-gallery">
        <img id="detail-main-image" src="${activeImage}" alt="${product.name}" />
        <div class="gallery-thumbs">
          ${(product.images || [product.image]).map((src, index) => `
            <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-image="${src}">
              <img src="${src}" alt="${product.name} image ${index + 1}" loading="lazy" />
            </button>
          `).join('')}
        </div>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${product.category}</p>
        <h2>${product.name}</h2>
        <p class="detail-subtitle">${product.subtitle}</p>
        <p class="detail-description">${product.description}</p>
        <div class="product-variants">
          <p class="variant-label">Choose variant</p>
          <div class="variant-list">${variantButtons}</div>
        </div>
        <ul class="detail-features">${detailsList}</ul>
        <div class="detail-meta">
          <span id="detail-price">${formatCurrency(product.price)}</span>
          <button id="detail-add-button" type="button">${translate('product.addToCart')}</button>
          <button id="detail-buy-button" type="button" class="buy-now-button">Buy now</button>
        </div>
      </div>
    </div>
    <section id="recommendations-section" class="recommendations-section"></section>
  `;

  const mainImage = container.querySelector('#detail-main-image');
  const thumbButtons = Array.from(container.querySelectorAll('.gallery-thumb'));
  const variantOptionButtons = Array.from(container.querySelectorAll('.variant-option'));
  const detailPrice = container.querySelector('#detail-price');
  const detailAddButton = container.querySelector('#detail-add-button');
  const detailBuyButton = container.querySelector('#detail-buy-button');

  const updateDetailActions = (variantName, variantPrice) => {
    if (detailAddButton) {
      detailAddButton.onclick = () => addToCart(product.id || product._id, variantName, variantPrice);
    }
    if (detailBuyButton) {
      detailBuyButton.onclick = () => buyNow(product.id || product._id, variantName, variantPrice);
    }
  };

  updateDetailActions(product.variants?.[0]?.name || 'Standard', product.price + (product.variants?.[0]?.priceDelta || 0));

  thumbButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!mainImage) return;
      const imageUrl = button.dataset.image;
      mainImage.src = imageUrl;
      thumbButtons.forEach((thumb) => thumb.classList.remove('active'));
      button.classList.add('active');
    });
  });

  variantOptionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      variantOptionButtons.forEach((option) => option.classList.remove('active'));
      button.classList.add('active');
      const priceDelta = Number(button.dataset.priceDelta || 0);
      const variantName = button.dataset.variant || 'Standard';
      if (detailPrice) {
        detailPrice.textContent = formatCurrency(product.price + priceDelta);
      }
      updateDetailActions(variantName, product.price + priceDelta);
    });
  });

  // Track product views and load personalized recommendations
  const productId = product.id || product._id;
  await saveViewedProduct(productId);

  const ratingData = await loadRatingSummary(productId);
  const reviewsData = await loadProductReviews(productId);

  // Render rating summary if container exists
  const ratingSummaryEl = document.getElementById('rating-summary');
  if (ratingSummaryEl && ratingData.totalReviews > 0) {
    ratingSummaryEl.innerHTML = `
      <div class="rating-summary">
        <div class="avg-rating">${ratingData.averageRating.toFixed(1)}</div>
        <div class="rating-text">${'★'.repeat(Math.round(ratingData.averageRating))}${'☆'.repeat(5 - Math.round(ratingData.averageRating))}</div>
        <div class="total-reviews">(${ratingData.totalReviews} reviews)</div>
      </div>
    `;
  }

  // Render review form
  renderReviewForm(productId);

  // Render existing reviews
  if (reviewsData.reviews) {
    renderReviews(reviewsData.reviews);
  }

  await renderRecommendations(productId);
}

function addToCart(productId, variantName = 'Standard', variantPrice = null, redirectToCheckout = false) {
  const product = getProductById(productId);
  if (!product) return;

  const selectedVariant = normalizeVariantName(variantName);
  const price = typeof variantPrice === 'number' ? variantPrice : product.price;
  
  // Check inventory locally first
  let availableStock = product.inventory?.quantity || 0;
  if (selectedVariant !== 'Standard') {
    const variant = product.variants?.find(v => v.name === selectedVariant);
    availableStock = variant?.inventory || product.inventory?.quantity || 0;
  }

  if (availableStock <= 0) {
    showToast('❌ This product is out of stock');
    return;
  }

  const existing = cart.find((item) => getItemIdentity(item, item.variant || 'Standard') === getItemIdentity({ id: productId, variant: selectedVariant }, selectedVariant));
  const currentQuantity = existing?.quantity || 0;

  if (currentQuantity >= availableStock) {
    showToast(`❌ Only ${availableStock} items available (${currentQuantity} already in cart)`);
    return;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id || product._id,
      productId: product.id || product._id,
      name: product.name,
      image: product.image,
      price,
      quantity: 1,
      variant: selectedVariant,
      category: product.category,
      subtitle: product.subtitle,
    });
  }

  saveCart();
  syncCart();
  renderCart();

  const quantity = existing ? existing.quantity : 1;
  const message = `${product.name}${selectedVariant !== 'Standard' ? ' - ' + selectedVariant : ''} (x${quantity}) ${translate('toast.addedCart')}`;
  showToast(message);

  if (redirectToCheckout) {
    window.location.href = 'checkout.html';
  }
}

// Wrapper functions for filter page
function addToCartFlow(productId) {
  addToCart(productId, 'Standard', null, false);
}

function buyNowFlow(productId) {
  addToCart(productId, 'Standard', null, true);
}

function buyNow(productId, variantName = 'Standard', variantPrice = null) {
  addToCart(productId, variantName, variantPrice, true);
}

function removeFromCart(productId, variantName = 'Standard') {
  const item = cart.find((entry) => getItemIdentity(entry, entry.variant || 'Standard') === getItemIdentity({ id: productId, variant: variantName }, variantName));
  cart = cart.filter((entry) => getItemIdentity(entry, entry.variant || 'Standard') !== getItemIdentity({ id: productId, variant: variantName }, variantName));
  saveCart();
  syncCart();
  renderCart();
  if (item) {
    showToast(`${item.name} removed from cart.`);
  }
}

function changeQuantity(productId, delta, variantName = 'Standard') {
  const item = cart.find((entry) => getItemIdentity(entry, entry.variant || 'Standard') === getItemIdentity({ id: productId, variant: variantName }, variantName));
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeFromCart(productId, variantName);
  } else {
    saveCart();
    syncCart();
    renderCart();
    showToast(`${item.name} quantity updated to ${item.quantity}.`);
  }
}

function calculateOrderTotals(items = [], options = {}) {
  const normalizedItems = items.map((item) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Math.round(Number(item.price || item.unitPrice || 0));
    const total = unitPrice * quantity;
    return { ...item, quantity, unitPrice, price: unitPrice, total };
  });

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const fallbackShipping = subtotal === 0 ? 0 : subtotal >= 20000 ? 0 : 299;
  const shipping = Number.isFinite(Number(options.shipping)) ? Math.round(Number(options.shipping)) : fallbackShipping;
  const discount = Number.isFinite(Number(options.discount)) ? Math.round(Number(options.discount)) : 0;
  const taxRate = Number(options.taxRate || GST_RATE);
  const tax = Math.round(subtotal * taxRate);
  const cgst = Math.round(tax / 2);
  const sgst = tax - cgst;
  const total = subtotal + shipping + tax - discount;
  const count = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  return { items: normalizedItems, subtotal, shipping, tax, cgst, sgst, discount, total, count };
}

function getCartTotals() {
  const totals = calculateOrderTotals(cart);

  if (appliedPromoCode && validPromoCodes[appliedPromoCode]) {
    totals.discount = Math.round(totals.subtotal * validPromoCodes[appliedPromoCode].discount);
    totals.total = totals.subtotal + totals.shipping + totals.tax - totals.discount;
  }

  return totals;
}

function updateCartSummary() {
  const subtotalEl = document.getElementById('subtotal');
  const shippingEl = document.getElementById('shipping');
  const taxEl = document.getElementById('tax');
  const totalEl = document.getElementById('total');
  const countEl = document.getElementById('cart-count');
  const discountEl = document.getElementById('discount-amount');
  const discountRow = document.getElementById('promo-discount');
  const totals = getCartTotals();

  if (countEl) countEl.textContent = totals.count;
  if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
  if (shippingEl) shippingEl.textContent = totals.shipping === 0 ? translate('cart.free') : formatCurrency(totals.shipping);
  if (taxEl) taxEl.textContent = formatCurrency(totals.tax);
  const cgstEl = document.getElementById('checkout-cgst');
  const sgstEl = document.getElementById('checkout-sgst');
  if (cgstEl) cgstEl.textContent = formatCurrency(totals.cgst || 0);
  if (sgstEl) sgstEl.textContent = formatCurrency(totals.sgst || 0);
  if (totalEl) totalEl.textContent = formatCurrency(totals.total);

  if (discountRow) {
    if (totals.discount > 0) {
      if (discountEl) discountEl.textContent = formatCurrency(totals.discount);
      discountRow.style.display = 'flex';
    } else {
      discountRow.style.display = 'none';
    }
  }

  const shippingNote = document.getElementById('shipping-note');
  if (shippingNote) {
    if (totals.subtotal === 0) {
      shippingNote.textContent = 'Add items to your cart to see shipping and delivery options.';
    } else if (totals.subtotal >= 20000) {
      shippingNote.textContent = 'Congratulations! Your order qualifies for free shipping.';
    } else {
      shippingNote.textContent = `Add ${formatCurrency(20000 - totals.subtotal)} more to unlock free shipping.`;
    }
  }

  updateCartCount();
}

function updateCheckoutSummary() {
  const subtotalEl = document.getElementById('checkout-subtotal');
  const shippingEl = document.getElementById('checkout-shipping');
  const taxEl = document.getElementById('checkout-tax');
  const totalEl = document.getElementById('checkout-total');
  const countEl = document.getElementById('checkout-count');
  const totals = getCartTotals();

  if (countEl) countEl.textContent = totals.count;
  if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
  if (shippingEl) shippingEl.textContent = totals.shipping === 0 ? translate('cart.free') : formatCurrency(totals.shipping);
  if (taxEl) taxEl.textContent = formatCurrency(totals.tax);
  const cgstEl = document.getElementById('cgst');
  const sgstEl = document.getElementById('sgst');
  if (cgstEl) cgstEl.textContent = formatCurrency(totals.cgst || 0);
  if (sgstEl) sgstEl.textContent = formatCurrency(totals.sgst || 0);
  if (totalEl) totalEl.textContent = formatCurrency(totals.total);

  const discountRow = document.getElementById('checkout-discount-row');
  const discountEl = document.getElementById('checkout-discount');
  if (discountRow) {
    if (totals.discount > 0) {
      discountRow.style.display = 'flex';
      if (discountEl) discountEl.textContent = `-${formatCurrency(totals.discount)}`;
    } else {
      discountRow.style.display = 'none';
    }
  }
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) {
    updateCartSummary();
    return;
  }

  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = `<li class="cart-item empty-cart">${translate('cart.empty')}</li>`;
    updateCartSummary();
    return;
  }

  cart.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="cart-item-meta">
        <div class="cart-item-avatar">
          <img src="${item.image || item.product?.image || 'https://via.placeholder.com/180'}" alt="${item.name}" loading="lazy" />
        </div>
        <div class="cart-item-content">
          <h3>${item.name}</h3>
          ${item.variant ? `<p class="cart-variant">${item.variant}</p>` : ''}
          <p class="cart-item-price">${formatCurrency(item.price * item.quantity)}</p>
          <p class="cart-item-subtext">${translate('cart.subtotal')}: ${formatCurrency(item.price * item.quantity)}</p>
        </div>
      </div>
      <div class="item-controls">
        <button onclick="changeQuantity(${JSON.stringify(item.id)}, -1, ${JSON.stringify(item.variant || 'Standard')})">-</button>
        <span>${item.quantity}</span>
        <button onclick="changeQuantity(${JSON.stringify(item.id)}, 1, ${JSON.stringify(item.variant || 'Standard')})">+</button>
        <button class="remove-button" onclick="removeFromCart(${JSON.stringify(item.id)}, ${JSON.stringify(item.variant || 'Standard')})">${translate('item.remove')}</button>
        <button class="save-for-later-btn" onclick="saveForLater(${JSON.stringify(item.id)}, ${JSON.stringify(item.variant || 'Standard')})" title="Save for later"><i class="fas fa-bookmark"></i></button>
      </div>
    `;
    container.appendChild(li);
  });

  updateCartSummary();
  renderSavedItems();
}

function clearCart() {
  if (!cart.length) {
    showToast('Your cart is already empty.');
    return;
  }
  cart = [];
  appliedPromoCode = '';
  localStorage.removeItem('papjoy-promo');
  saveCart();
  renderCart();
  showToast('Cart cleared.');
}

function saveForLater(productId, variantName = 'Standard') {
  const itemIndex = cart.findIndex((item) => getItemIdentity(item, item.variant || 'Standard') === getItemIdentity({ id: productId, variant: variantName }, variantName));
  if (itemIndex === -1) return;

  const item = cart[itemIndex];
  cart.splice(itemIndex, 1);
  const existingSaved = savedItems.some((saved) => getItemIdentity(saved, saved.variant || 'Standard') === getItemIdentity(item, item.variant || 'Standard'));
  if (!existingSaved) {
    savedItems.push(item);
  }

  saveCart();
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  showToast(`${item.name} saved for later!`);
  renderCart();
  renderSavedItems();
  syncWishlistItem(item);
}

function moveFromSaved(productId, variantName = 'Standard') {
  const itemIndex = savedItems.findIndex((item) => getItemIdentity(item, item.variant || 'Standard') === getItemIdentity({ id: productId, variant: variantName }, variantName));
  if (itemIndex === -1) return;

  const item = savedItems[itemIndex];
  savedItems.splice(itemIndex, 1);
  const existingCart = cart.some((entry) => getItemIdentity(entry, entry.variant || 'Standard') === getItemIdentity(item, item.variant || 'Standard'));
  if (!existingCart) {
    cart.push(item);
  }

  saveCart();
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  showToast(`${item.name} moved to cart!`);
  renderCart();
  renderSavedItems();
}

function removeSavedItem(productId, variantName = 'Standard') {
  const key = getItemIdentity({ id: productId, variant: variantName }, variantName);
  savedItems = savedItems.filter((item) => getItemIdentity(item, item.variant || 'Standard') !== key);
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  removeWishlistItem(productId, variantName);
  renderSavedItems();
}

async function fetchUserWishlist() {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/wishlist`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Unable to load wishlist:', error);
    return [];
  }
}

async function syncWishlistItem(item) {
  const token = getAuthToken();
  if (!token || !item?.id) return;

  try {
    await fetch(`${API_BASE_URL}/api/v1/wishlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ productId: item.id, variant: item.variant || 'Standard' }),
    });
  } catch (error) {
    console.warn('Failed to sync wishlist item:', error);
  }
}

async function removeWishlistItem(productId, variantName = 'Standard') {
  const token = getAuthToken();
  if (!token) return;

  try {
    await fetch(`${API_BASE_URL}/api/v1/wishlist/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
    });
  } catch (error) {
    console.warn('Failed to remove wishlist item:', error);
  }
}

async function loadUserWishlist() {
  const remoteItems = await fetchUserWishlist();
  if (!remoteItems.length) return;

  const merged = dedupeItemsByKey([...savedItems], (item) => getItemIdentity(item, item.variant || 'Standard'));
  remoteItems.forEach((item) => {
    const remoteProductId = item.productId?._id || item.productId;
    const variantName = item.variant || 'Standard';
    const alreadySaved = merged.some((saved) => getItemIdentity(saved, saved.variant || 'Standard') === getItemIdentity({ id: remoteProductId, variant: variantName }, variantName));
    if (!alreadySaved) {
      const product = typeof item.productId === 'string' ? getProductById(item.productId) : item.productId;
      if (product) {
        merged.push({
          ...product,
          id: remoteProductId,
          variant: variantName,
          quantity: 1,
        });
      }
    }
  });

  savedItems = dedupeItemsByKey(merged, (item) => getItemIdentity(item, item.variant || 'Standard'));
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
}

async function syncSavedItemsToServer() {
  const token = getAuthToken();
  if (!token || !savedItems.length) return;

  try {
    const payload = dedupeItemsByKey(savedItems, (item) => getItemIdentity(item, item.variant || 'Standard')).map((item) => ({
      productId: item.id,
      variant: item.variant || 'Standard',
    }));

    await fetch(`${API_BASE_URL}/api/v1/wishlist/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ items: payload }),
    });
  } catch (error) {
    console.warn('Failed to sync saved items to server:', error);
  }
}

async function saveViewedProduct(productId) {
  if (!productId) return;
  browsingHistory = browsingHistory.filter((id) => id !== productId).slice(0, 19);
  browsingHistory.unshift(productId);
  localStorage.setItem('papjoy-history', JSON.stringify(browsingHistory));

  try {
    await fetch(apiUrl('/api/v1/history'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ productId }),
    });
  } catch (error) {
    console.warn('Failed to save viewed history:', error);
  }
}

async function renderRecommendations(productId) {
  const container = document.getElementById('recommendations-section');
  if (!container) return;

  try {
    const response = await fetch(apiUrl(`/api/v1/recommendations?productId=${encodeURIComponent(productId)}`), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) return;

    const data = await response.json();
    const items = Array.isArray(data.recommendations) ? data.recommendations : [];
    if (!items.length) {
      container.style.display = 'none';
      return;
    }

    container.innerHTML = `
      <h3>Recommended for you</h3>
      <div class="recommendation-grid">
        ${items.slice(0, 4).map((product) => `
          <div class="recommendation-card">
            <a href="/product-detail.html?id=${product.id || product._id}">
              <img src="${product.image || product.images?.[0] || ''}" alt="${product.name}" loading="lazy" />
              <h4>${product.name}</h4>
              <p>${formatCurrency(product.price)}</p>
            </a>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.warn('Failed to load recommendations:', error);
  }
}

function applyPromoCode() {
  const input = document.getElementById('promo-code');
  const message = document.getElementById('promo-message');
  const code = input?.value.toUpperCase().trim();

  if (!code) {
    if (message) {
      message.textContent = 'Please enter a promo code';
      message.className = 'promo-message error';
    }
    showToast('Please enter a promo code.');
    return;
  }

  if (!validPromoCodes[code]) {
    if (message) {
      message.textContent = 'Invalid promo code';
      message.className = 'promo-message error';
    }
    appliedPromoCode = '';
    localStorage.removeItem('papjoy-promo');
    showToast('Promo code is not valid.');
  } else {
    appliedPromoCode = code;
    localStorage.setItem('papjoy-promo', code);
    if (message) {
      message.textContent = `${validPromoCodes[code].label} applied!`;
      message.className = 'promo-message success';
    }
    if (input) input.value = code;
    showToast(`${validPromoCodes[code].label} applied.`);
  }

  updateCartSummary();
}

function renderSavedItems() {
  const section = document.getElementById('saved-items-section');
  const container = document.getElementById('saved-items');

  if (!container) return;

  if (savedItems.length === 0) {
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = 'block';

  container.innerHTML = savedItems
    .map(
      (item) => `
    <li class="saved-item">
      <div class="saved-item-meta">
        <div class="saved-item-avatar">
          <img src="${item.image || item.product?.image || 'https://via.placeholder.com/100'}" alt="${item.name}" loading="lazy" />
        </div>
        <div class="saved-item-content">
          <h4>${item.name}</h4>
          ${item.variant ? `<p class="saved-variant">${item.variant}</p>` : ''}
          <p class="saved-price">${formatCurrency(item.price)}</p>
        </div>
      </div>
      <div class="saved-actions">
        <button onclick="moveFromSaved(${JSON.stringify(item.id)}, ${JSON.stringify(item.variant || 'Standard')})" class="move-to-cart-btn">
          <i class="fas fa-cart-plus"></i> Cart
        </button>
        <button onclick="removeSavedItem(${JSON.stringify(item.id)}, ${JSON.stringify(item.variant || 'Standard')})" class="remove-saved-btn">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </li>
  `
    )
    .join('');
}

function checkout() {
  if (cart.length === 0) {
    showToast(translate('checkout.emptyCart'));
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    showToast('Sign in for faster checkout and better order tracking.');
  }

  window.location.href = 'checkout.html';
}

function setCheckoutMessage(message, isError = false) {
  const messageEl = document.getElementById('checkout-message');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.style.color = isError ? '#ff8b94' : '#d7d7ff';
}

function getCheckoutItems() {
  return cart.map((item) => ({
    id: item.id,
    productId: item.productId || item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    variant: item.variant || 'Standard',
    category: item.category,
    subtitle: item.subtitle,
  }));
}

async function startStripeCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addStripe'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.redirectStripe'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/stripe/session'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo: getDeliveryInfo() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.stripeFail'));
    }

    const { url } = await response.json();
    if (!url) {
      throw new Error(translate('error.stripeCheckoutUrl'));
    }

    window.location.href = url;
  } catch (error) {
    console.error('Stripe checkout error', error);
    setCheckoutMessage(translate('checkout.stripeRedirectFail'), true);
  }
}

async function startPayPalCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addPayPal'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.redirectPayPal'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/paypal/create'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo: getDeliveryInfo() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.paypalFail'));
    }

    const { approvalUrl } = await response.json();
    if (!approvalUrl) {
      throw new Error(translate('error.paypalApprovalUrl'));
    }

    window.location.href = approvalUrl;
  } catch (error) {
    console.error('PayPal checkout error', error);
    setCheckoutMessage(error.message || translate('checkout.paypalFail'), true);
  }
}

async function startRazorpayCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addRazorpay'), true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();

  setCheckoutMessage(translate('checkout.preparingRazorpay'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/razorpay/create'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: totals.total, items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.razorpayFail'));
    }

    const { order, key_id } = await response.json();
    if (!order || !key_id) {
      throw new Error(translate('error.razorpayOrderFailed'));
    }

    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    if (!window.Razorpay) {
      throw new Error('Razorpay SDK failed to load');
    }

    const options = {
      key: key_id,
      amount: order.amount,
      currency: 'INR',
      name: 'PAP-JOY',
      description: 'Complete your order with Razorpay',
      order_id: order.id,
      handler: async function (razorResponse) {
        try {
          const verifyData = {
            paymentId: razorResponse.razorpay_payment_id,
            orderId: razorResponse.razorpay_order_id,
            signature: razorResponse.razorpay_signature,
            products: getCheckoutItems(),
            amount: totals.total,
            shipping: totals.shipping,
            discount: totals.discount,
            tax: totals.tax,
            deliveryInfo
          };
          const verifyHeaders = { 'Content-Type': 'application/json' };
          if (token) verifyHeaders.Authorization = `Bearer ${token}`;
          const verifyResponse = await fetch(apiUrl('/api/v1/payments/razorpay/verify'), {
            method: 'POST',
            headers: verifyHeaders,
            body: JSON.stringify(verifyData),
          });

          if (!verifyResponse.ok) {
            const verifyData = await verifyResponse.json().catch(() => null);
            throw new Error(verifyData?.error || translate('checkout.verifyFail'));
          }
          const result = await verifyResponse.json();
          sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'razorpay', order: result.order }));
          cart = [];
          saveCart();
          syncCart();
          window.location.href = 'success.html?provider=razorpay';
        } catch (verifyError) {
          console.error('Razorpay verification failed', verifyError);
          setCheckoutMessage(verifyError.message || translate('checkout.verifyFail'), true);
        }
      },
      modal: {
        ondismiss: function () {
          setCheckoutMessage(translate('checkout.razorpayCanceled'), true);
        },
      },
      theme: {
        color: '#f5a442',
      },
    };

    const razorpay = new Razorpay(options);
    razorpay.open();
  } catch (error) {
    console.error('Razorpay checkout error', error);
    setCheckoutMessage(error.message || translate('checkout.razorpayStartFail'), true);
  }
}


async function submitWebOrder() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.webOrderEmpty'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.submittingOrder'));

  try {
    const deliveryInfo = getDeliveryInfo();
    const totals = getCartTotals();
    const orderData = {
      items: getCheckoutItems(),
      amount: totals.total,
      shipping: totals.shipping,
      discount: totals.discount,
      tax: totals.tax,
      currency: currentCurrency,
      deliveryInfo,
      paymentMethod: 'web'
    };
    const headers = getAuthHeaders();
    const response = await fetch(apiUrl('/api/v1/orders'), {
      method: 'POST',
      headers,
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.webFail'));
    }

    const result = await response.json();
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'web', order: result.order }));
    cart = [];
    saveCart();
    syncCart();
    window.location.href = 'success.html?provider=web';
  } catch (error) {
    console.error('Web order error', error);
    setCheckoutMessage(error.message || translate('checkout.webFail'), true);
  }
}

async function startCODCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before selecting COD.', true);
    return;
  }

  if (!validateDeliveryForm()) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const codNotes = document.getElementById('cod-notes').value.trim();
  const totals = getCartTotals();
  const codFee = 50;

  setCheckoutMessage('Processing Cash on Delivery order...');

  try {
    const orderData = {
      items: getCheckoutItems(),
      paymentMethod: 'cod',
      shipping: totals.shipping + codFee,
      discount: totals.discount,
      tax: totals.tax,
      deliveryInfo,
      codNotes
    };
    const headers = getAuthHeaders();
    const response = await fetch(apiUrl('/api/v1/orders'), {
      method: 'POST',
      headers,
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'COD order failed');
    }

    const result = await response.json();
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'cod', order: result.order }));
    cart = [];
    saveCart();
    syncCart();
    window.location.href = 'success.html?provider=cod';
  } catch (error) {
    console.error('COD order error', error);
    setCheckoutMessage(error.message || 'COD order failed. Please try again later.', true);
  }
}

async function startPaytmCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Paytm.', true);
    return;
  }

  setCheckoutMessage('Redirecting to Paytm...');
  // Simulate Paytm payment
  setTimeout(() => {
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'paytm', order: { id: 'simulated-paytm-' + Date.now() } }));
    cart = [];
    saveCart();
    syncCart();
    window.location.href = 'success.html?provider=paytm';
  }, 2000);
}

async function startCreditCardCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Credit Card.', true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  // Validate credit card form
  if (!validateCardForm('credit')) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const cardInfo = getCardInfo('credit');

  setCheckoutMessage('Processing credit card payment...');

  // Simulate payment processing
  setTimeout(async () => {
    try {
      const user = getCurrentUser();
      const orderData = { 
        items: getCheckoutItems(), 
        paymentMethod: 'creditcard',
        shipping: getCartTotals().shipping,
        discount: getCartTotals().discount,
        tax: getCartTotals().tax,
        deliveryInfo: deliveryInfo,
        cardInfo: cardInfo
      };
      if (user && user.id) {
        orderData.userId = user.id;
      }
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(apiUrl('/api/v1/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Credit card payment failed');
      }

      const result = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'creditcard', order: result.order }));
      cart = [];
      saveCart();
      syncCart();
      window.location.href = 'success.html?provider=creditcard';
    } catch (error) {
      console.error('Credit card payment error', error);
      setCheckoutMessage('Credit card payment failed. Please try again.', true);
    }
  }, 2000);
}

async function startDebitCardCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Debit Card.', true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  // Validate debit card form
  if (!validateCardForm('debit')) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const cardInfo = getCardInfo('debit');

  setCheckoutMessage('Processing debit card payment...');

  // Simulate payment processing
  setTimeout(async () => {
    try {
      const user = getCurrentUser();
      const orderData = { 
        items: getCheckoutItems(), 
        paymentMethod: 'debitcard',
        shipping: getCartTotals().shipping,
        discount: getCartTotals().discount,
        tax: getCartTotals().tax,
        deliveryInfo: deliveryInfo,
        cardInfo: cardInfo
      };
      if (user && user.id) {
        orderData.userId = user.id;
      }
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(apiUrl('/api/v1/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Debit card payment failed');
      }

      const result = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'debitcard', order: result.order }));
      cart = [];
      saveCart();
      syncCart();
      window.location.href = 'success.html?provider=debitcard';
    } catch (error) {
      console.error('Debit card payment error', error);
      setCheckoutMessage('Debit card payment failed. Please try again.', true);
    }
  }, 2000);
}

function validateCardForm(type) {
  const number = document.getElementById(`${type}-number`).value.trim();
  const expiry = document.getElementById(`${type}-expiry`).value.trim();
  const cvv = document.getElementById(`${type}-cvv`).value.trim();
  const name = document.getElementById(`${type}-name`).value.trim();

  if (!number || !expiry || !cvv || !name) {
    setCheckoutMessage('Please fill in all card details.', true);
    return false;
  }

  // Basic validation
  const cardNumberRegex = /^\d{4}\s?\d{4}\s?\d{4}\s?\d{4}$/;
  if (!cardNumberRegex.test(number.replace(/\s/g, ''))) {
    setCheckoutMessage('Please enter a valid card number.', true);
    return false;
  }

  const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!expiryRegex.test(expiry)) {
    setCheckoutMessage('Please enter a valid expiry date (MM/YY).', true);
    return false;
  }

  if (cvv.length < 3 || cvv.length > 4) {
    setCheckoutMessage('Please enter a valid CVV.', true);
    return false;
  }

  return true;
}

function getCardInfo(type) {
  return {
    number: document.getElementById(`${type}-number`).value.trim(),
    expiry: document.getElementById(`${type}-expiry`).value.trim(),
    cvv: document.getElementById(`${type}-cvv`).value.trim(),
    name: document.getElementById(`${type}-name`).value.trim()
  };
}

// Card input formatting
function formatCardNumber(input) {
  let value = input.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  let formattedValue = '';
  for (let i = 0; i < value.length; i++) {
    if (i > 0 && i % 4 === 0) {
      formattedValue += ' ';
    }
    formattedValue += value[i];
  }
  input.value = formattedValue;
}

function formatExpiry(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length >= 2) {
    value = value.substring(0, 2) + '/' + value.substring(2, 4);
  }
  input.value = value;
}

// Initialize card formatting
function initCardFormatting() {
  const cardInputs = ['credit-number', 'debit-number'];
  const expiryInputs = ['credit-expiry', 'debit-expiry'];
  
  cardInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => formatCardNumber(input));
    }
  });
  
  expiryInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => formatExpiry(input));
    }
  });
}

// GPS Tracking Functions
let trackingInterval;

function initTrackingPage() {
  const trackingForm = document.getElementById('tracking-form');
  const trackingMessage = document.getElementById('tracking-message');
  const orderIdInput = document.getElementById('order-id');
  const emailInput = document.getElementById('tracking-email');
  const user = getCurrentUser();
  const params = getQueryParams();

  if (!trackingForm) return;

  if (user?.email && emailInput && !emailInput.value) {
    emailInput.value = user.email;
  }

  if (params.order) {
    orderIdInput.value = params.order;
  }

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    const orderId = orderIdInput.value.trim();
    const email = emailInput.value.trim();

    if (!orderId || !email) {
      showTrackingMessage('Please enter both Order ID and Email.', true);
      return;
    }

    showTrackingMessage('Searching for your order...');

    try {
      const order = await findOrder(orderId, email);
      if (order) {
        displayTrackingResults(order);
        startGPSTracking();
        showTrackingMessage('Order status loaded successfully.');
      } else {
        showTrackingMessage('Order not found. Please check your Order ID and Email.', true);
      }
    } catch (error) {
      console.error('Tracking error:', error);
      showTrackingMessage('Unable to track order. Please try again later.', true);
    }
  };

  trackingForm.addEventListener('submit', handleSubmit);

  if (params.order && emailInput.value) {
    setTimeout(() => trackingForm.requestSubmit?.() ?? trackingForm.dispatchEvent(new Event('submit', { cancelable: true })), 250);
  }
}

async function findOrder(orderId, email) {
  const savedOrder = getLocalOrder(orderId, email);

  try {
    const tracking = await loadOrderTracking(orderId);
    if (tracking) {
      return {
        id: tracking.orderId || orderId,
        email: email,
        status: tracking.status || 'pending',
        shipment: tracking.shipment || null,
        estimatedDelivery: tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : null,
        placedAt: tracking.createdAt ? new Date(tracking.createdAt) : (savedOrder ? new Date(savedOrder.placedAt) : new Date()),
      };
    }
  } catch (error) {
    console.warn('Remote tracking lookup failed, falling back to local order if available.', error);
  }

  if (savedOrder) {
    return {
      ...savedOrder,
      placedAt: new Date(savedOrder.placedAt),
      estimatedDelivery: savedOrder.estimatedDelivery ? new Date(savedOrder.estimatedDelivery) : null,
    };
  }

  if (orderId && /\d/.test(orderId)) {
    return {
      id: orderId,
      email: email,
      status: 'out_for_delivery',
      placedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000),
      shipment: {
        status: 'out_for_delivery',
        trackingUrl: '',
        carrier: 'Local Delivery',
        timeline: [
          { label: 'Order Placed', date: new Date(Date.now() - 2 * 60 * 60 * 1000), completed: true },
          { label: 'Processing', date: new Date(Date.now() - 90 * 60 * 1000), completed: true },
          { label: 'Out for Delivery', date: new Date(Date.now() - 10 * 60 * 1000), current: true },
          { label: 'Delivered', date: new Date(Date.now() + 45 * 60 * 1000) }
        ]
      },
      currentLocation: {
        address: 'Sector 18, Noida',
      },
      distance: 2.3,
      driver: {
        name: 'Rajesh Kumar',
        phone: '+91 98765 43210',
      },
    };
  }

  return null;
}

function displayTrackingResults(order) {
  const resultsDiv = document.getElementById('tracking-results');
  const orderNumber = document.getElementById('order-number');
  const orderDate = document.getElementById('order-date');
  const timelineContainer = document.querySelector('.status-timeline');
  const trackingData = order.shipment || order;

  // Update order info
  orderNumber.textContent = `Order #${order.id}`;
  orderDate.textContent = `Placed on: ${order.placedAt.toLocaleDateString()}`;
  
  // Render timeline using backend or local shipment details
  if (timelineContainer) {
    timelineContainer.innerHTML = renderTrackingTimeline(trackingData);
  }

  // Update timeline based on status
  updateTimelineStatus(order.shipment?.status || order.status || 'processing');
  
  // Show invoice action when order ID is available
  const invoiceActions = document.getElementById('tracking-invoice-actions');
  const invoiceButton = document.getElementById('tracking-invoice-button');
  if (invoiceActions && invoiceButton && order.id) {
    window.currentTrackingOrder = order;
    invoiceButton.onclick = () => downloadOrderInvoice(order.id);
    invoiceActions.style.display = 'flex';
  }

  // Show results
  resultsDiv.style.display = 'block';
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
  
  // Update tracking details
  updateTrackingDetails(order);
}

function updateTimelineStatus(status) {
  const timelineItems = document.querySelectorAll('.timeline-item, .timeline-step');
  
  // Reset all items
  timelineItems.forEach(item => {
    item.classList.remove('completed', 'active', 'pending', 'current');
    item.classList.add('pending');
  });
  
  // Set status based on order status
  const statusMap = {
    'placed': 0,
    'processing': 1,
    'out_for_delivery': 2,
    'delivered': 3
  };
  
  const currentStep = statusMap[status] || 0;
  
  timelineItems.forEach((item, index) => {
    if (index < currentStep) {
      item.classList.remove('pending');
      item.classList.add('completed');
    } else if (index === currentStep) {
      item.classList.remove('pending');
      item.classList.add('active');
    }
  });
}

function updateTrackingDetails(order) {
  const currentLocation = document.getElementById('current-location');
  const distanceRemaining = document.getElementById('distance-remaining');
  const eta = document.getElementById('eta');
  const driverContact = document.getElementById('driver-contact');
  const trackingSource = order.shipment || order;
  const locationAddress = trackingSource.currentLocation?.address || trackingSource.location?.address || 'Unknown location';
  const distanceValue = typeof trackingSource.distance === 'number' ? trackingSource.distance : parseFloat(trackingSource.distance) || null;
  const etaDate = trackingSource.estimatedDelivery ? new Date(trackingSource.estimatedDelivery) : null;
  const driverPhone = trackingSource.driver?.phone || order.driver?.phone || 'Unknown';

  if (currentLocation) {
    currentLocation.textContent = locationAddress;
  }
  if (distanceRemaining) {
    distanceRemaining.textContent = distanceValue != null ? `${distanceValue} km` : 'Unknown';
  }
  if (eta) {
    eta.textContent = etaDate ? etaDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
  }
  if (driverContact) {
    driverContact.textContent = driverPhone;
  }
}

function startGPSTracking() {
  // Clear any existing interval
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }
  
  // Simulate GPS movement every 30 seconds
  trackingInterval = setInterval(() => {
    updateGPSPosition();
  }, 30000);
  
  // Initial update
  updateGPSPosition();
}

function updateGPSPosition() {
  // Simulate movement towards destination
  const deliveryTruck = document.getElementById('delivery-truck');
  const currentLocation = document.getElementById('current-location');
  const distanceRemaining = document.getElementById('distance-remaining');
  const eta = document.getElementById('eta');
  
  // Simulate decreasing distance
  const distanceText = distanceRemaining.textContent.replace(/[^0-9.]/g, '');
  const currentDistance = parseFloat(distanceText) || 0;
  const newDistance = Math.max(0, currentDistance - 0.1);
  
  distanceRemaining.textContent = `${newDistance.toFixed(1)} km`;
  
  // Update location based on distance
  const locations = [
    'Sector 18, Noida',
    'Sector 15, Noida', 
    'Sector 12, Noida',
    'Crossing Republic, Ghaziabad',
    'Your Location'
  ];
  
  const locationIndex = Math.min(4, Math.floor((2.3 - newDistance) / 0.5));
  currentLocation.textContent = locations[locationIndex];
  
  // Update ETA
  const minutesRemaining = Math.max(1, Math.round(newDistance * 15)); // ~15 min per km
  const etaTime = new Date(Date.now() + minutesRemaining * 60 * 1000);
  eta.textContent = etaTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  // Add tracking update
  if (newDistance < 2.2 && newDistance > 2.0) {
    addTrackingUpdate('📍 Delivery vehicle has entered your area.');
  } else if (newDistance < 1.0 && newDistance > 0.8) {
    addTrackingUpdate('🚚 Your order is very close! Driver will arrive soon.');
  } else if (newDistance < 0.1) {
    addTrackingUpdate('✅ Order delivered successfully!');
    clearInterval(trackingInterval);
  }
}

function addTrackingUpdate(message) {
  const updatesList = document.getElementById('updates-list');
  const updateItem = document.createElement('div');
  updateItem.className = 'update-item';
  
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  updateItem.innerHTML = `
    <div class="update-time">${timeString}</div>
    <div class="update-content">
      <p>${message}</p>
    </div>
  `;
  
  // Insert at the beginning
  updatesList.insertBefore(updateItem, updatesList.firstChild);
}

function showTrackingMessage(message, isError = false) {
  const messageEl = document.getElementById('tracking-message');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.style.color = isError ? '#ff8b94' : '#d7d7ff';
    messageEl.style.display = 'block';
  }
}

async function startUPICheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with UPI.', true);
    return;
  }

  setCheckoutMessage('Redirecting to UPI payment...');
  // Simulate UPI payment
  setTimeout(() => {
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'upi', order: { id: 'simulated-upi-' + Date.now() } }));
    cart = [];
    saveCart();
    syncCart();
    window.location.href = 'success.html?provider=upi';
  }, 2000);
}

function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

async function renderInvoicePreviewPage() {
  const params = getQueryParams();
  const orderId = params.orderId;
  const guestEmail = params.email;
  const previewContainer = document.getElementById('invoice-preview-container');
  const previewMessage = document.getElementById('invoice-preview-message');
  const previewTitle = document.getElementById('invoice-preview-title');

  if (!previewContainer || !previewMessage || !previewTitle) return;

  if (!orderId) {
    previewMessage.textContent = 'Missing order ID for invoice preview.';
    previewMessage.style.color = 'red';
    return;
  }

  const token = getAuthToken();
  if (!token && !guestEmail) {
    previewMessage.textContent = 'Please sign in to view this invoice.';
    previewMessage.style.color = 'red';
    return;
  }

  try {
    previewTitle.textContent = `Invoice Preview for Order ${orderId}`;
    const url = new URL(`${API_BASE_URL}/api/v1/invoices/${orderId}`);
    if (!token && guestEmail) {
      url.searchParams.set('email', guestEmail);
    }
    const response = await fetch(url.toString(), {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Unable to load invoice');
    }

    const invoice = await response.json();
    const invoiceData = invoice.invoice || invoice;
    const rows = (invoiceData.items || []).map((item) => `
      <tr>
        <td>${item.productName || item.name || 'Item'}</td>
        <td>${item.quantity || 1}</td>
        <td>${formatCurrency(item.unitPrice || item.price || 0)}</td>
        <td>${item.gstRate != null ? item.gstRate + '%' : '—'}</td>
        <td>${formatCurrency(item.total || 0)}</td>
      </tr>
    `).join('');

    previewContainer.innerHTML = `
      <div class="invoice-summary">
        <div><strong>Invoice #</strong> ${invoiceData.invoiceNumber || invoiceData.orderNumber || ''}</div>
        <div><strong>Status</strong> ${invoiceData.status || 'issued'}</div>
        <div><strong>Payment</strong> ${invoiceData.paymentStatus || 'pending'}</div>
        <div><strong>Total</strong> ${formatCurrency(invoiceData.total || 0)}</div>
      </div>
      <section class="invoice-details">
        <div class="invoice-block">
          <h3>Customer</h3>
          <p>${invoiceData.customerName || invoiceData.billingAddress?.name || ''}</p>
          <p>${invoiceData.customerEmail || ''}</p>
          <p>${invoiceData.customerPhone || ''}</p>
        </div>
        <div class="invoice-block">
          <h3>Billing Address</h3>
          <p>${invoiceData.billingAddress?.street || ''}</p>
          <p>${invoiceData.billingAddress?.city || ''} ${invoiceData.billingAddress?.state || ''}</p>
          <p>${invoiceData.billingAddress?.zipCode || ''} ${invoiceData.billingAddress?.country || ''}</p>
        </div>
        <div class="invoice-block">
          <h3>Seller</h3>
          <p>${invoiceData.companyName || 'PAP-JOY'}</p>
          <p>${invoiceData.companyGSTIN || '09CZDPK9498Q1Z2'}</p>
          <p>${invoiceData.companyEmail || 'support@papjoy.com'}</p>
        </div>
      </section>
      <table class="invoice-table">
        <thead>
          <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>GST</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="invoice-total">
        <div>Subtotal: ${formatCurrency(invoiceData.subtotal || 0)}</div>
        <div>CGST: ${formatCurrency(invoiceData.cgstTotal || 0)}</div>
        <div>SGST: ${formatCurrency(invoiceData.sgstTotal || 0)}</div>
        <div>GST: ${formatCurrency(invoiceData.taxTotal || invoiceData.tax || 0)}</div>
        <div>Shipping: ${formatCurrency(invoiceData.shippingCharges || invoiceData.shipping || 0)}</div>
        <div>Discount: ${formatCurrency(invoiceData.discount || 0)}</div>
        <strong>Total: ${formatCurrency(invoiceData.total || 0)}</strong>
      </div>
      <button class="checkout-button" onclick="downloadOrderInvoice('${orderId}')">Download PDF</button>
    `;
    previewMessage.textContent = '';
  } catch (error) {
    console.error('Invoice preview error:', error);
    previewMessage.textContent = error.message || 'Failed to load invoice preview.';
    previewMessage.style.color = 'red';
  }
}

function renderCheckoutItems() {
  const container = document.getElementById('checkout-items');
  if (!container) return;

  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = `<div class="checkout-item">${translate('cart.empty')}</div>`;
    return;
  }

  cart.forEach((item) => {
    const itemRow = document.createElement('div');
    itemRow.className = 'checkout-item';
    itemRow.innerHTML = `
      <span>${item.name} × ${item.quantity}</span>
      <span>${formatCurrency(item.price * item.quantity)}</span>
    `;
    container.appendChild(itemRow);
  });
}

function renderSuccessDetails(order) {
  const container = document.getElementById('success-details');
  if (!container || !order) return;

  container.innerHTML = '';
  const providerKey = (order.provider || 'web').toLowerCase();
  const readableProvider = translate(`provider.${providerKey}`) || order.provider || translate('provider.web');
  const summary = [
    { label: translate('success.summaryProvider'), value: readableProvider },
    { label: translate('success.summaryOrderId'), value: order._id || order.id || 'N/A' },
    { label: translate('success.summaryPaymentId'), value: order.paymentId || 'N/A' },
    { label: translate('success.summaryStatus'), value: order.status || 'Completed' },
    { label: translate('success.summaryAmount'), value: order.amount ? formatCurrency(order.amount) : 'N/A' },
  ];

  summary.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'receipt-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(row);
  });

  if (Array.isArray(order.products) && order.products.length > 0) {
    const listTitle = document.createElement('h3');
      listTitle.textContent = translate('success.summaryItems');
    order.products.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'receipt-row';
      row.innerHTML = `<span>${item.name} × ${item.quantity}</span><strong>${formatCurrency(item.price * item.quantity)}</strong>`;
      container.appendChild(row);
    });
  }

  // Invoice button: open preview page with auth or guest email as needed
  const invoiceBtn = document.createElement('button');
  invoiceBtn.className = 'checkout-button';
  invoiceBtn.textContent = translate('success.viewInvoice') || 'View Invoice';
  invoiceBtn.addEventListener('click', () => {
    const orderId = order._id || order.id;
    if (!orderId) return showToast('Invoice not available');
    const previewUrl = new URL('invoice-preview.html', window.location.href);
    previewUrl.searchParams.set('orderId', orderId);
    const guestEmail = order.email || order.customerEmail || order.userEmail || order.billingAddress?.email || order.shippingAddress?.email;
    if (!getAuthToken() && guestEmail) {
      previewUrl.searchParams.set('email', guestEmail);
    }
    window.open(previewUrl.toString(), '_blank');
  });
  container.appendChild(document.createElement('hr'));
  container.appendChild(invoiceBtn);
}

let paymentProviders = null;

async function loadPaymentConfig() {
  try {
    const response = await fetch(apiUrl('/api/v1/payments/config'));
    if (response.ok) {
      paymentProviders = await response.json();
      const cards = document.querySelectorAll('.payment-card');
      cards.forEach((card) => {
        const button = card.querySelector('.checkout-button');
        if (!button) return;
        const action = button.getAttribute('onclick') || '';
        if (action.includes('startStripe') && paymentProviders && !paymentProviders.stripe?.enabled) {
          button.disabled = true; button.textContent = 'Stripe unavailable';
        }
        if (action.includes('startPayPal') && paymentProviders && !paymentProviders.paypal?.enabled) {
          button.disabled = true; button.textContent = 'PayPal unavailable';
        }
        if (action.includes('startRazorpay') && paymentProviders && !paymentProviders.razorpay?.enabled) {
          button.disabled = true; button.textContent = 'Razorpay unavailable';
        }
      });
    }
  } catch (error) {
    console.warn('Payment config unavailable, showing all options:', error);
  }
}

async function loadCheckoutAddresses() {
  const container = document.getElementById('checkout-addresses');
  if (!container) return;
  try {
    const addresses = await loadUserAddresses();
    if (!addresses || !addresses.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '<p style="margin-bottom:0.5rem;font-size:0.85rem;opacity:0.7;">Saved addresses:</p>' +
      addresses.map((addr, i) => `<button type="button" class="checkout-button secondary" style="margin:0.25rem;padding:0.4rem 0.75rem;font-size:0.8rem;" onclick="fillAddressFromSaved(${i})">${addr.name || 'Address ' + (i+1)}${addr.isDefault ? ' ★' : ''}</button>`).join('');
    window.__checkoutAddresses = addresses;
  } catch (error) {
    console.warn('Failed to load saved addresses:', error);
  }
}

function fillAddressFromSaved(index) {
  const addresses = window.__checkoutAddresses;
  if (!addresses || !addresses[index]) return;
  const addr = addresses[index];
  const nameEl = document.getElementById('delivery-fullname');
  const phoneEl = document.getElementById('delivery-phone');
  const streetEl = document.getElementById('delivery-address');
  const cityEl = document.getElementById('delivery-city');
  const stateEl = document.getElementById('delivery-state');
  const postalEl = document.getElementById('delivery-postal');
  const countryEl = document.getElementById('delivery-country');
  if (nameEl) nameEl.value = addr.name || '';
  if (phoneEl) phoneEl.value = addr.phone || '';
  if (streetEl) streetEl.value = addr.street || '';
  if (cityEl) cityEl.value = addr.city || '';
  if (stateEl) stateEl.value = addr.state || '';
  if (postalEl) postalEl.value = addr.zipCode || '';
  if (countryEl) countryEl.value = addr.country || 'India';
}

async function renderCheckoutPage() {
  renderCheckoutItems();
  updateCartSummary();
  updateCheckoutSummary();
  
  const gpsButton = document.getElementById('fill-delivery-address-btn');
  if (gpsButton) {
    gpsButton.removeEventListener('click', fillDeliveryAddressWithGPS);
    gpsButton.addEventListener('click', fillDeliveryAddressWithGPS);
  }
  
  const user = getCurrentUser();
  const signinPrompt = document.getElementById('signin-prompt');
  if (!user && signinPrompt) {
    signinPrompt.style.display = 'block';
  }
  
  if (user) {
    loadDeliveryInfo();
    await loadCheckoutAddresses();
  }
  
  await loadPaymentConfig();
  
  initCardFormatting();
  
  const params = getQueryParams();
  if (params.checkout === 'canceled') {
    setCheckoutMessage(translate('checkout.orderCanceled'), true);
  }
  if (params.paypal === 'canceled') {
    setCheckoutMessage(translate('checkout.paypalCanceled'), true);
  }
  if (params.payment === 'failed') {
    setCheckoutMessage(translate('checkout.paymentFailed'), true);
  }
}

function loadDeliveryInfo() {
  const user = getCurrentUser();
  if (!user) return;
  
  // Load from user shipping address if available
  document.getElementById('delivery-fullname').value = user.shippingAddress?.fullName || '';
  document.getElementById('delivery-phone').value = user.shippingAddress?.phone || '';
  document.getElementById('delivery-address').value = user.shippingAddress?.line1 || '';
  document.getElementById('delivery-city').value = user.shippingAddress?.city || '';
  document.getElementById('delivery-state').value = user.shippingAddress?.state || '';
  document.getElementById('delivery-postal').value = user.shippingAddress?.postalCode || '';
  document.getElementById('delivery-country').value = user.shippingAddress?.country || 'India';
  document.getElementById('delivery-instructions').value = user.deliveryPreferences?.instructions || '';
}

async function fillDeliveryAddressWithGPS() {
  if (!navigator.geolocation) {
    setCheckoutMessage('Your browser does not support GPS location.', true);
    return;
  }

  setCheckoutMessage('Fetching your current location...');

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 15000,
      });
    });

    const { latitude, longitude } = position.coords;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const response = await fetchWithTimeout(url, { timeout: 10000 });

    if (!response.ok) {
      throw new Error('Unable to resolve address from GPS coordinates.');
    }

    const data = await response.json();
    const address = data.address || {};

    const streetParts = [
      address.road,
      address.neighbourhood,
      address.suburb,
      address.village,
      address.town,
      address.city,
    ].filter(Boolean);

    document.getElementById('delivery-address').value = streetParts.join(', ') || data.display_name || '';
    document.getElementById('delivery-city').value = address.city || address.town || address.village || address.county || '';
    document.getElementById('delivery-state').value = address.state || address.region || '';
    document.getElementById('delivery-postal').value = address.postcode || '';
    document.getElementById('delivery-country').value = address.country || 'India';

    setCheckoutMessage('Address autofill complete. Please verify the fields before checkout.');
  } catch (error) {
    console.error('GPS autofill failed:', error);
    setCheckoutMessage('Unable to autofill address from GPS location. Please enter your delivery address manually.', true);
  }
}

function showCODForm() {
  const codForm = document.getElementById('cod-form');
  const totals = getCartTotals();
  const codAmount = document.getElementById('cod-amount');
  
  if (codForm.style.display === 'none' || codForm.style.display === '') {
    codForm.style.display = 'block';
    codAmount.value = formatCurrency(totals.total + 50);
  } else {
    codForm.style.display = 'none';
  }
}

function getDeliveryInfo() {
  const fullName = document.getElementById('delivery-fullname')?.value.trim() || '';
  const phone = document.getElementById('delivery-phone')?.value.trim() || '';
  const address = document.getElementById('delivery-address')?.value.trim() || '';
  const city = document.getElementById('delivery-city')?.value.trim() || '';
  const state = document.getElementById('delivery-state')?.value.trim() || '';
  const postalCode = document.getElementById('delivery-postal')?.value.trim() || '';
  const country = document.getElementById('delivery-country')?.value.trim() || 'India';
  const instructions = document.getElementById('delivery-instructions')?.value.trim() || '';
  return { fullName, phone, address, city, state, postalCode, country, instructions };
}

function showCreditForm() {
  const creditForm = document.getElementById('credit-form');
  if (creditForm.style.display === 'none' || creditForm.style.display === '') {
    creditForm.style.display = 'block';
  } else {
    creditForm.style.display = 'none';
  }
}

function showDebitForm() {
  const debitForm = document.getElementById('debit-form');
  if (debitForm.style.display === 'none' || debitForm.style.display === '') {
    debitForm.style.display = 'block';
  } else {
    debitForm.style.display = 'none';
  }
}

function validateDeliveryForm() {
  const requiredFields = [
    'delivery-fullname',
    'delivery-phone', 
    'delivery-address',
    'delivery-city',
    'delivery-state',
    'delivery-postal',
    'delivery-country'
  ];
  
  for (const fieldId of requiredFields) {
    const field = document.getElementById(fieldId);
    if (!field.value.trim()) {
      setCheckoutMessage(`Please fill in all required delivery information.`, true);
      field.focus();
      return false;
    }
  }
  return true;
}

async function renderSuccessPage() {
  const params = getQueryParams();
  const statusEl = document.getElementById('success-status');
  const storedOrder = sessionStorage.getItem('papjoy-order');

  if (!statusEl) return;

  // Show loading state
  statusEl.textContent = translate('success.processing');
  statusEl.style.color = '#666';

  try {
    if (params.provider === 'stripe' && params.session_id) {
      const response = await fetch(apiUrl('/api/v1/payments/stripe/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: params.session_id, items: getCheckoutItems() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || translate('error.stripeOrderConfirmationFailed'));
      }
      const { order } = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'stripe', order }));
      clearCart();
      renderSuccessDetails(order);
      statusEl.textContent = translate('success.stripeComplete');
      statusEl.style.color = '#4CAF50';
      return;
    }

    if (params.provider === 'paypal' && (params.token || params.orderId)) {
      const orderId = params.token || params.orderId;
      const response = await fetch(apiUrl('/api/v1/payments/paypal/capture'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, items: getCheckoutItems() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || translate('error.paypalOrderCaptureFailed'));
      }
      const { order } = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'paypal', order }));
      clearCart();
      renderSuccessDetails(order);
      statusEl.textContent = translate('success.paypalComplete');
      statusEl.style.color = '#4CAF50';
      return;
    }

    if (params.provider === 'web' && storedOrder) {
      const { order } = JSON.parse(storedOrder);
      renderSuccessDetails(order);
      clearCart();
      statusEl.textContent = translate('success.orderPlaced');
      statusEl.style.color = '#4CAF50';
      sessionStorage.removeItem('papjoy-order');
      return;
    }

    if (storedOrder) {
      const { order } = JSON.parse(storedOrder);
      renderSuccessDetails(order);
      clearCart();
      statusEl.textContent = translate('success.orderComplete');
      statusEl.style.color = '#4CAF50';
      sessionStorage.removeItem('papjoy-order');
      return;
    }

    statusEl.textContent = translate('success.noInfo');
    statusEl.style.color = '#FF9800';
  } catch (error) {
    console.error('Success page error:', error);
    statusEl.textContent = error.message || translate('error.verifyOrder');
    statusEl.style.color = '#F44336';

    // Show user-friendly error message
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.innerHTML = `
      <p>${translate('error.orderProcessing')}</p>
      <p><small>${error.message}</small></p>
      <button onclick="window.location.href='/'" class="btn btn-primary">${translate('error.returnHome')}</button>
    `;
    statusEl.parentNode.appendChild(errorContainer);
  }
}

async function renderSignInPage() {
  const user = getCurrentUser();
  const statusMessage = document.getElementById('auth-message');
  const signinForm = document.getElementById('auth-form');

  if (user) {
    if (statusMessage) {
      statusMessage.textContent = translate('signin.alreadySignedIn').replace('{email}', user.email);
      statusMessage.style.color = '#d7d7ff';
    }
    setTimeout(() => {
      window.location.href = 'account.html';
    }, 1200);
    return;
  }

  if (!signinForm) return;

  const passwordToggle = document.getElementById('password-toggle');
  const passwordInput = document.getElementById('password');
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      passwordToggle.textContent = translate(show ? 'signin.hidePassword' : 'signin.showPassword');
      passwordToggle.setAttribute('aria-label', translate(show ? 'signin.hidePassword' : 'signin.showPassword'));
    });
  }

  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
      if (statusMessage) {
        statusMessage.textContent = translate('signin.enterCredentials');
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = translate('signin.loggingIn');
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const remember = document.getElementById('remember')?.checked;
        const { response, data } = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (statusMessage) {
          statusMessage.textContent = data?.error || data?.message || translate('signin.invalidCredentials');
          statusMessage.style.color = '#ff8b94';
        }
        return;
      }

      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (statusMessage) {
        statusMessage.textContent = translate('signin.welcomeBack').replace('{email}', userData.email || email);
        statusMessage.style.color = '#d7d7ff';
      }

      setTimeout(() => {
        window.location.href = 'account.html';
      }, 1000);
    } catch (error) {
      console.error('Sign in error:', error);
      if (statusMessage) {
        statusMessage.textContent = translate('signin.loginError');
        statusMessage.style.color = '#ff8b94';
      }
    }
  });

  await initGoogleSignIn('google-signin-button', 'remember');
}

async function renderSignUpPage() {
  const user = getCurrentUser();
  const signupForm = document.getElementById('signup-form');
  const signupMessage = document.getElementById('signup-message');
  const signupPassword = document.getElementById('signup-password');
  const confirmPassword = document.getElementById('confirm-password');
  const signupPasswordToggle = document.getElementById('signup-password-toggle');
  const confirmPasswordToggle = document.getElementById('confirm-password-toggle');
  const passwordStrengthFill = document.getElementById('signup-password-strength-fill');
  const passwordStrengthText = document.getElementById('signup-password-strength-text');

  function updatePasswordStrength(value) {
    if (!passwordStrengthFill || !passwordStrengthText) return;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;

    const strengthMap = [
      { label: 'Very weak', width: '12%', color: '#d9534f' },
      { label: 'Weak', width: '28%', color: '#f0ad4e' },
      { label: 'Fair', width: '48%', color: '#f7c948' },
      { label: 'Strong', width: '72%', color: '#5bc0de' },
      { label: 'Very strong', width: '100%', color: '#4caf50' }
    ];
    const state = strengthMap[Math.max(0, Math.min(strengthMap.length - 1, score - 1))];
    passwordStrengthFill.style.width = state.width;
    passwordStrengthFill.style.background = state.color;
    passwordStrengthText.textContent = value ? `${state.label} password` : 'Use 8+ characters with a mix of letters, numbers, and symbols.';
  }

  function toggleVisibility(input) {
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  if (signupPasswordToggle && signupPassword) {
    signupPasswordToggle.addEventListener('click', () => toggleVisibility(signupPassword));
    signupPassword.addEventListener('input', () => updatePasswordStrength(signupPassword.value));
    updatePasswordStrength(signupPassword.value);
  }

  if (confirmPasswordToggle && confirmPassword) {
    confirmPasswordToggle.addEventListener('click', () => toggleVisibility(confirmPassword));
  }

  if (user) {
    if (signupMessage) {
      signupMessage.textContent = translate('signup.success');
      signupMessage.style.color = '#d7d7ff';
    }
    setTimeout(() => {
      window.location.href = 'account.html';
    }, 1200);
    return;
  }

  if (!signupForm) return;

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const confirmPasswordValue = document.getElementById('confirm-password').value.trim();

    if (!email || !password || !name || !phone) {
      if (signupMessage) {
        signupMessage.textContent = translate('signup.missingFields') || 'Please fill in all required fields.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) {
      if (signupMessage) {
        signupMessage.textContent = 'Enter a valid phone number.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password.length < 8) {
      if (signupMessage) {
        signupMessage.textContent = 'Password must be at least 8 characters long.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password !== confirmPasswordValue) {
      if (signupMessage) {
        signupMessage.textContent = translate('signup.passwordMismatch');
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (signupMessage) {
      signupMessage.textContent = translate('signup.registering');
      signupMessage.style.color = '#d7d7ff';
    }

    try {
      const remember = document.getElementById('remember-signup')?.checked;
      const { response, data } = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, phone, marketingOptIn: document.getElementById('marketing')?.checked }),
      });

      if (!response.ok) {
        if (signupMessage) {
          signupMessage.textContent = data?.error || data?.message || translate('signup.registerError');
          signupMessage.style.color = '#ff8b94';
        }
        return;
      }

      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (signupMessage) {
        signupMessage.textContent = translate('signup.success');
        signupMessage.style.color = '#4caf50';
      }
      setTimeout(() => {
        window.location.href = 'account.html';
      }, 1200);
    } catch (error) {
      console.error('Signup error:', error);
      if (signupMessage) {
        signupMessage.textContent = translate('signup.registerError');
        signupMessage.style.color = '#ff8b94';
      }
    }
  });

  await initGoogleSignIn('google-signup-button', 'remember-signup');
}

async function renderForgotPasswordPage() {
  const form = document.getElementById('forgot-password-form');
  const statusMessage = document.getElementById('auth-message');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) {
      if (statusMessage) {
        statusMessage.textContent = 'Please enter your email address.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = 'Sending password reset link...';
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to send reset link.');
      }
      if (statusMessage) {
        statusMessage.innerHTML = `If that email exists, a reset link is ready. <br /><strong>Reset link:</strong> <a href="${data.resetUrl}">${data.resetUrl}</a>`;
        statusMessage.style.color = '#4CAF50';
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      if (statusMessage) {
        statusMessage.textContent = error.message || 'Unable to send reset link.';
        statusMessage.style.color = '#ff8b94';
      }
    }
  });
}

async function renderResetPasswordPage() {
  const form = document.getElementById('reset-password-form');
  const statusMessage = document.getElementById('auth-message');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    if (statusMessage) {
      statusMessage.textContent = 'Invalid reset link. Please request a new password reset.';
      statusMessage.style.color = '#ff8b94';
    }
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();

    if (!password || !confirmPassword) {
      if (statusMessage) {
        statusMessage.textContent = 'Please enter and confirm your new password.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password !== confirmPassword) {
      if (statusMessage) {
        statusMessage.textContent = 'Passwords do not match.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = 'Resetting password...';
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }
      if (statusMessage) {
        statusMessage.textContent = 'Password reset successfully. You may now sign in.';
        statusMessage.style.color = '#4CAF50';
      }
      setTimeout(() => {
        window.location.href = 'signin.html';
      }, 1600);
    } catch (error) {
      console.error('Reset password error:', error);
      if (statusMessage) {
        statusMessage.textContent = error.message || 'Unable to reset password.';
        statusMessage.style.color = '#ff8b94';
      }
    }
  });
}

async function loadUserOrders() {
  const orderTableEl = document.querySelector('.order-table');
  const ordersContainer = document.getElementById('orders-container');
  const user = getCurrentUser();
  const currentUserId = user?.id || user?._id;
  if (!user || !currentUserId) {
    if (orderTableEl) {
      orderTableEl.innerHTML = `
        <div class="order-table-head">
          <span>Sales Order #</span>
          <span>Order Date</span>
          <span>Shipping Status</span>
          <span>Total</span>
        </div>
        <div class="order-row">
          <span class="muted-text">Please sign in to view your orders</span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    }
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>Please sign in to view your orders.</p>
        </div>
      `;
    }
    return [];
  }

  const email = user.email?.toLowerCase();
  let orders = [];
  const token = getAuthToken();

  if (token) {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const response = await fetch(`${API_BASE_URL}/api/v1/orders`, { headers });
      if (response.ok) {
        const json = await response.json();
        orders = Array.isArray(json) ? json : (json.orders || []);
      }
    } catch (error) {
      console.warn('Remote orders unavailable, using local orders instead.', error);
    }
  }

  const localOrders = getLocalOrders().filter((order) => order.email?.toLowerCase() === email);
  if (!orders || orders.length === 0) {
    orders = localOrders;
  }

  if (!orders || orders.length === 0) {
    if (orderTableEl) {
      orderTableEl.innerHTML = `
        <div class="order-table-head">
          <span>Sales Order #</span>
          <span>Order Date</span>
          <span>Shipping Status</span>
          <span>Total</span>
        </div>
        <div class="order-row">
          <span class="muted-text">No orders found. <a href="product.html">Start shopping</a></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    }
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No orders yet. <a href="product.html">Start shopping</a></p>
        </div>
      `;
    }
    return [];
  }

  if (orderTableEl) {
    orderTableEl.innerHTML = `
      <div class="order-table-head">
        <span>Sales Order #</span>
        <span>Order Date</span>
        <span>Shipping Status</span>
        <span>Total</span>
      </div>
      ${orders.map((order) => {
        const number = order.orderNumber || order.id || 'N/A';
        const date = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Unknown';
        const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Pending';
        const totalText = order.total != null ? formatCurrency(order.total) : '—';
        return `
          <div class="order-row">
            <a href="tracking.html?order=${number}" class="order-link">${number}</a>
            <span>${date}</span>
            <span class="status-pill status-${order.status || 'pending'}">${statusText}</span>
            <span>${totalText}</span>
          </div>
        `;
      }).join('')}
    `;
  }

  if (ordersContainer) {
    ordersContainer.innerHTML = orders.map((order) => {
      const number = order.orderNumber || order.id || 'N/A';
      const date = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
      const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Pending';
      const totalText = order.total != null ? formatCurrency(order.total) : '—';
      const orderId = order._id || order.id || '';
      return `
        <div class="order-item">
          <div class="order-details">
            <div class="order-id">Order #${number}</div>
            <div class="order-date">${date}</div>
          </div>
          <span class="order-status">${statusText}</span>
          <div class="order-total">${totalText}</div>
          <div class="order-actions">
            <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${orderId}'">Preview</button>
            <button class="btn-small" onclick="downloadOrderInvoice('${orderId}')">Download</button>
          </div>
        </div>
      `;
    }).join('');
  }

  return orders;
}

function getLoyaltyInfo(orderCount) {
  if (orderCount >= 20) {
    return { tier: 'Platinum Member', message: 'You have reached Platinum status! Enjoy VIP support and early access.', progress: 100 };
  }
  if (orderCount >= 10) {
    return { tier: 'Gold Member', message: 'Great work! One more order to reach Platinum.', progress: 75 };
  }
  if (orderCount >= 5) {
    return { tier: 'Silver Member', message: 'Nice progress! Complete 5 more orders to reach Gold.', progress: 50 };
  }
  if (orderCount >= 1) {
    return { tier: 'Bronze Member', message: 'Keep shopping to unlock Silver status.', progress: 25 };
  }
  return { tier: 'New Member', message: 'Start your first order to unlock rewards.', progress: 10 };
}

function renderLoyaltySummary(user, orders = []) {
  const loyaltyTier = document.getElementById('loyalty-tier');
  const loyaltyMessage = document.getElementById('loyalty-message');
  const loyaltyProgress = document.getElementById('loyalty-progress');
  const orderCount = Array.isArray(orders) ? orders.length : 0;
  const loyalty = getLoyaltyInfo(orderCount);

  if (loyaltyTier) loyaltyTier.textContent = loyalty.tier;
  if (loyaltyMessage) loyaltyMessage.textContent = `${loyalty.message} (${orderCount} order${orderCount === 1 ? '' : 's'} placed)`;
  if (loyaltyProgress) {
    loyaltyProgress.style.setProperty('--progress-width', `${loyalty.progress}%`);
  }
}

function renderOrderTrackingBadges(orders = []) {
  const badgesContainer = document.getElementById('order-status-badges');
  if (!badgesContainer) return;

  const statusCounts = orders.reduce((counts, order) => {
    const status = (order.status || 'pending').toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  const badgeData = [
    { status: 'shipped', icon: 'fa-truck', label: 'Shipped' },
    { status: 'pending', icon: 'fa-clock', label: 'Processing' },
    { status: 'completed', icon: 'fa-check-circle', label: 'Delivered' },
    { status: 'cancelled', icon: 'fa-ban', label: 'Cancelled' }
  ];

  badgesContainer.innerHTML = badgeData.map(({ status, icon, label }) => {
    const count = statusCounts[status] || 0;
    return `
      <span class="status-badge ${status}">
        <i class="fas ${icon}"></i>
        ${label}: ${count}
      </span>
    `;
  }).join('');
}

// Download invoice as PDF
async function downloadOrderInvoice(orderId) {
  if (!orderId) {
    showToast('Invalid order ID', 'error');
    return;
  }

  const token = getAuthToken();
  const guestEmail = window.currentTrackingOrder?.email || getQueryParams().email || '';
  if (!token && !guestEmail) {
    showToast('Please sign in to download invoice', 'error');
    return;
  }

  try {
    showToast('Downloading invoice...', 'info');
    const url = new URL(`${API_BASE_URL}/api/v1/invoices/${orderId}/download`);
    if (!token && guestEmail) {
      url.searchParams.set('email', guestEmail);
    }
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to download invoice (${response.status})`);
    }

    // Get the PDF blob
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `invoice-${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
    
    showToast('Invoice downloaded successfully', 'success');
  } catch (error) {
    console.error('Invoice download failed:', error);
    showToast(`Failed to download invoice: ${error.message}`, 'error');
  }
}

async function renderAccountAddresses(user) {
  const addressesContainer = document.getElementById('addresses-container');
  if (!addressesContainer) return;

  try {
    const addresses = await loadUserAddresses();
    
    if (!addresses || addresses.length === 0) {
      addressesContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-location-dot"></i>
          <p>No saved addresses yet.</p>
          <button type="button" class="checkout-button" onclick="document.getElementById('add-address-modal').classList.add('active')">Add Address</button>
        </div>
      `;
      return;
    }

    addressesContainer.innerHTML = addresses.map((address, index) => `
      <div class="address-card ${address.isDefault ? 'default' : ''}">
        ${address.isDefault ? '<div class="address-badge">Default</div>' : ''}
        <div class="address-name">${address.name || 'Address'} ${address.type ? `(${address.type})` : ''}</div>
        <div class="address-text">
          ${address.street || ''}<br>
          ${address.city || ''}${address.state ? ', ' + address.state : ''}<br>
          ${address.zipCode || ''}${address.country ? ', ' + address.country : ''}
          ${address.phone ? '<br><strong>Phone: ' + address.phone + '</strong>' : ''}
        </div>
        <div class="address-actions">
          <button type="button" class="btn-small" onclick="editAddress('${address._id}')">Edit</button>
          <button type="button" class="btn-small btn-danger" onclick="deleteAddressHandler('${address._id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to render addresses:', error);
    addressesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Unable to load addresses. Please try again.</p>
      </div>
    `;
  }
}

function renderAccountWishlist() {
  const wishlistContainer = document.getElementById('wishlist-container');
  if (!wishlistContainer) return;

  if (!savedItems || savedItems.length === 0) {
    wishlistContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-heart"></i>
        <p>No items in your wishlist yet. Add your favorite styles to save them here.</p>
        <button type="button" class="checkout-button" onclick="window.location.href='product.html'">Browse Products</button>
      </div>
    `;
    return;
  }

  wishlistContainer.innerHTML = savedItems.map((item) => {
    const productId = item.id || item._id || item.productId || '';
    const variantName = item.variant || 'Standard';
    return `
      <div class="wishlist-card">
        <div class="wishlist-card-meta">
          <strong>${item.name || item.title || 'Saved item'}</strong>
          ${item.category ? `<p>${item.category}</p>` : ''}
          ${variantName !== 'Standard' ? `<p class="wishlist-variant">${variantName}</p>` : ''}
          <p class="wishlist-price">${formatCurrency(item.price || 0)}</p>
        </div>
        <div class="wishlist-actions">
          <button type="button" class="btn-small" onclick="addToCart('${productId}', '${variantName}')">Add to Cart</button>
          <button type="button" class="btn-small" onclick="window.location.href='product-detail.html?id=${productId}'">View</button>
          <button type="button" class="btn-small btn-danger" onclick="removeSavedItem('${productId}', '${variantName}')">Remove</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderAccountInvoices(orders = []) {
  const invoicesContainer = document.getElementById('invoices-container');
  if (!invoicesContainer) return;

  if (!Array.isArray(orders) || orders.length === 0) {
    invoicesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-invoice-dollar"></i>
        <p>No invoices available yet.</p>
      </div>
    `;
    return;
  }

  invoicesContainer.innerHTML = orders.slice(0, 5).map((order) => {
    const orderId = order._id || order.id || order.orderNumber || '';
    const totalText = order.total != null ? formatCurrency(order.total) : '—';
    const issuedOn = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
    return `
      <div class="order-item">
        <div class="order-details">
          <div class="order-id">Invoice for Order #${order.orderNumber || orderId}</div>
          <div class="order-date">Issued ${issuedOn}</div>
        </div>
        <span class="order-status">${(order.status || 'issued').replace(/_/g, ' ')}</span>
        <div class="order-total">${totalText}</div>
        <div class="order-actions">
          <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${orderId}'">Preview</button>
          <button class="btn-small" onclick="downloadOrderInvoice('${orderId}')">Download</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSavedPaymentMethods(user) {
  const paymentContainer = document.getElementById('payment-methods-container');
  if (!paymentContainer) return;

  const savedMethods = Array.isArray(user?.savedPaymentMethods) ? user.savedPaymentMethods : [];
  const preferred = user?.preferredPaymentMethod || 'cod';

  if (!savedMethods.length) {
    paymentContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-credit-card"></i>
        <p>No saved payment methods yet.</p>
        <p>Preferred checkout method: <strong>${preferred.toUpperCase()}</strong></p>
      </div>
    `;
    return;
  }

  paymentContainer.innerHTML = savedMethods.map((method) => `
    <div class="address-card">
      <div class="address-name">${method.brand || method.type || 'Payment Method'}</div>
      <div class="address-text">${method.label || method.last4 || preferred.toUpperCase()}</div>
    </div>
  `).join('');
}

async function deleteAddressHandler(addressId) {
  if (!confirm('Are you sure you want to delete this address?')) return;

  try {
    await deleteUserAddress(addressId);
    renderAccountPage();
    showToast('Address deleted successfully.');
  } catch (error) {
    showToast(error.message || 'Unable to delete address.');
  }
}

async function editAddress(addressId) {
  try {
    const addresses = await loadUserAddresses();
    const address = addresses.find(a => a._id === addressId);
    if (!address) {
      showToast('Address not found.');
      return;
    }

    // Populate form with address data
    document.getElementById('addr-name').value = address.name || '';
    document.getElementById('addr-type').value = address.type || 'shipping';
    document.getElementById('addr-line1').value = address.street || '';
    document.getElementById('addr-city').value = address.city || '';
    document.getElementById('addr-state').value = address.state || '';
    document.getElementById('addr-postal').value = address.zipCode || '';
    document.getElementById('addr-country').value = address.country || 'India';
    document.getElementById('addr-phone').value = address.phone || '';
    document.getElementById('addr-default').checked = address.isDefault || false;

    // Change form submission to update instead of add
    const form = document.getElementById('add-address-form');
    const oldOnSubmit = form.onsubmit;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const addressData = {
        type: document.getElementById('addr-type')?.value || 'shipping',
        name: document.getElementById('addr-name')?.value.trim(),
        street: document.getElementById('addr-line1')?.value.trim(),
        city: document.getElementById('addr-city')?.value.trim(),
        state: document.getElementById('addr-state')?.value.trim(),
        zipCode: document.getElementById('addr-postal')?.value.trim(),
        country: document.getElementById('addr-country')?.value.trim(),
        phone: document.getElementById('addr-phone')?.value.trim(),
        isDefault: document.getElementById('addr-default')?.checked || false
      };

      try {
        await updateUserAddress(addressId, addressData);
        closeAddressModal();
        form.onsubmit = oldOnSubmit;
        renderAccountPage();
        showToast('Address updated successfully.');
      } catch (error) {
        showToast(error.message || 'Unable to update address.');
      }
    };

    document.getElementById('add-address-modal')?.classList.add('active');
  } catch (error) {
    showToast(error.message || 'Unable to edit address.');
  }
}

async function updateUserProfile(profileUpdates) {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(profileUpdates)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update profile');
    }

    const updatedUser = await response.json();
    const remember = !!localStorage.getItem('papjoy-token');
    const savedUser = getCurrentUser() || {};
    const finalUser = { ...savedUser, ...updatedUser, token };
    setCurrentUser(finalUser, remember);
    return finalUser;
  } catch (error) {
    console.error('Profile update failed:', error);
    throw error;
  }
}

async function handleEditProfileSubmit(event) {
  event.preventDefault();
  const user = getCurrentUser();
  if (!user) return;

  const name = document.getElementById('edit-name')?.value.trim();
  const phone = document.getElementById('edit-phone')?.value.trim();

  const profileUpdates = { name };
  if (phone) {
    profileUpdates.shippingAddress = {
      ...(user.shippingAddress || {}),
      phone
    };
  }

  try {
    const updatedUser = await updateUserProfile(profileUpdates);
    if (updatedUser) {
      closeEditModal();
      renderAccountPage();
      showToast('Profile saved successfully.');
    }
  } catch (error) {
    showToast(error.message || 'Unable to save profile.');
  }
}

// Load user addresses from API
async function loadUserAddresses() {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);
      return Array.isArray(data) ? data : (data?.addresses || []);
    }
  } catch (error) {
    console.error('Failed to load addresses:', error);
  }
  return [];
}

// Add new address via API
async function addUserAddress(addressData) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(addressData)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to add address');
  }
  return await response.json();
}

// Update existing address via API
async function updateUserAddress(addressId, addressData) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses/${addressId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(addressData)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update address');
  }
  return await response.json();
}

// Delete address via API
async function deleteUserAddress(addressId) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses/${addressId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete address');
  }
  return await response.json();
}

async function handleAddAddressSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) {
    showToast('Please sign in to save addresses.');
    return;
  }

  const addressData = {
    type: document.getElementById('addr-type')?.value || 'shipping',
    name: document.getElementById('addr-name')?.value.trim(),
    street: document.getElementById('addr-line1')?.value.trim(),
    city: document.getElementById('addr-city')?.value.trim(),
    state: document.getElementById('addr-state')?.value.trim(),
    zipCode: document.getElementById('addr-postal')?.value.trim(),
    country: document.getElementById('addr-country')?.value.trim(),
    phone: document.getElementById('addr-phone')?.value.trim(),
    isDefault: document.getElementById('addr-default')?.checked || false
  };

  if (!addressData.street || !addressData.city || !addressData.state || !addressData.zipCode) {
    showToast('Please fill in all required address fields.');
    return;
  }

  try {
    await addUserAddress(addressData);
    closeAddressModal();
    renderAccountPage();
    showToast('Address saved successfully.');
  } catch (error) {
    showToast(error.message || 'Unable to save address.');
  }
}

function populateEditProfileForm(user) {
  const editName = document.getElementById('edit-name');
  const editEmail = document.getElementById('edit-email');
  const editPhone = document.getElementById('edit-phone');
  if (editName) editName.value = user.name || '';
  if (editEmail) editEmail.value = user.email || '';
  if (editPhone) editPhone.value = user.shippingAddress?.phone || '';
}

async function renderAccountPage() {
  let user = getCurrentUser();

  if (getAuthToken()) {
    const profile = await syncUserProfile();
    if (profile) {
      user = profile;
    }
  }

  const currentUserId = user?.id || user?._id;
  if (!user || !currentUserId) {
    window.location.href = 'signin.html';
    return;
  }

  const accountNameHeader = document.getElementById('account-name-header');
  const accountEmailHeader = document.getElementById('account-email-header');
  const accountAvatarLarge = document.getElementById('account-avatar-large');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarEmail = document.getElementById('sidebar-email');
  const sidebarPhone = document.getElementById('sidebar-phone');
  const accountName = document.getElementById('account-name');
  const accountAddress = document.getElementById('account-address');
  const contactName = document.getElementById('account-contact-name');
  const contactEmail = document.getElementById('account-contact-email');
  const contactPhone = document.getElementById('account-contact-phone');
  const contactLocation = document.getElementById('account-contact-location');
  const editProfileBtn = document.getElementById('edit-profile-btn');
  const signoutBtn = document.getElementById('account-signout-btn');
  const editProfileForm = document.getElementById('edit-profile-form');
  const addAddressForm = document.getElementById('add-address-form');

  const displayName = user.name || user.email;
  if (accountNameHeader) accountNameHeader.textContent = `Welcome back, ${displayName}`;
  if (accountEmailHeader) accountEmailHeader.textContent = user.email || 'No email available';
  if (accountAvatarLarge) accountAvatarLarge.textContent = (displayName[0] || 'P').toUpperCase();
  if (sidebarName) sidebarName.textContent = `Name: ${user.name || 'N/A'}`;
  if (sidebarEmail) sidebarEmail.textContent = `Email: ${user.email || 'N/A'}`;
  if (sidebarPhone) sidebarPhone.textContent = `Phone: ${user.shippingAddress?.phone || 'Not set'}`;
  if (accountName) accountName.textContent = displayName;

  const address = user.shippingAddress || {};
  const addressLines = [];
  if (address.fullName) addressLines.push(address.fullName);
  if (address.line1) addressLines.push(address.line1);
  if (address.line2) addressLines.push(address.line2);
  const cityState = [address.city, address.state].filter(Boolean).join(', ');
  if (cityState) addressLines.push(cityState);
  const postalCountry = [address.postalCode, address.country].filter(Boolean).join(', ');
  if (postalCountry) addressLines.push(postalCountry);
  if (address.phone) addressLines.push(`Phone: ${address.phone}`);

  if (accountAddress) {
    accountAddress.innerHTML = addressLines.length > 0
      ? addressLines.map((line) => line === `Phone: ${address.phone}` ? `<strong>${line}</strong>` : line).join('<br>')
      : 'No saved shipping address yet. Update your account to save an address.';
  }
  if (contactName) contactName.innerHTML = `<strong>${displayName}</strong>`;
  if (contactEmail) contactEmail.innerHTML = `<i class="fas fa-envelope"></i> ${user.email || 'Not available'}`;
  if (contactPhone) contactPhone.innerHTML = `<i class="fas fa-phone"></i> ${address.phone || 'No phone number saved'}`;
  if (contactLocation) contactLocation.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${[address.city, address.state, address.country].filter(Boolean).join(', ') || 'No location set'}`;

  if (editProfileBtn) {
    editProfileBtn.onclick = () => {
      populateEditProfileForm(user);
      document.getElementById('edit-profile-modal')?.classList.add('active');
    };
  }

  if (signoutBtn) {
    signoutBtn.onclick = (event) => {
      event.preventDefault();
      signOut();
    };
  }

  if (editProfileForm) {
    editProfileForm.onsubmit = handleEditProfileSubmit;
  }

  if (addAddressForm) {
    addAddressForm.onsubmit = handleAddAddressSubmit;
  }

  renderAccountAddresses(user);
  const orders = await loadUserOrders();
  renderLoyaltySummary(user, orders);
  renderOrderTrackingBadges(orders);
  renderAccountWishlist();
  renderAccountInvoices(orders);
  renderSavedPaymentMethods(user);
  await renderAdminDashboard(user);
}

// ================== PRODUCT FILTERS INITIALIZATION ==================

async function initProductFilters() {
  const searchInput = document.getElementById('search-products');
  const sortFilter = document.getElementById('sort-filter');
  const inStockFilter = document.getElementById('in-stock-filter');
  const priceMinRange = document.getElementById('price-min');
  const priceMaxRange = document.getElementById('price-max');
  const priceMinDisplay = document.getElementById('price-min-display');
  const priceMaxDisplay = document.getElementById('price-max-display');

  if (!searchInput && !priceMinRange) return;

  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  const urlQuery = params.get('q');
  if (urlCategory && searchInput) {
    searchInput.value = urlCategory;
  }
  if (urlQuery && searchInput) {
    searchInput.value = urlQuery;
  }
  if (urlCategory) {
    let categoryInput = document.getElementById('filter-category');
    if (!categoryInput) {
      categoryInput = document.createElement('input');
      categoryInput.type = 'hidden';
      categoryInput.id = 'filter-category';
      document.getElementById('product-filters')?.appendChild(categoryInput);
    }
    categoryInput.value = urlCategory;
  }

  // Load available filter options
  const filterOptions = await loadFilterOptions();

  // Render brand filters
  const brandContainer = document.getElementById('brand-filters');
  if (brandContainer && filterOptions.brands.length > 0) {
    brandContainer.innerHTML = filterOptions.brands.map(brand => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-brand="${brand}" /> ${brand}
      </label>
    `).join('');
  }

  // Render size filters
  const sizeContainer = document.getElementById('size-filters');
  if (sizeContainer && filterOptions.sizes.length > 0) {
    sizeContainer.innerHTML = filterOptions.sizes.map(size => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-size="${size}" /> ${size}
      </label>
    `).join('');
  }

  // Render color filters
  const colorContainer = document.getElementById('color-filters');
  if (colorContainer && filterOptions.colors.length > 0) {
    colorContainer.innerHTML = filterOptions.colors.map(color => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-color="${color}" /> ${color}
      </label>
    `).join('');
  }

  // Set price range
  if (priceMinRange && priceMaxRange) {
    priceMinRange.max = filterOptions.priceRange.max;
    priceMaxRange.max = filterOptions.priceRange.max;
    priceMaxRange.value = filterOptions.priceRange.max;
    if (priceMaxDisplay) priceMaxDisplay.textContent = formatCurrency(filterOptions.priceRange.max);
  }

  // Debounced search handler
  const handleSearch = debounce(async () => {
    await performSearch();
  }, 300);

  const handlePriceChange = debounce(async () => {
    if (priceMinDisplay) priceMinDisplay.textContent = formatCurrency(priceMinRange.value);
    if (priceMaxDisplay) priceMaxDisplay.textContent = formatCurrency(priceMaxRange.value);
    await performSearch();
  }, 300);

  if (searchInput) searchInput.addEventListener('input', handleSearch);
  if (sortFilter) sortFilter.addEventListener('change', () => performSearch());
  if (inStockFilter) inStockFilter.addEventListener('change', () => performSearch());
  if (priceMinRange) priceMinRange.addEventListener('input', handlePriceChange);
  if (priceMaxRange) priceMaxRange.addEventListener('input', handlePriceChange);

  // Brand, size, color filter listeners
  document.querySelectorAll('[data-filter-brand], [data-filter-size], [data-filter-color]').forEach(checkbox => {
    checkbox.addEventListener('change', () => performSearch());
  });

  // Initial search
  await performSearch();
}

async function performSearch() {
  const searchInput = document.getElementById('search-products');
  const sortFilter = document.getElementById('sort-filter');
  const inStockFilter = document.getElementById('in-stock-filter');
  const priceMinRange = document.getElementById('price-min');
  const priceMaxRange = document.getElementById('price-max');
  const productGrid = document.getElementById('product-grid');
  const categoryInput = document.getElementById('filter-category');

  const q = searchInput?.value || '';
  const sort = sortFilter?.value || 'newest';
  const inStock = inStockFilter?.checked || false;
  const priceMin = priceMinRange?.value || 0;
  const priceMax = priceMaxRange?.value || 500000;
  const category = categoryInput?.value || '';

  const selectedBrands = Array.from(document.querySelectorAll('[data-filter-brand]:checked'))
    .map(cb => cb.dataset.filterBrand);
  const selectedSizes = Array.from(document.querySelectorAll('[data-filter-size]:checked'))
    .map(cb => cb.dataset.filterSize);
  const selectedColors = Array.from(document.querySelectorAll('[data-filter-color]:checked'))
    .map(cb => cb.dataset.filterColor);

  const brand = selectedBrands.join('|');
  const size = selectedSizes.join('|');
  const color = selectedColors.join('|');

  try {
    const result = await searchProducts({
      q, category, sort, inStock, priceMin, priceMax, brand, size, color
    });

    products = result.products.map(normalizeProduct).filter(Boolean);
    
    if (productGrid) {
      const fragment = document.createDocumentFragment();
      products.forEach((product) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.onclick = () => {
          window.location.href = getProductLink(product);
        };

        const imageUrls = getProductImageUrls(product);
        const primaryImage = imageUrls[0] || product.image || 'https://via.placeholder.com/800x800?text=PAP-JOY';
        const invStatus = getInventoryStatus(product);

        productCard.innerHTML = `
          <div class="product-image">
            <img src="${primaryImage}" alt="${product.name}" loading="lazy">
            ${product.isFeatured ? '<div class="badge featured">Featured</div>' : ''}
            <div class="badge ${invStatus.class}" style="background-color: ${invStatus.color}">${invStatus.status}</div>
          </div>
          <div class="product-info">
            <div class="category">${product.category}</div>
            <h3 class="product-name">${product.name}</h3>
        <p class="product-subtitle">${product.subtitle || (product.description || '').slice(0, 80) + '...'}</p>
            <div class="price">${formatCurrency(product.price)}</div>
            <div class="product-actions">
              <button class="btn btn-primary add-to-cart-btn" type="button" data-product-id="${product.id || product._id}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
                <i class="fas fa-cart-plus"></i> ${product.inventory?.quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
              </button>
              <button class="btn btn-secondary buy-now-btn" type="button" data-product-id="${product.id || product._id}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
                <i class="fas fa-bolt"></i> Buy Now
              </button>
            </div>
          </div>
        `;

        attachProductCardListeners(productCard);
        fragment.appendChild(productCard);
      });

      productGrid.innerHTML = '';
      productGrid.appendChild(fragment);
    }

    const statusEl = document.getElementById('product-status');
    if (statusEl) {
      statusEl.textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'} found`;
    }
  } catch (error) {
    console.error('Search error:', error);
    if (productGrid) productGrid.innerHTML = '<p>Failed to load products. Please try again.</p>';
  }
}

function attachProductCardListeners(productCard) {
  const addButton = productCard.querySelector('.add-to-cart-btn');
  const buyButton = productCard.querySelector('.buy-now-btn');
  const productId = addButton?.dataset.productId;

  if (addButton && !addButton.disabled) {
    addButton.addEventListener('click', (event) => {
      event.stopPropagation();
      addToCartFlow(productId);
    });
  }

  if (buyButton && !buyButton.disabled) {
    buyButton.addEventListener('click', (event) => {
      event.stopPropagation();
      buyNowFlow(productId);
    });
  }
}

async function renderPage() {
  translatePage();
  const page = document.body.dataset.page;
  const hasProductGrid = !!document.querySelector('.product-grid');
  const hasCartContainer = !!document.getElementById('cart-items');
  const hasSavedContainer = !!document.getElementById('saved-items');

  if (hasProductGrid || page === 'home' || page === 'product' || page === 'shop' || page === 'product-detail') {
    await loadProducts();
    initFeaturedControls();
  }

  const needsSavedItemsSync = page === 'cart' || page === 'checkout' || page === 'product' || page === 'shop' || page === 'account';
  const needsCartSync = page === 'cart' || page === 'checkout' || page === 'account';

  if (getCurrentUser() && needsSavedItemsSync) {
    await loadUserWishlist();
  }

  if (page === 'product' || page === 'shop') {
    await initProductFilters();
  }

  if (getCurrentUser() && needsCartSync) {
    await loadUserCart();
  }

  if (hasCartContainer || page === 'cart' || page === 'checkout') {
    renderCart();
  }

  if (hasSavedContainer || page === 'cart' || page === 'checkout') {
    renderSavedItems();
  }

  updateUserLinks();

  if (page === 'checkout') {
    await renderCheckoutPage();
  }
  if (page === 'success') {
    await renderSuccessPage();
  }
  if (page === 'signin') {
    await renderSignInPage();
  }
  if (page === 'signup') {
    await renderSignUpPage();
  }
  if (page === 'forgot-password') {
    await renderForgotPasswordPage();
  }
  if (page === 'reset-password') {
    await renderResetPasswordPage();
  }
  if (page === 'account') {
    await renderAccountPage();
  }
  if (page === 'invoice-preview') {
    await renderInvoicePreviewPage();
  }
  if (page === 'product-detail') {
    await renderProductDetailPage();
  }
}

// ================== ADMIN FUNCTIONS ==================

async function loadAdminDashboard() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    // Update stats
    document.getElementById('stat-revenue').textContent = formatCurrency(data.stats.totalRevenue);
    document.getElementById('stat-orders').textContent = data.stats.totalOrders;
    document.getElementById('stat-products').textContent = data.stats.totalProducts;
    document.getElementById('stat-users').textContent = data.stats.totalUsers;

    // Render recent orders
    const recentOrdersList = document.getElementById('recent-orders-list');
    if (recentOrdersList) {
      recentOrdersList.innerHTML = data.recentOrders.map(order => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.userId?.name || 'Guest'}</td>
          <td>${formatCurrency(order.total)}</td>
          <td><span class="status-badge">${order.status}</span></td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td><button class="btn-small" onclick="showOrderModal('${order._id}')">Update</button></td>
        </tr>
      `).join('');
    }

    // Render order status distribution
    const statusDist = document.getElementById('order-status-dist');
    if (statusDist && data.ordersByStatus) {
      statusDist.innerHTML = Object.entries(data.ordersByStatus).map(([status, count]) => `
        <div class="status-item">
          <span>${status}: ${count}</span>
          <div class="status-bar"><div style="width: ${(count / Math.max(...Object.values(data.ordersByStatus)) || 1) * 100}%"></div></div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Admin dashboard error:', error);
  }
}

async function loadAdminProducts() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const search = document.getElementById('product-search')?.value || '';
  const status = document.getElementById('product-status')?.value || 'all';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const productsList = document.getElementById('products-list');
    if (productsList) {
      productsList.innerHTML = data.products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.sku || 'N/A'}</td>
          <td>${formatCurrency(product.price)}</td>
          <td>${product.inventory?.quantity || 0}</td>
          <td><span class="badge ${product.isActive ? 'active' : 'inactive'}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn-small" onclick="editProduct('${product._id}')">Edit</button>
            <button class="btn-small danger" onclick="deleteProduct('${product._id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin products error:', error);
  }
}

function showProductForm() {
  document.getElementById('product-modal').classList.add('active');
  document.getElementById('product-id').value = '';
  document.getElementById('product-form').reset();
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

async function saveProduct(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const productId = document.getElementById('product-id').value;
  const productData = {
    name: document.getElementById('product-name').value,
    slug: document.getElementById('product-slug').value,
    description: document.getElementById('product-description').value,
    price: Number(document.getElementById('product-price').value),
    categoryId: document.getElementById('product-category').value,
    sku: document.getElementById('product-sku').value,
    brand: document.getElementById('product-brand').value,
    inventory: { quantity: Number(document.getElementById('product-stock').value) },
    isActive: document.getElementById('product-active').checked
  };

  const method = productId ? 'PUT' : 'POST';
  const endpoint = productId ? `/api/v1/admin/products/${productId}` : '/api/v1/admin/products';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error('Failed to save product');
    
    closeProductModal();
    loadAdminProducts();
    showToast('✅ Product saved successfully');
  } catch (error) {
    console.error('Product save error:', error);
    showToast('❌ Failed to save product');
  }
}

async function editProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    // For now, just open the form for new product
    showProductForm();
  } catch (error) {
    console.error('Product edit error:', error);
  }
}

async function deleteProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products/${productId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete product');
    
    loadAdminProducts();
    showToast('✅ Product deleted successfully');
  } catch (error) {
    console.error('Product delete error:', error);
    showToast('❌ Failed to delete product');
  }
}

async function loadAdminOrders() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const status = document.getElementById('order-status-filter')?.value || 'all';
  const sort = document.getElementById('order-sort')?.value || 'newest';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders?page=${page}&limit=${limit}&status=${status}&sort=${sort}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
      ordersList.innerHTML = data.orders.map(order => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.userId?.name || 'Guest'}</td>
          <td>${formatCurrency(order.total)}</td>
          <td><span class="status-badge">${order.status}</span></td>
          <td>${order.paymentStatus}</td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${order._id}'">Invoice</button>
            <button class="btn-small" onclick="showOrderModal('${order._id}')">Update</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin orders error:', error);
  }
}

function showOrderModal(orderId) {
  document.getElementById('order-modal').classList.add('active');
  document.getElementById('order-id').value = orderId;
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
}

async function updateOrderStatus(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const orderId = document.getElementById('order-id').value;
  const updateData = {
    status: document.getElementById('order-status-update').value,
    trackingNumber: document.getElementById('order-tracking-number').value,
    carrier: document.getElementById('order-carrier').value,
    trackingUrl: document.getElementById('order-tracking-url').value
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(updateData)
    });

    if (!response.ok) throw new Error('Failed to update order');
    
    closeOrderModal();
    loadAdminOrders();
    showToast('✅ Order updated successfully');
  } catch (error) {
    console.error('Order update error:', error);
    showToast('❌ Failed to update order');
  }
}

async function loadAdminUsers() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const search = document.getElementById('user-search')?.value || '';
  const role = document.getElementById('user-role-filter')?.value || 'all';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&role=${role}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.innerHTML = data.users.map(user => `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td><span class="badge">${user.role}</span></td>
          <td>${new Date(user.createdAt).toLocaleDateString()}</td>
          <td><span class="badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn-small" onclick="editUser('${user._id}')">View</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin users error:', error);
  }
}

async function loadAnalytics() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    // Render revenue chart
    const revenueChart = document.getElementById('revenue-chart');
    if (revenueChart && data.revenueByDate.length > 0) {
      revenueChart.innerHTML = `
        <div class="chart-data">
          ${data.revenueByDate.slice(-7).map(d => `
            <div class="chart-bar" style="height: ${(d.revenue / Math.max(...data.revenueByDate.map(x => x.revenue))) * 100}%">
              <span>${formatCurrency(d.revenue)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Render top products
    const topProductsList = document.getElementById('top-products-list');
    if (topProductsList && data.topProducts.length > 0) {
      topProductsList.innerHTML = data.topProducts.map(p => `
        <tr>
          <td>${p.product?.name || 'Product'}</td>
          <td>${p.quantity}</td>
          <td>${formatCurrency(p.revenue)}</td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Analytics error:', error);
  }
}

async function loadAdminCategories() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const categories = await response.json();

    const categoriesList = document.getElementById('categories-list');
    if (categoriesList) {
      categoriesList.innerHTML = categories.map(cat => `
        <tr>
          <td>${cat.name}</td>
          <td>${cat.slug}</td>
          <td><span class="badge ${cat.isActive ? 'active' : 'inactive'}">${cat.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${cat.sortOrder}</td>
          <td>
            <button class="btn-small" onclick="editCategory('${cat._id}')">Edit</button>
            <button class="btn-small danger" onclick="deleteCategory('${cat._id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin categories error:', error);
  }
}

function showCategoryForm() {
  document.getElementById('category-modal').classList.add('active');
  document.getElementById('category-id').value = '';
  document.getElementById('category-form').reset();
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('active');
}

async function saveCategory(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const categoryId = document.getElementById('category-id').value;
  const categoryData = {
    name: document.getElementById('category-name').value,
    slug: document.getElementById('category-slug').value,
    description: document.getElementById('category-description').value,
    sortOrder: Number(document.getElementById('category-sort-order').value),
    isActive: document.getElementById('category-active').checked
  };

  const method = categoryId ? 'PUT' : 'POST';
  const endpoint = categoryId ? `/api/v1/admin/categories/${categoryId}` : '/api/v1/admin/categories';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(categoryData)
    });

    if (!response.ok) throw new Error('Failed to save category');
    
    closeCategoryModal();
    loadAdminCategories();
    showToast('✅ Category saved successfully');
  } catch (error) {
    console.error('Category save error:', error);
    showToast('❌ Failed to save category');
  }
}

async function editCategory(categoryId) {
  showCategoryForm();
}

async function deleteCategory(categoryId) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm('Are you sure you want to delete this category?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories/${categoryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete category');
    
    loadAdminCategories();
    showToast('✅ Category deleted successfully');
  } catch (error) {
    console.error('Category delete error:', error);
    showToast('❌ Failed to delete category');
  }
}

function editUser(userId) {
  // Implement user editing
}

function initCookieConsent() {
  const modal = document.getElementById('cookie-consent-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('cookie-close');
  const acceptAllBtn = document.getElementById('cookie-accept-all');
  const acceptSelectedBtn = document.getElementById('cookie-accept-selected');
  const rejectBtn = document.getElementById('cookie-reject');
  const analyticsCheckbox = document.getElementById('analytics-cookies');
  const marketingCheckbox = document.getElementById('marketing-cookies');

  // Check if user has already made a choice
  const consent = localStorage.getItem('papjoy-cookie-consent');
  if (consent) {
    const preferences = JSON.parse(consent);
    // Apply saved preferences
    if (preferences.analytics) {
      // Enable analytics
    }
    if (preferences.marketing) {
      // Enable marketing cookies
    }
    return; // Don't show modal if already consented
  }

  // Show modal
  setTimeout(() => {
    modal.classList.add('show');
  }, 1000);

  // Close modal
  const closeModal = () => {
    modal.classList.remove('show');
  };

  closeBtn.addEventListener('click', closeModal);

  // Accept all cookies
  acceptAllBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Enable all cookies
  });

  // Accept selected cookies
  acceptSelectedBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: analyticsCheckbox.checked,
      marketing: marketingCheckbox.checked,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Enable selected cookies
  });

  // Reject all non-essential cookies
  rejectBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Disable non-essential cookies
  });

  // Handle link clicks
  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('privacy.html', '_blank');
  });

  document.getElementById('terms-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('terms.html', '_blank');
  });

  document.getElementById('cookies-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('cookies.html', '_blank');
  });
}

async function loadAdminDashboardData() {
  const user = getCurrentUser();
  if (!user) return null;
  try {
    const [summaryRes, ordersRes, productsRes, usersRes, invoicesRes, reportsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/admin/summary`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/orders`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/products`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/users`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/invoices/admin?limit=10`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/reports?range=month`, { headers: { Authorization: `Bearer ${user.token}` } })
    ]);

    if (!summaryRes.ok) return null;

    const [summary, orders, products, users] = await Promise.all([
      summaryRes.json(),
      ordersRes.ok ? ordersRes.json() : Promise.resolve({ orders: [] }),
      productsRes.ok ? productsRes.json() : Promise.resolve({ products: [] }),
      usersRes.ok ? usersRes.json() : Promise.resolve({ users: [] })
    ]);

    const invoices = invoicesRes.ok ? await invoicesRes.json() : { invoices: [] };
    const reports = reportsRes.ok ? await reportsRes.json() : null;

    return { summary, orders, products, users, invoices, reports };
  } catch (error) {
    console.error('Failed to load admin dashboard data:', error);
    return null;
  }
}

async function renderAdminDashboard(user) {
  if (!user) return;
  let adminContainer = document.getElementById('admin-dashboard');
  if (!adminContainer) {
    const accountSection = document.querySelector('.account-page') || document.querySelector('main') || document.body;
    adminContainer = document.createElement('section');
    adminContainer.id = 'admin-dashboard';
    adminContainer.className = 'admin-dashboard';
    if (accountSection) accountSection.appendChild(adminContainer);
  }

  const adminData = await loadAdminDashboardData();
  if (!adminData) {
    adminContainer.style.display = 'none';
    return;
  }

  const { summary, orders, products, users, invoices, reports } = adminData;
  adminContainer.style.display = 'block';
  adminContainer.innerHTML = `
    <section class="admin-dashboard-card">
      <h2>Admin Dashboard</h2>
      <div class="admin-summary-grid">
        <div class="summary-card"><strong>${summary.totalUsers}</strong><span>Users</span></div>
        <div class="summary-card"><strong>${summary.totalOrders}</strong><span>Orders</span></div>
        <div class="summary-card"><strong>${summary.totalProducts}</strong><span>Products</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.totalRevenue)}</strong><span>Revenue</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.gstCollected || 0)}</strong><span>GST Collected</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.pendingRevenue || 0)}</strong><span>Pending Revenue</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.refunds || 0)}</strong><span>Refunds</span></div>
        <div class="summary-card"><strong>${summary.invoiceCount || 0}</strong><span>Invoices</span></div>
      </div>
      <div class="admin-panels">
        <div class="admin-panel">
          <h3>Recent Orders</h3>
          <div class="admin-list">${orders.orders.slice(0, 6).map(order => `<div class="admin-list-item"><span>${order.orderNumber || order._id}</span><strong>${formatCurrency(order.total)}</strong><small>${order.status}</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Top Products</h3>
          <div class="admin-list">${products.products.slice(0, 6).map(product => `<div class="admin-list-item"><span>${product.name}</span><strong>${formatCurrency(product.price)}</strong><small>${product.inventory?.quantity || 0} in stock</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Recent Users</h3>
          <div class="admin-list">${users.users.slice(0, 6).map(user => `<div class="admin-list-item"><span>${user.name}</span><strong>${user.email}</strong><small>${user.role || 'user'}</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Recent Invoices</h3>
          <div class="admin-list">${(invoices.invoices || []).slice(0, 6).map((invoice) => `<div class="admin-list-item"><span>${invoice.invoiceNumber || invoice.orderId}</span><strong>${formatCurrency(invoice.total || 0)}</strong><small>${invoice.paymentStatus || 'pending'}</small></div>`).join('') || '<div class="empty-state">No invoices yet.</div>'}</div>
        </div>
      </div>
      ${reports ? `<div class="admin-panels"><div class="admin-panel"><h3>Report Snapshot</h3><div class="admin-list"><div class="admin-list-item"><span>Orders</span><strong>${reports.summary.orders}</strong></div><div class="admin-list-item"><span>Revenue</span><strong>${formatCurrency(reports.summary.revenue)}</strong></div><div class="admin-list-item"><span>GST</span><strong>${formatCurrency(reports.summary.gstCollected)}</strong></div><div class="admin-list-item"><span>Pending</span><strong>${formatCurrency(reports.summary.pendingRevenue)}</strong></div></div></div></div>` : ''}
    </section>
  `;
}

// Session auto-restore: restore user session from localStorage on page load
async function restoreSessionFromStorage() {
  const storedUser = getCurrentUser();
  const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
  const storedRefreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  
  if (storedUser && storedToken) {
    const remember = !!localStorage.getItem(AUTH_TOKEN_KEY);
    const user = { ...storedUser, token: storedToken };
    if (storedRefreshToken) {
      user.refreshToken = storedRefreshToken;
    }
    setCurrentUser(user, remember);
    
    try {
      const latestProfile = await syncUserProfile();
      if (!latestProfile) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
          signOut();
        }
      }
    } catch (error) {
      console.warn('Failed to sync profile on restore:', error);
    }
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await restoreSessionFromStorage();
  createSidebar();
  createLocaleSwitcher();
  updateUserLinks();
  initCookieConsent();
  initPageTransitions();

  if (document.body.dataset.page === 'tracking') {
    initTrackingPage();
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(renderPage);
  } else {
    setTimeout(renderPage, 200);
  }
});

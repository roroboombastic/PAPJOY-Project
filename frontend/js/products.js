// Global variables
let products = [];
let productsLoadPromise = null;
let searchInProgress = false;
let productsLoading = false;
let selectedFeaturedFilter = 'all';
let featuredControlsInitialized = false;
let searchAbortController = null;

// ================== PRODUCT CARD ==================

function createProductCardElement(product) {
  if (!product || !product.name) return null;
  const card = document.createElement('div');
  card.className = 'product-card';
  card.onclick = () => { window.location.href = getProductLink(product); };

  const imageUrls = getProductImageUrls(product);
  const primaryImage = imageUrls[0] || product.image || getNextFallbackImage();
  const invStatus = getInventoryStatus(product);
  const productId = product.id || product._id;

  const stockLevel = product.inventory?.quantity;
  const lowStock = stockLevel > 0 && stockLevel <= 5;
  const outOfStock = stockLevel === 0;
  const stockStatus = outOfStock ? 'out-of-stock' : (lowStock ? 'low-stock' : 'in-stock');
  const stockLabel = outOfStock ? 'Out of Stock' : (lowStock ? 'Only ' + stockLevel + ' left' : '');

  card.innerHTML = `
    <div class="product-image" data-quick-view="${productId}" role="button" tabindex="0" aria-label="Quick view ${product.name}">
      <img src="${primaryImage}" alt="${product.name || 'Product'}" loading="lazy" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src=getNextFallbackImage();}else{this.style.display='none';}">
      <button class="wishlist-heart" data-product-id="${productId}" title="Add to wishlist"><i class="${isInWishlist(productId) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
      ${product.isFeatured ? '<div class="badge featured">Featured</div>' : ''}
      ${lowStock ? '<div class="badge low-stock-badge">Low Stock</div>' : ''}
      ${outOfStock ? '<div class="badge out-of-stock-badge">Out of Stock</div>' : ''}
      <button class="quick-view-btn" data-quick-view="${productId}" title="Quick view"><i class="fas fa-eye"></i></button>
    </div>
    <div class="product-info">
      <div class="category">${product.category || 'Uncategorized'}</div>
      <h3 class="product-name">${product.name}</h3>
      <p class="product-subtitle">${product.subtitle || (product.description || '').slice(0, 80) + '...'}</p>
      ${stockLabel ? '<div class="stock-indicator ' + stockStatus + '"><span class="dot"></span>' + stockLabel + '</div>' : ''}
      <div class="price">${formatCurrency(product.price || 0)}</div>
      <div class="product-actions">
        <button class="btn btn-primary add-to-cart-btn" type="button" data-product-id="${productId}" ${outOfStock ? 'disabled' : ''}>
          <i class="fas fa-cart-plus"></i> ${outOfStock ? 'Out of Stock' : 'Add to Cart'}
        </button>
        <button class="btn btn-secondary buy-now-btn" type="button" data-product-id="${productId}" ${outOfStock ? 'disabled' : ''}>
          <i class="fas fa-bolt"></i> Buy Now
        </button>
      </div>
    </div>
  `;
  return card;
}
window.createProductCardElement = createProductCardElement;

function initProductGridDelegation() {
  const grid = document.querySelector('.product-grid') || document.getElementById('product-grid');
  if (!grid || grid._gridDelegated) return;
  grid._gridDelegated = true;
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-product-id]');
    if (!btn) return;
    const productId = btn.dataset.productId;
    if (btn.classList.contains('add-to-cart-btn') && !btn.disabled) {
      e.stopPropagation();
      addToCartFlow(productId);
    } else if (btn.classList.contains('buy-now-btn') && !btn.disabled) {
      e.stopPropagation();
      buyNowFlow(productId);
    } else if (btn.classList.contains('wishlist-heart')) {
      e.stopPropagation();
      toggleWishlist(productId, e);
    }
  });
}
window.initProductGridDelegation = initProductGridDelegation;

// ================== PRODUCT LOADING ==================

function showProductSkeleton(container, count = 8) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="product-card skeleton">
      <div class="skeleton-image"></div>
      <div class="skeleton-text skeleton-title"></div>
      <div class="skeleton-text skeleton-subtitle"></div>
      <div class="skeleton-text skeleton-price"></div>
    </div>
  `).join('');
}

async function loadProducts() {
  if (productsLoadPromise) {
    return productsLoadPromise;
  }

  productsLoading = true;
  const grid = document.querySelector('.product-grid');
  showProductSkeleton(grid);

  productsLoadPromise = (async () => {
    const now = Date.now();
    const cached = localStorage.getItem('papjoy-products-cache');
    let cachedProducts = [];

    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Array.isArray(data) && data.length && now - timestamp < cacheExpiry) {
          cachedProducts = data.map(normalizeProduct).filter(Boolean);
          if (cachedProducts.length) {
            products = cachedProducts;
            renderProducts();
          }
        }
      } catch (error) {
        localStorage.removeItem('papjoy-products-cache');
      }
    }

    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products`, { timeout: 8000 });
      if (!response.ok) {
        throw new Error(`Product API returned ${response.status}`);
      }

      const data = await response.json();
      const receivedProducts = Array.isArray(data.products) ? data.products : [];
      const loadedProducts = receivedProducts.map(normalizeProduct).filter(Boolean);

      if (loadedProducts.length) {
        products = loadedProducts;
        localStorage.setItem('papjoy-products-cache', JSON.stringify({ data: products, timestamp: now }));
      } else if (cachedProducts.length) {
        products = cachedProducts;
      } else {
        products = [];
      }

      renderProducts();
      return products;
    } catch (error) {
      console.error('Failed to load products:', error);
      if (cachedProducts.length) {
        products = cachedProducts;
      } else {
        localStorage.removeItem('papjoy-products-cache');
        products = [];
      }
      renderProducts();
      return products;
    } finally {
      productsLoading = false;
    }
  })();

  try {
    return await productsLoadPromise;
  } finally {
    productsLoadPromise = null;
  }
}
window.loadProducts = loadProducts;

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
window.getProductBySlug = getProductBySlug;

// ================== RENDER FUNCTIONS ==================

function renderProducts() {
  const page = document.body.dataset.page;
  if (page === 'shop') return;

  const productGrid = document.querySelector('.product-grid');
  if (!productGrid) return;

  if (!products || !products.length) {
    showEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  products.forEach((product) => {
    const card = createProductCardElement(product);
    if (card) fragment.appendChild(card);
  });

  productGrid.innerHTML = '';
  if (fragment.childNodes.length) {
    productGrid.appendChild(fragment);
  } else {
    showEmptyState();
  }
  initProductGridDelegation();
}
window.renderProducts = renderProducts;

function updateFeaturedControlState(filter) {
  const buttons = document.querySelectorAll('.section-controls .control-btn');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.filter === filter);
  });
}
window.updateFeaturedControlState = updateFeaturedControlState;

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
window.initFeaturedControls = initFeaturedControls;

async function renderProductDetailPage() {
  const container = document.getElementById('product-detail');
  if (!container) return;

  container.innerHTML = `<div class="loading-state">Loading product details...</div>`;

  const params = getQueryParams();
  const productIdOrSlug = params.slug || params.id;
  let product = getProductById(productIdOrSlug);

  if (!product && productIdOrSlug) {
    product = await getProductBySlug(productIdOrSlug);
    if (product) {
      products.push(product);
    }
  }

  if (!product) {
    container.innerHTML = `<div class="empty-state">${translate('product.notFound')}</div>`;
    return;
  }

  renderBreadcrumbs(product);

  const activeImage = product.images && product.images.length ? product.images[0] : (product.image || PRODUCT_FALLBACK_IMAGE);
  const variantButtons = (product.variants || []).map((variant, index) => `
        <button class="variant-option${index === 0 ? ' active' : ''}" data-price-delta="${variant.priceDelta || 0}" data-variant="${variant.name || 'Standard'}">
          ${variant.name || 'Standard'}${variant.priceDelta ? ` +${formatCurrency(variant.priceDelta)}` : ''}
        </button>
      `).join('');
  const detailsList = (product.details || []).map((detail) => `<li>${detail}</li>`).join('');

  container.innerHTML = `
    <div class="product-detail-card">
      <div class="product-gallery">
        <img id="detail-main-image" src="${activeImage}" alt="${escapeHTML(product.name || 'Product')}" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
        <button class="wishlist-heart detail-wishlist-heart" data-product-id="${product.id || product._id}" title="Add to wishlist"><i class="${isInWishlist(product.id || product._id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
        <div class="gallery-thumbs">
          ${(product.images || [product.image || PRODUCT_FALLBACK_IMAGE]).map((src, index) => `
            <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-image="${src}">
              <img src="${src}" alt="${escapeHTML(product.name || 'Product')} image ${index + 1}" loading="lazy" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
            </button>
          `).join('')}
        </div>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHTML(product.category || 'Uncategorized')}</p>
        <h2>${escapeHTML(product.name || 'Product')}</h2>
        <p class="detail-subtitle">${escapeHTML(product.subtitle || '')}</p>
        <p class="detail-description">${escapeHTML(product.description || '')}</p>
        <div class="product-variants">
          <p class="variant-label">Choose variant <button type="button" class="size-guide-btn" data-size-guide><i class="fas fa-ruler"></i> Size Guide</button></p>
          <div class="variant-list">${variantButtons}</div>
        </div>
        <ul class="detail-features">${detailsList}</ul>
        <div class="stock-indicator in-stock" id="detail-stock-indicator">
          <span class="dot"></span>
          <span class="stock-text">In Stock</span>
        </div>
        <div class="detail-meta">
          <span id="detail-price">${formatCurrency(product.price || 0)}</span>
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

  // Stock indicator
  var stockEl = container.querySelector('#detail-stock-indicator');
  if (stockEl) {
    var qty = product.inventory?.quantity;
    if (qty === undefined) qty = 10;
    if (qty === 0) {
      stockEl.className = 'stock-indicator out-of-stock';
      stockEl.querySelector('.stock-text').textContent = 'Out of Stock';
    } else if (qty <= 5) {
      stockEl.className = 'stock-indicator low-stock';
      stockEl.querySelector('.stock-text').textContent = 'Only ' + qty + ' left in stock';
    } else {
      stockEl.className = 'stock-indicator in-stock';
      stockEl.querySelector('.stock-text').textContent = 'In Stock';
    }
  }

  // Structured data JSON-LD for SEO
  var existingLd = document.getElementById('product-ld-json');
  if (existingLd) existingLd.remove();
  var ldScript = document.createElement('script');
  ldScript.id = 'product-ld-json';
  ldScript.type = 'application/ld+json';
  ldScript.textContent = JSON.stringify({
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    description: product.description || product.subtitle || '',
    image: (product.images && product.images.length) ? product.images : [product.image || ''],
    sku: product.sku || (product.id || product._id),
    brand: { '@type': 'Brand', name: product.brand || 'PAP-JOY' },
    offers: {
      '@type': 'Offer',
      url: window.location.href,
      priceCurrency: 'INR',
      price: product.price || 0,
      availability: qty === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    }
  });
  document.head.appendChild(ldScript);

  // Recommendations
  renderRecommendations(product);

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

  const detailWishlistHeart = container.querySelector('.detail-wishlist-heart');
  if (detailWishlistHeart) {
    detailWishlistHeart.addEventListener('click', (event) => {
      event.preventDefault();
      toggleWishlist(product.id || product._id, event);
    });
  }

  const productId = product.id || product._id;
  await saveViewedProduct(productId);

  const ratingData = await loadRatingSummary(productId);
  const reviewsData = await loadProductReviews(productId);

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

  renderReviewForm(productId);

  if (reviewsData.reviews) {
    renderReviews(reviewsData.reviews);
  }

  await renderRecommendations(productId);
}
window.renderProductDetailPage = renderProductDetailPage;

// ================== SEARCH ==================

async function performSearch() {
  if (searchInProgress) return;
  searchInProgress = true;

  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();

  const searchInput = document.getElementById('search-products');
  const sortFilter = document.getElementById('sort-filter');
  const inStockFilter = document.getElementById('in-stock-filter');
  const categoryFilter = document.getElementById('category-filter');
  const productGrid = document.getElementById('product-grid') || document.querySelector('.product-grid');

  const q = searchInput?.value || '';
  const sort = sortFilter?.value || 'newest';
  const inStock = inStockFilter?.checked || false;
  const category = categoryFilter?.value || '';

  const activePrice = document.querySelector('.price-chip.active');
  const priceRange = activePrice?.dataset.price || 'all';
  let priceMin = 0;
  let priceMax = 999999;
  if (priceRange !== 'all') {
    const parts = priceRange.split('-');
    priceMin = parseInt(parts[0], 10) || 0;
    priceMax = parseInt(parts[1], 10) || 999999;
  }

  if (productGrid) {
    showProductSkeleton(productGrid);
  }

  try {
    const result = await searchProducts({
      q, category, sort, inStock, priceMin, priceMax,
      signal: searchAbortController.signal
    });

    if (searchAbortController.signal.aborted) return;

    const rawProducts = Array.isArray(result.products) ? result.products : [];
    products = rawProducts.map(normalizeProduct).filter(Boolean);

    if (productGrid) {
      if (!products.length) {
        productGrid.innerHTML = `<div class="empty-state">No products found matching your criteria.</div>`;
        const statusEl = document.getElementById('product-status');
        if (statusEl) statusEl.textContent = '0 products found';
        renderActiveFilters();
        return;
      }

      const fragment = document.createDocumentFragment();
      products.forEach((product) => {
        const card = createProductCardElement(product);
        if (card) fragment.appendChild(card);
      });

      productGrid.innerHTML = '';
      productGrid.appendChild(fragment);
      initProductGridDelegation();
    }

    const statusEl = document.getElementById('product-status');
    if (statusEl) {
      statusEl.textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'} found`;
    }

    renderActiveFilters();
  } catch (error) {
    if (error.name === 'AbortError') return;
    console.error('Search error:', error);
    if (productGrid) {
      productGrid.innerHTML = `
        <div class="error-state">
          <p>Failed to load products. Please try again.</p>
          <button class="btn btn-primary" onclick="performSearch()">Retry</button>
        </div>`;
    }
  } finally {
    searchInProgress = false;
  }
}
window.performSearch = performSearch;

// ================== REVIEWS ==================

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
window.renderReviewForm = renderReviewForm;

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
          <strong>${escapeHTML(review.userId?.name || 'Anonymous')}</strong>
          ${review.isVerified ? '<span class="verified-badge">✓ Verified Purchase</span>' : ''}
        </div>
        <div class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</div>
      </div>
      ${review.title ? `<h4 class="review-title">${escapeHTML(review.title)}</h4>` : ''}
      <p class="review-comment">${escapeHTML(review.comment)}</p>
      <small class="review-date">${new Date(review.createdAt).toLocaleDateString()}</small>
    </div>
  `).join('');
}
window.renderReviews = renderReviews;

// ================== RECOMMENDATIONS ==================

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
        ${items.slice(0, 4).map((recProduct) => `
          <div class="recommendation-card">
            <a href="${getProductLink(recProduct)}">
              <img src="${recProduct.image || (recProduct.images && recProduct.images[0]) || ''}" alt="${recProduct.name}" loading="lazy" />
              <h4>${recProduct.name}</h4>
              <p>${formatCurrency(recProduct.price)}</p>
            </a>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.warn('Failed to load recommendations:', error);
  }
}
window.renderRecommendations = renderRecommendations;

// ================== BREADCRUMBS ==================

function renderBreadcrumbs(product) {
  const container = document.getElementById('breadcrumbs');
  if (!container) return;

  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'Shop', href: 'product.html' }
  ];

  const page = document.body.dataset.page;
  if (page === 'product-detail' && product) {
    if (product.category && product.category !== 'Uncategorized') {
      crumbs.push({ label: product.category, href: `product.html?category=${encodeURIComponent(product.category)}` });
    }
    crumbs.push({ label: product.name, href: null });
  } else if (page === 'shop') {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    const q = params.get('q');
    if (cat) {
      crumbs.push({ label: cat, href: null });
    } else if (q) {
      crumbs.push({ label: `Search: "${q}"`, href: null });
    } else {
      crumbs.push({ label: 'All Products', href: null });
    }
  }

  container.innerHTML = crumbs.map((crumb, i) => {
    const isLast = i === crumbs.length - 1;
    if (isLast || !crumb.href) {
      return `<span class="breadcrumb-item current" aria-current="page">${crumb.label}</span>`;
    }
    return `<a class="breadcrumb-item" href="${crumb.href}">${crumb.label}</a><span class="breadcrumb-separator">/</span>`;
  }).join('');
}
window.renderBreadcrumbs = renderBreadcrumbs;

// ================== RECENTLY VIEWED ==================

function renderRecentlyViewed() {
  const section = document.getElementById('recently-viewed-section');
  const grid = document.getElementById('recently-viewed-grid');
  if (!section || !grid) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('papjoy-history')) || [];
  } catch (e) { return; }

  if (!history.length) {
    section.style.display = 'none';
    return;
  }

  const recentIds = history.slice(0, 4);
  const matched = recentIds
    .map(id => products.find(p => String(p.id) === String(id) || String(p._id) === String(id) || String(p.slug) === String(id)))
    .filter(Boolean);

  if (!matched.length) {
    section.style.display = 'none';
    return;
  }

  const fragment = document.createDocumentFragment();
  matched.forEach(product => {
    const card = createProductCardElement(product);
    if (card) fragment.appendChild(card);
  });

  grid.innerHTML = '';
  grid.appendChild(fragment);
  section.style.display = '';
  initProductGridDelegation();
}
window.renderRecentlyViewed = renderRecentlyViewed;

// ================== SEARCH AUTOCOMPLETE ==================

let autocompleteAbortController = null;
let autocompleteDebounceTimer = null;

function initSearchAutocomplete() {
  const wrapper = document.querySelector('.search-autocomplete-wrapper');
  const input = document.getElementById('search-products');
  const dropdown = document.getElementById('search-autocomplete');
  if (!input || !dropdown) return;

  input.addEventListener('input', () => {
    clearTimeout(autocompleteDebounceTimer);
    const query = input.value.trim();
    if (query.length < 2) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }
    autocompleteDebounceTimer = setTimeout(() => fetchAutocomplete(query, dropdown), 250);
  });

  input.addEventListener('focus', () => {
    if (dropdown.innerHTML.trim()) dropdown.style.display = '';
  });

  document.addEventListener('click', (e) => {
    if (!wrapper || !wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    } else if (e.key === 'Enter') {
      dropdown.style.display = 'none';
    }
  });
}
window.initSearchAutocomplete = initSearchAutocomplete;

async function fetchAutocomplete(query, dropdown) {
  if (autocompleteAbortController) autocompleteAbortController.abort();
  autocompleteAbortController = new AbortController();

  try {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/products/search?q=${encodeURIComponent(query)}&limit=6`,
      { timeout: 3000, signal: autocompleteAbortController.signal }
    );
    if (!response.ok) {
      dropdown.style.display = 'none';
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.products) ? data.products : [];
    if (!items.length) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }

    dropdown.innerHTML = items.slice(0, 6).map(product => {
      const image = (product.images && product.images[0]) || product.image || PRODUCT_FALLBACK_IMAGE;
      const link = getProductLink(normalizeProduct(product));
      const price = formatCurrency(product.price || 0);
      return `
        <a class="autocomplete-item" href="${link}">
          <img src="${image}" alt="${product.name || 'Product'}" class="autocomplete-thumb" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
          <div class="autocomplete-info">
            <span class="autocomplete-name">${escapeHTML(product.name || 'Product')}</span>
            <span class="autocomplete-price">${price}</span>
          </div>
        </a>
      `;
    }).join('');
    dropdown.style.display = '';
  } catch (error) {
    if (error.name === 'AbortError') return;
    dropdown.style.display = 'none';
  }
}
window.fetchAutocomplete = fetchAutocomplete;

// ================== PRODUCT HISTORY ==================

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
window.saveViewedProduct = saveViewedProduct;

// ================== PRODUCT FILTERS INITIALIZATION ==================

async function initProductFilters() {
  const searchInput = document.getElementById('search-products');
  const sortFilter = document.getElementById('sort-filter');
  const inStockFilter = document.getElementById('in-stock-filter');
  const categoryFilter = document.getElementById('category-filter');
  const priceQuickSelect = document.getElementById('price-quick-select');

  if (!searchInput) return;

  const params = new URLSearchParams(window.location.search);
  const urlCategory = params.get('category');
  const urlQuery = params.get('q');
  if (urlCategory && searchInput) {
    searchInput.value = urlCategory;
  }
  if (urlQuery && searchInput) {
    searchInput.value = urlQuery;
  }

  // Populate category dropdown from products
  const categorySet = new Set();
  products.forEach((p) => {
    if (p.category && p.category !== 'Uncategorized') {
      categorySet.add(p.category);
    }
  });
  if (categoryFilter && categorySet.size > 0) {
    const sorted = Array.from(categorySet).sort();
    categoryFilter.innerHTML = `<option value="">All Categories</option>` +
      sorted.map((cat) => `<option value="${cat}"${urlCategory === cat ? ' selected' : ''}>${cat}</option>`).join('');
  }

  if (urlCategory && categoryFilter) {
    categoryFilter.value = urlCategory;
  }

  // Price quick-select
  if (priceQuickSelect) {
    priceQuickSelect.addEventListener('click', (e) => {
      const chip = e.target.closest('.price-chip');
      if (!chip) return;
      priceQuickSelect.querySelectorAll('.price-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      performSearch();
    });
  }

  // Event listeners
  const handleSearch = debounce(() => performSearch(), 300);

  if (searchInput) searchInput.addEventListener('input', handleSearch);
  if (sortFilter) sortFilter.addEventListener('change', () => performSearch());
  if (inStockFilter) inStockFilter.addEventListener('change', () => performSearch());
  if (categoryFilter) categoryFilter.addEventListener('change', () => performSearch());

  await performSearch();
}
window.initProductFilters = initProductFilters;

// ================== ACTIVE FILTER CHIPS ==================

function renderActiveFilters() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];
  const searchInput = document.getElementById('search-products');
  const categoryFilter = document.getElementById('category-filter');
  const sortFilter = document.getElementById('sort-filter');
  const inStockFilter = document.getElementById('in-stock-filter');
  const activePrice = document.querySelector('.price-chip.active');

  const q = searchInput?.value?.trim();
  const category = categoryFilter?.value;
  const inStock = inStockFilter?.checked;
  const priceRange = activePrice?.dataset.price;

  if (q) {
    chips.push({ label: `Search: "${q}"`, clear: () => { searchInput.value = ''; performSearch(); } });
  }
  if (category) {
    chips.push({ label: `Category: ${category}`, clear: () => { categoryFilter.value = ''; performSearch(); } });
  }
  if (priceRange && priceRange !== 'all') {
    const label = activePrice?.textContent || priceRange;
    chips.push({ label: `Price: ${label}`, clear: () => {
      document.querySelectorAll('.price-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.price-chip[data-price="all"]')?.classList.add('active');
      performSearch();
    }});
  }
  if (inStock) {
    chips.push({ label: 'In Stock', clear: () => { inStockFilter.checked = false; performSearch(); } });
  }

  if (!chips.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = chips.map((chip, i) =>
    `<span class="filter-chip">${chip.label}<button class="filter-chip-remove" data-chip-index="${i}" title="Remove">&times;</button></span>`
  ).join('') + `<button class="clear-all-btn" id="clear-all-filters">Clear All</button>`;

  container.querySelectorAll('.filter-chip-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.chipIndex, 10);
      if (chips[idx]) chips[idx].clear();
    });
  });

  const clearAllBtn = document.getElementById('clear-all-filters');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (categoryFilter) categoryFilter.value = '';
      if (inStockFilter) inStockFilter.checked = false;
      if (sortFilter) sortFilter.value = 'newest';
      document.querySelectorAll('.price-chip').forEach((c) => c.classList.remove('active'));
      document.querySelector('.price-chip[data-price="all"]')?.classList.add('active');
      performSearch();
    });
  }
}
window.renderActiveFilters = renderActiveFilters;

// ================== PAGE RENDER ==================

async function renderPage() {
  translatePage();
  const page = document.body.dataset.page;
  const hasProductGrid = !!document.querySelector('.product-grid');
  const hasCartContainer = !!document.getElementById('cart-items');
  const hasSavedContainer = !!document.getElementById('saved-items');

  injectWishlistNav();
  updateWishlistCount();

  if (hasProductGrid || page === 'home' || page === 'product' || page === 'shop' || page === 'product-detail') {
    await loadProducts();
    initFeaturedControls();
  }

  const needsSavedItemsSync = page === 'cart' || page === 'checkout' || page === 'product' || page === 'shop' || page === 'account' || page === 'product-detail';
  const needsCartSync = page === 'cart' || page === 'checkout' || page === 'account';

  if (getCurrentUser() && needsSavedItemsSync) {
    await loadUserWishlist();
  }

  if (page === 'product' || page === 'shop') {
    renderBreadcrumbs();
    await initProductFilters();
    initSearchAutocomplete();
  }

  if (page === 'home') {
    renderRecentlyViewed();
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

  if (page === 'checkout' && typeof renderCheckoutPage === 'function') {
    await renderCheckoutPage();
  }
  if (page === 'success' && typeof renderSuccessPage === 'function') {
    await renderSuccessPage();
  }
  if (page === 'thankyou' && typeof renderThankYouPage === 'function') {
    await renderThankYouPage();
  }
  if (page === 'account' && typeof renderAccountPage === 'function') {
    await renderAccountPage();
  }
  if (page === 'invoice-preview' && typeof renderInvoicePreviewPage === 'function') {
    await renderInvoicePreviewPage();
  }
  if (page === 'product-detail' && typeof renderProductDetailPage === 'function') {
    await renderProductDetailPage();
  }
}
window.products = products;
window.productsLoadPromise = productsLoadPromise;
window.searchInProgress = searchInProgress;
window.productsLoading = productsLoading;
window.selectedFeaturedFilter = selectedFeaturedFilter;
window.featuredControlsInitialized = featuredControlsInitialized;
window.searchAbortController = searchAbortController;
window.createProductCardElement = createProductCardElement;
window.initProductGridDelegation = initProductGridDelegation;
window.loadProducts = loadProducts;
window.getProductBySlug = getProductBySlug;
window.renderProducts = renderProducts;
window.updateFeaturedControlState = updateFeaturedControlState;
window.initFeaturedControls = initFeaturedControls;
window.renderProductDetailPage = renderProductDetailPage;
window.renderReviewForm = renderReviewForm;
window.renderReviews = renderReviews;
window.renderRecommendations = renderRecommendations;
window.saveViewedProduct = saveViewedProduct;
window.initProductFilters = initProductFilters;
window.performSearch = performSearch;
window.renderActiveFilters = renderActiveFilters;
window.renderBreadcrumbs = renderBreadcrumbs;
window.renderRecentlyViewed = renderRecentlyViewed;
window.initSearchAutocomplete = initSearchAutocomplete;
window.fetchAutocomplete = fetchAutocomplete;
window.renderPage = renderPage;

// Global variables
let products = [];
let currentProduct = null;
let productsCache = null;
let productsLoadPromise = null;
let productRenderCount = 0;
let searchInProgress = false;
let productsLoading = false;
let selectedCategory = '';
let searchQuery = '';
let selectedSort = 'featured';
let selectedFeaturedFilter = 'all';
let filtersInitialized = false;
let featuredControlsInitialized = false;
let searchAbortController = null;

// ================== PRODUCT CARD ==================

function createProductCardElement(product) {
  if (!product || !product.name) return null;
  const card = document.createElement('div');
  card.className = 'product-card';
  card.onclick = () => { window.location.href = getProductLink(product); };

  const imageUrls = getProductImageUrls(product);
  const primaryImage = imageUrls[0] || product.image || PRODUCT_FALLBACK_IMAGE;
  const invStatus = getInventoryStatus(product);
  const productId = product.id || product._id;

  card.innerHTML = `
    <div class="product-image">
      <img src="${primaryImage}" alt="${product.name || 'Product'}" loading="lazy" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'">
      <button class="wishlist-heart" data-product-id="${productId}" title="Add to wishlist"><i class="${isInWishlist(productId) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
      ${product.isFeatured ? '<div class="badge featured">Featured</div>' : ''}
      <div class="badge ${invStatus.class}" style="background-color: ${invStatus.color}">${invStatus.status}</div>
    </div>
    <div class="product-info">
      <div class="category">${product.category || 'Uncategorized'}</div>
      <h3 class="product-name">${product.name}</h3>
      <p class="product-subtitle">${product.subtitle || (product.description || '').slice(0, 80) + '...'}</p>
      <div class="price">${formatCurrency(product.price || 0)}</div>
      <div class="product-actions">
        <button class="btn btn-primary add-to-cart-btn" type="button" data-product-id="${productId}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
          <i class="fas fa-cart-plus"></i> ${product.inventory?.quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
        <button class="btn btn-secondary buy-now-btn" type="button" data-product-id="${productId}" ${product.inventory?.quantity === 0 ? 'disabled' : ''}>
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

async function loadProducts() {
  if (productsLoadPromise) {
    return productsLoadPromise;
  }

  productsLoading = true;
  const grid = document.querySelector('.product-grid');
  if (grid) grid.innerHTML = `<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Loading products...</p></div>`;

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
        <img id="detail-main-image" src="${activeImage}" alt="${product.name || 'Product'}" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
        <button class="wishlist-heart detail-wishlist-heart" data-product-id="${product.id || product._id}" title="Add to wishlist"><i class="${isInWishlist(product.id || product._id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
        <div class="gallery-thumbs">
          ${(product.images || [product.image || PRODUCT_FALLBACK_IMAGE]).map((src, index) => `
            <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-image="${src}">
              <img src="${src}" alt="${product.name || 'Product'} image ${index + 1}" loading="lazy" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
            </button>
          `).join('')}
        </div>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${product.category || 'Uncategorized'}</p>
        <h2>${product.name || 'Product'}</h2>
        <p class="detail-subtitle">${product.subtitle || ''}</p>
        <p class="detail-description">${product.description || ''}</p>
        <div class="product-variants">
          <p class="variant-label">Choose variant</p>
          <div class="variant-list">${variantButtons}</div>
        </div>
        <ul class="detail-features">${detailsList}</ul>
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
  const priceMinRange = document.getElementById('price-min');
  const priceMaxRange = document.getElementById('price-max');
  const productGrid = document.getElementById('product-grid') || document.querySelector('.product-grid');
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

  if (productGrid) {
    productGrid.innerHTML = `<div class="loading-state">Loading products...</div>`;
  }

  try {
    const result = await searchProducts({
      q, category, sort, inStock, priceMin, priceMax, brand, size, color,
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

  const filterOptions = await loadFilterOptions();

  const brandContainer = document.getElementById('brand-filters');
  if (brandContainer && filterOptions.brands.length > 0) {
    brandContainer.innerHTML = filterOptions.brands.map(brand => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-brand="${brand}" /> ${brand}
      </label>
    `).join('');
  }

  const sizeContainer = document.getElementById('size-filters');
  if (sizeContainer && filterOptions.sizes.length > 0) {
    sizeContainer.innerHTML = filterOptions.sizes.map(size => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-size="${size}" /> ${size}
      </label>
    `).join('');
  }

  const colorContainer = document.getElementById('color-filters');
  if (colorContainer && filterOptions.colors.length > 0) {
    colorContainer.innerHTML = filterOptions.colors.map(color => `
      <label class="filter-checkbox">
        <input type="checkbox" data-filter-color="${color}" /> ${color}
      </label>
    `).join('');
  }

  if (priceMinRange && priceMaxRange) {
    priceMinRange.max = filterOptions.priceRange.max;
    priceMaxRange.max = filterOptions.priceRange.max;
    priceMaxRange.value = filterOptions.priceRange.max;
    if (priceMaxDisplay) priceMaxDisplay.textContent = formatCurrency(filterOptions.priceRange.max);
  }

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

  document.querySelectorAll('[data-filter-brand], [data-filter-size], [data-filter-color]').forEach(checkbox => {
    checkbox.addEventListener('change', () => performSearch());
  });

  await performSearch();
}
window.initProductFilters = initProductFilters;

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
window.products = products;
window.currentProduct = currentProduct;
window.productsCache = productsCache;
window.productsLoadPromise = productsLoadPromise;
window.productRenderCount = productRenderCount;
window.searchInProgress = searchInProgress;
window.productsLoading = productsLoading;
window.selectedCategory = selectedCategory;
window.searchQuery = searchQuery;
window.selectedSort = selectedSort;
window.selectedFeaturedFilter = selectedFeaturedFilter;
window.filtersInitialized = filtersInitialized;
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
window.renderPage = renderPage;

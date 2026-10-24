// Global variables
let products = [];
let productsLoadPromise = null;
let searchInProgress = false;
let searchQueued = false;
let productsLoading = false;
let selectedFeaturedFilter = 'all';
let featuredControlsInitialized = false;
let searchAbortController = null;

// ================== PRODUCT CARD ==================

function createProductCardElement(product) {
  if (!product || !product.name) return null;
  const card = document.createElement('div');
  card.className = 'product-card';
  card.onclick = (event) => {
    if (event.target.closest('button')) return;
    if (event.target.closest('a')) return;
    window.location.href = getProductLink(product);
  };
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target.closest('button') || event.target.closest('a')) return;
      event.preventDefault();
      window.location.href = getProductLink(product);
    }
  });

  const imageUrls = getProductImageUrls(product);
  const primaryImage = imageUrls[0] || product.image || getNextFallbackImage();
  const productVideos = typeof getProductVideos === 'function' ? getProductVideos(product) : [];
  const hasVideo = Array.isArray(productVideos) && productVideos.length > 0;
  const invStatus = getInventoryStatus(product);
  const productId = product.id || product._id;
  const safeName = escapeHTML(product.name);
  const safeCategory = escapeHTML(product.category || 'Uncategorized');
  const isOutOfStock = invStatus.outOfStock;
  const isLowStock = invStatus.lowStock;

  let subtitle = product.subtitle;
  if (!subtitle && product.description) {
    subtitle = product.description.length > 80 ? product.description.slice(0, 80) + '…' : product.description;
  }

  const stockChip = (isOutOfStock || isLowStock)
    ? `<div class="stock-chip ${invStatus.class}" role="status" aria-label="${escapeHTML(invStatus.label)}"><span class="stock-chip-dot" aria-hidden="true"></span>${escapeHTML(invStatus.label)}</div>`
    : '';

  const price = Number(product.price || 0);
  const comparePrice = Number(product.comparePrice || 0);
  const discountPercent = Number(product.discountPercent || 0);
  const hasDiscount = discountPercent > 0 && comparePrice > price;

  const discountBadge = hasDiscount
    ? `<div class="badge discount">-${discountPercent}%</div>`
    : '';
  const newBadge = product.isNewArrival
    ? `<div class="badge new">${escapeHTML(translate('shop.newBadge'))}</div>`
    : '';
  const featuredBadge = product.isFeatured
    ? `<div class="badge featured">${escapeHTML(translate('shop.featuredBadge'))}</div>`
    : '';

  // The badges are stacked in a single column so that a product that is both
  // new and discounted does not end up with two labels on top of each other.
  const badges = [featuredBadge, newBadge, discountBadge].filter(Boolean).join('');
  const badgeHtml = badges ? `<div class="product-badges">${badges}</div>` : '';

  const priceRow = hasDiscount
    ? `<div class="price-row">
        <span class="price">${formatCurrency(price)}</span>
        <span class="price-compare">
          <s class="price-mrp">${formatCurrency(comparePrice)}</s>
          <span class="price-discount">${escapeHTML(translate('shop.discount', { percent: discountPercent }))}</span>
        </span>
      </div>`
    : `<div class="price-row"><span class="price">${formatCurrency(price)}</span></div>`;

  const rating = Number(product.rating || 0);
  const reviewCount = Number(product.reviewCount || 0);
  const ratingRow = rating > 0
    ? `<div class="product-rating">
        <span class="product-stars" aria-hidden="true">${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))}</span>
        <span class="product-rating-value">${rating.toFixed(1)}</span>
        ${reviewCount > 0 ? `<span class="product-review-count">(${reviewCount})</span>` : ''}
      </div>`
    : '';

  card.innerHTML = `
    <a class="product-link" href="${escapeHTML(getProductLink(product))}">
      <div class="product-info">
        <div class="product-info-top">
          <span class="category">${safeCategory}</span>
          <button class="wishlist-heart" data-product-id="${escapeHTML(productId)}" title="Add to wishlist" aria-label="Add ${safeName} to wishlist" onclick="event.preventDefault(); event.stopPropagation();"><i class="${isInWishlist(productId) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
        </div>
        <h3 class="product-name">${safeName}</h3>
        ${ratingRow}
        ${priceRow}
        ${stockChip ? stockChip.replace('class="stock-chip', 'class="stock-chip-inline') : ''}
      </div>
    </a>
    <div class="product-actions">
      <button class="btn btn-primary add-to-cart-btn" type="button" data-product-id="${escapeHTML(productId)}" ${isOutOfStock ? 'disabled' : ''}>
        ${isOutOfStock ? escapeHTML(translate('product.outOfStock')) : escapeHTML(translate('product.addToCartLabel'))}
      </button>
    </div>
  `;
  return card;
}
window.createProductCardElement = createProductCardElement;

function initProductGridDelegation(grid) {
  grid = grid || document.querySelector('.product-grid') || document.getElementById('product-grid');
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

async function fetchAllProducts() {
  const pageSize = 100;
  const collected = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/v1/products?limit=${pageSize}&page=${page}`,
      { timeout: 30000 }
    );
    if (!response.ok) {
      throw new Error(`Product API returned ${response.status}`);
    }

    const data = await response.json();
    const batch = Array.isArray(data.products) ? data.products : [];
    collected.push(...batch.map(normalizeProduct).filter(Boolean));

    const pagination = data.pagination || {};
    totalPages = Math.max(1, Number(pagination.pages) || 1);
    page += 1;

    if (!batch.length) break;
  } while (page <= totalPages);

  return collected;
}

async function loadProducts() {
  if (productsLoadPromise) {
    return productsLoadPromise;
  }

  productsLoading = true;
  const grid = document.querySelector('.product-grid');
  if (grid && document.body.dataset.page !== 'shop') showProductSkeleton(grid);

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
            if (document.body.dataset.page !== 'shop') renderProducts();
          }
        }
      } catch (error) {
        localStorage.removeItem('papjoy-products-cache');
      }
    }

    try {
      // The full catalogue is loaded (not just the first page) so that every
      // product is reachable from the listing page and from the filter facets.
      const loadedProducts = await fetchAllProducts();

      if (loadedProducts.length) {
        products = loadedProducts;
        localStorage.setItem('papjoy-products-cache', JSON.stringify({ data: products, timestamp: now }));
      } else if (cachedProducts.length) {
        products = cachedProducts;
      } else {
        products = [];
      }

      if (document.body.dataset.page !== 'shop') renderProducts();
      return products;
    } catch (error) {
      console.error('Failed to load products:', error);
      if (cachedProducts.length) {
        products = cachedProducts;
      } else {
        localStorage.removeItem('papjoy-products-cache');
        products = [];
      }
      if (document.body.dataset.page !== 'shop') renderProducts();
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
window.fetchAllProducts = fetchAllProducts;

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

  let list = products;
  if (selectedFeaturedFilter === 'featured') {
    list = products.filter((product) => product.isFeatured);
  } else if (selectedFeaturedFilter === 'new') {
    list = products.filter((product) => product.isNewArrival);
  }

  if (!list || !list.length) {
    showEmptyState(productGrid);
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((product) => {
    const card = createProductCardElement(product);
    if (card) fragment.appendChild(card);
  });

  productGrid.innerHTML = '';
  if (fragment.childNodes.length) {
    productGrid.appendChild(fragment);
  } else {
    showEmptyState(productGrid);
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

  const detailImages = getProductImageUrls(product);
  const detailVideos = typeof getProductVideos === 'function' ? getProductVideos(product) : [];
  const galleryItems = [];
  detailImages.forEach((src) => galleryItems.push({ type: 'image', src }));
  detailVideos.forEach((url, idx) => galleryItems.push({ type: 'video', url, index: idx }));
  const primaryImage = detailImages[0] || product.image || PRODUCT_FALLBACK_IMAGE;
  const activeImage = galleryItems.length ? (galleryItems[0].type === 'image' ? galleryItems[0].src : primaryImage) : primaryImage;
  const SIZE_OPTIONS = [
    { uk: 4, eu: 37 },
    { uk: 5, eu: 38 },
    { uk: 6, eu: 39 },
    { uk: 7, eu: 40 },
    { uk: 8, eu: 41 },
    { uk: 9, eu: 42 }
  ];
  const realVariants = (product.variants || []).filter((v) => !(v && v.name === 'Standard' && !v.priceDelta && !v._id));
  const variantButtons = [
    ...realVariants.map((variant, index) => ({
      html: `
        <button class="variant-option${index === 0 ? ' active' : ''}" type="button" data-price-delta="${variant.priceDelta || 0}" data-variant="${escapeHTML(variant.name || 'Standard')}">
          ${escapeHTML(variant.name || 'Standard')}${variant.priceDelta ? ` +${formatCurrency(variant.priceDelta)}` : ''}
        </button>`,
      name: variant.name || 'Standard',
      priceDelta: variant.priceDelta || 0
    })),
    ...SIZE_OPTIONS.map((size) => ({
      html: `
        <button class="variant-option size-option" type="button" data-variant="UK ${size.uk} (EU ${size.eu})">
          <span class="size-uk">UK ${size.uk}</span>
          <span class="size-eu">EU ${size.eu}</span>
        </button>`,
      name: `UK ${size.uk} (EU ${size.eu})`,
      priceDelta: 0
    }))
  ];
  if (!realVariants.length && variantButtons.length) {
    variantButtons[0].html = variantButtons[0].html.replace('class="variant-option size-option"', 'class="variant-option size-option active"');
  }
  const variantButtonsHtml = variantButtons.map((entry) => entry.html).join('');
  const defaultVariant = variantButtons.length ? variantButtons[0].name : 'Standard';
  const defaultVariantPrice = product.price + (variantButtons.length ? variantButtons[0].priceDelta : 0);
  const detailsList = (product.details || []).map((detail) => `<li>${escapeHTML(detail)}</li>`).join('');

  const galleryThumbsHtml = galleryItems.length
    ? galleryItems.map((item, index) => {
        if (item.type === 'video') {
          const yt = typeof getYouTubeIdFromUrl === 'function' ? getYouTubeIdFromUrl(item.url) : null;
          const vm = typeof getVimeoIdFromUrl === 'function' ? getVimeoIdFromUrl(item.url) : null;
          const thumb = typeof getVideoThumbnailUrl === 'function' ? getVideoThumbnailUrl(item.url) : null;
          const direct = typeof isDirectVideoUrl === 'function' ? isDirectVideoUrl(item.url) : false;
          const label = yt ? 'YT' : vm ? 'Vimeo' : direct ? 'MP4' : 'Video';
          return `
            <button class="gallery-thumb gallery-thumb--video${index === 0 && galleryItems[0].type === 'video' ? ' active' : ''}" type="button" data-video-url="${escapeHTML(item.url)}" data-video-type="${yt ? 'youtube' : vm ? 'vimeo' : direct ? 'direct' : 'other'}" data-index="${index}">
              ${thumb ? `<img src="${escapeHTML(thumb)}" alt="Video ${index + 1}" onerror="this.style.display='none'" />` : `<div class="gallery-video-thumb"><i class="fas fa-play"></i></div>`}
              <span class="gallery-video-badge">${label}</span>
            </button>
          `;
        }
        return `
          <button class="gallery-thumb${index === 0 && galleryItems[0].type === 'image' ? ' active' : ''}" type="button" data-image="${escapeHTML(item.src)}" data-index="${index}">
            <img src="${escapeHTML(item.src)}" alt="${escapeHTML(product.name || 'Product')} image ${index + 1}" onerror="handleProductImageError(this)" />
          </button>
        `;
      }).join('')
    : (detailImages.length ? detailImages : [product.image || PRODUCT_FALLBACK_IMAGE]).map((src, index) => `
        <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-image="${escapeHTML(src)}">
          <img src="${escapeHTML(src)}" alt="${escapeHTML(product.name || 'Product')} image ${index + 1}" onerror="handleProductImageError(this)" />
        </button>
      `).join('');

  container.innerHTML = `
    <div class="product-detail-card">
      <div class="product-gallery">
        <div class="product-gallery-main" id="product-gallery-main">
          <img id="detail-main-image" src="${escapeHTML(activeImage)}" alt="${escapeHTML(product.name || 'Product')}" onerror="handleProductImageError(this)" />
        </div>
        <div class="gallery-thumbs">
          ${galleryThumbsHtml}
        </div>
      </div>
      <div class="detail-copy">
        <p class="eyebrow">${escapeHTML(product.category || 'Uncategorized')}</p>
        <h2>${escapeHTML(product.name || 'Product')}</h2>
        <p class="detail-subtitle">${escapeHTML(product.subtitle || '')}</p>
        <p class="detail-description">${escapeHTML(product.description || '')}</p>
        <div class="product-variants">
          <p class="variant-label">Select size <button type="button" class="size-guide-btn" data-size-guide><i class="fas fa-ruler"></i> Size Guide</button></p>
          <div class="variant-list">${variantButtonsHtml}</div>
        </div>
        <ul class="detail-features">${detailsList}</ul>
        <div class="stock-indicator in-stock" id="detail-stock-indicator">
          <span class="dot"></span>
          <span class="stock-text">In Stock</span>
        </div>
          <div class="detail-meta">
          <div class="detail-price-wrap">
            <span id="detail-price">${formatCurrency(defaultVariantPrice)}</span>
            <span class="tax-included">All taxes included</span>
          </div>
          <button id="detail-add-button" type="button">${translate('product.addToCart')}</button>
          <button id="detail-buy-button" type="button" class="buy-now-button">Buy now</button>
          <button class="wishlist-heart detail-wishlist-heart" type="button" data-product-id="${product.id || product._id}" title="Add to wishlist" aria-label="Add to wishlist"><i class="${isInWishlist(product.id || product._id) ? 'fas fa-heart' : 'far fa-heart'}"></i></button>
        </div>
        <div class="product-share">
          <span class="product-share-label"><i class="fas fa-share-alt"></i> Share</span>
          <div class="product-share-buttons">
            <a class="product-share-btn share-whatsapp" href="#" role="button" data-share="whatsapp" title="Share on WhatsApp" aria-label="Share on WhatsApp"><i class="fab fa-whatsapp"></i></a>
            <a class="product-share-btn share-facebook" href="#" role="button" data-share="facebook" title="Share on Facebook" aria-label="Share on Facebook"><i class="fab fa-facebook-f"></i></a>
            <a class="product-share-btn share-x" href="#" role="button" data-share="x" title="Share on X" aria-label="Share on X"><i class="fab fa-x-twitter"></i></a>
            <a class="product-share-btn share-telegram" href="#" role="button" data-share="telegram" title="Share on Telegram" aria-label="Share on Telegram"><i class="fab fa-telegram-plane"></i></a>
            <a class="product-share-btn share-email" href="#" role="button" data-share="email" title="Share via Email" aria-label="Share via Email"><i class="fas fa-envelope"></i></a>
            <button class="product-share-btn share-copy" type="button" data-share="copy" title="Copy link" aria-label="Copy link"><i class="fas fa-link"></i></button>
          </div>
        </div>
      </div>
    </div>
    <section id="recommendations-section" class="recommendations-section"></section>
  `;

  const mainImage = container.querySelector('#detail-main-image');
  const galleryMain = container.querySelector('#product-gallery-main');
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

  updateDetailActions(defaultVariant, defaultVariantPrice);

  // Stock indicator
  var stockEl = container.querySelector('#detail-stock-indicator');
  if (stockEl) {
    var inv = getInventoryStatus(product);
    stockEl.className = 'stock-indicator ' + inv.class;
    stockEl.querySelector('.stock-text').textContent = inv.status;
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
    image: galleryItems.length && galleryItems[0].type === 'image' ? galleryItems.map(i => i.type === 'image' ? i.src : null).filter(Boolean) : (detailImages.length ? detailImages : [product.image || '']),
    sku: product.sku || (product.id || product._id),
    brand: { '@type': 'Brand', name: product.brand || 'PAP-JOY' },
    offers: {
      '@type': 'Offer',
      url: window.location.href,
      priceCurrency: 'INR',
      price: product.price || 0,
      availability: inv.outOfStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition'
    },
    video: detailVideos.length ? detailVideos.slice(0, 3) : undefined
  });
  document.head.appendChild(ldScript);

  function showImage(src) {
    if (!galleryMain || !mainImage) return;
    const existingVideo = galleryMain.querySelector('.product-video-player');
    if (existingVideo) existingVideo.remove();
    mainImage.style.display = '';
    mainImage.src = src;
  }

  function showVideo(url) {
    if (!galleryMain) return;
    const existingVideo = galleryMain.querySelector('.product-video-player');
    if (existingVideo) existingVideo.remove();
    if (mainImage) mainImage.style.display = 'none';

    const ytId = typeof getYouTubeIdFromUrl === 'function' ? getYouTubeIdFromUrl(url) : null;
    const vmId = typeof getVimeoIdFromUrl === 'function' ? getVimeoIdFromUrl(url) : null;
    const direct = typeof isDirectVideoUrl === 'function' ? isDirectVideoUrl(url) : false;

    if (ytId) {
      const iframe = document.createElement('iframe');
      iframe.className = 'product-video-player';
      iframe.src = 'https://www.youtube.com/embed/' + ytId + '?rel=0';
      iframe.title = product.name || 'Product video';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      iframe.frameBorder = '0';
      galleryMain.appendChild(iframe);
      return;
    }
    if (vmId) {
      const iframe = document.createElement('iframe');
      iframe.className = 'product-video-player';
      iframe.src = 'https://player.vimeo.com/video/' + vmId;
      iframe.title = product.name || 'Product video';
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.allowFullscreen = true;
      iframe.frameBorder = '0';
      galleryMain.appendChild(iframe);
      return;
    }
    if (direct) {
      const video = document.createElement('video');
      video.className = 'product-video-player';
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      galleryMain.appendChild(video);
      return;
    }

    if (mainImage) {
      mainImage.style.display = '';
      mainImage.src = url;
    }
  }

  // Recommendations
  thumbButtons.forEach((button) => {
    button.addEventListener('click', () => {
      thumbButtons.forEach((thumb) => thumb.classList.remove('active'));
      button.classList.add('active');

      if (button.dataset.videoUrl) {
        showVideo(button.dataset.videoUrl);
        return;
      }
      if (button.dataset.image) {
        showImage(button.dataset.image);
        return;
      }
      if (mainImage && button.dataset.image) {
        showImage(button.dataset.image);
        return;
      }
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

  container.querySelectorAll('[data-share]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      shareProduct(product, button.getAttribute('data-share'));
    });
  });

  updateProductShareMeta(product);

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

// ================== SHARE ==================

function getProductShareData(product) {
  const url = window.location.href.split('#')[0];
  const title = `${product.name || 'Product'} — PAP-JOY`;
  const description = String(product.subtitle || product.description || '').slice(0, 120);
  const image = getProductImageUrls(product)[0] || product.image || window.PRODUCT_FALLBACK_IMAGE || '';
  const absImage = String(image || '').replace(/^https?:\/\/papjoy-project\.onrender\.com/i, 'https://papjoy-project.onrender.com');
  return { url, title, description, image: absImage };
}

function updateProductShareMeta(product) {
  try {
    const data = getProductShareData(product);
    const setMeta = (attr, name, value) => {
      const el = document.querySelector(`meta[${attr}="${name}"]`);
      if (el) el.setAttribute('content', value);
    };
    setMeta('property', 'og:title', data.title);
    setMeta('property', 'og:description', data.description);
    setMeta('property', 'og:url', data.url);
    if (data.image) setMeta('property', 'og:image', data.image);
    setMeta('name', 'twitter:title', data.title);
    setMeta('name', 'twitter:description', data.description);
    if (data.image) setMeta('name', 'twitter:image', data.image);
    if (data.title) document.title = data.title;
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) console.warn('Failed to update share meta', err);
  }
}

function copyShareLink(url) {
  const fallbackCopy = () => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
      document.body.removeChild(textarea);
      if (typeof showToast === 'function') showToast('Link copied to clipboard');
    } catch (e3) {
      if (typeof showToast === 'function') showToast('Unable to copy link', 'error');
    }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showToast === 'function') showToast('Link copied to clipboard');
    }).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function nativeShare(data) {
  if (navigator.share) {
    navigator.share({ title: data.title, text: data.text, url: data.url }).catch((err) => {
      if (err && err.name === 'AbortError') return;
      copyShareLink(data.url);
    });
  } else {
    copyShareLink(data.url);
  }
}

function shareProduct(product, action) {
  const data = getProductShareData(product);
  const text = `${data.title} — ${data.description}`.trim();
  const enc = {
    url: encodeURIComponent(data.url),
    title: encodeURIComponent(data.title),
    text: encodeURIComponent(text),
    image: encodeURIComponent(data.image || data.url)
  };
  switch (action) {
    case 'whatsapp':
      window.open(`https://wa.me/?text=${enc.text}%20${enc.url}`, '_blank', 'noopener,noreferrer');
      break;
    case 'facebook':
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${enc.url}`, '_blank', 'noopener,noreferrer');
      break;
    case 'x':
      window.open(`https://twitter.com/intent/tweet?url=${enc.url}&text=${enc.text}`, '_blank', 'noopener,noreferrer');
      break;
    case 'telegram':
      window.open(`https://t.me/share/url?url=${enc.url}&text=${enc.text}`, '_blank', 'noopener,noreferrer');
      break;
    case 'email':
      window.location.href = `mailto:?subject=${enc.title}&body=${enc.text}%0A%0A${enc.url}`;
      break;
    case 'copy':
      copyShareLink(data.url);
      break;
    default:
      nativeShare({ title: data.title, text, url: data.url });
  }
}
window.shareProduct = shareProduct;
window.getProductShareData = getProductShareData;

// ================== SEARCH ==================
// The listing page filter/sort/pagination logic lives in js/shop.js.

async function performSearch() {
  if (typeof refreshShopResults === 'function') return refreshShopResults();
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
              <img src="${getProductImageUrls(recProduct)[0] || getNextFallbackImage()}" alt="${escapeHTML(recProduct.name)}" onerror="handleProductImageError(this)" />
              <h4>${escapeHTML(recProduct.name)}</h4>
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

// ================== CATEGORY NAVIGATION LINKS ==================

// The header and footer used to link to categories that do not exist in the
// catalogue (sneakers / casual / formal / sports). They are now rendered from
// the categories that actually have products.
function getCatalogueCategories() {
  const counts = new Map();
  (Array.isArray(products) ? products : []).forEach((product) => {
    const category = product.category && product.category !== 'Uncategorized' ? product.category : '';
    if (category) counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderCategoryNavLinks() {
  const categories = getCatalogueCategories();
  if (!categories.length) return;

  const navEl = document.getElementById('nav-categories');
  if (navEl) {
    navEl.innerHTML = categories.slice(0, 4).map(([name]) =>
      `<a href="product.html?category=${encodeURIComponent(name)}" class="header-nav-link">${escapeHTML(name)}</a>`
    ).join('');
  }

  const footerEl = document.getElementById('footer-categories');
  if (footerEl) {
    footerEl.innerHTML = categories.map(([name]) =>
      `<a href="product.html?category=${encodeURIComponent(name)}"><i class="fas fa-angle-right"></i>${escapeHTML(name)}</a>`
    ).join('');
  }
}
window.renderCategoryNavLinks = renderCategoryNavLinks;

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
    const safeLabel = escapeHTML(crumb.label);
    if (isLast || !crumb.href) {
      return `<span class="breadcrumb-item current" aria-current="page">${safeLabel}</span>`;
    }
    return `<a class="breadcrumb-item" href="${crumb.href}">${safeLabel}</a><span class="breadcrumb-separator">/</span>`;
  }).join('');
}
window.renderBreadcrumbs = renderBreadcrumbs;

// ================== RECENTLY VIEWED ==================

function buildRecentlyViewedSection() {
  let section = document.getElementById('recently-viewed-section');
  if (section) return section;
  section = document.createElement('section');
  section.className = 'recently-viewed-section';
  section.id = 'recently-viewed-section';
  section.style.display = 'none';
  section.innerHTML = `
    <div class="section-header">
      <p class="eyebrow">Your history</p>
      <h2>Recently Viewed</h2>
    </div>
    <div class="product-grid" id="recently-viewed-grid"></div>
  `;
  const mount = document.querySelector('main') || document.body;
  mount.appendChild(section);
  return section;
}
window.buildRecentlyViewedSection = buildRecentlyViewedSection;

function renderRecentlyViewed() {
  const section = buildRecentlyViewedSection();
  const grid = document.getElementById('recently-viewed-grid');
  if (!section || !grid) return;

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('papjoy-history')) || [];
  } catch (e) {
    section.style.display = 'none';
    return;
  }

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
  initProductGridDelegation(grid);
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
      const image = getProductImageUrls(product)[0] || product.image || PRODUCT_FALLBACK_IMAGE;
      const link = getProductLink(normalizeProduct(product));
      const price = formatCurrency(product.price || 0);
      return `
        <a class="autocomplete-item" href="${link}">
          <img src="${image}" alt="${product.name || 'Product'}" class="autocomplete-thumb" onerror="handleProductImageError(this)" />
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
// The listing page filter/sort/pagination logic lives in js/shop.js.

async function initProductFilters() {
  if (typeof initShopPage === 'function') return initShopPage();
}
window.initProductFilters = initProductFilters;

// ================== ACTIVE FILTER CHIPS ==================
// Rendered by js/shop.js.

function renderActiveFilters() {
  if (typeof renderShopFilterChips === 'function') return renderShopFilterChips();
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

  renderCategoryNavLinks();

  const needsSavedItemsSync = page === 'cart' || page === 'checkout' || page === 'product' || page === 'shop' || page === 'account' || page === 'product-detail';
  const needsCartSync = page === 'cart' || page === 'checkout' || page === 'account';

  if (getCurrentUser() && needsSavedItemsSync) {
    await loadUserWishlist();
  }

  if (page === 'product' || page === 'shop') {
    renderBreadcrumbs();
    if (typeof initShopPage === 'function') {
      await initShopPage();
    } else {
      await initProductFilters();
    }
    initSearchAutocomplete();
  }

  if (page === 'home' || page === 'product' || page === 'shop') {
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

  if (typeof updateUserLinks === 'function') updateUserLinks();

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

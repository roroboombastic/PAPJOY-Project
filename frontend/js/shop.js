// ================== SHOP (LISTING) PAGE ==================
//
// The listing page runs on the full catalogue that js/products.js loads into
// the shared `products` array. Filtering, sorting and pagination are applied
// client side so that:
//   - every product in the catalogue stays reachable (the old implementation
//     silently stopped after the first 20 items),
//   - the category facet matches the categories that actually exist in the
//     catalogue instead of a hard coded list that the backend ignores,
//   - results stay correct regardless of which backend revision is deployed.

const SHOP_PAGE_SIZES = [12, 24, 48, 96];
const SHOP_DEFAULT_PAGE_SIZE = 24;
const SHOP_SORTS = ['newest', 'price-asc', 'price-desc', 'rating', 'name-asc', 'discount'];
// A large part of the catalogue carries no brand at all. Those products are
// grouped under a sentinel so they stay reachable through the brand facet.
const SHOP_OTHER_BRAND = '__other__';

const shopState = {
  catalog: [],
  facets: { categories: [], brands: [], sizes: [], colors: [], priceMin: 0, priceMax: 0 },
  q: '',
  category: '',
  brands: [],
  sizes: [],
  colors: [],
  priceMin: null,
  priceMax: null,
  inStock: false,
  sort: 'newest',
  page: 1,
  perPage: SHOP_DEFAULT_PAGE_SIZE,
  view: 'grid',
  unknownCategory: '',
  ready: false
};

let shopControlsBound = false;

// ================== CATALOG & FACETS ==================

function getShopCatalog() {
  return Array.isArray(products) ? products : [];
}

function buildShopFacets(catalog) {
  const categories = new Map();
  const brands = new Map();
  const sizes = new Set();
  const colors = new Set();
  let minPrice = Infinity;
  let maxPrice = 0;

  catalog.forEach((product) => {
    const category = product.category && product.category !== 'Uncategorized' ? product.category : '';
    if (category) categories.set(category, (categories.get(category) || 0) + 1);
    const brand = product.brand || SHOP_OTHER_BRAND;
    brands.set(brand, (brands.get(brand) || 0) + 1);
    getProductSizes(product).forEach((size) => sizes.add(size));
    getProductColors(product).forEach((color) => colors.add(color));

    const price = Number(product.price || 0);
    if (price > 0) {
      minPrice = Math.min(minPrice, price);
      maxPrice = Math.max(maxPrice, price);
    }
  });

  return {
    categories: [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    brands: [...brands.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    sizes: [...sizes].sort(),
    colors: [...colors].sort(),
    priceMin: minPrice === Infinity ? 0 : minPrice,
    priceMax: maxPrice
  };
}

// ================== FILTERING & SORTING ==================

function matchesShopQuery(product, query) {
  if (!query) return true;
  const haystack = [
    product.name,
    product.subtitle,
    product.description,
    product.category,
    product.brand,
    Array.isArray(product.tags) ? product.tags.join(' ') : ''
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function getShopFilteredProducts() {
  const { q, category, brands, sizes, colors, priceMin, priceMax, inStock } = shopState;
  const query = (q || '').trim().toLowerCase();

  return shopState.catalog.filter((product) => {
    if (query && !matchesShopQuery(product, query)) return false;
    if (category && product.category !== category) return false;
    if (brands.length && !brands.includes(product.brand || SHOP_OTHER_BRAND)) return false;

    if (sizes.length) {
      const productSizes = getProductSizes(product);
      if (!productSizes.some((size) => sizes.includes(size))) return false;
    }

    if (colors.length) {
      const productColors = getProductColors(product);
      if (!productColors.some((color) => colors.includes(color))) return false;
    }

    const price = Number(product.price || 0);
    if (priceMin !== null && price < priceMin) return false;
    if (priceMax !== null && price > priceMax) return false;

    if (inStock) {
      const status = getInventoryStatus(product);
      if (!status.inStock) return false;
    }

    return true;
  });
}

function sortShopProducts(list) {
  const sorted = [...list];
  switch (shopState.sort) {
    case 'price-asc':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'rating':
      sorted.sort((a, b) => (b.rating - a.rating) || (b.reviewCount - a.reviewCount));
      break;
    case 'name-asc':
      sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      break;
    case 'discount':
      sorted.sort((a, b) => (b.discountPercent - a.discountPercent) || (a.price - b.price));
      break;
    default:
      sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  return sorted;
}

// ================== URL STATE ==================

function readShopUrlState() {
  const params = new URLSearchParams(window.location.search);

  // Only `q` feeds the search box. A `category` parameter selects the
  // category facet - it must never be copied into the search field, otherwise
  // the request is narrowed twice and most products disappear.
  shopState.q = (params.get('q') || '').trim();
  shopState.category = (params.get('category') || '').trim();

  const sort = params.get('sort');
  if (sort && SHOP_SORTS.includes(sort)) shopState.sort = sort;

  const page = parseInt(params.get('page'), 10);
  if (Number.isFinite(page) && page > 0) shopState.page = page;

  const perPage = parseInt(params.get('perPage'), 10);
  if (Number.isFinite(perPage) && SHOP_PAGE_SIZES.includes(perPage)) shopState.perPage = perPage;

  const readList = (key) => (params.get(key) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const brands = readList('brand');
  if (brands.length) shopState.brands = brands;

  const sizes = readList('size');
  if (sizes.length) shopState.sizes = sizes;

  const colors = readList('color');
  if (colors.length) shopState.colors = colors;

  const priceMin = parseInt(params.get('priceMin'), 10);
  if (Number.isFinite(priceMin) && priceMin >= 0) shopState.priceMin = priceMin;

  const priceMax = parseInt(params.get('priceMax'), 10);
  if (Number.isFinite(priceMax) && priceMax >= 0) shopState.priceMax = priceMax;

  if (params.get('stock') === '1') shopState.inStock = true;

  const view = params.get('view');
  if (view === 'list' || view === 'grid') shopState.view = view;
}

function syncShopUrl() {
  const params = new URLSearchParams();
  if (shopState.q) params.set('q', shopState.q);
  if (shopState.category) params.set('category', shopState.category);
  if (shopState.brands.length) params.set('brand', shopState.brands.join(','));
  if (shopState.sizes.length) params.set('size', shopState.sizes.join(','));
  if (shopState.colors.length) params.set('color', shopState.colors.join(','));
  if (shopState.priceMin !== null) params.set('priceMin', String(shopState.priceMin));
  if (shopState.priceMax !== null) params.set('priceMax', String(shopState.priceMax));
  if (shopState.inStock) params.set('stock', '1');
  if (shopState.sort && shopState.sort !== 'newest') params.set('sort', shopState.sort);
  if (shopState.perPage !== SHOP_DEFAULT_PAGE_SIZE) params.set('perPage', String(shopState.perPage));
  if (shopState.page > 1) params.set('page', String(shopState.page));
  if (shopState.view !== 'grid') params.set('view', shopState.view);

  const query = params.toString();
  const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  window.history.replaceState({}, '', url);
}

// ================== RENDERING ==================

function renderShopGrid(items) {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!items.length) {
    grid.innerHTML = `
      <div class="shop-empty">
        <div class="shop-empty-icon"><i class="fas fa-shoe-prints"></i></div>
        <h3>${escapeHTML(translate('shop.noResults'))}</h3>
        <p>${escapeHTML(translate('shop.noResultsHint'))}</p>
        <button type="button" class="btn btn-primary shop-empty-reset">${escapeHTML(translate('shop.clearAll'))}</button>
      </div>`;
    const resetBtn = grid.querySelector('.shop-empty-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => clearShopFilters());
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((product) => {
    const card = createProductCardElement(product);
    if (card) fragment.appendChild(card);
  });
  grid.appendChild(fragment);
  initProductGridDelegation(grid);
}

function getShopPageWindow(current, totalPages) {
  const pages = new Set([1, totalPages]);
  const start = Math.max(1, current - 1);
  const end = Math.min(totalPages, current + 1);
  for (let page = start; page <= end; page += 1) pages.add(page);
  return [...pages].sort((a, b) => a - b);
}

function renderShopPagination(totalItems) {
  const nav = document.getElementById('shop-pagination');
  if (!nav) return;

  const perPage = shopState.perPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));

  if (totalPages <= 1) {
    nav.innerHTML = '';
    nav.style.display = 'none';
    return;
  }

  nav.style.display = '';
  const current = Math.min(shopState.page, totalPages);
  const windowed = getShopPageWindow(current, totalPages);

  let html = `
    <button type="button" class="shop-page-btn shop-page-prev" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''} aria-label="${escapeHTML(translate('shop.prev'))}">
      <i class="fas fa-chevron-left"></i><span>${escapeHTML(translate('shop.prev'))}</span>
    </button>`;

  let previous = 0;
  windowed.forEach((page) => {
    if (previous && page - previous > 1) {
      html += `<span class="shop-page-gap" aria-hidden="true">&hellip;</span>`;
    }
    html += `<button type="button" class="shop-page-btn${page === current ? ' active' : ''}" data-page="${page}"${page === current ? ' aria-current="page"' : ''}>${page}</button>`;
    previous = page;
  });

  html += `
    <button type="button" class="shop-page-btn shop-page-next" data-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''} aria-label="${escapeHTML(translate('shop.next'))}">
      <span>${escapeHTML(translate('shop.next'))}</span><i class="fas fa-chevron-right"></i>
    </button>`;

  nav.innerHTML = html;
}

function renderShopStatus(totalItems) {
  const statusEl = document.getElementById('product-status');
  if (!statusEl) return;

  const perPage = shopState.perPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const current = Math.min(shopState.page, totalPages);
  const from = totalItems ? (current - 1) * perPage + 1 : 0;
  const to = Math.min(current * perPage, totalItems);

  statusEl.textContent = translate('shop.resultsRange', { from, to, total: totalItems });
}

function renderShopStats() {
  const facets = shopState.facets;
  const totalEl = document.getElementById('shop-stat-total');
  const categoryEl = document.getElementById('shop-stat-categories');
  const saleEl = document.getElementById('shop-stat-sale');

  if (totalEl) totalEl.textContent = String(shopState.catalog.length);
  if (categoryEl) categoryEl.textContent = String(facets.categories.length);
  if (saleEl) {
    const onSale = shopState.catalog.filter((product) => Number(product.discountPercent || 0) > 0).length;
    saleEl.textContent = String(onSale);
  }
}

function getShopBrandLabel(brand) {
  return brand === SHOP_OTHER_BRAND ? translate('shop.brandOther') : brand;
}

function renderShopFacets() {
  const facets = shopState.facets;

  const categoryEl = document.getElementById('facet-categories');
  if (categoryEl) {
    const rows = [[
      { name: translate('shop.allCategories'), count: shopState.catalog.length },
      ''
    ]];
    facets.categories.forEach(([name, count]) => rows.push([{ name, count }, name]));

    categoryEl.innerHTML = rows.map(([entry, value]) => `
      <button type="button" class="shop-facet${shopState.category === value ? ' active' : ''}" data-facet="category" data-value="${escapeHTML(value)}">
        <span class="shop-facet-label">${escapeHTML(entry.name)}</span>
        <span class="shop-facet-count">${entry.count}</span>
      </button>`).join('');
  }

  const brandEl = document.getElementById('facet-brands');
  if (brandEl) {
    if (!facets.brands.length) {
      brandEl.innerHTML = '<p class="shop-facet-empty">' + escapeHTML(translate('shop.noBrands')) + '</p>';
    } else {
      brandEl.innerHTML = facets.brands.map(([name, count]) => `
        <button type="button" class="shop-facet shop-facet-check${shopState.brands.includes(name) ? ' active' : ''}" data-facet="brand" data-value="${escapeHTML(name)}">
          <span class="shop-facet-box" aria-hidden="true"><i class="fas fa-check"></i></span>
          <span class="shop-facet-label">${escapeHTML(getShopBrandLabel(name))}</span>
          <span class="shop-facet-count">${count}</span>
        </button>`).join('');
    }
  }

  const sizeEl = document.getElementById('facet-sizes');
  const sizeGroup = document.querySelector('[data-facet-group="sizes"]');
  if (sizeEl) {
    if (!facets.sizes.length) {
      // The catalogue ships without size variants, so instead of an empty
      // filter we point at the size guide that the product page provides.
      sizeEl.innerHTML = `
        <p class="shop-facet-empty">${escapeHTML(translate('shop.noSizes'))}</p>
        <button type="button" class="shop-size-guide-btn" data-size-guide>
          <i class="fas fa-ruler"></i> ${escapeHTML(translate('shop.sizeGuide'))}
        </button>`;
    } else {
      sizeEl.innerHTML = facets.sizes.map((size) => `
        <button type="button" class="shop-facet-chip${shopState.sizes.includes(size) ? ' active' : ''}" data-facet="size" data-value="${escapeHTML(size)}">${escapeHTML(size)}</button>`).join('');
    }
  }
  if (sizeGroup) sizeGroup.hidden = false;

  const colorEl = document.getElementById('facet-colors');
  const colorGroup = document.querySelector('[data-facet-group="colors"]');
  if (colorEl) {
    if (!facets.colors.length) {
      colorEl.innerHTML = '<p class="shop-facet-empty">' + escapeHTML(translate('shop.noColors')) + '</p>';
    } else {
      colorEl.innerHTML = facets.colors.map((color) => `
        <button type="button" class="shop-facet-chip${shopState.colors.includes(color) ? ' active' : ''}" data-facet="color" data-value="${escapeHTML(color)}">${escapeHTML(color)}</button>`).join('');
    }
  }
  // A colour filter without any colour data is just noise - hide the group.
  if (colorGroup) colorGroup.hidden = !facets.colors.length;
}

function renderShopFilterChips() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];

  if (shopState.q) {
    chips.push({
      label: translate('shop.chipSearch', { term: shopState.q }),
      clear: () => {
        shopState.q = '';
        const input = document.getElementById('search-products');
        if (input) input.value = '';
      }
    });
  }

  if (shopState.category) {
    chips.push({
      label: translate('shop.chipCategory', { name: shopState.category }),
      clear: () => { shopState.category = ''; }
    });
  }

  shopState.brands.forEach((brand) => {
    chips.push({
      label: translate('shop.chipBrand', { name: getShopBrandLabel(brand) }),
      clear: () => { shopState.brands = shopState.brands.filter((item) => item !== brand); }
    });
  });

  shopState.sizes.forEach((size) => {
    chips.push({
      label: translate('shop.chipSize', { name: size }),
      clear: () => { shopState.sizes = shopState.sizes.filter((item) => item !== size); }
    });
  });

  shopState.colors.forEach((color) => {
    chips.push({
      label: translate('shop.chipColor', { name: color }),
      clear: () => { shopState.colors = shopState.colors.filter((item) => item !== color); }
    });
  });

  if (shopState.priceMin !== null || shopState.priceMax !== null) {
    const min = shopState.priceMin === null ? '' : formatCurrency(shopState.priceMin);
    const max = shopState.priceMax === null ? '' : formatCurrency(shopState.priceMax);
    let label;
    if (shopState.priceMin !== null && shopState.priceMax !== null) {
      label = translate('shop.chipPrice', { min, max });
    } else if (shopState.priceMin !== null) {
      label = translate('shop.chipPriceMin', { min });
    } else {
      label = translate('shop.chipPriceMax', { max });
    }
    chips.push({
      label,
      clear: () => {
        shopState.priceMin = null;
        shopState.priceMax = null;
        syncPriceInputs();
      }
    });
  }

  if (shopState.inStock) {
    chips.push({
      label: translate('shop.chipInStock'),
      clear: () => {
        shopState.inStock = false;
        const toggle = document.getElementById('in-stock-filter');
        if (toggle) toggle.checked = false;
      }
    });
  }

  if (!chips.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = chips.map((chip, index) =>
    `<span class="filter-chip">${escapeHTML(chip.label)}<button class="filter-chip-remove" data-chip-index="${index}" title="${escapeHTML(translate('shop.removeFilter'))}" aria-label="${escapeHTML(translate('shop.removeFilter'))}">&times;</button></span>`
  ).join('') + `<button class="clear-all-btn" id="clear-all-filters" type="button">${escapeHTML(translate('shop.clearAll'))}</button>`;

  container.querySelectorAll('.filter-chip-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const index = parseInt(button.dataset.chipIndex, 10);
      if (chips[index]) {
        chips[index].clear();
        applyShopFilters();
      }
    });
  });

  const clearAllBtn = document.getElementById('clear-all-filters');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => clearShopFilters());
  }
}

function renderShopNotice() {
  const noticeEl = document.getElementById('shop-notice');
  if (!noticeEl) return;

  if (!shopState.unknownCategory) {
    noticeEl.innerHTML = '';
    noticeEl.style.display = 'none';
    return;
  }

  noticeEl.style.display = '';
  noticeEl.innerHTML = `
    <i class="fas fa-info-circle"></i>
    <span>${escapeHTML(translate('shop.unknownCategory', { name: shopState.unknownCategory }))}</span>
    <button type="button" class="shop-notice-close" aria-label="${escapeHTML(translate('shop.removeFilter'))}"><i class="fas fa-times"></i></button>`;

  const closeBtn = noticeEl.querySelector('.shop-notice-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      shopState.unknownCategory = '';
      renderShopNotice();
    });
  }
}

function syncPriceInputs() {
  const minInput = document.getElementById('price-min');
  const maxInput = document.getElementById('price-max');
  if (minInput) minInput.value = shopState.priceMin === null ? '' : String(shopState.priceMin);
  if (maxInput) maxInput.value = shopState.priceMax === null ? '' : String(shopState.priceMax);
}

function syncPriceChips() {
  document.querySelectorAll('#price-quick-select .price-chip').forEach((chip) => {
    const range = chip.dataset.price || 'all';
    let active = false;
    if (range === 'all') {
      active = shopState.priceMin === null && shopState.priceMax === null;
    } else {
      const [min, max] = range.split('-').map((value) => parseInt(value, 10));
      active = shopState.priceMin === min && shopState.priceMax === max;
    }
    chip.classList.toggle('active', active);
  });
}

// ================== STATE UPDATES ==================

function applyShopFilters() {
  const filtered = getShopFilteredProducts();
  const sorted = sortShopProducts(filtered);

  const totalPages = Math.max(1, Math.ceil(sorted.length / shopState.perPage));
  if (shopState.page > totalPages) shopState.page = totalPages;

  const start = (shopState.page - 1) * shopState.perPage;
  const pageItems = sorted.slice(start, start + shopState.perPage);

  renderShopGrid(pageItems);
  renderShopPagination(sorted.length);
  renderShopStatus(sorted.length);
  renderShopFilterChips();
  renderShopFacets();
  syncPriceChips();
  syncShopUrl();

  document.body.classList.toggle('shop-list-view', shopState.view === 'list');
}

function clearShopFilters() {
  shopState.q = '';
  shopState.category = '';
  shopState.brands = [];
  shopState.sizes = [];
  shopState.colors = [];
  shopState.priceMin = null;
  shopState.priceMax = null;
  shopState.inStock = false;
  shopState.page = 1;
  shopState.unknownCategory = '';

  const input = document.getElementById('search-products');
  if (input) input.value = '';
  const toggle = document.getElementById('in-stock-filter');
  if (toggle) toggle.checked = false;

  syncPriceInputs();
  applyShopFilters();
}

function setShopCategory(category) {
  shopState.category = shopState.category === category ? '' : category;
  shopState.page = 1;
  applyShopFilters();
}

// ================== CONTROL BINDING ==================

function bindShopControls() {
  if (shopControlsBound) return;
  shopControlsBound = true;

  const searchInput = document.getElementById('search-products');
  if (searchInput) {
    const handleSearch = debounce(() => {
      shopState.q = searchInput.value.trim();
      shopState.page = 1;
      applyShopFilters();
    }, 250);
    searchInput.addEventListener('input', handleSearch);
  }

  const sortFilter = document.getElementById('sort-filter');
  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      shopState.sort = sortFilter.value;
      shopState.page = 1;
      applyShopFilters();
    });
  }

  const inStockFilter = document.getElementById('in-stock-filter');
  if (inStockFilter) {
    inStockFilter.addEventListener('change', () => {
      shopState.inStock = inStockFilter.checked;
      shopState.page = 1;
      applyShopFilters();
    });
  }

  const perPageSelect = document.getElementById('per-page-select');
  if (perPageSelect) {
    perPageSelect.addEventListener('change', () => {
      const value = parseInt(perPageSelect.value, 10);
      if (SHOP_PAGE_SIZES.includes(value)) shopState.perPage = value;
      shopState.page = 1;
      applyShopFilters();
    });
  }

  const minInput = document.getElementById('price-min');
  const maxInput = document.getElementById('price-max');
  const handlePrice = debounce(() => {
    shopState.priceMin = minInput && minInput.value !== '' ? Math.max(0, Number(minInput.value)) : null;
    shopState.priceMax = maxInput && maxInput.value !== '' ? Math.max(0, Number(maxInput.value)) : null;
    shopState.page = 1;
    applyShopFilters();
  }, 400);
  if (minInput) minInput.addEventListener('input', handlePrice);
  if (maxInput) maxInput.addEventListener('input', handlePrice);

  const priceQuickSelect = document.getElementById('price-quick-select');
  if (priceQuickSelect) {
    priceQuickSelect.addEventListener('click', (event) => {
      const chip = event.target.closest('.price-chip');
      if (!chip) return;
      const range = chip.dataset.price || 'all';
      if (range === 'all') {
        shopState.priceMin = null;
        shopState.priceMax = null;
      } else {
        const [min, max] = range.split('-').map((value) => parseInt(value, 10));
        shopState.priceMin = min;
        shopState.priceMax = max;
      }
      shopState.page = 1;
      syncPriceInputs();
      applyShopFilters();
    });
  }

  // Facet lists are re-rendered on every filter change, so the listener is
  // delegated from the document instead of being bound to the buttons.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-facet]');
    if (!button) return;

    const facet = button.dataset.facet;
    const value = button.dataset.value || '';

    if (facet === 'category') {
      setShopCategory(value);
      return;
    }

    const bucket = facet === 'brand' ? 'brands' : facet === 'size' ? 'sizes' : 'colors';
    const list = shopState[bucket];
    shopState[bucket] = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
    shopState.page = 1;
    applyShopFilters();
  });

  const pagination = document.getElementById('shop-pagination');
  if (pagination) {
    pagination.addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      const page = parseInt(button.dataset.page, 10);
      if (!Number.isFinite(page) || page < 1) return;
      shopState.page = page;
      applyShopFilters();
      const grid = document.getElementById('product-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const resetBtn = document.getElementById('shop-filter-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => clearShopFilters());
  }

  const viewToggle = document.getElementById('shop-view-toggle');
  if (viewToggle) {
    viewToggle.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      shopState.view = button.dataset.view === 'list' ? 'list' : 'grid';
      viewToggle.querySelectorAll('[data-view]').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
      document.body.classList.toggle('shop-list-view', shopState.view === 'list');
      syncShopUrl();
    });
  }

  // Mobile filter drawer
  const openBtn = document.getElementById('shop-filter-open');
  const closeBtn = document.getElementById('shop-sidebar-close');
  const applyBtn = document.getElementById('shop-sidebar-apply');
  const backdrop = document.getElementById('shop-sidebar-backdrop');
  const toggleSidebar = (open) => {
    document.body.classList.toggle('shop-filters-open', open);
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  if (openBtn) {
    openBtn.addEventListener('click', () => toggleSidebar(!document.body.classList.contains('shop-filters-open')));
  }
  if (closeBtn) closeBtn.addEventListener('click', () => toggleSidebar(false));
  if (applyBtn) applyBtn.addEventListener('click', () => toggleSidebar(false));
  if (backdrop) backdrop.addEventListener('click', () => toggleSidebar(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('shop-filters-open')) {
      toggleSidebar(false);
    }
  });
}

// ================== INIT ==================

async function initShopPage() {
  const grid = document.getElementById('product-grid');
  if (!grid) return;

  readShopUrlState();

  const searchInput = document.getElementById('search-products');
  if (searchInput) searchInput.value = shopState.q;

  const sortFilter = document.getElementById('sort-filter');
  if (sortFilter) sortFilter.value = shopState.sort;

  const perPageSelect = document.getElementById('per-page-select');
  if (perPageSelect) {
    perPageSelect.innerHTML = SHOP_PAGE_SIZES.map((size) =>
      `<option value="${size}"${size === shopState.perPage ? ' selected' : ''}>${size}</option>`
    ).join('');
  }

  // The controls have to reflect the state that was restored from the URL.
  syncPriceInputs();

  const inStockFilter = document.getElementById('in-stock-filter');
  if (inStockFilter) inStockFilter.checked = shopState.inStock;

  const viewToggle = document.getElementById('shop-view-toggle');
  if (viewToggle) {
    viewToggle.querySelectorAll('[data-view]').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === shopState.view);
    });
  }
  document.body.classList.toggle('shop-list-view', shopState.view === 'list');

  bindShopControls();

  if (grid && !shopState.ready) showProductSkeleton(grid, 8);

  await loadProducts();

  shopState.catalog = getShopCatalog();
  shopState.facets = buildShopFacets(shopState.catalog);

  // A category that does not exist in the catalogue used to render an empty
  // page. Fall back to the full catalogue instead.
  if (shopState.category) {
    const known = shopState.facets.categories.some(([name]) => name.toLowerCase() === shopState.category.toLowerCase());
    if (!known) {
      shopState.unknownCategory = shopState.category;
      shopState.category = '';
    } else {
      const match = shopState.facets.categories.find(([name]) => name.toLowerCase() === shopState.category.toLowerCase());
      shopState.category = match ? match[0] : '';
    }
  }

  shopState.ready = true;

  renderShopStats();
  renderShopNotice();
  applyShopFilters();
}

function refreshShopResults() {
  if (!shopState.ready) return initShopPage();
  shopState.catalog = getShopCatalog();
  shopState.facets = buildShopFacets(shopState.catalog);
  applyShopFilters();
  return Promise.resolve();
}

window.shopState = shopState;
window.initShopPage = initShopPage;
window.refreshShopResults = refreshShopResults;
window.renderShopFilterChips = renderShopFilterChips;
window.clearShopFilters = clearShopFilters;
window.getShopFilteredProducts = getShopFilteredProducts;

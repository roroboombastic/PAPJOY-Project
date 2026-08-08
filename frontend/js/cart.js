let cart = [];
try { cart = JSON.parse(localStorage.getItem('papjoy-cart')) || []; } catch (e) { cart = []; }
let cartUpdateInProgress = false;
let remoteCartLoaded = false;
let syncCartTimer = null;
let syncCartPromise = null;
let appliedPromoCode = localStorage.getItem('papjoy-promo') || '';
let validatedDiscount = JSON.parse(localStorage.getItem('papjoy-discount') || 'null');

function saveCart() {
  localStorage.setItem('papjoy-cart', JSON.stringify(cart));
  if (typeof updateCartCount === 'function') updateCartCount();
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
    shippingCharge: item.shippingCharge || 0,
    weight: item.weight || 0,
    length: item.length || 0,
    breadth: item.breadth || 0,
    height: item.height || 0,
    hsnCode: item.hsnCode || '',
  }));
}

function normalizeServerCartItem(item) {
  const product = item.productId || {};
  return {
    id: product._id || product.slug || String(item.productId),
    productId: product._id || String(item.productId),
    name: product.name || item.name || 'Product',
    image: getProductImageUrls(product)[0] || product.image || PRODUCT_FALLBACK_IMAGE,
    variant: item.variant || 'Standard',
    price: Number(item.price || product.price || 0),
    quantity: Number(item.quantity || 1),
    category: product.category || (product.categoryId && product.categoryId.name) || item.category || '',
    subtitle: product.shortDescription || product.subtitle || item.subtitle || '',
    shippingCharge: Number(product.shippingCharge || item.shippingCharge || 0),
    weight: Number(product.weight || item.weight || 0),
    length: Number(product.length || item.length || 0),
    breadth: Number(product.breadth || item.breadth || 0),
    height: Number(product.height || item.height || 0),
    hsnCode: product.hsnCode || item.hsnCode || ''
  };
}

function mergeServerCart(remoteItems) {
  const merged = [...cart];
  const seenKeys = new Set();

  cart.forEach(item => {
    seenKeys.add(getItemIdentity(item, item.variant || 'Standard'));
  });

  remoteItems.forEach((item) => {
    const normalized = normalizeServerCartItem(item);
    const key = getItemIdentity(normalized, normalized.variant || 'Standard');
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const existing = merged.find((entry) => getItemIdentity(entry, entry.variant || 'Standard') === key);
    if (!existing) {
      merged.push(normalized);
    }
  });

  cart = merged;
  saveCart();
  renderCart();
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

function syncCart() {
  const user = getCurrentUser();
  const token = getAuthToken();
  if (!user || !user.id || !token) return;
  if (syncCartTimer) clearTimeout(syncCartTimer);
  if (syncCartPromise) return;
  syncCartTimer = setTimeout(async () => {
    syncCartTimer = null;
    syncCartPromise = (async () => {
      try {
        const response = await apiRequest('/api/v1/cart/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart })
        });
      } catch (error) {
        console.error('Failed to sync cart to server:', error);
      } finally {
        syncCartPromise = null;
      }
    })();
    try {
      await syncCartPromise;
    } catch {
      // ignored, error already logged
    }
  }, 300);
}

function syncCartImmediate() {
  const user = getCurrentUser();
  const token = getAuthToken();
  if (!user || !user.id || !token) return;
  if (syncCartTimer) clearTimeout(syncCartTimer);
  try {
    const payload = JSON.stringify({ cart });
    navigator.sendBeacon(
      `${API_BASE_URL}/api/v1/cart/sync`,
      new Blob([payload], { type: 'application/json' })
    );
  } catch (error) {
    console.error('Failed to sync cart on unload:', error);
  }
}

function addToCart(productId, variantName = 'Standard', variantPrice = null, redirectToCheckout = false) {
  if (cartUpdateInProgress) return;
  cartUpdateInProgress = true;

  const product = getProductById(productId);
  if (!product) {
    cartUpdateInProgress = false;
    return;
  }

  const selectedVariant = normalizeVariantName(variantName);
  const price = typeof variantPrice === 'number' ? variantPrice : product.price;
  
  // Check inventory locally first
  let availableStock = product.inventory?.quantity || 0;
  if (selectedVariant !== 'Standard') {
    const variant = product.variants?.find(v => v.name === selectedVariant);
    availableStock = variant?.inventory || product.inventory?.quantity || 0;
  }

  if (availableStock <= 0) {
    showToast('This product is out of stock');
    cartUpdateInProgress = false;
    return;
  }

  const existing = cart.find((item) => getItemIdentity(item, item.variant || 'Standard') === getItemIdentity({ id: productId, variant: selectedVariant }, selectedVariant));
  const currentQuantity = existing?.quantity || 0;

  if (currentQuantity >= availableStock) {
    showToast(`Only ${availableStock} items available (${currentQuantity} already in cart)`);
    cartUpdateInProgress = false;
    return;
  }

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id || product._id,
      productId: product.id || product._id,
      name: product.name,
      image: getProductImageUrls(product)[0] || product.image || PRODUCT_FALLBACK_IMAGE,
      price,
      quantity: 1,
      variant: selectedVariant,
      category: product.category,
      subtitle: product.subtitle,
      shippingCharge: Number(product.shippingCharge) || 0,
      weight: Number(product.weight) || 0,
      length: Number(product.length) || 0,
      breadth: Number(product.breadth) || 0,
      height: Number(product.height) || 0,
      hsnCode: product.hsnCode || '',
    });
  }

  saveCart();
  syncCart();
  renderCart();

  const quantity = existing ? existing.quantity : 1;
  const message = `${product.name}${selectedVariant !== 'Standard' ? ' - ' + selectedVariant : ''} (x${quantity}) ${translate('toast.addedCart')}`;
  showToast(message);

  cartUpdateInProgress = false;

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

function checkout() {
  if (cart.length === 0) {
    showToast(translate('checkout.emptyCart'));
    return;
  }
  window.location.href = 'checkout.html';
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
  if (cartUpdateInProgress) return;
  cartUpdateInProgress = true;

  const item = cart.find((entry) => getItemIdentity(entry, entry.variant || 'Standard') === getItemIdentity({ id: productId, variant: variantName }, variantName));
  if (!item) {
    cartUpdateInProgress = false;
    return;
  }

  if (delta > 0) {
    const product = getProductById(productId);
    if (product) {
      let availableStock = product.inventory?.quantity || 0;
      const selectedVariant = normalizeVariantName(variantName);
      if (selectedVariant !== 'Standard') {
        const variant = product.variants?.find(v => v.name === selectedVariant);
        availableStock = variant?.inventory || product.inventory?.quantity || 0;
      }
      if (item.quantity + delta > availableStock) {
        showToast(`Only ${availableStock} items available`);
        cartUpdateInProgress = false;
        return;
      }
    }
  }

  item.quantity += delta;
  if (item.quantity <= 0) {
    cartUpdateInProgress = false;
    removeFromCart(productId, variantName);
  } else {
    saveCart();
    syncCart();
    renderCart();
    cartUpdateInProgress = false;
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
  const itemShipping = normalizedItems.reduce((sum, item) => sum + (Number(item.shippingCharge) || 0) * item.quantity, 0);
  const shipping = Number.isFinite(Number(options.shipping)) ? Math.round(Number(options.shipping)) : Math.round(itemShipping);
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

  if (appliedPromoCode && validatedDiscount && validatedDiscount.valid) {
    totals.discount = validatedDiscount.discount;
    totals.total = totals.subtotal + totals.shipping + totals.tax - totals.discount;
  }

  return totals;
}

function updateCartSummary() {
  const subtotalEl = document.getElementById('subtotal');
  const shippingEl = document.getElementById('shipping');
  const totalEl = document.getElementById('total');
  const countEl = document.getElementById('cart-count');
  const discountEl = document.getElementById('discount-amount');
  const discountRow = document.getElementById('promo-discount');
  const totals = getCartTotals();

  if (countEl) countEl.textContent = totals.count;
  if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
  if (shippingEl) shippingEl.textContent = totals.shipping === 0 ? translate('cart.free') : formatCurrency(totals.shipping);
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
    } else if (totals.shipping === 0) {
      shippingNote.textContent = 'This order ships for FREE.';
    } else {
      shippingNote.textContent = `Shipping charges apply based on the items in your cart (₹${formatCurrency(totals.shipping)}).`;
    }
  }

  updateCartCount();
}

function updateCheckoutSummary() {
  const subtotalEl = document.getElementById('checkout-subtotal');
  const shippingEl = document.getElementById('checkout-shipping');
  const totalEl = document.getElementById('checkout-total');
  const countEl = document.getElementById('checkout-count');
  const totals = getCartTotals();

  if (countEl) countEl.textContent = totals.count;
  if (subtotalEl) subtotalEl.textContent = formatCurrency(totals.subtotal);
  if (shippingEl) shippingEl.textContent = totals.shipping === 0 ? translate('cart.free') : formatCurrency(totals.shipping);
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
    container.innerHTML = `
      <li class="cart-item empty-cart">
        <div class="empty-cart-icon"><i class="fas fa-shopping-bag"></i></div>
        <h3>${translate('cart.empty')}</h3>
        <p>Looks like you haven't added any shoes yet.</p>
        <a href="product.html" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;padding:14px 32px;border-radius:16px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;">
          <i class="fas fa-arrow-left"></i> Continue Shopping
        </a>
      </li>`;
    updateCartSummary();
    return;
  }

  container._cartItemId = null;
  cart.forEach((item) => {
    const safeId = encodeURIComponent(String(item.id || ''));
    const safeVariant = encodeURIComponent(String(item.variant || 'Standard'));
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.dataset.cartId = safeId;
    li.dataset.cartVariant = safeVariant;
    li.innerHTML = `
      <div class="cart-item-meta">
        <div class="cart-item-avatar">
          <img src="${item.image || item.product?.image || PRODUCT_FALLBACK_IMAGE}" alt="${escapeHTML(item.name)}" onerror="handleProductImageError(this)" />
        </div>
        <div class="cart-item-content">
          <h3>${escapeHTML(item.name)}</h3>
          ${item.variant ? `<p class="cart-variant">${escapeHTML(item.variant)}</p>` : ''}
          <p class="cart-item-price">${formatCurrency(item.price * item.quantity)}</p>
          <p class="cart-item-subtext">${translate('cart.subtotal')}: ${formatCurrency(item.price * item.quantity)}</p>
        </div>
      </div>
      <div class="item-controls">
        <button class="cart-qty-btn" data-cart-action="decr">-</button>
        <span>${item.quantity}</span>
        <button class="cart-qty-btn" data-cart-action="incr">+</button>
        <button class="remove-button cart-remove-btn">${translate('item.remove')}</button>
        <button class="save-for-later-btn cart-save-btn" title="Save for later"><i class="fas fa-bookmark"></i></button>
      </div>
    `;
    container.appendChild(li);
  });

  // Attach one delegated listener per render (remove old first, attach new)
  if (container._cartListener) {
    container.removeEventListener('click', container._cartListener);
  }
  const handler = (e) => {
    const li = e.target.closest('.cart-item');
    if (!li) return;
    const id = decodeURIComponent(li.dataset.cartId || '');
    const variant = decodeURIComponent(li.dataset.cartVariant || 'Standard');
    if (e.target.closest('.cart-qty-btn')) {
      const delta = e.target.closest('.cart-qty-btn').dataset.cartAction === 'incr' ? 1 : -1;
      changeQuantity(id, delta, variant);
    } else if (e.target.closest('.cart-remove-btn')) {
      removeFromCart(id, variant);
    } else if (e.target.closest('.cart-save-btn')) {
      saveForLater(id, variant);
    }
  };
  container.addEventListener('click', handler);
  container._cartListener = handler;

  updateCartSummary();
  renderSavedItems();
}

function resetCartState() {
  cart = [];
  appliedPromoCode = '';
  validatedDiscount = null;
  localStorage.removeItem('papjoy-promo');
  localStorage.removeItem('papjoy-discount');
  saveCart();
  syncCart();
}

function clearCart() {
  if (!cart.length) {
    showToast('Your cart is already empty.');
    return;
  }
  if (!confirm('Are you sure you want to clear your cart? This cannot be undone.')) return;
  resetCartState();
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
  syncCart();
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
  syncCart();
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  showToast(`${item.name} moved to cart!`);
  renderCart();
  renderSavedItems();
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

  // Remove old listener
  if (container._savedListener) {
    container.removeEventListener('click', container._savedListener);
  }

  container.innerHTML = savedItems
    .map(
      (item) => {
        const safeId = encodeURIComponent(String(item.id || ''));
        const safeVariant = encodeURIComponent(String(item.variant || 'Standard'));
        return `
    <li class="saved-item" data-saved-id="${safeId}" data-saved-variant="${safeVariant}">
      <div class="saved-item-meta">
        <div class="saved-item-avatar">
          <img src="${item.image || item.product?.image || PRODUCT_FALLBACK_IMAGE}" alt="${escapeHTML(item.name)}" onerror="handleProductImageError(this)" />
        </div>
        <div class="saved-item-content">
          <h4>${escapeHTML(item.name)}</h4>
          ${item.variant ? `<p class="saved-variant">${escapeHTML(item.variant)}</p>` : ''}
          <p class="saved-price">${formatCurrency(item.price)}</p>
        </div>
      </div>
      <div class="saved-actions">
        <button class="move-to-cart-btn saved-move-btn"><i class="fas fa-cart-plus"></i> Cart</button>
        <button class="remove-saved-btn saved-del-btn"><i class="fas fa-trash"></i></button>
      </div>
    </li>
  `;
      }
    )
    .join('');

  const savedHandler = (e) => {
    const li = e.target.closest('.saved-item');
    if (!li) return;
    const id = decodeURIComponent(li.dataset.savedId || '');
    const variant = decodeURIComponent(li.dataset.savedVariant || 'Standard');
    if (e.target.closest('.saved-move-btn')) {
      moveFromSaved(id, variant);
    } else if (e.target.closest('.saved-del-btn')) {
      removeSavedItem(id, variant);
    }
  };
  container.addEventListener('click', savedHandler);
  container._savedListener = savedHandler;
}

function showCart() {
  window.location.href = 'cart.html';
}

async function applyPromoCode() {
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

  const subtotal = calculateOrderTotals(cart).subtotal;

  try {
    const { response, data } = await apiFetch('/api/v1/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal, items: getCheckoutItems() })
    });

    if (!response.ok || !data?.valid) {
      if (message) {
        message.textContent = data?.error || 'Invalid promo code';
        message.className = 'promo-message error';
      }
      appliedPromoCode = '';
      validatedDiscount = null;
      localStorage.removeItem('papjoy-promo');
      localStorage.removeItem('papjoy-discount');
      showToast(data?.error || 'Promo code is not valid.');
    } else {
      appliedPromoCode = code;
      validatedDiscount = data;
      localStorage.setItem('papjoy-promo', code);
      localStorage.setItem('papjoy-discount', JSON.stringify(data));
      if (message) {
        message.textContent = `${data.label} applied! You save ${formatCurrency(data.discount)}`;
        message.className = 'promo-message success';
      }
      if (input) input.value = code;
      showToast(`${data.label} applied.`);
    }
  } catch (error) {
    console.error('Coupon validation error:', error);
    if (message) {
      message.textContent = 'Failed to validate promo code. Please try again.';
      message.className = 'promo-message error';
    }
    showToast('Failed to validate promo code.');
  }

  updateCartSummary();
}

window.getCart = function() { return cart; };
window.getCartUpdateInProgress = function() { return cartUpdateInProgress; };
window.setCartUpdateInProgress = function(val) { cartUpdateInProgress = val; };
window.isRemoteCartLoaded = function() { return remoteCartLoaded; };
window.setRemoteCartLoaded = function(val) { remoteCartLoaded = val; };
window.getAppliedPromoCode = function() { return appliedPromoCode; };
window.setAppliedPromoCode = function(val) { appliedPromoCode = val; };
window.getValidatedDiscount = function() { return validatedDiscount; };
window.setValidatedDiscount = function(val) { validatedDiscount = val; };
window.normalizeServerCartItem = normalizeServerCartItem;
window.mergeServerCart = mergeServerCart;
window.loadUserCart = loadUserCart;
window.syncCart = syncCart;
window.syncCartImmediate = syncCartImmediate;
window.addToCart = addToCart;
window.addToCartFlow = addToCartFlow;
window.buyNowFlow = buyNowFlow;
window.buyNow = buyNow;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.calculateOrderTotals = calculateOrderTotals;
window.getCartTotals = getCartTotals;
window.updateCartSummary = updateCartSummary;
window.updateCheckoutSummary = updateCheckoutSummary;
window.renderCart = renderCart;
window.resetCartState = resetCartState;
window.clearCart = clearCart;
window.saveForLater = saveForLater;
window.moveFromSaved = moveFromSaved;
window.renderSavedItems = renderSavedItems;
window.showCart = showCart;
window.applyPromoCode = applyPromoCode;

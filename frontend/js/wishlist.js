let savedItems = [];
try { savedItems = JSON.parse(localStorage.getItem('papjoy-saved')) || []; } catch (e) { savedItems = []; }
let wishlistUpdated = false;
let browsingHistory = [];
try { browsingHistory = JSON.parse(localStorage.getItem('papjoy-history')) || []; } catch (e) { browsingHistory = []; }

function isInWishlist(productId) {
  return savedItems.some((item) =>
    String(item.id || item._id || item.productId) === String(productId)
  );
}

function toggleWishlist(productId, event) {
  if (event) event.stopPropagation();
  const existing = savedItems.find((item) =>
    String(item.id || item._id || item.productId) === String(productId)
  );
  if (existing) {
    removeSavedItem(productId, existing.variant || 'Standard');
  } else {
    const product = getProductById(productId);
    if (!product) return;
    savedItems.push({
      id: product.id || product._id,
      productId: product.id || product._id,
      name: product.name,
      image: getProductImageUrls(product)[0] || product.image || PRODUCT_FALLBACK_IMAGE,
      price: product.price,
      variant: 'Standard',
      category: product.category,
      subtitle: product.subtitle,
    });
    localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
    syncWishlistItem({ id: product.id || product._id, variant: 'Standard' });
    showToast(`${product.name} added to wishlist`);
  }
  updateWishlistCount();
  updateProductCardHearts();
}

function updateWishlistCount() {
  const count = savedItems.length;
  const badge = document.getElementById('wishlist-count');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }
}

function updateProductCardHearts() {
  document.querySelectorAll('.wishlist-heart').forEach((heart) => {
    const productId = heart.dataset.productId;
    if (!productId) return;
    const saved = isInWishlist(productId);
    const icon = heart.querySelector('i');
    if (icon) {
      icon.className = saved ? 'fas fa-heart' : 'far fa-heart';
    }
    heart.classList.toggle('active', saved);
  });
}

function removeSavedItem(productId, variantName = 'Standard') {
  const key = getItemIdentity({ id: productId, variant: variantName }, variantName);
  savedItems = savedItems.filter((item) => getItemIdentity(item, item.variant || 'Standard') !== key);
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  removeWishlistItem(productId, variantName);
  renderSavedItems();
  updateWishlistCount();
  updateProductCardHearts();
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
    await fetch(`${API_BASE_URL}/api/v1/wishlist/${encodeURIComponent(productId)}?variant=${encodeURIComponent(variantName)}`, {
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
  if (wishlistUpdated) return;
  wishlistUpdated = true;

  const remoteItems = await fetchUserWishlist();
  if (!remoteItems.length && savedItems.length) {
    await syncSavedItemsToServer();
    return;
  }

  if (!remoteItems.length) return;

  const merged = [...savedItems];
  const seenKeys = new Set();
  savedItems.forEach(item => seenKeys.add(getItemIdentity(item, item.variant || 'Standard')));

  remoteItems.forEach((item) => {
    const remoteProductId = item.productId?._id || item.productId;
    const variantName = item.variant || 'Standard';
    const key = getItemIdentity({ id: remoteProductId, variant: variantName }, variantName);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const product = getProductById(remoteProductId);
    if (product) {
      merged.push({
        ...product,
        id: remoteProductId,
        variant: variantName,
        quantity: 1,
      });
    } else {
      merged.push({
        id: remoteProductId,
        productId: remoteProductId,
        name: item.productId?.name || 'Saved item',
        variant: variantName,
        quantity: 1,
      });
    }
  });

  savedItems = dedupeItemsByKey(merged, (item) => getItemIdentity(item, item.variant || 'Standard'));
  localStorage.setItem('papjoy-saved', JSON.stringify(savedItems));
  updateWishlistCount();
  updateProductCardHearts();

  if (savedItems.length) {
    await syncSavedItemsToServer();
  }
}

async function syncSavedItemsToServer() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const payload = dedupeItemsByKey(savedItems, (item) => getItemIdentity(item, item.variant || 'Standard')).map((item) => ({
      productId: item.id || item.productId,
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

window.savedItems = savedItems;
window.wishlistUpdated = wishlistUpdated;
window.browsingHistory = browsingHistory;
window.isInWishlist = isInWishlist;
window.toggleWishlist = toggleWishlist;
window.updateWishlistCount = updateWishlistCount;
window.updateProductCardHearts = updateProductCardHearts;
window.removeSavedItem = removeSavedItem;
window.fetchUserWishlist = fetchUserWishlist;
window.syncWishlistItem = syncWishlistItem;
window.removeWishlistItem = removeWishlistItem;
window.loadUserWishlist = loadUserWishlist;
window.syncSavedItemsToServer = syncSavedItemsToServer;

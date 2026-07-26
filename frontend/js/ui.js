// ================== UI FUNCTIONS ==================

function showEmptyState() {
  const grid = document.querySelector('.product-grid');
  if (!grid) return;
  grid.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No products available</p></div>`;
}
window.showEmptyState = showEmptyState;

function createToastContainer() {
  if (document.getElementById('cart-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'cart-toast';
  toast.className = 'cart-toast';
  document.body.appendChild(toast);
}
window.createToastContainer = createToastContainer;

function showToast(message, type) {
  createToastContainer();
  const toast = document.getElementById('cart-toast');
  if (!toast) return;
  toast.className = 'cart-toast';
  if (type) toast.classList.add('toast-' + type);
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 3000);
}
window.showToast = showToast;

function createPageTransitionOverlay() {
  if (document.getElementById('page-transition-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'page-transition-overlay';
  overlay.className = 'page-transition-overlay';
  document.body.appendChild(overlay);
}
window.createPageTransitionOverlay = createPageTransitionOverlay;

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
window.triggerPageTransition = triggerPageTransition;

function injectWishlistNav() {
  if (document.getElementById('wishlist-nav-link')) return;
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const accountLink = nav.querySelector('a[href="account.html"]');
  const wishlistLink = document.createElement('a');
  wishlistLink.id = 'wishlist-nav-link';
  wishlistLink.href = 'account.html#wishlist';
  wishlistLink.className = 'nav-link';
  wishlistLink.innerHTML = '<i class="fas fa-heart"></i><span>Wishlist</span><span class="cart-badge" id="wishlist-count" style="display:none">0</span>';
  if (accountLink) {
    nav.insertBefore(wishlistLink, accountLink);
  } else {
    nav.appendChild(wishlistLink);
  }
}
window.injectWishlistNav = injectWishlistNav;

function updateNavLinkText(link, text) {
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
}
window.updateNavLinkText = updateNavLinkText;

function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('#cart-count, #utility-cart-count').forEach((el) => {
    el.textContent = count;
  });
}
window.updateCartCount = updateCartCount;

function updateLocaleSwitcher() {
  const select = document.getElementById('region-selector');
  if (!select) return;
  select.value = selectedRegion;
}
window.updateLocaleSwitcher = updateLocaleSwitcher;



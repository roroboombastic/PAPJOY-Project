let sidebarCreated = false;
let navResizeHandler = null;

function updateUserLinks() {
  const user = getCurrentUser();
  const links = Array.from(document.querySelectorAll('.site-nav a, .sidebar-nav a'));

  links.forEach((link) => {
    if (link.getAttribute('href') === 'signin.html') {
      if (user) {
        link.onclick = null;
        updateNavLinkText(link, translate('nav.signout'));
        link.href = '#';
        link.onclick = (event) => {
          event.preventDefault();
          signOut();
        };
      } else {
        link.onclick = null;
        updateNavLinkText(link, translate('nav.signin'));
        link.href = 'signin.html';
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
  toggle?.setAttribute('aria-label', shouldOpen ? 'Close navigation menu' : 'Open navigation menu');
  document.body.style.overflow = shouldOpen ? 'hidden' : '';

  if (shouldOpen && sidebar) {
    sidebar.querySelector('a')?.focus();
  } else if (!shouldOpen && toggle) {
    toggle.focus();
  }
}

function closeMobileSidebar() {
  toggleMobileSidebar(true);
}

function getActivePageName() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const page = path.replace(/\.html$/i, '');
  if (page === '' || page === 'index' || page === 'home') return 'index';
  return page;
}

function isActiveNavPage(href) {
  const current = getActivePageName();
  const pageName = href.replace(/\.html$/i, '');
  if (pageName === 'index' || pageName === 'home') {
    return current === 'index';
  }
  return current === pageName;
}

function createSidebar() {
  if (sidebarCreated) return;
  if (document.querySelector('.admin-sidebar') || document.querySelector('.admin-container')) return;

  sidebarCreated = true;

  const existingLegacyOverlay = document.getElementById('sidebar-overlay');
  if (existingLegacyOverlay) existingLegacyOverlay.remove();

  const existingSidebar = document.getElementById('site-sidebar');
  const existingMobileOverlay = document.getElementById('mobile-nav-overlay');
  const currentCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const sidebar = existingSidebar || document.createElement('aside');
  if (!existingSidebar) {
    sidebar.id = 'site-sidebar';
    sidebar.className = 'site-sidebar';
    document.body.prepend(sidebar);
  }

  sidebar.innerHTML = `
    <div class="sidebar-brand"><a href="index.html">PAP-JOY</a></div>
    <nav class="sidebar-nav">
      <a href="index.html" class="nav-link${isActiveNavPage('index.html') ? ' active' : ''}"${isActiveNavPage('index.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-home"></i><span>Home</span></a>
      <a href="product.html" class="nav-link${isActiveNavPage('product.html') ? ' active' : ''}"${isActiveNavPage('product.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-store"></i><span>Shop</span></a>
      <a href="cart.html" class="nav-link${isActiveNavPage('cart.html') ? ' active' : ''}"${isActiveNavPage('cart.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-shopping-cart"></i><span>Cart</span><span class="cart-badge" id="cart-count">${currentCartCount}</span></a>
      <a href="tracking.html" class="nav-link${isActiveNavPage('tracking.html') ? ' active' : ''}"${isActiveNavPage('tracking.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-truck"></i><span>Track Order</span></a>
      <a href="account.html" class="nav-link${isActiveNavPage('account.html') ? ' active' : ''}"${isActiveNavPage('account.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-user"></i><span>Account</span></a>
      <a href="signin.html" class="nav-link${isActiveNavPage('signin.html') ? ' active' : ''}"${isActiveNavPage('signin.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-sign-in-alt"></i><span>Sign In</span></a>
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

  if (!existingMobileOverlay) {
    const overlay = document.createElement('div');
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
    toggleButton.setAttribute('aria-label', 'Open navigation menu');
    toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.appendChild(toggleButton);
  }

  document.body.classList.add('has-global-nav');

  sidebar.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) closeMobileSidebar();
  });

  const navOverlay = document.getElementById('mobile-nav-overlay');
  if (navOverlay && !navOverlay._navListener) {
    navOverlay.addEventListener('click', () => closeMobileSidebar());
    navOverlay._navListener = true;
  }

  if (!navResizeHandler) {
    let resizeTimer;
    navResizeHandler = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 1024) closeMobileSidebar();
      }, 150);
    };
    window.addEventListener('resize', navResizeHandler);
  }

  const activeToggle = document.getElementById('mobile-menu-toggle');
  if (activeToggle && !activeToggle._navListener) {
    activeToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleMobileSidebar();
    });
    activeToggle._navListener = true;
  }

  updateCartCount();
}


function createLocaleSwitcher() {
  if (document.getElementById('region-switcher-wrapper')) return;

  const sidebarMeta = document.querySelector('.sidebar-meta');
  const target = sidebarMeta || document.querySelector('.sidebar-brand');
  if (!target) return;

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

  target.appendChild(wrapper);
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

window.sidebarCreated = sidebarCreated;
window.navResizeHandler = navResizeHandler;
window.updateUserLinks = updateUserLinks;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.getActivePageName = getActivePageName;
window.isActiveNavPage = isActiveNavPage;
window.createSidebar = createSidebar;
window.createLocaleSwitcher = createLocaleSwitcher;
window.initPageTransitions = initPageTransitions;
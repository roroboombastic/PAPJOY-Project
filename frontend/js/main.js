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
  if (typeof syncCartTimer !== 'undefined' && syncCartTimer) clearTimeout(syncCartTimer);
  if (typeof syncCartImmediate === 'function') syncCartImmediate();
  if (typeof trackingInterval !== 'undefined' && trackingInterval) clearInterval(trackingInterval);
  if (typeof trackingSSE !== 'undefined' && trackingSSE) trackingSSE.close();
  if (typeof trackingGPSsse !== 'undefined' && trackingGPSsse) trackingGPSsse.close();
  if (typeof notificationSSE !== 'undefined' && notificationSSE) notificationSSE.close();
  if (typeof productsLoadPromise !== 'undefined') productsLoadPromise = null;
  if (typeof wishlistUpdated !== 'undefined') wishlistUpdated = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('mobile-nav-open')) {
    if (typeof closeMobileSidebar === 'function') closeMobileSidebar();
  }
});

function initCookieConsent() {
  if (localStorage.getItem('papjoy-cookie-consent')) return;
  const banner = document.createElement('div');
  banner.id = 'cookie-consent-banner';
  banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:var(--bg-secondary,#1a1a1a);color:var(--text-primary,#e0e0e0);padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;z-index:9999;font-size:0.9rem;border-top:1px solid var(--border,#333);flex-wrap:wrap;';
  banner.innerHTML = '<span>We use cookies to improve your experience. By continuing, you agree to our use of cookies.</span><div style="display:flex;gap:8px;flex-shrink:0;"><button id="cookie-accept" style="background:var(--primary,#7c9a72);color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-weight:500;">Accept</button><button id="cookie-dismiss" style="background:transparent;color:var(--text-muted,#999);border:1px solid var(--border,#444);padding:8px 16px;border-radius:6px;cursor:pointer;">Dismiss</button></div>';
  document.body.appendChild(banner);
  const accept = () => { localStorage.setItem('papjoy-cookie-consent', 'accepted'); banner.remove(); };
  const dismiss = () => { localStorage.setItem('papjoy-cookie-consent', 'dismissed'); banner.remove(); };
  document.getElementById('cookie-accept').addEventListener('click', accept);
  document.getElementById('cookie-dismiss').addEventListener('click', dismiss);
}

function initAnnouncementBar() {
  const bar = document.getElementById('announcement-bar');
  if (!bar) return;

  if (localStorage.getItem('papjoy-announcement-hidden') === 'true') {
    bar.remove();
    return;
  }

  document.body.classList.add('has-announcement');

  const closeBtn = document.getElementById('announcement-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      bar.classList.add('hidden');
      localStorage.setItem('papjoy-announcement-hidden', 'true');
      setTimeout(() => {
        bar.remove();
        document.body.classList.remove('has-announcement');
      }, 400);
    });
  }
}

function initScrollAnimations() {
  const elements = document.querySelectorAll('.fade-in-up, .fade-in-left, .scale-in');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  elements.forEach((el) => observer.observe(el));
}

function addScrollClasses() {
  document.querySelectorAll('.hero-content, .section-header, .featured-section, .recently-viewed-section').forEach((el, i) => {
    el.classList.add('fade-in-up');
    if (i < 5) el.classList.add('stagger-' + (i + 1));
  });
  document.querySelectorAll('.product-card, .stat').forEach((el, i) => {
    el.classList.add('scale-in');
    const stagger = (i % 5) + 1;
    el.classList.add('stagger-' + stagger);
  });
}

function initMobileEnhancements() {
  if (window.innerWidth > 1024) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let sidebarOpen = false;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    sidebarOpen = document.body.classList.contains('mobile-nav-open');
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 60) {
      if (deltaX > 0 && !sidebarOpen && touchStartX < 30) {
        if (typeof toggleMobileSidebar === 'function') toggleMobileSidebar();
      } else if (deltaX < 0 && sidebarOpen) {
        if (typeof closeMobileSidebar === 'function') closeMobileSidebar();
      }
    }
  }, { passive: true });

  document.querySelectorAll('.btn, .nav-link, .utility-btn, .control-btn, .social-link').forEach((el) => {
    el.addEventListener('touchstart', () => {}, { passive: true });
  });

  if ('visualViewport' in window) {
    window.visualViewport.addEventListener('resize', () => {
      const viewport = window.visualViewport;
      if (viewport.height < window.innerHeight * 0.75) {
        document.body.classList.add('keyboard-open');
      } else {
        document.body.classList.remove('keyboard-open');
      }
    });
  }

  document.querySelectorAll('input, textarea, select').forEach((el) => {
    el.addEventListener('focus', () => {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }, { passive: true });
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (typeof restoreSessionFromStorage === 'function') await restoreSessionFromStorage();
  initAnnouncementBar();
  if (typeof createSidebar === 'function') createSidebar();
  if (typeof createLocaleSwitcher === 'function') createLocaleSwitcher();
  if (typeof updateUserLinks === 'function') updateUserLinks();
  if (typeof initThemeToggle === 'function') initThemeToggle();
  if (typeof createMobileThemeToggle === 'function') createMobileThemeToggle();
  if (typeof loadNotifications === 'function') loadNotifications();
  if (typeof requestNotificationPermission === 'function') requestNotificationPermission();
  initCookieConsent();
  if (typeof initPageTransitions === 'function') initPageTransitions();
  addScrollClasses();
  requestAnimationFrame(() => initScrollAnimations());
  initMobileEnhancements();
  initBackToTop();
  initSizeGuide();
  initQuickView();
  enhanceAllEmptyStates();

  const newsletterBtn = document.getElementById('newsletter-subscribe-btn');
  if (newsletterBtn) {
    newsletterBtn.addEventListener('click', function() {
      const emailInput = document.getElementById('newsletter-email');
      const email = emailInput?.value?.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (typeof showToast === 'function') showToast('Please enter a valid email address.', 'error');
        return;
      }
      if (typeof showToast === 'function') showToast('Thank you for subscribing!', 'success');
      if (emailInput) emailInput.value = '';
    });
  }

  if (document.body.dataset.page === 'tracking' && typeof initTrackingPage === 'function') {
    initTrackingPage();
  }

  if (typeof renderPage === 'function') {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => renderPage().catch(console.error));
    } else {
      setTimeout(() => renderPage().catch(console.error), 200);
    }
  }
});

// ================== BACK TO TOP ==================

function initBackToTop() {
  var btn = document.getElementById('back-to-top');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', 'Back to top');
    btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    document.body.appendChild(btn);
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        btn.classList.toggle('visible', window.scrollY > 400);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// ================== SIZE GUIDE ==================

function initSizeGuide() {
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-size-guide]');
    if (!trigger) return;
    e.preventDefault();
    var existing = document.querySelector('.size-guide-overlay');
    if (existing) { existing.classList.add('active'); return; }
    var overlay = document.createElement('div');
    overlay.className = 'size-guide-overlay active';
    overlay.innerHTML =
      '<div class="size-guide-modal">' +
        '<button class="size-guide-close" id="sg-close" aria-label="Close size guide"><i class="fas fa-times"></i></button>' +
        '<h3>Size Guide</h3>' +
        '<p class="guide-sub">Men\'s footwear — measurements in centimetres</p>' +
        '<table class="size-guide-table">' +
          '<tr><th>India</th><th>UK</th><th>US</th><th>EU</th><th>Foot Length (cm)</th></tr>' +
          '<tr><td>6</td><td>5.5</td><td>6.5</td><td>39</td><td>24.5</td></tr>' +
          '<tr><td>7</td><td>6.5</td><td>7.5</td><td>40</td><td>25.5</td></tr>' +
          '<tr><td>8</td><td>7.5</td><td>8.5</td><td>41</td><td>26.5</td></tr>' +
          '<tr><td>9</td><td>8.5</td><td>9.5</td><td>42</td><td>27.5</td></tr>' +
          '<tr><td>10</td><td>9.5</td><td>10.5</td><td>43</td><td>28.5</td></tr>' +
          '<tr><td>11</td><td>10.5</td><td>11.5</td><td>44</td><td>29.5</td></tr>' +
          '<tr><td>12</td><td>11.5</td><td>12.5</td><td>45</td><td>30.5</td></tr>' +
        '</table>' +
        '<p style="margin:16px 0 0;font-size:0.78rem;color:var(--text-muted);">Measure from heel to longest toe. If between sizes, choose the next size up.</p>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#sg-close').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e2) {
      if (e2.target === overlay) overlay.remove();
    });
  });
}

// ================== QUICK VIEW MODAL ==================

function initQuickView() {
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-quick-view]');
    if (!trigger) return;
    e.preventDefault();
    var pid = trigger.dataset.quickView;
    var product = typeof getProductById === 'function' ? getProductById(pid) : null;
    if (!product) return;
    var img = (product.images && product.images[0]) || product.image || '';
    var name = product.name || 'Product';
    var priceFmt = typeof formatCurrency === 'function' ? formatCurrency(product.price || 0) : '\u20b9' + (product.price || 0);
    var desc = typeof escapeHTML === 'function' ? escapeHTML(product.description || '') : product.description || '';
    var cat = typeof escapeHTML === 'function' ? escapeHTML(product.category || '') : product.category || '';
    var overlay = document.createElement('div');
    overlay.className = 'quick-view-overlay active';
    overlay.innerHTML =
      '<div class="quick-view-modal">' +
        '<button class="quick-view-close" id="qv-close" aria-label="Close"><i class="fas fa-times"></i></button>' +
        '<div class="quick-view-image"><img src="' + img + '" alt="' + name + '" loading="lazy" /></div>' +
        '<div class="quick-view-info">' +
          '<span class="qv-category">' + cat + '</span>' +
          '<h3>' + name + '</h3>' +
          '<div class="qv-price">' + priceFmt + '</div>' +
          '<p class="qv-desc">' + desc + '</p>' +
          '<div class="qv-actions">' +
            '<button class="btn btn-primary qv-add-cart" data-product-id="' + (product.id || product._id) + '"><i class="fas fa-shopping-cart"></i> Add to Cart</button>' +
            '<a href="' + (typeof getProductLink === 'function' ? getProductLink(product) : 'product-detail.html?id=' + (product.id || product._id)) + '" class="btn btn-secondary"><i class="fas fa-eye"></i> View Details</a>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#qv-close').addEventListener('click', function () { overlay.remove(); });
    overlay.querySelector('.qv-add-cart').addEventListener('click', function () {
      if (typeof addToCartFlow === 'function') addToCartFlow(product.id || product._id);
      overlay.remove();
    });
    overlay.addEventListener('click', function (e2) {
      if (e2.target === overlay) overlay.remove();
    });
  });
}

// ================== ENHANCED EMPTY STATES ==================

function enhanceAllEmptyStates() {
  var page = document.body.dataset.page;
  if (page === 'cart') {
    enhanceEmptyState('cart-items', '\ud83d\uded2', 'Your cart is empty', 'Looks like you haven\'t added anything yet. Browse our collection and find your perfect pair.', 'Start Shopping', 'product.html');
  } else if (page === 'product' || page === 'shop') {
    enhanceEmptyState('product-grid', '\ud83d\udc5e', 'No products found', 'Try adjusting your filters or search terms.', 'Clear Filters', 'product.html');
  }
}

function enhanceEmptyState(containerId, icon, title, message, ctaText, ctaLink) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var existingEmpty = container.querySelector('.empty-state');
  if (!existingEmpty) return;
  container.innerHTML =
    '<div class="empty-state-enhanced">' +
      '<div class="empty-icon">' + icon + '</div>' +
      '<h3>' + title + '</h3>' +
      '<p>' + message + '</p>' +
      (ctaText && ctaLink ? '<a href="' + ctaLink + '" class="btn btn-primary"><i class="fas fa-store"></i> ' + ctaText + '</a>' : '') +
    '</div>';
}

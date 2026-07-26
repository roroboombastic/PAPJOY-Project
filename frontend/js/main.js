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

window.addEventListener('DOMContentLoaded', async () => {
  if (typeof restoreSessionFromStorage === 'function') await restoreSessionFromStorage();
  initAnnouncementBar();
  if (typeof createSidebar === 'function') createSidebar();
  if (typeof createLocaleSwitcher === 'function') createLocaleSwitcher();
  if (typeof updateUserLinks === 'function') updateUserLinks();
  if (typeof initThemeToggle === 'function') initThemeToggle();
  if (typeof loadNotifications === 'function') loadNotifications();
  initCookieConsent();
  if (typeof initPageTransitions === 'function') initPageTransitions();
  addScrollClasses();
  requestAnimationFrame(() => initScrollAnimations());

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

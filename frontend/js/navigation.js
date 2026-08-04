let sidebarCreated = false;
let navResizeHandler = null;
let notificationSSE = null;
let notificationPermissionRequested = false;
let notificationListenersBound = false;
let sseRetryDelay = 1000;

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

  if (shouldOpen) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
  }

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
    <div class="sidebar-top">
      <div class="sidebar-brand"><a href="index.html"><img src="/favicon.svg" alt="PAP-JOY" class="logo-img" /><span class="logo-text">PAP-JOY</span></a></div>
      <nav class="sidebar-nav">
        <a href="index.html" class="nav-link${isActiveNavPage('index.html') ? ' active' : ''}"${isActiveNavPage('index.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-home"></i><span>Home</span></a>
        <a href="product.html" class="nav-link${isActiveNavPage('product.html') ? ' active' : ''}"${isActiveNavPage('product.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-store"></i><span>Shop</span></a>
        <a href="cart.html" class="nav-link${isActiveNavPage('cart.html') ? ' active' : ''}"${isActiveNavPage('cart.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-shopping-cart"></i><span>Cart</span><span class="cart-badge" id="cart-count">${currentCartCount}</span></a>
        <a href="tracking.html" class="nav-link${isActiveNavPage('tracking.html') ? ' active' : ''}"${isActiveNavPage('tracking.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-truck"></i><span>Track Order</span></a>
        <a href="account.html" class="nav-link${isActiveNavPage('account.html') ? ' active' : ''}"${isActiveNavPage('account.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-user"></i><span>Account</span></a>
        <a href="signin.html" class="nav-link${isActiveNavPage('signin.html') ? ' active' : ''}"${isActiveNavPage('signin.html') ? ' aria-current="page"' : ''} data-no-transition><i class="fas fa-sign-in-alt"></i><span>Sign In</span></a>
      </nav>
    </div>
    <div class="sidebar-utility">
      <button class="utility-btn" id="quick-cart-btn" onclick="showCart()"><i class="fas fa-shopping-bag"></i><span>Quick Cart</span><span class="cart-badge" id="utility-cart-count">${currentCartCount}</span></button>
      <div class="sidebar-notifications">
        <button class="utility-btn notification-bell" id="notification-bell" title="Notifications">
          <i class="fas fa-bell"></i><span>Notifications</span>
          <span class="notification-badge" id="notification-badge" style="display:none;">0</span>
        </button>
        <div class="notification-dropdown" id="notification-dropdown">
          <div class="notification-header">
            <h4>Notifications</h4>
            <button id="mark-all-read" class="btn-small">Mark all read</button>
          </div>
          <div class="notification-list" id="notification-list">
            <p class="text-center" style="padding: 20px; color: var(--text-muted);">No notifications</p>
          </div>
        </div>
      </div>
      <div class="utility-separator"></div>
      <div class="theme-picker" id="theme-picker">
        <button class="theme-option" data-theme-value="light" title="Light Mode">
          <i class="fas fa-sun"></i><span>Light</span>
        </button>
        <button class="theme-option" data-theme-value="dark" title="Dark Mode">
          <i class="fas fa-moon"></i><span>Dark</span>
        </button>
        <button class="theme-option" data-theme-value="auto" title="System preference">
          <i class="fas fa-circle-half-stroke"></i><span>Auto</span>
        </button>
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

  const utilitySection = document.querySelector('.sidebar-utility');
  const target = utilitySection || document.querySelector('.sidebar-top');
  if (!target) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'region-switcher-wrapper';
  wrapper.className = 'region-switcher-wrapper';
  wrapper.innerHTML = `
    <div class="locale-controls">
      <div class="locale-group">
        <label for="region-selector" class="locale-label" data-i18n="selector.region">Region</label>
        <select id="region-selector" class="locale-select"></select>
      </div>
      <div class="locale-group">
        <label for="language-selector" class="locale-label" data-i18n="selector.language">Language</label>
        <select id="language-selector" class="locale-select"></select>
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

  target.prepend(wrapper);
}

function applyTheme(value) {
  var current = document.documentElement.getAttribute('data-theme');
  var target = value === 'auto' ? null : value;

  if (current === target) return;

  if (target) {
    document.documentElement.setAttribute('data-theme', target);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  localStorage.setItem('papjoy-theme', value);

  document.querySelectorAll('.theme-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.themeValue === value);
  });

  const mobileBtn = document.getElementById('mobile-theme-btn');
  if (mobileBtn) {
    const iconMap = { dark: 'fa-moon', light: 'fa-sun', auto: 'fa-circle-half-stroke' };
    const icon = iconMap[value] || 'fa-circle-half-stroke';
    const existingIcon = mobileBtn.querySelector('i');
    if (existingIcon) {
      existingIcon.className = 'fas ' + icon;
    } else {
      mobileBtn.innerHTML = '<i class="fas ' + icon + '"></i>';
    }
  }
}

function getSavedTheme() {
  return localStorage.getItem('papjoy-theme') || 'auto';
}

function initThemeToggle() {
  const picker = document.getElementById('theme-picker');
  if (!picker) return;

  applyTheme(getSavedTheme());

  picker.querySelectorAll('.theme-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeValue);
    });
  });

  const sysPref = window.matchMedia('(prefers-color-scheme: dark)');
  sysPref.addEventListener('change', () => {
    if (getSavedTheme() === 'auto') {
      document.querySelectorAll('.theme-option').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.themeValue === 'auto');
      });
      const mobileBtn = document.getElementById('mobile-theme-btn');
      if (mobileBtn) {
        mobileBtn.innerHTML = '<i class="fas fa-circle-half-stroke"></i>';
      }
    }
  });
}

function createMobileThemeToggle() {
  const existing = document.getElementById('mobile-theme-toggle-wrapper');
  if (existing) existing.remove();

  const currentTheme = getSavedTheme();
  const iconMap = { dark: 'fa-moon', light: 'fa-sun', auto: 'fa-circle-half-stroke' };

  const wrapper = document.createElement('div');
  wrapper.id = 'mobile-theme-toggle-wrapper';

  wrapper.innerHTML =
    '<button class="mobile-theme-toggle" id="mobile-theme-btn" aria-label="Switch theme" aria-haspopup="true" aria-expanded="false">' +
      '<i class="fas ' + (iconMap[currentTheme] || 'fa-circle-half-stroke') + '"></i>' +
    '</button>' +
    '<div class="mobile-theme-popover" id="mobile-theme-popover" role="menu">' +
      '<button class="theme-option" data-theme-value="light" title="Light Mode" role="menuitem">' +
        '<i class="fas fa-sun"></i><span>Light</span>' +
      '</button>' +
      '<button class="theme-option" data-theme-value="dark" title="Dark Mode" role="menuitem">' +
        '<i class="fas fa-moon"></i><span>Dark</span>' +
      '</button>' +
      '<button class="theme-option" data-theme-value="auto" title="System preference" role="menuitem">' +
        '<i class="fas fa-circle-half-stroke"></i><span>Auto</span>' +
      '</button>' +
    '</div>';

  document.body.appendChild(wrapper);

  const btn = document.getElementById('mobile-theme-btn');
  const popover = document.getElementById('mobile-theme-popover');
  let popoverOpen = false;

  function openPopover() {
    popoverOpen = true;
    popover.classList.add('active');
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');
    const firstOption = popover.querySelector('.theme-option');
    if (firstOption) firstOption.focus();
  }

  function closePopover() {
    popoverOpen = false;
    popover.classList.remove('active');
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  }

  function togglePopover(e) {
    e.stopPropagation();
    if (popoverOpen) {
      closePopover();
    } else {
      openPopover();
    }
  }

  btn.addEventListener('click', togglePopover);

  popover.querySelectorAll('.theme-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      applyTheme(opt.dataset.themeValue);
      closePopover();
    });
  });

  document.addEventListener('click', closePopover);
  popover.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && popoverOpen) {
      closePopover();
    }
  });

  window.addEventListener('resize', function onResize() {
    if (popoverOpen && window.innerWidth > 1024) {
      closePopover();
    }
  });
}

async function loadNotifications() {
  const user = getCurrentUser();

  const badge = document.getElementById('notification-badge');
  const list = document.getElementById('notification-list');
  const markAllBtn = document.getElementById('mark-all-read');
  const bellBtn = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown');
  if (!badge || !list) return;

  if (!notificationListenersBound) {
    notificationListenersBound = true;

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpening = !dropdown.classList.contains('active');
      dropdown.classList.toggle('active');

      if (isOpening && window.innerWidth <= 1024) {
        const bellRect = bellBtn.getBoundingClientRect();
        dropdown.style.bottom = 'auto';
        dropdown.style.top = Math.max(8, bellRect.top - 8) + 'px';
      }
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && e.target !== bellBtn) {
        dropdown.classList.remove('active');
      }
    });

    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const unreadItems = list.querySelectorAll('.notification-item.unread');
        for (const item of unreadItems) {
          const id = item.dataset.id;
          if (id) {
            try {
              await fetch(`${API_BASE_URL}/api/v1/notifications/${id}/read`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token || ''}` } });
            } catch (_) {}
          }
        }
        loadNotifications();
      });
    }
  }

  if (!user) {
    list.innerHTML = '<p class="text-center" style="padding: 20px; color: var(--text-muted);">Sign in to receive order and account updates</p>';
    badge.style.display = 'none';
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${user.token || ''}` }
    });
    if (!response.ok) return;
    const notifications = await response.json();

    if (!Array.isArray(notifications) || notifications.length === 0) {
      list.innerHTML = '<p class="text-center" style="padding: 20px; color: var(--text-muted);">No notifications</p>';
      badge.style.display = 'none';
      return;
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    list.innerHTML = notifications.map(n => {
      const iconMap = { order: 'fa-box', promo: 'fa-tag', info: 'fa-info-circle', success: 'fa-check-circle', payment: 'fa-credit-card', delivery: 'fa-truck', system: 'fa-cog' };
      const icon = iconMap[n.type] || 'fa-bell';
      const timeAgo = n.createdAt ? getTimeAgo(n.createdAt) : '';
      return `<div class="notification-item ${n.isRead ? '' : 'unread'}" data-id="${n._id || ''}">
        <i class="fas ${icon}"></i>
        <div class="notification-text">${escapeHTML(n.message || n.text || '')}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }

  connectNotificationSSE(user);
}

function connectNotificationSSE(user) {
  if (notificationSSE) { notificationSSE.close(); notificationSSE = null; }
  if (!user || !user.token) return;

  const baseUrl = (window.API_BASE_URL || '').replace(/\/$/, '');
  const url = `${baseUrl}/api/v1/stream/notifications`;

  const controller = new AbortController();
  notificationSSE = { close() { controller.abort(); } };

  const handleNotificationEvent = (e) => {
    try {
      const data = JSON.parse(e.data);
      const notification = data.notification;
      if (!notification) return;

      const badge = document.getElementById('notification-badge');
      const list = document.getElementById('notification-list');

      if (badge) {
        const currentCount = parseInt(badge.textContent || '0', 10);
        const newCount = currentCount + 1;
        badge.textContent = newCount;
        badge.style.display = 'flex';
      }

      if (list) {
        const emptyMsg = list.querySelector('p.text-center');
        if (emptyMsg) emptyMsg.remove();

        const iconMap = { order: 'fa-box', promo: 'fa-tag', info: 'fa-info-circle', success: 'fa-check-circle', payment: 'fa-credit-card', delivery: 'fa-truck', system: 'fa-cog' };
        const icon = iconMap[notification.type] || 'fa-bell';

        const itemEl = document.createElement('div');
        itemEl.className = 'notification-item unread';
        itemEl.dataset.id = notification._id || '';
        itemEl.innerHTML = `
          <i class="fas ${icon}"></i>
          <div class="notification-text">${escapeHTML(notification.message || '')}</div>
          <div class="notification-time">Just now</div>
        `;
        list.prepend(itemEl);
      }

      showBrowserNotification(notification);
    } catch (err) {
      console.warn('SSE notification parse error:', err);
    }
  };

  const parseSSEBlock = (block) => {
    let eventName = 'message';
    let dataLines = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) return;
    if (eventName === 'notification') handleNotificationEvent({ data: dataLines.join('\n') });
  };

  (async () => {
    let shouldReconnect = false;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${user.token}` },
        credentials: 'include',
      });
      if (!response.ok || !response.body) {
        if (response.status === 401) {
          sseRetryDelay = 1000;
          console.warn('Notification stream rejected (401), reconnecting on next page load');
          return;
        }
        throw new Error(`Notification stream failed: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          parseSSEBlock(block);
        }
      }
      shouldReconnect = true;
      sseRetryDelay = 1000;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Notification stream disconnected:', err);
      shouldReconnect = true;
    } finally {
      if (shouldReconnect && !controller.signal.aborted) {
        const delay = sseRetryDelay;
        sseRetryDelay = Math.min(sseRetryDelay * 2, 30000);
        setTimeout(() => connectNotificationSSE(user), delay);
      }
    }
  })();
}

function requestNotificationPermission() {
  if (notificationPermissionRequested) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'default') return;

  notificationPermissionRequested = true;
  setTimeout(() => {
    Notification.requestPermission();
  }, 3000);
}

function showBrowserNotification(notification) {
  if (!('Notification' in window)) return;

  const show = () => {
    try {
      new Notification(notification.title || 'PAP-JOY', {
        body: notification.message || '',
        icon: '/favicon.svg',
        tag: notification._id || `papjoy-${Date.now()}`,
        renotify: true,
      });
    } catch (_) {}
  };

  if (Notification.permission === 'granted') {
    show();
  } else if (Notification.permission === 'default') {
    notificationPermissionRequested = true;
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') show();
    });
  }
}

function getTimeAgo(dateString) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
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
window.initThemeToggle = initThemeToggle;
window.createMobileThemeToggle = createMobileThemeToggle;
window.loadNotifications = loadNotifications;
window.requestNotificationPermission = requestNotificationPermission;

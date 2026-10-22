function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const _adminDebounceTimers = {};
function adminDebounce(key, fn, delay = 350) {
  clearTimeout(_adminDebounceTimers[key]);
  _adminDebounceTimers[key] = setTimeout(fn, delay);
}

function buildPagination(totalPages, currentPage, loadFnName) {
  if (totalPages <= 1) return '';
  let html = '';
  html += `<button class="page-btn" onclick="${loadFnName}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&laquo; Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - currentPage) > 1) {
      if (i === 3 || i === totalPages - 2) html += '<span class="page-ellipsis">...</span>';
      continue;
    }
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${loadFnName}(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" onclick="${loadFnName}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
  return html;
}

function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

function requireAdmin() {
  const user = getCurrentUser();
  if (!user || !isAdminRole(user.role)) {
    // Send the reason along so the sign-in page can explain what happened
    // rather than looking like a random logout.
    const reason = !user ? 'no-session' : 'not-admin';
    window.location.href = 'signin.html?admin=' + reason;
    return false;
  }
  return true;
}

/* ================= SHARED ADMIN UI HELPERS ================= */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value == null ? '' : String(value);
}

function adminInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function adminFormatDate(value, withTime) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return day;
  return `${day} · ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}

function adminStatusTone(status) {
  const key = String(status || '').toLowerCase();
  if (['delivered', 'completed', 'paid', 'confirmed', 'active', 'success', 'online'].includes(key)) return 'ok';
  if (['pending', 'unpaid', 'processing', 'packed', 'out_for_delivery', 'cod'].includes(key)) return 'info';
  if (['shipped', 'transit', 'in_transit'].includes(key)) return 'violet';
  if (['cancelled', 'failed', 'refunded', 'returned', 'inactive', 'blocked'].includes(key)) return 'danger';
  if (['warning', 'partially_paid'].includes(key)) return 'warn';
  return '';
}

function adminStatusPill(status, labelOverride) {
  const tone = adminStatusTone(status) || 'plain';
  const label = labelOverride || String(status || 'unknown').replace(/_/g, ' ');
  return `<span class="adm-pill adm-pill--${tone}">${escapeHTML(label)}</span>`;
}

function adminCompactMoney(value) {
  const num = Number(value) || 0;
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(num >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(num)}`;
}

function adminEmptyRow(colspan, title, message, icon) {
  return `<tr><td colspan="${colspan}"><div class="adm-empty">
    <i class="fas ${icon || 'fa-inbox'}" aria-hidden="true"></i>
    <strong>${escapeHTML(title)}</strong>
    <span>${escapeHTML(message)}</span>
  </div></td></tr>`;
}

function adminProductThumb(product) {
  const images = product && product.images;
  let url = '';
  if (Array.isArray(images) && images.length) {
    url = images[0] && (images[0].url || images[0].src || images[0].path) ? (images[0].url || images[0].src || images[0].path) : '';
  } else if (typeof images === 'string') {
    url = images;
  }
  if (!url && product) url = product.image || product.imageUrl || '';
  if (!url) {
    return '<span class="adm-cell-product__thumb adm-cell-product__thumb--empty" aria-hidden="true"><i class="fas fa-image"></i></span>';
  }
  return `<img class="adm-cell-product__thumb" src="${escapeHTML(url)}" alt="" loading="lazy" />`;
}

function adminSetNavCount(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ? String(value) : '';
}

/* ================= SVG REVENUE CHART ================= */

function renderRevenueChart(container, days) {
  if (!container) return 0;

  const rows = (Array.isArray(days) ? days : [])
    .map((day) => ({
      label: String(day._id || day.date || ''),
      value: Number(day.revenue || 0),
      orders: Number(day.orders || 0)
    }))
    .filter((row) => row.label);

  if (!rows.length) {
    container.innerHTML = `<div class="adm-empty"><i class="fas fa-chart-line" aria-hidden="true"></i>
      <strong>No revenue in this period</strong><span>Paid orders will show up here as they come in.</span></div>`;
    return 0;
  }

  const width = Math.max(container.clientWidth || 720, 320);
  const height = 260;
  const padL = 62;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...rows.map((row) => row.value), 1);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const stepX = rows.length > 1 ? innerW / (rows.length - 1) : 0;

  const px = (index) => padL + (rows.length > 1 ? index * stepX : innerW / 2);
  const py = (value) => padT + innerH - (value / max) * innerH;

  const points = rows.map((row, index) => [px(index), py(row.value)]);
  const line = points
    .map((point, index) => `${index ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)}`)
    .join(' ');
  const baseY = (padT + innerH).toFixed(1);
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${baseY} L${points[0][0].toFixed(1)} ${baseY} Z`;

  let grid = '';
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i += 1) {
    const value = (max / gridCount) * i;
    const y = py(value);
    grid += `<line class="adm-chart__grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${(width - padR).toFixed(1)}" y2="${y.toFixed(1)}"></line>`;
    grid += `<text class="adm-chart__axis" x="${padL - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHTML(adminCompactMoney(value))}</text>`;
  }

  const every = Math.max(1, Math.ceil(rows.length / 7));
  let axis = '';
  rows.forEach((row, index) => {
    if (index % every !== 0 && index !== rows.length - 1) return;
    const short = row.label.length > 5 ? row.label.slice(5) : row.label;
    axis += `<text class="adm-chart__axis" x="${px(index).toFixed(1)}" y="${height - 10}" text-anchor="middle">${escapeHTML(short)}</text>`;
  });

  const dots = points
    .map((point, index) => {
      const row = rows[index];
      const tip = `${row.label}: ${formatINR(row.value)} · ${row.orders} order${row.orders === 1 ? '' : 's'}`;
      return `<circle class="adm-chart__point" cx="${point[0].toFixed(1)}" cy="${point[1].toFixed(1)}" r="3.5"><title>${escapeHTML(tip)}</title></circle>`;
    })
    .join('');

  container.innerHTML = `
    <svg class="adm-chart" viewBox="0 0 ${width.toFixed(0)} ${height}" width="${width.toFixed(0)}" height="${height}" role="img"
      aria-label="Revenue trend chart, ${rows.length} data points, total ${escapeHTML(formatINR(total))}">
      <defs>
        <linearGradient id="admGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--adm-brand)" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="var(--adm-brand)" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      ${grid}
      <path class="adm-chart__area" d="${area}"></path>
      <path class="adm-chart__line" d="${line}"></path>
      ${dots}
      ${axis}
    </svg>`;

  container._admChartData = rows;
  return total;
}

/* ================= PAGE SHELL ================= */

function switchAdminPage(page) {
  if (!page) return;
  const target = document.getElementById(`${page}-page`);
  if (!target) return;

  document.querySelectorAll('.admin-nav-item[data-page]').forEach((btn) => {
    const active = btn.dataset.page === page;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  document.querySelectorAll('.admin-page').forEach((section) => {
    section.classList.toggle('active', section.id === `${page}-page`);
  });

  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');

  try {
    history.replaceState(null, '', `#${page}`);
  } catch (e) {
    /* history is optional */
  }

  if (page === 'dashboard') loadAdminDashboard();
  else if (page === 'products') loadAdminProducts();
  else if (page === 'orders') loadAdminOrders();
  else if (page === 'users') loadAdminUsers();
  else if (page === 'analytics') loadAnalytics();
  else if (page === 'categories') loadAdminCategories();

  window.scrollTo({ top: 0 });
}

function refreshAdminData() {
  const active = document.querySelector('.admin-page.active');
  const page = active ? active.id.replace('-page', '') : 'dashboard';
  switchAdminPage(page);
  if (typeof showToast === 'function') showToast('Data refreshed', 'success');
}

function updateThemeIcon() {
  const btn = document.getElementById('adm-theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.innerHTML = `<i class="fas fa-${isDark ? 'sun' : 'moon'}" aria-hidden="true"></i>`;
}

function toggleAdminTheme() {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try {
    localStorage.setItem('papjoy-theme', next);
  } catch (e) {
    /* storage is optional */
  }
  updateThemeIcon();
}

function handleSidebarToggle() {
  const container = document.getElementById('admin-container');
  if (!container) return;
  const btn = document.getElementById('adm-sidebar-toggle');

  if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
    toggleAdminSidebar();
    if (btn) btn.setAttribute('aria-expanded', String(!document.querySelector('.admin-sidebar.mobile-open')));
    return;
  }

  const collapsed = container.classList.toggle('adm-sidebar-collapsed');
  try {
    localStorage.setItem('papjoy-admin-sidebar', collapsed ? 'mini' : 'full');
  } catch (e) {
    /* storage is optional */
  }
  if (btn) btn.setAttribute('aria-expanded', String(!collapsed));
}

function initAdminShell() {
  const user = getCurrentUser();
  if (!user || !user.token) {
    window.location.href = 'signin.html?admin=no-session';
    return false;
  }
  if (!isAdminRole(user.role)) {
    window.location.href = 'signin.html?admin=not-admin';
    return false;
  }

  const displayName = user.name || 'Admin';
  const initials = adminInitials(displayName);
  setText('admin-user-name', displayName);
  setText('admin-user-name-top', displayName);
  setText('admin-user-role', user.role === 'super_admin' ? 'Super admin' : 'Administrator');
  setText('adm-profile-name', displayName);
  setText('adm-profile-email', user.email || '');
  const avatar = document.getElementById('admin-user-avatar');
  if (avatar) avatar.textContent = initials;
  const avatarTop = document.getElementById('admin-user-avatar-top');
  if (avatarTop) avatarTop.textContent = initials;

  const greeting = document.getElementById('dash-greeting');
  if (greeting) {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    greeting.textContent = `${part}, ${displayName.split(' ')[0]} — here is how the store is doing today.`;
  }

  document.querySelectorAll('.admin-nav-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => switchAdminPage(btn.dataset.page));
  });
  document.querySelectorAll('[data-goto-page]').forEach((el) => {
    el.addEventListener('click', () => switchAdminPage(el.dataset.gotoPage));
  });

  const container = document.getElementById('admin-container');
  const toggle = document.getElementById('adm-sidebar-toggle');
  if (toggle) toggle.addEventListener('click', handleSidebarToggle);

  try {
    if (localStorage.getItem('papjoy-admin-sidebar') === 'mini' && container) {
      container.classList.add('adm-sidebar-collapsed');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  } catch (e) {
    /* storage is optional */
  }

  const profileBtn = document.getElementById('adm-profile-btn');
  const profileMenu = document.getElementById('adm-profile-menu');
  if (profileBtn && profileMenu) {
    profileBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = profileMenu.classList.toggle('open');
      profileBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!profileMenu.classList.contains('open')) return;
      if (profileMenu.contains(event.target) || profileBtn.contains(event.target)) return;
      profileMenu.classList.remove('open');
      profileBtn.setAttribute('aria-expanded', 'false');
    });
  }

  const themeBtn = document.getElementById('adm-theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleAdminTheme);
  updateThemeIcon();

  const notifBtn = document.getElementById('adm-notif-btn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      const filter = document.getElementById('order-status-filter');
      if (filter) filter.value = 'pending';
      switchAdminPage('orders');
    });
  }

  const globalSearch = document.getElementById('adm-global-search');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const query = globalSearch.value.trim();
      if (!query) return;
      const compact = query.replace(/\s+/g, '');
      const looksLikeOrder = /order/i.test(query)
        || /^#?[A-Za-z]*-?[\d-]{3,}$/.test(compact)
        || /^\d{4,}$/.test(compact);
      const field = document.getElementById(looksLikeOrder ? 'order-search' : 'product-search');
      if (field) field.value = query;
      switchAdminPage(looksLikeOrder ? 'orders' : 'products');
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (profileMenu && profileMenu.classList.contains('open')) {
        profileMenu.classList.remove('open');
        if (profileBtn) profileBtn.setAttribute('aria-expanded', 'false');
        return;
      }
      closeOrderModal();
    }
    if (event.key === '/' && document.activeElement && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      event.preventDefault();
      if (globalSearch) globalSearch.focus();
    }
  });

  window.addEventListener('resize', () => {
    const chart = document.getElementById('dash-revenue-chart');
    if (chart && chart._admChartData) renderRevenueChart(chart, chart._admChartData);
    const analyticsChart = document.getElementById('revenue-chart');
    if (analyticsChart && analyticsChart._admChartData) renderRevenueChart(analyticsChart, analyticsChart._admChartData);
  });

  const hash = (window.location.hash || '').replace('#', '').trim();
  if (hash && document.getElementById(`${hash}-page`)) {
    switchAdminPage(hash);
  } else {
    loadAdminDashboard();
  }

  return true;
}

function logoutAdmin() {
  if (typeof signOut === 'function') {
    signOut();
  } else {
    localStorage.removeItem('papjoy-user');
    localStorage.removeItem('papjoy-token');
    localStorage.removeItem('papjoy-refresh-token');
    sessionStorage.removeItem('papjoy-user');
    sessionStorage.removeItem('papjoy-token');
    sessionStorage.removeItem('papjoy-refresh-token');
    window.location.href = 'signin.html';
  }
}

async function loadAdminDashboard() {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const errEl = document.getElementById('recent-orders-list');
      if (errEl) errEl.innerHTML = adminEmptyRow(6, 'Could not load the dashboard', 'Please check your connection and try again.', 'fa-triangle-exclamation');
      return;
    }
    const data = await response.json();
    const stats = data.stats || {};
    const ordersByStatus = data.ordersByStatus || {};

    setText('stat-revenue', formatINR(stats.totalRevenue || 0));
    setText('stat-orders', stats.totalOrders || 0);
    setText('stat-products', stats.totalProducts || 0);
    setText('stat-users', stats.totalUsers || 0);

    setText('stat-aov', formatINR(stats.averageOrderValue || 0));
    setText('stat-pending', formatINR(data.pendingRevenue || 0));
    setText('stat-refunds', formatINR(data.refunds || 0));
    setText('stat-gst', formatINR(data.gstCollected || 0));

    setText('stat-revenue-meta', `${formatINR(data.pendingRevenue || 0)} awaiting payment`);
    setText('stat-orders-meta', `${stats.totalOrders || 0} orders all time`);
    setText('stat-products-meta', `${stats.totalProducts || 0} products listed`);
    setText('stat-users-meta', `${stats.totalUsers || 0} registered accounts`);

    const pendingCount = Number(ordersByStatus.pending || 0);
    adminSetNavCount('nav-order-count', pendingCount);
    adminSetNavCount('nav-product-count', stats.totalProducts || 0);
    const notif = document.getElementById('adm-notif-count');
    if (notif) {
      notif.textContent = pendingCount;
      notif.hidden = !pendingCount;
    }
    // Keep the accessible name in sync with the visible badge so screen
    // readers announce the same count sighted users see.
    const notifButton = document.getElementById('adm-notif-btn');
    if (notifButton) {
      notifButton.setAttribute(
        'aria-label',
        pendingCount ? `Pending orders (${pendingCount})` : 'Pending orders'
      );
      notifButton.title = pendingCount ? `Pending orders (${pendingCount})` : 'Pending orders';
    }

    renderRecentOrders(data.recentOrders || []);
    renderStatusDistribution(ordersByStatus);
    renderActivityFeed(data.recentOrders || []);
    loadDashboardChart();
  } catch (error) {
    console.error('Admin dashboard error:', error);
  }
}

function renderRecentOrders(orders) {
  const list = document.getElementById('recent-orders-list');
  if (!list) return;

  if (!orders.length) {
    list.innerHTML = adminEmptyRow(6, 'No orders yet', 'New orders will appear here as soon as customers check out.', 'fa-receipt');
    return;
  }

  list.innerHTML = orders.map((order) => {
    const customerName = order.userId?.name || order.shippingAddress?.name || 'Guest';
    return `
      <tr>
        <td data-label="Order ID"><span class="admin-table__primary">${escapeHTML(order.orderNumber || order._id?.slice(-8) || 'N/A')}</span></td>
        <td data-label="Customer">
          <span class="adm-cell-user">
            <span class="adm-avatar adm-avatar--sm" aria-hidden="true">${escapeHTML(adminInitials(customerName))}</span>
            <span class="adm-cell-user__meta"><strong>${escapeHTML(customerName)}</strong></span>
          </span>
        </td>
        <td data-label="Total" class="admin-table__num"><span class="admin-table__primary">${formatINR(order.total || 0)}</span></td>
        <td data-label="Status">${adminStatusPill(order.status)}</td>
        <td data-label="Date" class="admin-table__muted">${escapeHTML(adminFormatDate(order.createdAt))}</td>
        <td data-label="Action" class="admin-table__actions">
          <button type="button" class="btn-small" onclick="showOrderModal('${order._id}', '${escapeHTML(order.status || '')}')">View</button>
        </td>
      </tr>`;
  }).join('');
}

function renderStatusDistribution(ordersByStatus) {
  const container = document.getElementById('order-status-dist');
  if (!container) return;

  const entries = Object.entries(ordersByStatus || {});
  if (!entries.length) {
    container.innerHTML = `<div class="adm-empty"><i class="fas fa-chart-pie" aria-hidden="true"></i>
      <strong>No orders yet</strong><span>The status breakdown appears once orders are placed.</span></div>`;
    return;
  }

  const max = Math.max(...entries.map((entry) => Number(entry[1]) || 0), 1);
  container.innerHTML = entries.map(([status, count]) => `
    <div class="adm-status-row">
      <div class="adm-status-row__top">
        <strong>${escapeHTML(String(status).replace(/_/g, ' '))}</strong>
        <span>${count}</span>
      </div>
      <div class="adm-status-row__track">
        <div class="adm-status-row__fill adm-status-row__fill--${adminStatusTone(status) || 'info'}" style="width:${Math.max(4, Math.round((count / max) * 100))}%"></div>
      </div>
    </div>`).join('');
}

function renderActivityFeed(orders) {
  const feed = document.getElementById('dash-feed');
  if (!feed) return;

  if (!orders.length) {
    feed.innerHTML = '<p class="adm-empty"><span>No activity yet</span></p>';
    return;
  }

  feed.innerHTML = orders.slice(0, 5).map((order) => {
    const name = order.userId?.name || order.shippingAddress?.name || 'A customer';
    const reference = order.orderNumber || order._id?.slice(-8) || '';
    return `
      <div class="adm-feed__item">
        <span class="adm-feed__dot" aria-hidden="true"></span>
        <div class="adm-feed__body">
          <strong>${escapeHTML(name)} placed order ${escapeHTML(reference)}</strong>
          <span>${escapeHTML(adminFormatDate(order.createdAt, true))} · ${formatINR(order.total || 0)} · ${escapeHTML(String(order.status || '').replace(/_/g, ' '))}</span>
        </div>
      </div>`;
  }).join('');
}

async function loadDashboardChart() {
  const container = document.getElementById('dash-revenue-chart');
  if (!container) return;
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics?range=month`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Analytics request failed');
    const data = await response.json();
    const total = renderRevenueChart(container, data.revenueByDate || []);
    setText('dash-chart-total', formatINR(total || 0));
  } catch (error) {
    console.error('Dashboard chart error:', error);
    container.innerHTML = `<div class="adm-empty"><i class="fas fa-chart-line" aria-hidden="true"></i>
      <strong>Chart unavailable</strong><span>The revenue trend could not be loaded right now.</span></div>`;
  }
}

async function loadAdminProducts(page = 1) {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  const limit = 20;
  const search = document.getElementById('product-search')?.value || '';
  const status = document.getElementById('product-status')?.value || 'all';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const el = document.getElementById('products-list');
      if (el) el.innerHTML = '<tr><td colspan="6" class="text-center">Failed to load products.</td></tr>';
      return;
    }
    const data = await response.json();

    const productsList = document.getElementById('products-list');
    if (productsList && Array.isArray(data.products)) {
      if (!data.products.length) {
        productsList.innerHTML = adminEmptyRow(6, 'No products found', 'Try a different search term or add a new product.', 'fa-box-open');
      } else {
        productsList.innerHTML = data.products.map((product) => {
          const price = Number(product.price || 0);
          const compare = Number(product.comparePrice || 0);
          const stock = Number(product.inventory?.quantity || 0);
          const stockTone = stock <= 0 ? 'danger' : stock < 10 ? 'warn' : 'ok';
          const stockLabel = stock <= 0 ? 'Out of stock' : stock < 10 ? `${stock} left` : `${stock} in stock`;
          const categoryName = product.categoryId?.name || product.category || 'Uncategorised';
          const brand = product.brand ? ` · ${product.brand}` : '';
          return `
            <tr>
              <td data-label="Product Name">
                <span class="adm-cell-product">
                  ${adminProductThumb(product)}
                  <span class="adm-cell-product__meta">
                    <strong>${escapeHTML(product.name || 'Untitled product')}</strong>
                    <span>${escapeHTML(categoryName + brand)}</span>
                  </span>
                </span>
              </td>
              <td data-label="SKU" class="admin-table__muted">${escapeHTML(product.sku || '—')}</td>
              <td data-label="Price" class="admin-table__num">
                <span class="admin-table__primary">${formatINR(price)}</span>
                ${compare > price ? `<span class="admin-table__muted" style="text-decoration:line-through;margin-left:6px;">${formatINR(compare)}</span>` : ''}
              </td>
              <td data-label="Stock"><span class="adm-pill adm-pill--${stockTone}">${escapeHTML(stockLabel)}</span></td>
              <td data-label="Status">${product.isActive ? adminStatusPill('active', 'Active') : adminStatusPill('inactive', 'Inactive')}</td>
              <td data-label="Actions" class="admin-table__actions">
                <button type="button" class="btn-small" onclick="window.location.href='product-edit.html?id=${product._id}'">Edit</button>
                <button type="button" class="btn-small danger" onclick="deleteProduct('${product._id}')">Delete</button>
              </td>
            </tr>`;
        }).join('');
      }
    }

    const productCount = document.getElementById('products-count');
    if (productCount) {
      const total = data.pagination?.total ?? data.total ?? '';
      const shown = Array.isArray(data.products) ? data.products.length : 0;
      productCount.innerHTML = total === '' || total === undefined
        ? `<strong>${shown}</strong> shown`
        : `<strong>${shown}</strong> of <strong>${total}</strong> products`;
    }

    const paginationEl = document.getElementById('products-pagination');
    if (paginationEl) {
      const totalPages = data.pagination?.pages || data.totalPages || Math.ceil((data.total || 0) / limit) || 1;
      paginationEl.innerHTML = buildPagination(totalPages, page, 'loadAdminProducts');
    }
  } catch (error) {
    console.error('Admin products error:', error);
  }
}

function showProductForm() {
  const modal = document.getElementById('product-modal');
  if (modal) modal.classList.add('active');

  const idInput = document.getElementById('product-id');
  if (idInput) idInput.value = '';

  const form = document.getElementById('product-form');
  if (form) form.reset();

  populateCategoryDropdown();
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  if (modal) modal.classList.remove('active');
}

async function saveProduct(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const productId = document.getElementById('product-id')?.value;
  const imageUrl = document.getElementById('product-image-url')?.value?.trim();

  const productData = {
    name: document.getElementById('product-name')?.value,
    slug: document.getElementById('product-slug')?.value,
    description: document.getElementById('product-description')?.value,
    price: Number(document.getElementById('product-price')?.value || 0),
    categoryId: document.getElementById('product-category')?.value,
    sku: document.getElementById('product-sku')?.value,
    brand: document.getElementById('product-brand')?.value,
    inventory: { quantity: Number(document.getElementById('product-stock')?.value || 0) },
    shippingCharge: Number(document.getElementById('product-shipping')?.value || 0),
    weight: Number(document.getElementById('product-weight')?.value || 0),
    length: Number(document.getElementById('product-length')?.value || 0),
    breadth: Number(document.getElementById('product-breadth')?.value || 0),
    height: Number(document.getElementById('product-height')?.value || 0),
    isActive: document.getElementById('product-active')?.checked || false
  };

  if (imageUrl) {
    productData.images = [{ url: imageUrl, alt: productData.name || '' }];
  }

  const method = productId ? 'PUT' : 'POST';
  const endpoint = productId ? `/api/v1/admin/products/${productId}` : '/api/v1/admin/products';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error('Failed to save product');

    closeProductModal();
    loadAdminProducts();
    if (typeof showToast === 'function') showToast('Product saved successfully');
  } catch (error) {
    console.error('Product save error:', error);
    if (typeof showToast === 'function') showToast('Failed to save product');
  }
}

async function editProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products/${productId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch product');
    const product = await response.json();

    showProductForm();
    document.getElementById('product-id').value = product._id;
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-slug').value = product.slug || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-price').value = product.price || 0;
    document.getElementById('product-category').value = product.categoryId?._id || product.categoryId || '';
    document.getElementById('product-sku').value = product.sku || '';
    document.getElementById('product-brand').value = product.brand || '';
    document.getElementById('product-stock').value = product.inventory?.quantity || 0;
    document.getElementById('product-shipping').value = product.shippingCharge || 0;
    document.getElementById('product-weight').value = product.weight || 0;
    document.getElementById('product-length').value = product.length || 0;
    document.getElementById('product-breadth').value = product.breadth || 0;
    document.getElementById('product-height').value = product.height || 0;
    document.getElementById('product-active').checked = Boolean(product.isActive);

    const imageUrlInput = document.getElementById('product-image-url');
    if (imageUrlInput) {
      const images = typeof getProductImageUrls === 'function' ? getProductImageUrls(product) : [];
      imageUrlInput.value = images[0] || '';
    }
  } catch (error) {
    console.error('Product edit error:', error);
  }
}

async function deleteProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete product');

    loadAdminProducts();
    if (typeof showToast === 'function') showToast('Product deleted successfully');
  } catch (error) {
    console.error('Product delete error:', error);
    if (typeof showToast === 'function') showToast('Failed to delete product');
  }
}

async function loadAdminOrders(page = 1) {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  const limit = 20;
  const status = document.getElementById('order-status-filter')?.value || 'all';
  const sort = document.getElementById('order-sort')?.value || 'newest';
  const search = document.getElementById('order-search')?.value || '';

  try {
    const params = new URLSearchParams({ page, limit, sort });
    if (status !== 'all') params.set('status', status);
    if (search) params.set('search', search);

    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const el = document.getElementById('orders-list');
      if (el) el.innerHTML = adminEmptyRow(8, 'Could not load orders', 'Please try again in a moment.', 'fa-triangle-exclamation');
      return;
    }
    const data = await response.json();

    const orders = data.orders || data.data || [];
    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
      if (!orders.length) {
        ordersList.innerHTML = adminEmptyRow(8, 'No orders found', 'Try clearing the filters to see more results.', 'fa-receipt');
      } else {
        ordersList.innerHTML = orders.map((order) => {
          const customerName = order.userId?.name || order.shippingAddress?.name || 'Guest';
          const customerMeta = order.userId?.email || order.shippingAddress?.phone || order.shippingAddress?.city || '';
          const itemCount = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
          return `
            <tr>
              <td data-label="Order #"><span class="admin-table__primary">${escapeHTML(order.orderNumber || order._id?.slice(-8) || 'N/A')}</span></td>
              <td data-label="Customer">
                <span class="adm-cell-user">
                  <span class="adm-avatar adm-avatar--sm" aria-hidden="true">${escapeHTML(adminInitials(customerName))}</span>
                  <span class="adm-cell-user__meta">
                    <strong>${escapeHTML(customerName)}</strong>
                    ${customerMeta ? `<span>${escapeHTML(customerMeta)}</span>` : ''}
                  </span>
                </span>
              </td>
              <td data-label="Items" class="admin-table__num">${itemCount}</td>
              <td data-label="Total" class="admin-table__num"><span class="admin-table__primary">${formatINR(order.total || 0)}</span></td>
              <td data-label="Status">${adminStatusPill(order.status)}</td>
              <td data-label="Payment">${adminStatusPill(order.paymentStatus || order.paymentMethod || 'unknown')}</td>
              <td data-label="Date" class="admin-table__muted">${escapeHTML(adminFormatDate(order.createdAt))}</td>
              <td data-label="Actions" class="admin-table__actions">
                <button type="button" class="btn-small" onclick="showOrderModal('${order._id}')">View</button>
              </td>
            </tr>`;
        }).join('');
      }
    }

    const orderCount = document.getElementById('orders-count');
    if (orderCount) {
      const total = data.pagination?.total ?? data.total ?? '';
      orderCount.innerHTML = total === '' || total === undefined
        ? `<strong>${orders.length}</strong> shown`
        : `<strong>${orders.length}</strong> of <strong>${total}</strong> orders`;
    }

    const paginationEl = document.getElementById('orders-pagination');
    if (paginationEl) {
      const totalPages = data.pagination?.pages || data.totalPages || Math.ceil((data.total || orders.length) / limit) || 1;
      paginationEl.innerHTML = buildPagination(totalPages, page, 'loadAdminOrders');
    }
  } catch (error) {
    console.error('Admin orders error:', error);
  }
}

async function loadAdminUsers(page = 1) {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  const limit = 20;
  const search = document.getElementById('user-search')?.value || '';
  const role = document.getElementById('user-role-filter')?.value || 'all';

  try {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (role !== 'all') params.set('role', role);

    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const el = document.getElementById('users-list');
      if (el) el.innerHTML = adminEmptyRow(6, 'Could not load users', 'Please try again in a moment.', 'fa-triangle-exclamation');
      return;
    }
    const data = await response.json();

    const users = data.users || data.data || [];
    const usersList = document.getElementById('users-list');
    if (usersList) {
      if (!users.length) {
        usersList.innerHTML = adminEmptyRow(6, 'No users found', 'Try a different search term or role filter.', 'fa-users');
      } else {
        usersList.innerHTML = users.map((u) => {
          const displayName = u.name || u.email || 'Customer';
          const roleLabel = u.role === 'super_admin' ? 'super admin' : (u.role || 'customer');
          return `
            <tr>
              <td data-label="Name">
                <span class="adm-cell-user">
                  <span class="adm-avatar adm-avatar--sm" aria-hidden="true">${escapeHTML(adminInitials(displayName))}</span>
                  <span class="adm-cell-user__meta"><strong>${escapeHTML(displayName)}</strong></span>
                </span>
              </td>
              <td data-label="Email" class="admin-table__muted">${escapeHTML(u.email || '—')}</td>
              <td data-label="Role">
                <select class="admin-role-select" aria-label="Role for ${escapeHTML(u.email || displayName)}" onchange="changeUserRole('${u._id}', this.value)" ${u.email === 'papp.joyy@gmail.com' ? 'disabled' : ''}>
                  <option value="customer" ${u.role === 'customer' || u.role === 'user' ? 'selected' : ''}>Customer</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
                ${u.role === 'super_admin' ? `<span class="admin-table__muted" style="margin-left:8px;">${escapeHTML(roleLabel)}</span>` : ''}
              </td>
              <td data-label="Created" class="admin-table__muted">${escapeHTML(adminFormatDate(u.createdAt))}</td>
              <td data-label="Status">${u.isActive !== false ? adminStatusPill('active', 'Active') : adminStatusPill('inactive', 'Inactive')}</td>
              <td data-label="Actions" class="admin-table__actions">
                <button type="button" class="btn-small" onclick="toggleUserStatus('${u._id}', ${u.isActive === false})">${u.isActive !== false ? 'Deactivate' : 'Activate'}</button>
              </td>
            </tr>`;
        }).join('');
      }
    }

    const userCount = document.getElementById('users-count');
    if (userCount) {
      const total = data.pagination?.total ?? data.total ?? '';
      userCount.innerHTML = total === '' || total === undefined
        ? `<strong>${users.length}</strong> shown`
        : `<strong>${users.length}</strong> of <strong>${total}</strong> users`;
    }

    const paginationEl = document.getElementById('users-pagination');
    if (paginationEl) {
      const totalPages = data.totalPages || Math.ceil((data.total || users.length) / limit) || 1;
      paginationEl.innerHTML = buildPagination(totalPages, page, 'loadAdminUsers');
    }
  } catch (error) {
    console.error('Admin users error:', error);
  }
}

async function toggleUserStatus(userId, currentlyInactive) {
  const token = getAuthToken();
  if (!token) return;

  const action = currentlyInactive ? 'activate' : 'deactivate';
  if (!confirm(`Are you sure you want to ${action} this user?`)) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isActive: !currentlyInactive })
    });

    if (!response.ok) throw new Error('Failed to update user status');
    loadAdminUsers();
    if (typeof showToast === 'function') showToast(`User ${action}d successfully`);
  } catch (error) {
    console.error('Toggle user status error:', error);
    if (typeof showToast === 'function') showToast(`Failed to ${action} user`);
  }
}

async function changeUserRole(userId, newRole) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm(`Change this user's role to "${newRole}"?`)) {
    loadAdminUsers();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role: newRole })
    });

    if (!response.ok) throw new Error('Failed to update user role');
    loadAdminUsers();
    if (typeof showToast === 'function') showToast(`User role changed to ${newRole}`);
  } catch (error) {
    console.error('Change user role error:', error);
    if (typeof showToast === 'function') showToast('Failed to change user role');
    loadAdminUsers();
  }
}

async function loadAnalytics() {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  const range = document.getElementById('analytics-range')?.value || 'month';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics?range=${encodeURIComponent(range)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const chartEl = document.getElementById('revenue-chart');
      if (chartEl) chartEl.innerHTML = `<div class="adm-empty"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <strong>Analytics unavailable</strong><span>Please try again in a moment.</span></div>`;
      return;
    }
    const data = await response.json();

    const total = renderRevenueChart(document.getElementById('revenue-chart'), data.revenueByDate || []);
    setText('analytics-chart-total', formatINR(total || 0));

    renderPaymentMix(data.paymentMethodStats || {});
    renderTopProducts(data.topProducts || []);
    renderCategorySales(data.categorySales || []);
  } catch (error) {
    console.error('Analytics error:', error);
  }
}

function renderPaymentMix(stats) {
  const container = document.getElementById('analytics-payments');
  if (!container) return;

  const entries = Object.entries(stats || {});
  if (!entries.length) {
    container.innerHTML = `<div class="adm-empty"><i class="fas fa-credit-card" aria-hidden="true"></i>
      <strong>No payment data</strong><span>Payment methods appear once orders are placed.</span></div>`;
    return;
  }

  const max = Math.max(...entries.map((entry) => Number(entry[1]?.count || 0)), 1);
  container.innerHTML = entries.map(([method, value]) => {
    const count = Number(value?.count || 0);
    const revenue = Number(value?.revenue || 0);
    return `
      <div class="adm-status-row">
        <div class="adm-status-row__top">
          <strong>${escapeHTML(String(method || 'unknown').toUpperCase())}</strong>
          <span>${count} order${count === 1 ? '' : 's'} · ${formatINR(revenue)}</span>
        </div>
        <div class="adm-status-row__track">
          <div class="adm-status-row__fill adm-status-row__fill--info" style="width:${Math.max(4, Math.round((count / max) * 100))}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTopProducts(products) {
  const list = document.getElementById('top-products-list');
  if (!list) return;

  if (!products.length) {
    list.innerHTML = adminEmptyRow(4, 'No sales in this period', 'Top sellers appear once paid orders are recorded.', 'fa-crown');
    return;
  }

  list.innerHTML = products.map((product, index) => `
    <tr>
      <td data-label="#" class="admin-table__num">${index + 1}</td>
      <td data-label="Product"><span class="admin-table__primary">${escapeHTML(product.product?.name || product._id || 'Unknown product')}</span></td>
      <td data-label="Units Sold" class="admin-table__num">${product.quantity || 0}</td>
      <td data-label="Revenue" class="admin-table__num"><span class="admin-table__primary">${formatINR(product.revenue || product.totalRevenue || 0)}</span></td>
    </tr>`).join('');
}

function renderCategorySales(categories) {
  const list = document.getElementById('category-sales-list');
  if (!list) return;

  if (!categories.length) {
    list.innerHTML = adminEmptyRow(3, 'No category data', 'Sales per category appear once paid orders are recorded.', 'fa-tags');
    return;
  }

  list.innerHTML = categories.map((category) => `
    <tr>
      <td data-label="Category"><span class="admin-table__primary">${escapeHTML(category.name || category._id || 'Unknown')}</span></td>
      <td data-label="Units Sold" class="admin-table__num">${category.quantity || 0}</td>
      <td data-label="Revenue" class="admin-table__num"><span class="admin-table__primary">${formatINR(category.revenue || category.totalRevenue || 0)}</span></td>
    </tr>`).join('');
}

async function loadAdminCategories() {
  if (!requireAdmin()) return;
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const el = document.getElementById('categories-list');
      if (el) el.innerHTML = adminEmptyRow(5, 'Could not load categories', 'Please try again in a moment.', 'fa-triangle-exclamation');
      return;
    }
    const data = await response.json();

    const categories = data.categories || data.data || data || [];
    const categoriesList = document.getElementById('categories-list');
    if (categoriesList) {
      if (!Array.isArray(categories) || !categories.length) {
        categoriesList.innerHTML = adminEmptyRow(5, 'No categories found', 'Create your first category to organise the catalogue.', 'fa-tags');
      } else {
        categoriesList.innerHTML = categories.map((cat) => `
          <tr>
            <td data-label="Name"><span class="admin-table__primary">${escapeHTML(cat.name || 'Untitled')}</span></td>
            <td data-label="Slug" class="admin-table__muted">${escapeHTML(cat.slug || '—')}</td>
            <td data-label="Sort Order" class="admin-table__num">${cat.sortOrder || 0}</td>
            <td data-label="Status">${cat.isActive !== false ? adminStatusPill('active', 'Active') : adminStatusPill('inactive', 'Inactive')}</td>
            <td data-label="Actions" class="admin-table__actions">
              <button type="button" class="btn-small" onclick="showCategoryForm('${cat._id}')">Edit</button>
              <button type="button" class="btn-small danger" onclick="deleteCategory('${cat._id}')">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Admin categories error:', error);
  }
}

async function showOrderModal(orderId, currentStatus) {
  const modal = document.getElementById('order-modal');
  if (!modal) return;

  const token = getAuthToken();
  if (!token) return;

  document.getElementById('order-id').value = orderId;
  document.getElementById('order-status-update').value = currentStatus || 'pending';
  document.getElementById('order-tracking-number').value = '';
  document.getElementById('order-carrier').value = '';
  document.getElementById('order-tracking-url').value = '';

  const detailsEl = document.getElementById('order-details');
  if (detailsEl) detailsEl.innerHTML = '<div class="adm-empty"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><strong>Loading order details…</strong></div>';
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const closeBtn = modal.querySelector('.adm-drawer__head .adm-icon-btn');
  if (closeBtn) closeBtn.focus();

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      if (detailsEl) detailsEl.innerHTML = `<div class="adm-empty"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <strong>Could not load this order</strong><span>Please close the panel and try again.</span></div>`;
      return;
    }
    const order = await response.json();
    if (detailsEl) detailsEl.innerHTML = renderOrderDetails(order);

    setText('order-drawer-title', order.orderNumber ? `Order ${order.orderNumber}` : 'Order details');
    setText('order-drawer-sub', `${adminFormatDate(order.createdAt, true)} · ${formatINR(order.total || 0)}`);

    const collectSection = document.getElementById('order-payment-collect');
    if (collectSection) {
      const isCod = order.paymentMethod === 'cod';
      const unpaid = order.paymentStatus !== 'paid';
      collectSection.style.display = (isCod && unpaid) ? 'block' : 'none';
    }
    const qrDisplay = document.getElementById('collection-qr-display');
    if (qrDisplay) qrDisplay.style.display = 'none';
    const collectedBtn = document.getElementById('mark-collected-btn');
    if (collectedBtn) collectedBtn.style.display = 'none';
    const qrMsg = document.getElementById('collection-qr-message');
    if (qrMsg) qrMsg.textContent = '';

    const statusEl = document.getElementById('order-status-update');
    if (statusEl && order.status) statusEl.value = order.status;
    const trackingNumber = document.getElementById('order-tracking-number');
    const carrier = document.getElementById('order-carrier');
    const trackingUrl = document.getElementById('order-tracking-url');
    if (trackingNumber && order.shipment?.trackingNumber) trackingNumber.value = order.shipment.trackingNumber;
    if (carrier && order.shipment?.carrier) carrier.value = order.shipment.carrier;
    if (trackingUrl && order.shipment?.trackingUrl) trackingUrl.value = order.shipment.trackingUrl;

    resetShiprocketSection(order);
  } catch (error) {
    console.error('Admin order detail error:', error);
    if (detailsEl) detailsEl.innerHTML = `<div class="adm-empty"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <strong>Could not load this order</strong><span>Please close the panel and try again.</span></div>`;
  }
}

function setShiprocketBusy(message) {
  const status = document.getElementById('shiprocket-status');
  if (status) { status.textContent = message || ''; status.style.color = 'var(--text-muted)'; }
}

function setShiprocketError(message) {
  const status = document.getElementById('shiprocket-status');
  if (status) { status.textContent = message || ''; status.style.color = 'var(--danger)'; }
}

function setShiprocketSuccess(message) {
  const status = document.getElementById('shiprocket-status');
  if (status) { status.textContent = message || ''; status.style.color = 'var(--success, #2f7d32)'; }
}

function resetShiprocketSection(order) {
  const section = document.getElementById('order-shiprocket');
  if (!section) return;

  const shipBtn = document.getElementById('shiprocket-ship-btn');
  const pickupBtn = document.getElementById('shiprocket-pickup-btn');
  const awbBtn = document.getElementById('shiprocket-awb-btn');
  const labelBtn = document.getElementById('shiprocket-label-btn');
  const trackBtn = document.getElementById('shiprocket-track-btn');
  const cancelBtn = document.getElementById('shiprocket-cancel-btn');
  const status = document.getElementById('shiprocket-status');
  if (status) status.textContent = '';

  const sr = order.shiprocket || {};
  const hasShipment = Boolean(sr.shipmentId);
  const hasAwb = Boolean(sr.awbCode);
  const isCancelled = order.status === 'cancelled' || order.shipment?.status === 'cancelled';

  if (shipBtn) shipBtn.style.display = hasShipment ? 'none' : 'inline-flex';
  if (pickupBtn) pickupBtn.style.display = hasShipment && !hasAwb ? 'inline-flex' : 'none';
  if (awbBtn) awbBtn.style.display = hasShipment && !hasAwb ? 'inline-flex' : 'none';
  if (labelBtn) labelBtn.style.display = hasShipment && hasAwb ? 'inline-flex' : 'none';
  if (trackBtn) trackBtn.style.display = hasShipment ? 'inline-flex' : 'none';
  if (cancelBtn) cancelBtn.style.display = isCancelled ? 'none' : 'inline-flex';

  if (sr.shipmentId) {
    const parts = [`Shipment ID: ${sr.shipmentId}`];
    if (sr.awbCode) parts.push(`AWB: ${sr.awbCode}`);
    if (sr.courierName) parts.push(`Courier: ${sr.courierName}`);
    if (sr.pickupStatus) parts.push(`Pickup: ${sr.pickupStatus}`);
    setShiprocketSuccess(parts.join(' · '));
  } else if (sr.error) {
    if (status) {
      status.textContent = `Auto-sync to Shiprocket pending/failed: ${sr.error}. Fix the address or retry with "Send to Shiprocket".`;
      status.style.color = 'var(--danger, #dc3545)';
    }
  }

  fetch(`${API_BASE_URL}/api/v1/shiprocket/status`, { headers: { Authorization: `Bearer ${getAuthToken()}` } })
    .then(res => res.json())
    .then((data) => {
      section.style.display = data.configured ? 'block' : 'none';
      if (!data.configured) {
        if (status) { status.textContent = 'Shiprocket is not configured yet. Add SHIPROCKET_API_EMAIL/PASSWORD to enable fulfillment.'; status.style.color = 'var(--text-muted)'; }
      }
    })
    .catch(() => { section.style.display = 'none'; });
}

async function shiprocketRequest(path, options = {}) {
  const token = getAuthToken();
  if (!token) return null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Shiprocket request failed');
  }
  return response.json();
}

async function shiprocketShipOrder() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  setShiprocketBusy('Sending order to Shiprocket...');
  try {
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/ship`, { method: 'POST' });
    resetShiprocketSection(data.order);
    setShiprocketSuccess(`Shiprocket order created. Shipment ID: ${data.shiprocket?.shipment_id || data.order?.shiprocket?.shipmentId}. Now generate a pickup.`);
    if (typeof showToast === 'function') showToast('Order sent to Shiprocket');
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

async function shiprocketGeneratePickup() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  setShiprocketBusy('Generating pickup...');
  try {
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/pickup`, { method: 'POST' });
    resetShiprocketSection(data.order);
    const scheduled = data.order?.shiprocket?.pickupScheduledDate || data.shiprocket?.pickup_scheduled_date || '';
    setShiprocketSuccess(`Pickup scheduled${scheduled ? ` for ${new Date(scheduled).toLocaleDateString()}` : ''}. Now assign AWB.`);
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

async function shiprocketAssignAWB() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  setShiprocketBusy('Assigning AWB (picking best courier)...');
  try {
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/awb`, { method: 'POST' });
    resetShiprocketSection(data.order);
    setShiprocketSuccess(`AWB ${data.awbCode || ''} assigned${data.order?.shiprocket?.courierName ? ` via ${data.order.shiprocket.courierName}` : ''}. Now generate the label.`);
    const url = data.trackingUrl;
    if (url && typeof window.open === 'function') {
      setShiprocketSuccess(`AWB ${data.awbCode || ''} assigned. Tracking: ${url}`);
    }
    const trk = document.getElementById('order-tracking-number');
    if (trk && data.awbCode) trk.value = data.awbCode;
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

async function shiprocketGenerateLabel() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  setShiprocketBusy('Generating shipping label...');
  try {
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/label`, { method: 'POST' });
    resetShiprocketSection(data.order);
    const labelUrl = data.labelUrl || data.shiprocket?.label_url || '';
    setShiprocketSuccess(labelUrl ? `Label generated. <a href="${labelUrl}" target="_blank" rel="noopener">Open label</a>` : 'Label generated.');
    if (labelUrl && typeof window.open === 'function') window.open(labelUrl, '_blank');
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

async function shiprocketTrackOrder() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  setShiprocketBusy('Fetching live tracking...');
  try {
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/track`);
    const events = data.events || [];
    const last = events[events.length - 1];
    const message = [data.trackStatus && `Status: ${data.trackStatus}`, data.etd && `ETD: ${data.etd}`, last && `Latest: ${last.message}`].filter(Boolean).join(' · ');
    setShiprocketSuccess(message || 'Tracking refreshed.');
    const statusSelect = document.getElementById('order-status-update');
    if (statusSelect && data.trackStatus) {
      const raw = String(data.trackStatus).toLowerCase().replace(/\s+/g, '_');
      const aliases = { in_transit: 'shipped', out_for_delivery: 'out_for_delivery', 'out_for_delivery_': 'out_for_delivery', manifested: 'packed', picked_up: 'shipped', 'rto_attempted': 'returned', 'rto': 'returned', 'cancelled': 'cancelled', 'undelivered': 'returned' };
      const mapped = aliases[raw] || raw;
      const valid = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'refunded'];
      if (valid.includes(mapped)) statusSelect.value = mapped;
    }
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

async function shiprocketCancelOrder() {
  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;
  const confirmed = window.confirm && confirm('Cancel this order? If it was already sent to Shiprocket, the shipment will be cancelled there too. Inventory will be restored.');
  if (!confirmed) return;
  setShiprocketBusy('Cancelling order...');
  try {
    const reason = window.prompt ? prompt('Reason for cancellation (optional):') : '';
    const data = await shiprocketRequest(`/api/v1/shiprocket/orders/${orderId}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason || '' }) });
    resetShiprocketSection(data.order);
    setShiprocketSuccess('Order cancelled. Inventory restored.');
    const statusSelect = document.getElementById('order-status-update');
    if (statusSelect) statusSelect.value = 'cancelled';
    if (typeof showToast === 'function') showToast('Order cancelled');
  } catch (err) {
    setShiprocketError(err.message);
    if (typeof showToast === 'function') showToast(err.message);
  }
}

function renderOrderDetails(order) {
  const addressBlock = (label, addr) => {
    if (!addr) return '';
    return `<div class="order-addr"><h3>${label}</h3><p>${escapeHTML(addr.name || '')}</p>` +
      `${addr.street ? `<p>${escapeHTML(addr.street)}</p>` : ''}` +
      `${addr.city ? `<p>${escapeHTML(addr.city)}${addr.state ? ', ' + escapeHTML(addr.state) : ''}${addr.zipCode ? ' - ' + escapeHTML(addr.zipCode) : ''}</p>` : ''}` +
      `${addr.phone ? `<p>${escapeHTML(addr.phone)}</p>` : ''}</div>`;
  };

  const items = (order.items || []).map(item => `
    <tr>
      <td data-label="Item">${escapeHTML(item.name || 'N/A')}${item.variant ? `<span class="order-item-variant">${escapeHTML(item.variant)}</span>` : ''}</td>
      <td data-label="Qty">${item.quantity}</td>
      <td data-label="Price">${formatINR(item.price || 0)}</td>
      <td data-label="GST">${formatINR((item.cgst || 0) + (item.sgst || 0) + (item.igst || 0))}</td>
      <td data-label="Total">${formatINR(item.total || 0)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-center">No items</td></tr>';

  const gstTotal = order.gstTotal || ((order.cgstTotal || 0) + (order.sgstTotal || 0) + (order.igstTotal || 0)) || order.tax || 0;

  const statusPill = adminStatusPill(order.status);
  const paymentStatusPill = adminStatusPill(order.paymentStatus || order.paymentMethod || 'unknown');
  const unitCount = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const tracking = order.shipment && (order.shipment.trackingNumber || order.shipment.trackingUrl) ? `
    <div class="order-track">
      <h3>Tracking</h3>
      ${order.shipment.trackingNumber ? `<p>Number: ${escapeHTML(order.shipment.trackingNumber)}</p>` : ''}
      ${order.shipment.carrier ? `<p>Carrier: ${escapeHTML(order.shipment.carrier)}</p>` : ''}
      ${order.shipment.trackingUrl ? `<p>URL: <a href="${escapeHTML(order.shipment.trackingUrl)}" target="_blank" rel="noopener">${escapeHTML(order.shipment.trackingUrl)}</a></p>` : ''}
    </div>` : '';

  return `
    <div class="order-detail-block">
      <div class="order-summary-row">
        <span><strong>Order:</strong> ${escapeHTML(order.orderNumber || order._id)}</span>
        <span><strong>Placed:</strong> ${escapeHTML(adminFormatDate(order.createdAt, true))}</span>
        <span><strong>Items:</strong> ${unitCount}</span>
        <span>${statusPill}</span>
        <span>${paymentStatusPill}</span>
      </div>
      <div class="order-grid">
        <div class="order-cust">
          <h3>Customer</h3>
          <p>${escapeHTML(order.userId?.name || order.shippingAddress?.name || order.billingAddress?.name || 'Guest')}</p>
          ${order.userId?.email ? `<p>${escapeHTML(order.userId.email)}</p>` : ''}
          ${order.userId?.phone ? `<p>${escapeHTML(order.userId.phone)}</p>` : ''}
          ${order.notes ? `<p class="order-notes">Note: ${escapeHTML(order.notes)}</p>` : ''}
        </div>
        ${addressBlock('Shipping Address', order.shippingAddress)}
        ${addressBlock('Billing Address', order.billingAddress)}
      </div>
      ${tracking}
    </div>
    <div class="order-detail-block">
      <h3>Items</h3>
      <table class="admin-table order-items-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>GST</th><th>Total</th></tr></thead>
        <tbody>${items}</tbody>
      </table>
      <div class="order-totals">
        <p><span>Subtotal</span><span>${formatINR(order.subtotal || 0)}</span></p>
        <p><span>GST</span><span>${formatINR(gstTotal)}</span></p>
        <p><span>Shipping</span><span>${formatINR(order.shipping || 0)}</span></p>
        ${order.discount ? `<p><span>Discount</span><span>-${formatINR(order.discount)}</span></p>` : ''}
        <p class="order-grand-total"><span>Total</span><span>${formatINR(order.total || 0)}</span></p>
      </div>
    </div>`;
}

function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
  setText('order-drawer-title', 'Order details');
  setText('order-drawer-sub', 'Review fulfilment, payments and shipping');
}

async function updateOrderStatus(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const orderId = document.getElementById('order-id')?.value;
  const status = document.getElementById('order-status-update')?.value;
  const trackingNumber = document.getElementById('order-tracking-number')?.value || '';
  const carrier = document.getElementById('order-carrier')?.value || '';
  const trackingUrl = document.getElementById('order-tracking-url')?.value || '';

  if (!orderId || !status) return;

  try {
    const body = { status };
    if (trackingNumber) body.trackingNumber = trackingNumber;
    if (carrier) body.carrier = carrier;
    if (trackingUrl) body.trackingUrl = trackingUrl;

    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Failed to update order status');

    closeOrderModal();
    loadAdminOrders();
    if (typeof showToast === 'function') showToast('Order status updated successfully');
  } catch (error) {
    console.error('Order status update error:', error);
    if (typeof showToast === 'function') showToast('Failed to update order status');
  }
}

async function generateCollectionQR() {
  const token = getAuthToken();
  if (!token) return;

  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;

  const qrBtn = document.getElementById('collect-qr-btn');
  const msgEl = document.getElementById('collection-qr-message');
  const display = document.getElementById('collection-qr-display');
  if (qrBtn) qrBtn.disabled = true;
  if (msgEl) { msgEl.textContent = 'Generating QR...'; msgEl.style.color = 'var(--text-muted)'; }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/payments/orders/${orderId}/collection-qr`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to generate QR');
    }

    const data = await response.json();

    if (msgEl) { msgEl.textContent = ''; }
    if (display) {
      const img = document.getElementById('collection-qr-image');
      if (img) img.src = data.qrImage;
      display.style.display = 'block';
    }
    const collectedBtn = document.getElementById('mark-collected-btn');
    if (collectedBtn) collectedBtn.style.display = 'inline-flex';
    if (typeof showToast === 'function') showToast('UPI QR generated. Show it to the delivery partner.');
  } catch (error) {
    console.error('Generate collection QR error:', error);
    if (msgEl) { msgEl.textContent = error.message || 'Failed to generate QR'; msgEl.style.color = 'var(--danger)'; }
    if (typeof showToast === 'function') showToast(error.message || 'Failed to generate QR');
  } finally {
    if (qrBtn) qrBtn.disabled = false;
  }
}

async function markOrderCollected() {
  const token = getAuthToken();
  if (!token) return;

  const orderId = document.getElementById('order-id')?.value;
  if (!orderId) return;

  if (!confirm('Confirm that the customer paid at delivery? This marks the order as PAID.')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/payments/orders/${orderId}/mark-collected`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ note: 'Payment collected at delivery via UPI QR' })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to mark order as collected');
    }

    const data = await response.json();
    const collect = document.getElementById('order-payment-collect');
    if (collect) collect.style.display = 'none';
    if (typeof showToast === 'function') showToast('Order marked as paid');
    closeOrderModal();
    loadAdminOrders();
    if (data.order?._id && typeof showOrderModal === 'function') showOrderModal(data.order._id, data.order.status);
  } catch (error) {
    console.error('Mark order collected error:', error);
    if (typeof showToast === 'function') showToast(error.message || 'Failed to mark order as collected');
  }
}

function showCategoryForm(categoryId) {
  const modal = document.getElementById('category-modal');
  if (!modal) return;

  document.getElementById('category-id').value = '';
  document.getElementById('category-name').value = '';
  document.getElementById('category-slug').value = '';
  document.getElementById('category-description').value = '';
  document.getElementById('category-sort-order').value = '0';
  document.getElementById('category-active').checked = true;

  if (categoryId) {
    loadCategoryIntoForm(categoryId);
  }

  modal.classList.add('active');
}

function closeCategoryModal() {
  const modal = document.getElementById('category-modal');
  if (modal) modal.classList.remove('active');
}

async function loadCategoryIntoForm(categoryId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories/${categoryId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch category');
    const cat = await response.json();

    document.getElementById('category-id').value = cat._id;
    document.getElementById('category-name').value = cat.name || '';
    document.getElementById('category-slug').value = cat.slug || '';
    document.getElementById('category-description').value = cat.description || '';
    document.getElementById('category-sort-order').value = cat.sortOrder || 0;
    document.getElementById('category-active').checked = cat.isActive !== false;
  } catch (error) {
    console.error('Load category error:', error);
  }
}

async function saveCategory(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const categoryId = document.getElementById('category-id')?.value;
  const categoryData = {
    name: document.getElementById('category-name')?.value,
    slug: document.getElementById('category-slug')?.value,
    description: document.getElementById('category-description')?.value || '',
    sortOrder: Number(document.getElementById('category-sort-order')?.value || 0),
    isActive: document.getElementById('category-active')?.checked || false
  };

  const method = categoryId ? 'PUT' : 'POST';
  const endpoint = categoryId ? `/api/v1/admin/categories/${categoryId}` : '/api/v1/admin/categories';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(categoryData)
    });

    if (!response.ok) throw new Error('Failed to save category');

    closeCategoryModal();
    loadAdminCategories();
    if (typeof showToast === 'function') showToast('Category saved successfully');
  } catch (error) {
    console.error('Category save error:', error);
    if (typeof showToast === 'function') showToast('Failed to save category');
  }
}

async function deleteCategory(categoryId) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm('Are you sure you want to delete this category?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories/${categoryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete category');

    loadAdminCategories();
    if (typeof showToast === 'function') showToast('Category deleted successfully');
  } catch (error) {
    console.error('Category delete error:', error);
    if (typeof showToast === 'function') showToast('Failed to delete category');
  }
}

async function populateCategoryDropdown() {
  const token = getAuthToken();
  if (!token) return;

  const select = document.getElementById('product-category');
  if (!select) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const categories = data.categories || data.data || data || [];
    const currentValue = select.value;

    select.innerHTML = '<option value="">Select a category</option>';
    if (Array.isArray(categories)) {
      categories.forEach(cat => {
        if (cat.isActive !== false) {
          const opt = document.createElement('option');
          opt.value = cat._id;
          opt.textContent = cat.name;
          select.appendChild(opt);
        }
      });
    }

    if (currentValue) select.value = currentValue;
  } catch (error) {
    console.error('Populate category dropdown error:', error);
  }
}

function toggleAdminSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
  const btn = document.getElementById('adm-sidebar-toggle');
  if (btn) btn.setAttribute('aria-expanded', String(sidebar.classList.contains('mobile-open')));
}

function closeAdminSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
  const btn = document.getElementById('adm-sidebar-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// Global Window Exports
window.requireAdmin = requireAdmin;
window.escapeHTML = escapeHTML;
window.adminDebounce = adminDebounce;
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminProducts = loadAdminProducts;
window.showProductForm = showProductForm;
window.closeProductModal = closeProductModal;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.loadAdminOrders = loadAdminOrders;
window.loadAdminUsers = loadAdminUsers;
window.toggleUserStatus = toggleUserStatus;
window.changeUserRole = changeUserRole;
window.loadAnalytics = loadAnalytics;
window.loadAdminCategories = loadAdminCategories;
window.showOrderModal = showOrderModal;
window.closeOrderModal = closeOrderModal;
window.updateOrderStatus = updateOrderStatus;
window.generateCollectionQR = generateCollectionQR;
window.markOrderCollected = markOrderCollected;
window.shiprocketShipOrder = shiprocketShipOrder;
window.shiprocketGeneratePickup = shiprocketGeneratePickup;
window.shiprocketAssignAWB = shiprocketAssignAWB;
window.shiprocketGenerateLabel = shiprocketGenerateLabel;
window.shiprocketTrackOrder = shiprocketTrackOrder;
window.shiprocketCancelOrder = shiprocketCancelOrder;
window.showCategoryForm = showCategoryForm;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategory;
window.deleteCategory = deleteCategory;
window.populateCategoryDropdown = populateCategoryDropdown;
window.toggleAdminSidebar = toggleAdminSidebar;
window.closeAdminSidebar = closeAdminSidebar;
window.switchAdminPage = switchAdminPage;
window.refreshAdminData = refreshAdminData;
window.toggleAdminTheme = toggleAdminTheme;
window.logoutAdmin = logoutAdmin;
window.renderRevenueChart = renderRevenueChart;
window.adminStatusPill = adminStatusPill;

// Bootstrap the admin console once the deferred scripts are ready.
document.addEventListener('DOMContentLoaded', () => {
  if (!initAdminShell()) return;

  // Close the order drawer when clicking the backdrop.
  const orderModal = document.getElementById('order-modal');
  if (orderModal) {
    orderModal.addEventListener('click', (event) => {
      if (event.target === orderModal) closeOrderModal();
    });
  }

  // Close the product and category modals on backdrop click as well.
  ['product-modal', 'category-modal'].forEach((id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      if (id === 'product-modal') closeProductModal();
      else closeCategoryModal();
    });
  });
});

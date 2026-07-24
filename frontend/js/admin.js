let adminCategories = [];

async function loadAdminDashboard() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    // Update stats
    document.getElementById('stat-revenue').textContent = formatCurrency(data.stats.totalRevenue);
    document.getElementById('stat-orders').textContent = data.stats.totalOrders;
    document.getElementById('stat-products').textContent = data.stats.totalProducts;
    document.getElementById('stat-users').textContent = data.stats.totalUsers;

    // Render recent orders
    const recentOrdersList = document.getElementById('recent-orders-list');
    if (recentOrdersList) {
      recentOrdersList.innerHTML = data.recentOrders.map(order => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.userId?.name || 'Guest'}</td>
          <td>${formatCurrency(order.total)}</td>
          <td><span class="status-badge">${order.status}</span></td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td><button class="btn-small" onclick="showOrderModal('${order._id}')">Update</button></td>
        </tr>
      `).join('');
    }

    // Render order status distribution
    const statusDist = document.getElementById('order-status-dist');
    if (statusDist && data.ordersByStatus) {
      statusDist.innerHTML = Object.entries(data.ordersByStatus).map(([status, count]) => `
        <div class="status-item">
          <span>${status}: ${count}</span>
          <div class="status-bar"><div style="width: ${(count / Math.max(...Object.values(data.ordersByStatus)) || 1) * 100}%"></div></div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Admin dashboard error:', error);
  }
}

async function loadAdminProducts() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const search = document.getElementById('product-search')?.value || '';
  const status = document.getElementById('product-status')?.value || 'all';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const productsList = document.getElementById('products-list');
    if (productsList) {
      productsList.innerHTML = data.products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.sku || 'N/A'}</td>
          <td>${formatCurrency(product.price)}</td>
          <td>${product.inventory?.quantity || 0}</td>
          <td><span class="badge ${product.isActive ? 'active' : 'inactive'}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn-small" onclick="editProduct('${product._id}')">Edit</button>
            <button class="btn-small danger" onclick="deleteProduct('${product._id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin products error:', error);
  }
}

function showProductForm() {
  document.getElementById('product-modal').classList.add('active');
  document.getElementById('product-id').value = '';
  document.getElementById('product-form').reset();
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

async function saveProduct(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const productId = document.getElementById('product-id').value;
  const productData = {
    name: document.getElementById('product-name').value,
    slug: document.getElementById('product-slug').value,
    description: document.getElementById('product-description').value,
    price: Number(document.getElementById('product-price').value),
    categoryId: document.getElementById('product-category').value,
    sku: document.getElementById('product-sku').value,
    brand: document.getElementById('product-brand').value,
    inventory: { quantity: Number(document.getElementById('product-stock').value) },
    isActive: document.getElementById('product-active').checked
  };

  const method = productId ? 'PUT' : 'POST';
  const endpoint = productId ? `/api/v1/admin/products/${productId}` : '/api/v1/admin/products';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(productData)
    });

    if (!response.ok) throw new Error('Failed to save product');
    
    closeProductModal();
    loadAdminProducts();
    showToast('✅ Product saved successfully');
  } catch (error) {
    console.error('Product save error:', error);
    showToast('❌ Failed to save product');
  }
}

async function editProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    // For now, just open the form for new product
    showProductForm();
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
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete product');
    
    loadAdminProducts();
    showToast('✅ Product deleted successfully');
  } catch (error) {
    console.error('Product delete error:', error);
    showToast('❌ Failed to delete product');
  }
}

async function loadAdminOrders() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const status = document.getElementById('order-status-filter')?.value || 'all';
  const sort = document.getElementById('order-sort')?.value || 'newest';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders?page=${page}&limit=${limit}&status=${status}&sort=${sort}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
      ordersList.innerHTML = data.orders.map(order => `
        <tr>
          <td>${order.orderNumber}</td>
          <td>${order.userId?.name || 'Guest'}</td>
          <td>${formatCurrency(order.total)}</td>
          <td><span class="status-badge">${order.status}</span></td>
          <td>${order.paymentStatus}</td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td>
            <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${order._id}'">Invoice</button>
            <button class="btn-small" onclick="showOrderModal('${order._id}')">Update</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin orders error:', error);
  }
}

function showOrderModal(orderId) {
  document.getElementById('order-modal').classList.add('active');
  document.getElementById('order-id').value = orderId;
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('active');
}

async function updateOrderStatus(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const orderId = document.getElementById('order-id').value;
  const updateData = {
    status: document.getElementById('order-status-update').value,
    trackingNumber: document.getElementById('order-tracking-number').value,
    carrier: document.getElementById('order-carrier').value,
    trackingUrl: document.getElementById('order-tracking-url').value
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(updateData)
    });

    if (!response.ok) throw new Error('Failed to update order');
    
    closeOrderModal();
    loadAdminOrders();
    showToast('✅ Order updated successfully');
  } catch (error) {
    console.error('Order update error:', error);
    showToast('❌ Failed to update order');
  }
}

async function loadAdminUsers() {
  const token = getAuthToken();
  if (!token) return;

  const page = 1;
  const limit = 20;
  const search = document.getElementById('user-search')?.value || '';
  const role = document.getElementById('user-role-filter')?.value || 'all';

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&role=${role}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    const usersList = document.getElementById('users-list');
    if (usersList) {
      usersList.innerHTML = data.users.map(user => `
        <tr>
          <td>${user.name}</td>
          <td>${user.email}</td>
          <td><span class="badge">${user.role}</span></td>
          <td>${new Date(user.createdAt).toLocaleDateString()}</td>
          <td><span class="badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn-small" onclick="editUser('${user._id}')">View</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin users error:', error);
  }
}

async function loadAnalytics() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const data = await response.json();

    // Render revenue chart
    const revenueChart = document.getElementById('revenue-chart');
    if (revenueChart && data.revenueByDate.length > 0) {
      revenueChart.innerHTML = `
        <div class="chart-data">
          ${data.revenueByDate.slice(-7).map(d => `
            <div class="chart-bar" style="height: ${(d.revenue / Math.max(...data.revenueByDate.map(x => x.revenue))) * 100}%">
              <span>${formatCurrency(d.revenue)}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Render top products
    const topProductsList = document.getElementById('top-products-list');
    if (topProductsList && data.topProducts.length > 0) {
      topProductsList.innerHTML = data.topProducts.map(p => `
        <tr>
          <td>${p.product?.name || 'Product'}</td>
          <td>${p.quantity}</td>
          <td>${formatCurrency(p.revenue)}</td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Analytics error:', error);
  }
}

async function loadAdminCategories() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return;
    const categories = await response.json();

    const categoriesList = document.getElementById('categories-list');
    if (categoriesList) {
      categoriesList.innerHTML = categories.map(cat => `
        <tr>
          <td>${cat.name}</td>
          <td>${cat.slug}</td>
          <td><span class="badge ${cat.isActive ? 'active' : 'inactive'}">${cat.isActive ? 'Active' : 'Inactive'}</span></td>
          <td>${cat.sortOrder}</td>
          <td>
            <button class="btn-small" onclick="editCategory('${cat._id}')">Edit</button>
            <button class="btn-small danger" onclick="deleteCategory('${cat._id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    console.error('Admin categories error:', error);
  }
}

function showCategoryForm() {
  document.getElementById('category-modal').classList.add('active');
  document.getElementById('category-id').value = '';
  document.getElementById('category-form').reset();
}

function closeCategoryModal() {
  document.getElementById('category-modal').classList.remove('active');
}

async function saveCategory(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) return;

  const categoryId = document.getElementById('category-id').value;
  const categoryData = {
    name: document.getElementById('category-name').value,
    slug: document.getElementById('category-slug').value,
    description: document.getElementById('category-description').value,
    sortOrder: Number(document.getElementById('category-sort-order').value),
    isActive: document.getElementById('category-active').checked
  };

  const method = categoryId ? 'PUT' : 'POST';
  const endpoint = categoryId ? `/api/v1/admin/categories/${categoryId}` : '/api/v1/admin/categories';

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(categoryData)
    });

    if (!response.ok) throw new Error('Failed to save category');
    
    closeCategoryModal();
    loadAdminCategories();
    showToast('✅ Category saved successfully');
  } catch (error) {
    console.error('Category save error:', error);
    showToast('❌ Failed to save category');
  }
}

async function editCategory(categoryId) {
  showCategoryForm();
}

async function deleteCategory(categoryId) {
  const token = getAuthToken();
  if (!token) return;

  if (!confirm('Are you sure you want to delete this category?')) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/categories/${categoryId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete category');
    
    loadAdminCategories();
    showToast('✅ Category deleted successfully');
  } catch (error) {
    console.error('Category delete error:', error);
    showToast('❌ Failed to delete category');
  }
}

function editUser(userId) {
  // Implement user editing
}

function initCookieConsent() {
  const modal = document.getElementById('cookie-consent-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('cookie-close');
  const acceptAllBtn = document.getElementById('cookie-accept-all');
  const acceptSelectedBtn = document.getElementById('cookie-accept-selected');
  const rejectBtn = document.getElementById('cookie-reject');
  const analyticsCheckbox = document.getElementById('analytics-cookies');
  const marketingCheckbox = document.getElementById('marketing-cookies');

  // Check if user has already made a choice
  const consent = localStorage.getItem('papjoy-cookie-consent');
  if (consent) {
    try {
      const preferences = JSON.parse(consent);
      // Apply saved preferences (stub for future use)
      if (preferences.analytics) { /* Enable analytics */ }
      if (preferences.marketing) { /* Enable marketing cookies */ }
      return; // Don't show modal if already consented
    } catch (e) {
      localStorage.removeItem('papjoy-cookie-consent');
      // Fall through to show the modal again
    }
  }

  // Show modal
  setTimeout(() => {
    modal.classList.add('show');
  }, 1000);

  // Close modal
  const closeModal = () => {
    modal.classList.remove('show');
  };

  closeBtn.addEventListener('click', closeModal);

  // Accept all cookies
  acceptAllBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: true,
      marketing: true,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Enable all cookies
  });

  // Accept selected cookies
  acceptSelectedBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: analyticsCheckbox.checked,
      marketing: marketingCheckbox.checked,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Enable selected cookies
  });

  // Reject all non-essential cookies
  rejectBtn.addEventListener('click', () => {
    const preferences = {
      essential: true,
      analytics: false,
      marketing: false,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('papjoy-cookie-consent', JSON.stringify(preferences));
    closeModal();
    // Disable non-essential cookies
  });

  // Handle link clicks
  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('privacy.html', '_blank');
  });

  document.getElementById('terms-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('terms.html', '_blank');
  });

  document.getElementById('cookies-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.open('cookies.html', '_blank');
  });
}

async function loadAdminDashboardData() {
  const user = getCurrentUser();
  if (!user) return null;
  try {
    const [summaryRes, ordersRes, productsRes, usersRes, invoicesRes, reportsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/v1/admin/summary`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/orders`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/products`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/users`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/invoices/admin?limit=10`, { headers: { Authorization: `Bearer ${user.token}` } }),
      fetch(`${API_BASE_URL}/api/v1/admin/reports?range=month`, { headers: { Authorization: `Bearer ${user.token}` } })
    ]);

    if (!summaryRes.ok) return null;

    const [summary, orders, products, users] = await Promise.all([
      summaryRes.json(),
      ordersRes.ok ? ordersRes.json() : Promise.resolve({ orders: [] }),
      productsRes.ok ? productsRes.json() : Promise.resolve({ products: [] }),
      usersRes.ok ? usersRes.json() : Promise.resolve({ users: [] })
    ]);

    const invoices = invoicesRes.ok ? await invoicesRes.json() : { invoices: [] };
    const reports = reportsRes.ok ? await reportsRes.json() : null;

    return { summary, orders, products, users, invoices, reports };
  } catch (error) {
    console.error('Failed to load admin dashboard data:', error);
    return null;
  }
}

async function renderAdminDashboard(user) {
  if (!user) return;
  let adminContainer = document.getElementById('admin-dashboard');
  if (!adminContainer) {
    const accountSection = document.querySelector('.account-page') || document.querySelector('main') || document.body;
    adminContainer = document.createElement('section');
    adminContainer.id = 'admin-dashboard';
    adminContainer.className = 'admin-dashboard';
    if (accountSection) accountSection.appendChild(adminContainer);
  }

  const adminData = await loadAdminDashboardData();
  if (!adminData) {
    adminContainer.style.display = 'none';
    return;
  }

  const { summary, orders, products, users, invoices, reports } = adminData;
  adminContainer.style.display = 'block';
  adminContainer.innerHTML = `
    <section class="admin-dashboard-card">
      <h2>Admin Dashboard</h2>
      <div class="admin-summary-grid">
        <div class="summary-card"><strong>${summary.totalUsers}</strong><span>Users</span></div>
        <div class="summary-card"><strong>${summary.totalOrders}</strong><span>Orders</span></div>
        <div class="summary-card"><strong>${summary.totalProducts}</strong><span>Products</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.totalRevenue)}</strong><span>Revenue</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.gstCollected || 0)}</strong><span>GST Collected</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.pendingRevenue || 0)}</strong><span>Pending Revenue</span></div>
        <div class="summary-card"><strong>${formatCurrency(summary.refunds || 0)}</strong><span>Refunds</span></div>
        <div class="summary-card"><strong>${summary.invoiceCount || 0}</strong><span>Invoices</span></div>
      </div>
      <div class="admin-panels">
        <div class="admin-panel">
          <h3>Recent Orders</h3>
          <div class="admin-list">${orders.orders.slice(0, 6).map(order => `<div class="admin-list-item"><span>${order.orderNumber || order._id}</span><strong>${formatCurrency(order.total)}</strong><small>${order.status}</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Top Products</h3>
          <div class="admin-list">${products.products.slice(0, 6).map(product => `<div class="admin-list-item"><span>${product.name}</span><strong>${formatCurrency(product.price)}</strong><small>${product.inventory?.quantity || 0} in stock</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Recent Users</h3>
          <div class="admin-list">${users.users.slice(0, 6).map(user => `<div class="admin-list-item"><span>${user.name}</span><strong>${user.email}</strong><small>${user.role || 'user'}</small></div>`).join('')}</div>
        </div>
        <div class="admin-panel">
          <h3>Recent Invoices</h3>
          <div class="admin-list">${(invoices.invoices || []).slice(0, 6).map((invoice) => `<div class="admin-list-item"><span>${invoice.invoiceNumber || invoice.orderId}</span><strong>${formatCurrency(invoice.total || 0)}</strong><small>${invoice.paymentStatus || 'pending'}</small></div>`).join('') || '<div class="empty-state">No invoices yet.</div>'}</div>
        </div>
      </div>
      ${reports ? `<div class="admin-panels"><div class="admin-panel"><h3>Report Snapshot</h3><div class="admin-list"><div class="admin-list-item"><span>Orders</span><strong>${reports.summary.orders}</strong></div><div class="admin-list-item"><span>Revenue</span><strong>${formatCurrency(reports.summary.revenue)}</strong></div><div class="admin-list-item"><span>GST</span><strong>${formatCurrency(reports.summary.gstCollected)}</strong></div><div class="admin-list-item"><span>Pending</span><strong>${formatCurrency(reports.summary.pendingRevenue)}</strong></div></div></div></div>` : ''}
    </section>
  `;
}

window.adminCategories = adminCategories;
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminProducts = loadAdminProducts;
window.showProductForm = showProductForm;
window.closeProductModal = closeProductModal;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.loadAdminOrders = loadAdminOrders;
window.showOrderModal = showOrderModal;
window.closeOrderModal = closeOrderModal;
window.updateOrderStatus = updateOrderStatus;
window.loadAdminUsers = loadAdminUsers;
window.loadAnalytics = loadAnalytics;
window.loadAdminCategories = loadAdminCategories;
window.showCategoryForm = showCategoryForm;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategory;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.editUser = editUser;
window.initCookieConsent = initCookieConsent;
window.loadAdminDashboardData = loadAdminDashboardData;
window.renderAdminDashboard = renderAdminDashboard;

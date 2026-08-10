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

function requireAdmin() {
  const user = getCurrentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    window.location.href = 'signin.html';
    return false;
  }
  return true;
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
      if (errEl) errEl.innerHTML = '<tr><td colspan="6" class="text-center">Failed to load dashboard. Please try again.</td></tr>';
      return;
    }
    const data = await response.json();

    if (data.stats) {
      document.getElementById('stat-revenue').textContent = formatINR(data.stats.totalRevenue || 0);
      document.getElementById('stat-orders').textContent = data.stats.totalOrders || 0;
      document.getElementById('stat-products').textContent = data.stats.totalProducts || 0;
      document.getElementById('stat-users').textContent = data.stats.totalUsers || 0;
    }

    const recentOrdersList = document.getElementById('recent-orders-list');
    if (recentOrdersList && Array.isArray(data.recentOrders)) {
      if (!data.recentOrders.length) {
        recentOrdersList.innerHTML = '<tr><td colspan="6" class="text-center">No orders yet</td></tr>';
      } else {
        recentOrdersList.innerHTML = data.recentOrders.map(order => `
          <tr>
            <td data-label="Order ID">${escapeHTML(order.orderNumber || order._id?.slice(-8) || 'N/A')}</td>
            <td data-label="Customer">${escapeHTML(order.userId?.name || order.shippingAddress?.name || 'Guest')}</td>
            <td data-label="Total">${formatINR(order.total || 0)}</td>
            <td data-label="Status"><span class="status-badge">${escapeHTML(order.status)}</span></td>
            <td data-label="Date">${new Date(order.createdAt).toLocaleDateString()}</td>
            <td data-label="Action"><button class="btn-small" onclick="showOrderModal('${order._id}', '${escapeHTML(order.status)}')">Update</button></td>
          </tr>
        `).join('');
      }
    }

    const statusDist = document.getElementById('order-status-dist');
    if (statusDist && data.ordersByStatus) {
      const entries = Object.entries(data.ordersByStatus);
      if (!entries.length) {
        statusDist.innerHTML = '<p class="text-center">No order data</p>';
      } else {
        const maxCount = Math.max(...entries.map(e => e[1])) || 1;
        statusDist.innerHTML = entries.map(([status, count]) => `
          <div class="status-item">
            <span>${escapeHTML(status)}: ${count}</span>
            <div class="status-bar"><div style="width: ${(count / maxCount) * 100}%"></div></div>
          </div>
        `).join('');
      }
    }
  } catch (error) {
    console.error('Admin dashboard error:', error);
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
      productsList.innerHTML = data.products.map(product => `
        <tr>
          <td data-label="Product Name">${escapeHTML(product.name)}</td>
          <td data-label="SKU">${escapeHTML(product.sku || 'N/A')}</td>
          <td data-label="Price">${formatINR(product.price)}</td>
          <td data-label="Stock">${product.inventory?.quantity || 0}</td>
          <td data-label="Status"><span class="badge ${product.isActive ? 'active' : 'inactive'}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
          <td data-label="Actions">
            <button class="btn-small" onclick="window.location.href='product-edit.html?id=${product._id}'">Edit</button>
            <button class="btn-small danger" onclick="deleteProduct('${product._id}')">Delete</button>
          </td>
        </tr>
      `).join('');
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
      if (el) el.innerHTML = '<tr><td colspan="7" class="text-center">Failed to load orders.</td></tr>';
      return;
    }
    const data = await response.json();

    const orders = data.orders || data.data || [];
    const ordersList = document.getElementById('orders-list');
    if (ordersList) {
      if (!orders.length) {
        ordersList.innerHTML = '<tr><td colspan="7" class="text-center">No orders found</td></tr>';
      } else {
        ordersList.innerHTML = orders.map(order => `
          <tr>
            <td data-label="Order #">${escapeHTML(order.orderNumber || order._id?.slice(-8) || 'N/A')}</td>
            <td data-label="Customer">${escapeHTML(order.userId?.name || order.shippingAddress?.name || 'Guest')}</td>
            <td data-label="Total">${formatINR(order.total || 0)}</td>
            <td data-label="Status"><span class="status-badge">${escapeHTML(order.status)}</span></td>
            <td data-label="Payment">${escapeHTML(order.paymentStatus || order.paymentMethod || 'N/A')}</td>
            <td data-label="Date">${new Date(order.createdAt).toLocaleDateString()}</td>
            <td data-label="Actions"><button class="btn-small" onclick="showOrderModal('${order._id}')">View</button></td>
          </tr>
        `).join('');
      }
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
      if (el) el.innerHTML = '<tr><td colspan="6" class="text-center">Failed to load users.</td></tr>';
      return;
    }
    const data = await response.json();

    const users = data.users || data.data || [];
    const usersList = document.getElementById('users-list');
    if (usersList) {
      if (!users.length) {
        usersList.innerHTML = '<tr><td colspan="6" class="text-center">No users found</td></tr>';
      } else {
        usersList.innerHTML = users.map(u => `
          <tr>
            <td data-label="Name">${escapeHTML(u.name)}</td>
            <td data-label="Email">${escapeHTML(u.email)}</td>
            <td data-label="Role">
              <select class="admin-role-select" onchange="changeUserRole('${u._id}', this.value)" ${u.email === 'papp.joyy@gmail.com' ? 'disabled' : ''}>
                <option value="customer" ${u.role === 'customer' || u.role === 'user' ? 'selected' : ''}>Customer</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
            </td>
            <td data-label="Created">${new Date(u.createdAt).toLocaleDateString()}</td>
            <td data-label="Status"><span class="badge ${u.isActive !== false ? 'active' : 'inactive'}">${u.isActive !== false ? 'Active' : 'Inactive'}</span></td>
            <td data-label="Actions">
              <button class="btn-small" onclick="toggleUserStatus('${u._id}', ${u.isActive === false})">${u.isActive !== false ? 'Deactivate' : 'Activate'}</button>
            </td>
          </tr>
        `).join('');
      }
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

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      const chartEl = document.getElementById('revenue-chart');
      if (chartEl) chartEl.innerHTML = '<p class="text-center">Failed to load analytics.</p>';
      return;
    }
    const data = await response.json();

    const revenueChartEl = document.getElementById('revenue-chart');
    if (revenueChartEl && data.revenueByDate) {
      const days = data.revenueByDate;
      const maxRevenue = Math.max(...days.map(d => d.revenue || 0), 1);
      const chartBars = days.map(d => {
        const height = ((d.revenue || 0) / maxRevenue) * 100;
        const dateLabel = d._id || d.date || '';
        const shortDate = dateLabel.length > 5 ? dateLabel.slice(5) : dateLabel;
        return `<div class="chart-bar-wrapper" title="${escapeHTML(dateLabel)}: ${formatINR(d.revenue || 0)}">
          <div class="chart-bar" style="height: ${height}%"></div>
          <span class="chart-label">${escapeHTML(shortDate)}</span>
        </div>`;
      }).join('');
      revenueChartEl.innerHTML = `<div class="bar-chart">${chartBars}</div>`;
    } else if (revenueChartEl) {
      revenueChartEl.innerHTML = '<p class="text-center">No revenue data available</p>';
    }

    const topProductsEl = document.getElementById('top-products-list');
    if (topProductsEl && data.topProducts) {
      if (!data.topProducts.length) {
        topProductsEl.innerHTML = '<tr><td colspan="3" class="text-center">No data available</td></tr>';
      } else {
        topProductsEl.innerHTML = data.topProducts.map((p, i) => `
          <tr>
            <td data-label="Product">${i + 1}. ${escapeHTML(p.product?.name || p._id || 'Unknown')}</td>
            <td data-label="Units Sold">${p.quantity || p.totalSold || p.sold || 0}</td>
            <td data-label="Revenue">${formatINR(p.revenue || p.totalRevenue || 0)}</td>
          </tr>
        `).join('');
      }
    }

    if (data.categorySales) {
      const analyticsPage = document.getElementById('analytics-page');
      let categorySection = document.getElementById('category-sales-section');
      if (!categorySection) {
        categorySection = document.createElement('section');
        categorySection.id = 'category-sales-section';
        categorySection.className = 'dashboard-section';
        const topProductsSection = topProductsEl?.closest('.dashboard-section');
        if (topProductsSection) {
          topProductsSection.parentNode.insertBefore(categorySection, topProductsSection.nextSibling);
        } else {
          analyticsPage?.appendChild(categorySection);
        }
      }
      const catData = data.categorySales;
      if (Array.isArray(catData) && catData.length) {
        categorySection.innerHTML = `
          <h2>Sales by Category</h2>
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead><tr><th>Category</th><th>Orders</th><th>Revenue</th></tr></thead>
              <tbody>${catData.map(c => `
                <tr>
                  <td data-label="Category">${escapeHTML(c._id || c.name || 'Unknown')}</td>
                  <td data-label="Orders">${c.count || c.orders || 0}</td>
                  <td data-label="Revenue">${formatINR(c.revenue || c.totalRevenue || 0)}</td>
                </tr>
              `).join('')}</tbody>
            </table>
          </div>`;
      } else {
        categorySection.innerHTML = '<h2>Sales by Category</h2><p class="text-center">No category data available</p>';
      }
    }
  } catch (error) {
    console.error('Analytics error:', error);
  }
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
      if (el) el.innerHTML = '<tr><td colspan="5" class="text-center">Failed to load categories.</td></tr>';
      return;
    }
    const data = await response.json();

    const categories = data.categories || data.data || data || [];
    const categoriesList = document.getElementById('categories-list');
    if (categoriesList) {
      if (!Array.isArray(categories) || !categories.length) {
        categoriesList.innerHTML = '<tr><td colspan="5" class="text-center">No categories found</td></tr>';
      } else {
        categoriesList.innerHTML = categories.map(cat => `
          <tr>
            <td data-label="Name">${escapeHTML(cat.name)}</td>
            <td data-label="Slug">${escapeHTML(cat.slug)}</td>
            <td data-label="Status"><span class="badge ${cat.isActive !== false ? 'active' : 'inactive'}">${cat.isActive !== false ? 'Active' : 'Inactive'}</span></td>
            <td data-label="Sort Order">${cat.sortOrder || 0}</td>
            <td data-label="Actions">
              <button class="btn-small" onclick="showCategoryForm('${cat._id}')">Edit</button>
              <button class="btn-small danger" onclick="deleteCategory('${cat._id}')">Delete</button>
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
  if (detailsEl) detailsEl.innerHTML = '<p class="text-center">Loading order details...</p>';
  modal.classList.add('active');

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      if (detailsEl) detailsEl.innerHTML = '<p class="text-center">Failed to load order details.</p>';
      return;
    }
    const order = await response.json();
    if (detailsEl) detailsEl.innerHTML = renderOrderDetails(order);

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
    if (detailsEl) detailsEl.innerHTML = '<p class="text-center">Failed to load order details.</p>';
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
    return `<div class="order-addr"><h4>${label}</h4><p>${escapeHTML(addr.name || '')}</p>` +
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

  const statusClass = `status-badge status-${String(order.status || 'pending').toLowerCase()}`;
  const paymentStatusClass = `status-badge status-${String(order.paymentStatus || 'pending').toLowerCase()}`;

  const tracking = order.shipment && (order.shipment.trackingNumber || order.shipment.trackingUrl) ? `
    <div class="order-track">
      <h4>Tracking</h4>
      ${order.shipment.trackingNumber ? `<p>Number: ${escapeHTML(order.shipment.trackingNumber)}</p>` : ''}
      ${order.shipment.carrier ? `<p>Carrier: ${escapeHTML(order.shipment.carrier)}</p>` : ''}
      ${order.shipment.trackingUrl ? `<p>URL: <a href="${escapeHTML(order.shipment.trackingUrl)}" target="_blank" rel="noopener">${escapeHTML(order.shipment.trackingUrl)}</a></p>` : ''}
    </div>` : '';

  return `
    <div class="order-detail-block">
      <div class="order-summary-row">
        <span><strong>Order:</strong> ${escapeHTML(order.orderNumber || order._id)}</span>
        <span><strong>Placed:</strong> ${new Date(order.createdAt).toLocaleString()}</span>
        <span><span class="${statusClass}">${escapeHTML(order.status || 'pending')}</span></span>
        <span><span class="${paymentStatusClass}">${escapeHTML(order.paymentStatus || 'pending')} · ${escapeHTML(order.paymentMethod || '')}</span></span>
      </div>
      <div class="order-grid">
        <div class="order-cust">
          <h4>Customer</h4>
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
      <h4>Items</h4>
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
}

function closeAdminSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('admin-sidebar-overlay');
  if (sidebar) sidebar.classList.remove('mobile-open');
  if (overlay) overlay.classList.remove('active');
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

// Helper to escape raw text and prevent XSS injection
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

    // Update stats safely
    if (data.stats) {
      document.getElementById('stat-revenue').textContent = formatCurrency(data.stats.totalRevenue || 0);
      document.getElementById('stat-orders').textContent = data.stats.totalOrders || 0;
      document.getElementById('stat-products').textContent = data.stats.totalProducts || 0;
      document.getElementById('stat-users').textContent = data.stats.totalUsers || 0;
    }

    // Render recent orders
    const recentOrdersList = document.getElementById('recent-orders-list');
    if (recentOrdersList && Array.isArray(data.recentOrders)) {
      recentOrdersList.innerHTML = data.recentOrders.map(order => `
        <tr>
          <td>${escapeHTML(order.orderNumber)}</td>
          <td>${escapeHTML(order.userId?.name || 'Guest')}</td>
          <td>${formatCurrency(order.total || 0)}</td>
          <td><span class="status-badge">${escapeHTML(order.status)}</span></td>
          <td>${new Date(order.createdAt).toLocaleDateString()}</td>
          <td><button class="btn-small" onclick="showOrderModal('${order._id}')">Update</button></td>
        </tr>
      `).join('');
    }

    // Render order status distribution
    const statusDist = document.getElementById('order-status-dist');
    if (statusDist && data.ordersByStatus) {
      const maxCount = Math.max(...Object.values(data.ordersByStatus)) || 1;
      statusDist.innerHTML = Object.entries(data.ordersByStatus).map(([status, count]) => `
        <div class="status-item">
          <span>${escapeHTML(status)}: ${count}</span>
          <div class="status-bar"><div style="width: ${(count / maxCount) * 100}%"></div></div>
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
    if (productsList && Array.isArray(data.products)) {
      productsList.innerHTML = data.products.map(product => `
        <tr>
          <td>${escapeHTML(product.name)}</td>
          <td>${escapeHTML(product.sku || 'N/A')}</td>
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
  const modal = document.getElementById('product-modal');
  if (modal) modal.classList.add('active');
  
  const idInput = document.getElementById('product-id');
  if (idInput) idInput.value = '';
  
  const form = document.getElementById('product-form');
  if (form) form.reset();
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
  const productData = {
    name: document.getElementById('product-name')?.value,
    slug: document.getElementById('product-slug')?.value,
    description: document.getElementById('product-description')?.value,
    price: Number(document.getElementById('product-price')?.value || 0),
    categoryId: document.getElementById('product-category')?.value,
    sku: document.getElementById('product-sku')?.value,
    brand: document.getElementById('product-brand')?.value,
    inventory: { quantity: Number(document.getElementById('product-stock')?.value || 0) },
    isActive: document.getElementById('product-active')?.checked || false
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
    if (typeof showToast === 'function') showToast('✅ Product saved successfully');
  } catch (error) {
    console.error('Product save error:', error);
    if (typeof showToast === 'function') showToast('❌ Failed to save product');
  }
}

// FIX: Properly fetch product details and populate form fields
async function editProduct(productId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/products/${productId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to fetch product');
    const product = await response.json();

    showProductForm();
    document.getElementById('product-id').value = product._id;
    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-slug').value = product.slug || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-price').value = product.price || 0;
    document.getElementById('product-category').value = product.categoryId || '';
    document.getElementById('product-sku').value = product.sku || '';
    document.getElementById('product-brand').value = product.brand || '';
    document.getElementById('product-stock').value = product.inventory?.quantity || 0;
    document.getElementById('product-active').checked = Boolean(product.isActive);
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
    if (typeof showToast === 'function') showToast('✅ Product deleted successfully');
  } catch (error) {
    console.error('Product delete error:', error);
    if (typeof showToast === 'function') showToast('❌ Failed to delete product');
  }
}

function initCookieConsent() {
  const modal = document.getElementById('cookie-consent-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('cookie-close');
  const acceptAllBtn = document.getElementById('cookie-accept-all');
  const acceptSelectedBtn = document.getElementById('cookie-accept-selected');
  const rejectBtn = document.getElementById('cookie-reject');

  const consent = localStorage.getItem('papjoy-cookie-consent');
  if (consent) return;

  setTimeout(() => modal.classList.add('show'), 1000);

  const closeModal = () => modal.classList.remove('show');

  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  if (acceptAllBtn) {
    acceptAllBtn.addEventListener('click', () => {
      localStorage.setItem('papjoy-cookie-consent', JSON.stringify({ essential: true, analytics: true, marketing: true, timestamp: new Date().toISOString() }));
      closeModal();
    });
  }

  // Safe checks for footer/privacy links
  ['privacy-link', 'terms-link', 'cookies-link'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(el.getAttribute('href') || '#', '_blank');
      });
    }
  });
}

// Global Window Exports
window.loadAdminDashboard = loadAdminDashboard;
window.loadAdminProducts = loadAdminProducts;
window.showProductForm = showProductForm;
window.closeProductModal = closeProductModal;
window.saveProduct = saveProduct;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.initCookieConsent = initCookieConsent;
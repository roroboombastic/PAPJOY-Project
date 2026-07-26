function formatOrderData(order) {
  const number = order.orderNumber || order.id || 'N/A';
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Unknown';
  const shortDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
  const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1).replace(/_/g, ' ') : 'Pending';
  const totalText = order.total != null ? formatCurrency(order.total) : '—';
  const orderId = order._id || order.id || '';
  return { number, date, shortDate, statusText, totalText, orderId, status: order.status || 'pending' };
}

function showSectionLoading(container, icon = 'fa-spinner fa-spin') {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas ${icon}"></i>
      <p>Loading...</p>
    </div>
  `;
}

async function loadUserOrders() {
  const ordersContainer = document.getElementById('orders-container');
  const user = getCurrentUser();
  const currentUserId = user?.id || user?._id;

  if (!user || !currentUserId) {
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-lock"></i>
          <p>Please sign in to view your orders.</p>
          <a href="signin.html" class="checkout-button">Sign In</a>
        </div>`;
    }
    return [];
  }

  if (ordersContainer) showSectionLoading(ordersContainer, 'fa-shopping-bag');

  const email = user.email?.toLowerCase();
  let orders = [];
  const token = getAuthToken();

  if (token) {
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const response = await fetch(`${API_BASE_URL}/api/v1/orders`, { headers });
      if (response.ok) {
        const json = await response.json();
        orders = Array.isArray(json) ? json : (json.orders || []);
      }
    } catch (error) {
      console.warn('Remote orders unavailable, using local orders.', error);
    }
  }

  const localOrders = getLocalOrders().filter((order) => order.email?.toLowerCase() === email);
  if (!orders || orders.length === 0) {
    orders = localOrders;
  }

  if (!orders || orders.length === 0) {
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No orders yet.</p>
          <a href="product.html" class="checkout-button">Start Shopping</a>
        </div>`;
    }
    return [];
  }

  if (ordersContainer) {
    if (ordersContainer._orderListener) {
      ordersContainer.removeEventListener('click', ordersContainer._orderListener);
    }
    ordersContainer.innerHTML = orders.map((order) => {
      const d = formatOrderData(order);
      const statusClass = d.status === 'delivered' || d.status === 'completed' ? 'completed' : d.status === 'cancelled' ? 'cancelled' : 'pending';
      return `
        <div class="order-item" data-order-id="${d.orderId}">
          <div class="order-details">
            <div class="order-id">Order #${d.number}</div>
            <div class="order-date">${d.shortDate}</div>
          </div>
          <span class="order-status status-pill status-${statusClass}">${d.statusText}</span>
          <div class="order-total">${d.totalText}</div>
          <div class="order-actions">
            <button type="button" class="btn-small" data-order-action="preview" data-order-id="${d.orderId}" title="View invoice">
              <i class="fas fa-eye"></i> Preview
            </button>
            <button type="button" class="btn-small" data-order-action="download" data-order-id="${d.orderId}" title="Download PDF">
              <i class="fas fa-download"></i> Download
            </button>
            ${['pending', 'confirmed'].includes(d.status) ? `
              <button type="button" class="btn-small btn-danger" data-order-action="cancel" data-order-id="${d.orderId}" title="Cancel order">
                <i class="fas fa-times"></i> Cancel
              </button>` : ''}
            ${d.status === 'shipped' ? `
              <a href="tracking.html?order=${d.number}" class="btn-small" title="Track shipment">
                <i class="fas fa-truck"></i> Track
              </a>` : ''}
          </div>
        </div>`;
    }).join('');

    const orderHandler = (e) => {
      const btn = e.target.closest('[data-order-action]');
      if (!btn) return;
      const orderId = btn.dataset.orderId;
      const action = btn.dataset.orderAction;
      if (action === 'preview') {
        window.location.href = `invoice-preview.html?orderId=${orderId}`;
      } else if (action === 'download') {
        downloadOrderInvoice(orderId);
      } else if (action === 'cancel') {
        cancelOrder(orderId);
      }
    };
    ordersContainer.addEventListener('click', orderHandler);
    ordersContainer._orderListener = orderHandler;
  }

  return orders;
}

function getLoyaltyInfo(orderCount) {
  if (orderCount >= 20) return { tier: 'Platinum Member', message: 'You have reached Platinum status! Enjoy VIP support and early access.', progress: 100 };
  if (orderCount >= 10) return { tier: 'Gold Member', message: 'Great work! One more order to reach Platinum.', progress: 75 };
  if (orderCount >= 5) return { tier: 'Silver Member', message: 'Nice progress! Complete 5 more orders to reach Gold.', progress: 50 };
  if (orderCount >= 1) return { tier: 'Bronze Member', message: 'Keep shopping to unlock Silver status.', progress: 25 };
  return { tier: 'New Member', message: 'Start your first order to unlock rewards.', progress: 10 };
}

function renderLoyaltySummary(user, orders = []) {
  const loyaltyTier = document.getElementById('loyalty-tier');
  const loyaltyMessage = document.getElementById('loyalty-message');
  const loyaltyProgress = document.getElementById('loyalty-progress');
  const orderCount = Array.isArray(orders) ? orders.length : 0;
  const loyalty = getLoyaltyInfo(orderCount);

  if (loyaltyTier) loyaltyTier.textContent = loyalty.tier;
  if (loyaltyMessage) loyaltyMessage.textContent = `${loyalty.message} (${orderCount} order${orderCount === 1 ? '' : 's'} placed)`;
  if (loyaltyProgress) loyaltyProgress.style.setProperty('--progress-width', `${loyalty.progress}%`);
}

function renderOrderTrackingBadges(orders = []) {
  const badgesContainer = document.getElementById('order-status-badges');
  if (!badgesContainer) return;

  const statusCounts = orders.reduce((counts, order) => {
    const status = (order.status || 'pending').toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});

  const badgeData = [
    { status: 'shipped', icon: 'fa-truck', label: 'Shipped' },
    { status: 'pending', icon: 'fa-clock', label: 'Processing' },
    { status: 'delivered', icon: 'fa-check-circle', label: 'Delivered' },
    { status: 'completed', icon: 'fa-check-circle', label: 'Completed' },
    { status: 'cancelled', icon: 'fa-ban', label: 'Cancelled' }
  ];

  badgesContainer.innerHTML = badgeData.map(({ status, icon, label }) => {
    const count = statusCounts[status] || 0;
    if (count === 0 && status === 'completed') return '';
    return `
      <span class="status-badge ${status}">
        <i class="fas ${icon}"></i>
        ${label}: ${count}
      </span>`;
  }).join('');
}

function renderAccountStats(user, orders = []) {
  const totalOrders = document.getElementById('stat-total-orders');
  const totalSpent = document.getElementById('stat-total-spent');
  const memberSince = document.getElementById('stat-member-since');

  if (totalOrders) totalOrders.textContent = orders.length;
  if (totalSpent) {
    const sum = orders.reduce((acc, o) => acc + (o.total || 0), 0);
    totalSpent.textContent = sum > 0 ? formatCurrency(sum) : '—';
  }
  if (memberSince && user?.createdAt) {
    memberSince.textContent = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
}

async function downloadOrderInvoice(orderId) {
  if (!orderId) {
    showToast('Invalid order ID', 'error');
    return;
  }
  const token = getAuthToken();
  const guestEmail = window.currentTrackingOrder?.email || getQueryParams().email || '';
  if (!token && !guestEmail) {
    showToast('Please sign in to download invoice', 'error');
    return;
  }

  try {
    showToast('Downloading invoice...', 'info');
    const url = new URL(`${API_BASE_URL}/api/v1/invoices/${orderId}/download`);
    if (!token && guestEmail) url.searchParams.set('email', guestEmail);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to download invoice (${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `invoice-${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
    showToast('Invoice downloaded successfully', 'success');
  } catch (error) {
    console.error('Invoice download failed:', error);
    showToast(`Failed to download invoice: ${error.message}`, 'error');
  }
}

async function cancelOrder(orderId) {
  if (!orderId) return;
  if (!confirm('Are you sure you want to cancel this order?')) return;

  const token = getAuthToken();
  if (!token) {
    showToast('Please sign in to cancel orders.', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to cancel order');
    }
    showToast('Order cancelled successfully.', 'success');
    loadUserOrders();
  } catch (error) {
    console.error('Cancel order failed:', error);
    showToast(`Cancel failed: ${error.message}`, 'error');
  }
}

async function renderAccountAddresses(user) {
  const addressesContainer = document.getElementById('addresses-container');
  if (!addressesContainer) return;

  showSectionLoading(addressesContainer, 'fa-location-dot');

  try {
    const addresses = await loadUserAddresses();

    if (!addresses || addresses.length === 0) {
      addressesContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-location-dot"></i>
          <p>No saved addresses yet.</p>
          <button type="button" class="checkout-button" onclick="openAddressModal()">Add Your First Address</button>
        </div>`;
      return;
    }

    addressesContainer.innerHTML = addresses.map((address) => `
      <div class="address-card ${address.isDefault ? 'default' : ''}" data-address-id="${address._id}">
        ${address.isDefault ? '<div class="address-badge">Default</div>' : ''}
        <div class="address-name">${address.name || 'Address'} <span class="address-type-tag">${address.type || 'shipping'}</span></div>
        <div class="address-text">
          ${address.street || ''}<br>
          ${address.city || ''}${address.state ? ', ' + address.state : ''}<br>
          ${address.zipCode || ''}${address.country ? ', ' + address.country : ''}
          ${address.phone ? '<br><strong>Phone: ' + address.phone + '</strong>' : ''}
        </div>
        <div class="address-actions">
          ${!address.isDefault ? `<button type="button" class="btn-small" data-address-id="${address._id}" data-address-action="setDefault" title="Set as default">
            <i class="fas fa-star"></i> Default
          </button>` : ''}
          <button type="button" class="btn-small" data-address-id="${address._id}" data-address-action="edit" title="Edit address">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button type="button" class="btn-small btn-danger" data-address-id="${address._id}" data-address-action="delete" title="Delete address">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (addressesContainer._addressListener) {
      addressesContainer.removeEventListener('click', addressesContainer._addressListener);
    }
    const addressHandler = (e) => {
      const btn = e.target.closest('[data-address-action]');
      if (!btn) return;
      const id = btn.dataset.addressId;
      const action = btn.dataset.addressAction;
      if (action === 'edit') editAddress(id);
      else if (action === 'delete') deleteAddressHandler(id);
      else if (action === 'setDefault') setAddressDefaultHandler(id);
    };
    addressesContainer.addEventListener('click', addressHandler);
    addressesContainer._addressListener = addressHandler;
  } catch (error) {
    console.error('Failed to render addresses:', error);
    addressesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Unable to load addresses. Please try again.</p>
      </div>`;
  }
}

function renderAccountWishlist() {
  const wishlistContainer = document.getElementById('wishlist-container');
  if (!wishlistContainer) return;

  if (!savedItems || savedItems.length === 0) {
    wishlistContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-heart"></i>
        <p>Your wishlist is empty. Save your favorite styles for later.</p>
        <a href="product.html" class="checkout-button">Browse Products</a>
      </div>`;
    return;
  }

  wishlistContainer.innerHTML = savedItems.map((item) => {
    const productId = item.id || item._id || item.productId || '';
    const variantName = item.variant || 'Standard';
    const itemImage = item.image || item.product?.image || PRODUCT_FALLBACK_IMAGE;
    const safeId = encodeURIComponent(String(productId));
    const safeVariant = encodeURIComponent(String(variantName));
    return `
      <div class="wishlist-card" data-wishlist-id="${safeId}" data-wishlist-variant="${safeVariant}">
        <div class="wishlist-card-meta">
          <img src="${itemImage}" alt="${item.name || 'Saved item'}" loading="lazy" class="wishlist-card-image" onerror="this.src='${PRODUCT_FALLBACK_IMAGE}'" />
          <div class="wishlist-card-details">
            <strong>${item.name || item.title || 'Saved item'}</strong>
            ${item.category ? `<p>${item.category}</p>` : ''}
            ${variantName !== 'Standard' ? `<p class="wishlist-variant">${variantName}</p>` : ''}
            <p class="wishlist-price">${formatCurrency(item.price || 0)}</p>
          </div>
        </div>
        <div class="wishlist-actions">
          <button type="button" class="btn-small add-to-cart-btn" data-wishlist-action="addtocart">
            <i class="fas fa-cart-plus"></i> Add to Cart
          </button>
          <button type="button" class="btn-small" data-wishlist-action="view">
            <i class="fas fa-eye"></i> View
          </button>
          <button type="button" class="btn-small btn-danger" data-wishlist-action="remove">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>`;
  }).join('');

  if (wishlistContainer._wishlistListener) {
    wishlistContainer.removeEventListener('click', wishlistContainer._wishlistListener);
  }
  const wishlistHandler = (e) => {
    const card = e.target.closest('.wishlist-card');
    if (!card) return;
    const id = decodeURIComponent(card.dataset.wishlistId || '');
    const variant = decodeURIComponent(card.dataset.wishlistVariant || 'Standard');
    const action = e.target.closest('[data-wishlist-action]')?.dataset.wishlistAction;
    if (action === 'addtocart') addToCart(id, variant);
    else if (action === 'view') window.location.href = `product-detail.html?id=${id}`;
    else if (action === 'remove') removeSavedItem(id, variant);
  };
  wishlistContainer.addEventListener('click', wishlistHandler);
  wishlistContainer._wishlistListener = wishlistHandler;
}

function renderAccountInvoices(orders = []) {
  const invoicesContainer = document.getElementById('invoices-container');
  if (!invoicesContainer) return;

  if (!Array.isArray(orders) || orders.length === 0) {
    invoicesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-file-invoice-dollar"></i>
        <p>No invoices available yet.</p>
      </div>`;
    return;
  }

  invoicesContainer.innerHTML = orders.slice(0, 5).map((order) => {
    const orderId = order._id || order.id || order.orderNumber || '';
    const totalText = order.total != null ? formatCurrency(order.total) : '—';
    const issuedOn = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
    return `
      <div class="order-item">
        <div class="order-details">
          <div class="order-id">Invoice #${order.orderNumber || orderId}</div>
          <div class="order-date">Issued ${issuedOn}</div>
        </div>
        <div class="order-total">${totalText}</div>
        <div class="order-actions">
          <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${orderId}'">
            <i class="fas fa-eye"></i> Preview
          </button>
          <button class="btn-small" onclick="downloadOrderInvoice('${orderId}')">
            <i class="fas fa-download"></i> Download
          </button>
        </div>
      </div>`;
  }).join('');
}

function renderSavedPaymentMethods(user) {
  const paymentContainer = document.getElementById('payment-methods-container');
  if (!paymentContainer) return;

  const savedMethods = Array.isArray(user?.savedPaymentMethods) ? user.savedPaymentMethods : [];
  const preferred = user?.preferredPaymentMethod || 'cod';
  const methodIcons = { card: 'fa-credit-card', paypal: 'fa-paypal', cod: 'fa-money-bill-wave', upi: 'fa-mobile-alt', bank_transfer: 'fa-university', bnpl: 'fa-clock', wallet: 'fa-wallet' };

  if (!savedMethods.length) {
    paymentContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas ${methodIcons[preferred] || 'fa-credit-card'}"></i>
        <p>Preferred method: <strong>${preferred.replace(/_/g, ' ').toUpperCase()}</strong></p>
        <p class="muted-text">No saved payment methods. Payment preferences are set at checkout.</p>
      </div>`;
    return;
  }

  paymentContainer.innerHTML = savedMethods.map((method) => `
    <div class="address-card">
      <div class="address-name"><i class="fas ${methodIcons[method.type] || 'fa-credit-card'}"></i> ${method.brand || method.type || 'Payment Method'}</div>
      <div class="address-text">${method.label || method.last4 || preferred.toUpperCase()}</div>
    </div>
  `).join('');
}

function renderPreferences(user) {
  const notifications = document.getElementById('pref-notifications');
  const marketing = document.getElementById('pref-marketing');
  const currency = document.getElementById('pref-currency');
  const language = document.getElementById('pref-language');

  if (notifications) notifications.checked = user?.preferences?.notifications !== false;
  if (marketing) marketing.checked = user?.marketingOptIn === true;
  if (currency) currency.value = user?.preferences?.currency || 'INR';
  if (language) language.value = user?.preferences?.language || 'en';
}

async function savePreferences() {
  const notifications = document.getElementById('pref-notifications')?.checked;
  const marketing = document.getElementById('pref-marketing')?.checked;
  const currency = document.getElementById('pref-currency')?.value;
  const language = document.getElementById('pref-language')?.value;

  try {
    await updateUserProfile({
      preferences: { notifications, currency, language },
      marketingOptIn: marketing
    });
    showToast('Preferences saved successfully.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to save preferences.', 'error');
  }
}

async function deleteAddressHandler(addressId) {
  if (!confirm('Are you sure you want to delete this address?')) return;
  try {
    await deleteUserAddress(addressId);
    renderAccountPage();
    showToast('Address deleted successfully.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to delete address.', 'error');
  }
}

async function setAddressDefaultHandler(addressId) {
  try {
    await setAddressAsDefault(addressId);
    renderAccountPage();
    showToast('Default address updated.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to set default address.', 'error');
  }
}

async function editAddress(addressId) {
  try {
    const addresses = await loadUserAddresses();
    const address = addresses.find(a => a._id === addressId);
    if (!address) {
      showToast('Address not found.');
      return;
    }

    document.getElementById('addr-edit-id').value = addressId;
    document.getElementById('addr-name').value = address.name || '';
    document.getElementById('addr-type').value = address.type || 'shipping';
    document.getElementById('addr-line1').value = address.street || '';
    document.getElementById('addr-line2').value = '';
    document.getElementById('addr-city').value = address.city || '';
    document.getElementById('addr-state').value = address.state || '';
    document.getElementById('addr-postal').value = address.zipCode || '';
    document.getElementById('addr-country').value = address.country || 'India';
    document.getElementById('addr-phone').value = address.phone || '';
    document.getElementById('addr-default').checked = address.isDefault || false;

    document.getElementById('address-modal-title').textContent = 'Edit Address';
    document.getElementById('address-submit-btn').textContent = 'Save Changes';
    document.getElementById('add-address-modal').classList.add('active');
  } catch (error) {
    showToast(error.message || 'Unable to edit address.');
  }
}

async function handleEditProfileSubmit(event) {
  event.preventDefault();
  const user = getCurrentUser();
  if (!user) return;

  const name = document.getElementById('edit-name')?.value.trim();
  const phone = document.getElementById('edit-phone')?.value.trim();

  if (!name) {
    showToast('Please enter your name.');
    return;
  }

  const profileUpdates = { name };
  if (phone) {
    profileUpdates.phone = phone;
    profileUpdates.shippingAddress = { ...(user.shippingAddress || {}), phone };
  }

  try {
    const updatedUser = await updateUserProfile(profileUpdates);
    if (updatedUser) {
      closeEditModal();
      renderAccountPage();
      showToast('Profile updated successfully.', 'success');
    }
  } catch (error) {
    showToast(error.message || 'Unable to save profile.', 'error');
  }
}

async function handleAddressFormSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) {
    showToast('Please sign in to save addresses.', 'error');
    return;
  }

  const editId = document.getElementById('addr-edit-id')?.value;
  const addressData = {
    type: document.getElementById('addr-type')?.value || 'shipping',
    name: document.getElementById('addr-name')?.value.trim(),
    street: document.getElementById('addr-line1')?.value.trim(),
    city: document.getElementById('addr-city')?.value.trim(),
    state: document.getElementById('addr-state')?.value.trim(),
    zipCode: document.getElementById('addr-postal')?.value.trim(),
    country: document.getElementById('addr-country')?.value.trim(),
    phone: document.getElementById('addr-phone')?.value.trim(),
    isDefault: document.getElementById('addr-default')?.checked || false
  };

  if (!addressData.street || !addressData.city || !addressData.state || !addressData.zipCode) {
    showToast('Please fill in all required address fields.', 'error');
    return;
  }

  try {
    if (editId) {
      await updateUserAddress(editId, addressData);
      showToast('Address updated successfully.', 'success');
    } else {
      await addUserAddress(addressData);
      showToast('Address added successfully.', 'success');
    }
    closeAddressModal();
    renderAccountPage();
  } catch (error) {
    showToast(error.message || 'Unable to save address.', 'error');
  }
}

async function handleChangePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password')?.value;
  const newPassword = document.getElementById('new-password')?.value;
  const confirmPassword = document.getElementById('confirm-new-password')?.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill in all password fields.', 'error');
    return;
  }
  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'error');
    return;
  }
  if (newPassword.length < 8) {
    showToast('New password must be at least 8 characters.', 'error');
    return;
  }

  try {
    await changeUserPassword(currentPassword, newPassword);
    document.getElementById('change-password-modal').classList.remove('active');
    document.getElementById('change-password-form').reset();
    showToast('Password changed successfully.', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to change password.', 'error');
  }
}

async function handleDeleteAccount(event) {
  event.preventDefault();
  const password = document.getElementById('delete-confirm-password')?.value;
  const confirmed = document.getElementById('delete-confirm-check')?.checked;

  if (!password) {
    showToast('Please enter your password.', 'error');
    return;
  }
  if (!confirmed) {
    showToast('Please confirm you understand this action is irreversible.', 'error');
    return;
  }
  if (!confirm('FINAL WARNING: This will permanently delete your account and all data. Are you absolutely sure?')) {
    return;
  }

  try {
    await deleteUserAccount(password);
    setCurrentUser(null);
    window.location.href = 'index.html';
  } catch (error) {
    showToast(error.message || 'Unable to delete account.', 'error');
  }
}

function handleAvatarUpload() {
  const fileInput = document.getElementById('avatar-upload');
  if (!fileInput) return;
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await updateUserProfile({ avatar: reader.result });
        const avatar = document.getElementById('account-avatar-large');
        if (avatar) {
          avatar.style.backgroundImage = `url(${reader.result})`;
          avatar.style.backgroundSize = 'cover';
          avatar.textContent = '';
        }
        showToast('Avatar updated.', 'success');
      } catch (error) {
        showToast('Unable to update avatar.', 'error');
      }
    };
    reader.readAsDataURL(file);
  });
}

function closeAddressModal() {
  const modal = document.getElementById('add-address-modal');
  if (modal) modal.classList.remove('active');
  const form = document.getElementById('add-address-form');
  if (form) form.reset();
  document.getElementById('addr-edit-id').value = '';
  document.getElementById('address-modal-title').textContent = 'Add New Address';
  document.getElementById('address-submit-btn').textContent = 'Add Address';
}

function closeEditModal() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.classList.remove('active');
}

function populateEditProfileForm(user) {
  const editName = document.getElementById('edit-name');
  const editEmail = document.getElementById('edit-email');
  const editPhone = document.getElementById('edit-phone');
  if (editName) editName.value = user.name || '';
  if (editEmail) editEmail.value = user.email || '';
  if (editPhone) editPhone.value = user.phone || user.shippingAddress?.phone || '';
}

async function renderAccountPage() {
  let user = getCurrentUser();

  if (getAuthToken()) {
    const profile = await syncUserProfile();
    if (profile) user = profile;
  }

  const currentUserId = user?.id || user?._id;
  if (!user || !currentUserId) {
    window.location.href = 'signin.html';
    return;
  }

  const displayName = user.name || user.email;

  const accountNameHeader = document.getElementById('account-name-header');
  const accountEmailHeader = document.getElementById('account-email-header');
  const accountAvatarLarge = document.getElementById('account-avatar-large');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarEmail = document.getElementById('sidebar-email');
  const sidebarPhone = document.getElementById('sidebar-phone');
  const editProfileBtn = document.getElementById('edit-profile-btn');
  const signoutBtn = document.getElementById('account-signout-btn');
  const editProfileForm = document.getElementById('edit-profile-form');
  const addressForm = document.getElementById('add-address-form');
  const changePasswordBtn = document.getElementById('change-password-btn');
  const changePasswordForm = document.getElementById('change-password-form');
  const deleteAccountBtn = document.getElementById('delete-account-btn');
  const deleteAccountForm = document.getElementById('delete-account-form');
  const savePrefsBtn = document.getElementById('save-prefs-btn');

  if (accountNameHeader) accountNameHeader.textContent = `Welcome back, ${displayName}`;
  if (accountEmailHeader) accountEmailHeader.textContent = user.email || '';
  if (accountAvatarLarge) {
    if (user.avatar) {
      accountAvatarLarge.style.backgroundImage = `url(${user.avatar})`;
      accountAvatarLarge.style.backgroundSize = 'cover';
      accountAvatarLarge.textContent = '';
    } else {
      accountAvatarLarge.textContent = (displayName[0] || 'P').toUpperCase();
    }
  }
  if (sidebarName) sidebarName.textContent = `Name: ${user.name || 'N/A'}`;
  if (sidebarEmail) sidebarEmail.textContent = `Email: ${user.email || 'N/A'}`;
  if (sidebarPhone) sidebarPhone.textContent = `Phone: ${user.phone || user.shippingAddress?.phone || 'Not set'}`;

  if (editProfileBtn) {
    editProfileBtn.onclick = () => {
      populateEditProfileForm(user);
      document.getElementById('edit-profile-modal')?.classList.add('active');
    };
  }
  if (signoutBtn) {
    signoutBtn.onclick = (event) => { event.preventDefault(); signOut(); };
  }
  if (editProfileForm) editProfileForm.onsubmit = handleEditProfileSubmit;
  if (addressForm) addressForm.onsubmit = handleAddressFormSubmit;
  if (changePasswordForm) changePasswordForm.onsubmit = handleChangePassword;
  if (deleteAccountForm) deleteAccountForm.onsubmit = handleDeleteAccount;
  if (savePrefsBtn) savePrefsBtn.onclick = savePreferences;

  if (changePasswordBtn) {
    changePasswordBtn.onclick = () => {
      document.getElementById('change-password-form')?.reset();
      document.getElementById('change-password-modal')?.classList.add('active');
    };
  }
  if (deleteAccountBtn) {
    deleteAccountBtn.onclick = () => {
      document.getElementById('delete-account-form')?.reset();
      document.getElementById('delete-account-modal')?.classList.add('active');
    };
  }

  renderPreferences(user);
  handleAvatarUpload();

  const orders = await loadUserOrders();
  renderAccountAddresses(user);
  renderLoyaltySummary(user, orders);
  renderOrderTrackingBadges(orders);
  renderAccountStats(user, orders);
  renderAccountWishlist();
  renderAccountInvoices(orders);
  renderSavedPaymentMethods(user);

  const adminCard = document.getElementById('admin-sidebar-card');
  if (adminCard) {
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    adminCard.style.display = isAdmin ? '' : 'none';
  }
}

window.formatOrderData = formatOrderData;
window.loadUserOrders = loadUserOrders;
window.getLoyaltyInfo = getLoyaltyInfo;
window.renderLoyaltySummary = renderLoyaltySummary;
window.renderOrderTrackingBadges = renderOrderTrackingBadges;
window.renderAccountStats = renderAccountStats;
window.downloadOrderInvoice = downloadOrderInvoice;
window.renderAccountAddresses = renderAccountAddresses;
window.renderAccountWishlist = renderAccountWishlist;
window.renderAccountInvoices = renderAccountInvoices;
window.renderSavedPaymentMethods = renderSavedPaymentMethods;
window.renderPreferences = renderPreferences;
window.deleteAddressHandler = deleteAddressHandler;
window.setAddressDefaultHandler = setAddressDefaultHandler;
window.editAddress = editAddress;
window.handleEditProfileSubmit = handleEditProfileSubmit;
window.handleAddressFormSubmit = handleAddressFormSubmit;
window.handleChangePassword = handleChangePassword;
window.handleDeleteAccount = handleDeleteAccount;
window.closeAddressModal = closeAddressModal;
window.closeEditModal = closeEditModal;
window.populateEditProfileForm = populateEditProfileForm;
window.renderAccountPage = renderAccountPage;
window.openAddressModal = openAddressModal;

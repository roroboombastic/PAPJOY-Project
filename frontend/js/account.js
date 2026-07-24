function formatOrderData(order) {
  const number = order.orderNumber || order.id || 'N/A';
  const date = order.createdAt ? new Date(order.createdAt).toLocaleString() : 'Unknown';
  const shortDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
  const statusText = order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : 'Pending';
  const totalText = order.total != null ? formatCurrency(order.total) : '—';
  const orderId = order._id || order.id || '';
  return { number, date, shortDate, statusText, totalText, orderId, status: order.status || 'pending' };
}

async function loadUserOrders() {
  const orderTableEl = document.querySelector('.order-table');
  const ordersContainer = document.getElementById('orders-container');
  const user = getCurrentUser();
  const currentUserId = user?.id || user?._id;

  if (!user || !currentUserId) {
    if (orderTableEl) {
      orderTableEl.innerHTML = `
        <div class="order-table-head">
          <span>Sales Order #</span>
          <span>Order Date</span>
          <span>Shipping Status</span>
          <span>Total</span>
        </div>
        <div class="order-row">
          <span class="muted-text">Please sign in to view your orders</span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    }
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>Please sign in to view your orders.</p>
        </div>
      `;
    }
    return [];
  }

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
      console.warn('Remote orders unavailable, using local orders instead.', error);
    }
  }

  const localOrders = getLocalOrders().filter((order) => order.email?.toLowerCase() === email);
  if (!orders || orders.length === 0) {
    orders = localOrders;
  }

  if (!orders || orders.length === 0) {
    if (orderTableEl) {
      orderTableEl.innerHTML = `
        <div class="order-table-head">
          <span>Sales Order #</span>
          <span>Order Date</span>
          <span>Shipping Status</span>
          <span>Total</span>
        </div>
        <div class="order-row">
          <span class="muted-text">No orders found. <a href="product.html">Start shopping</a></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
    }
    if (ordersContainer) {
      ordersContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No orders yet. <a href="product.html">Start shopping</a></p>
        </div>
      `;
    }
    return [];
  }

  if (orderTableEl) {
    orderTableEl.innerHTML = `
      <div class="order-table-head">
        <span>Sales Order #</span>
        <span>Order Date</span>
        <span>Shipping Status</span>
        <span>Total</span>
      </div>
      ${orders.map((order) => {
        const d = formatOrderData(order);
        return `
          <div class="order-row">
            <a href="tracking.html?order=${d.number}" class="order-link">${d.number}</a>
            <span>${d.date}</span>
            <span class="status-pill status-${d.status}">${d.statusText}</span>
            <span>${d.totalText}</span>
          </div>
        `;
      }).join('')}
    `;
  }

  if (ordersContainer) {
    if (ordersContainer._orderListener) {
      ordersContainer.removeEventListener('click', ordersContainer._orderListener);
    }
    ordersContainer.innerHTML = orders.map((order) => {
      const d = formatOrderData(order);
      return `
        <div class="order-item">
          <div class="order-details">
            <div class="order-id">Order #${d.number}</div>
            <div class="order-date">${d.shortDate}</div>
          </div>
          <span class="order-status">${d.statusText}</span>
          <div class="order-total">${d.totalText}</div>
          <div class="order-actions">
            <button type="button" class="btn-small" data-order-action="preview" data-order-id="${d.orderId}">Preview</button>
            <button type="button" class="btn-small" data-order-action="download" data-order-id="${d.orderId}">Download</button>
          </div>
        </div>
      `;
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
      }
    };
    ordersContainer.addEventListener('click', orderHandler);
    ordersContainer._orderListener = orderHandler;
  }

  return orders;
}

function getLoyaltyInfo(orderCount) {
  if (orderCount >= 20) {
    return { tier: 'Platinum Member', message: 'You have reached Platinum status! Enjoy VIP support and early access.', progress: 100 };
  }
  if (orderCount >= 10) {
    return { tier: 'Gold Member', message: 'Great work! One more order to reach Platinum.', progress: 75 };
  }
  if (orderCount >= 5) {
    return { tier: 'Silver Member', message: 'Nice progress! Complete 5 more orders to reach Gold.', progress: 50 };
  }
  if (orderCount >= 1) {
    return { tier: 'Bronze Member', message: 'Keep shopping to unlock Silver status.', progress: 25 };
  }
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
  if (loyaltyProgress) {
    loyaltyProgress.style.setProperty('--progress-width', `${loyalty.progress}%`);
  }
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
    { status: 'completed', icon: 'fa-check-circle', label: 'Delivered' },
    { status: 'cancelled', icon: 'fa-ban', label: 'Cancelled' }
  ];

  badgesContainer.innerHTML = badgeData.map(({ status, icon, label }) => {
    const count = statusCounts[status] || 0;
    return `
      <span class="status-badge ${status}">
        <i class="fas ${icon}"></i>
        ${label}: ${count}
      </span>
    `;
  }).join('');
}

// Download invoice as PDF
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
    if (!token && guestEmail) {
      url.searchParams.set('email', guestEmail);
    }
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to download invoice (${response.status})`);
    }

    // Get the PDF blob
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

async function renderAccountAddresses(user) {
  const addressesContainer = document.getElementById('addresses-container');
  if (!addressesContainer) return;

  try {
    const addresses = await loadUserAddresses();
    
    if (!addresses || addresses.length === 0) {
      addressesContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-location-dot"></i>
          <p>No saved addresses yet.</p>
          <button type="button" class="checkout-button" id="add-address-empty-btn">Add Address</button>
        </div>
      `;
      const emptyBtn = document.getElementById('add-address-empty-btn');
      if (emptyBtn) {
        emptyBtn.onclick = () => document.getElementById('add-address-modal')?.classList.add('active');
      }
      return;
    }

    addressesContainer.innerHTML = addresses.map((address) => `
      <div class="address-card ${address.isDefault ? 'default' : ''}">
        ${address.isDefault ? '<div class="address-badge">Default</div>' : ''}
        <div class="address-name">${address.name || 'Address'} ${address.type ? `(${address.type})` : ''}</div>
        <div class="address-text">
          ${address.street || ''}<br>
          ${address.city || ''}${address.state ? ', ' + address.state : ''}<br>
          ${address.zipCode || ''}${address.country ? ', ' + address.country : ''}
          ${address.phone ? '<br><strong>Phone: ' + address.phone + '</strong>' : ''}
        </div>
        <div class="address-actions">
          <button type="button" class="btn-small" data-address-id="${address._id}" data-address-action="edit">Edit</button>
          <button type="button" class="btn-small btn-danger" data-address-id="${address._id}" data-address-action="delete">Delete</button>
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
      if (action === 'edit') {
        editAddress(id);
      } else if (action === 'delete') {
        deleteAddressHandler(id);
      }
    };
    addressesContainer.addEventListener('click', addressHandler);
    addressesContainer._addressListener = addressHandler;
  } catch (error) {
    console.error('Failed to render addresses:', error);
    addressesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Unable to load addresses. Please try again.</p>
      </div>
    `;
  }
}

function renderAccountWishlist() {
  const wishlistContainer = document.getElementById('wishlist-container');
  if (!wishlistContainer) return;

  if (!savedItems || savedItems.length === 0) {
    wishlistContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-heart"></i>
        <p>No items in your wishlist yet. Add your favorite styles to save them here.</p>
        <button type="button" class="checkout-button" onclick="window.location.href='product.html'">Browse Products</button>
      </div>
    `;
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
          <button type="button" class="btn-small add-to-cart-btn" data-wishlist-action="addtocart">Add to Cart</button>
          <button type="button" class="btn-small" data-wishlist-action="view">View</button>
          <button type="button" class="btn-small btn-danger" data-wishlist-action="remove">Remove</button>
        </div>
      </div>
    `;
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
    if (action === 'addtocart') {
      addToCart(id, variant);
    } else if (action === 'view') {
      window.location.href = `product-detail.html?id=${id}`;
    } else if (action === 'remove') {
      removeSavedItem(id, variant);
    }
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
      </div>
    `;
    return;
  }

  invoicesContainer.innerHTML = orders.slice(0, 5).map((order) => {
    const orderId = order._id || order.id || order.orderNumber || '';
    const totalText = order.total != null ? formatCurrency(order.total) : '—';
    const issuedOn = order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'Unknown';
    return `
      <div class="order-item">
        <div class="order-details">
          <div class="order-id">Invoice for Order #${order.orderNumber || orderId}</div>
          <div class="order-date">Issued ${issuedOn}</div>
        </div>
        <span class="order-status">${(order.status || 'issued').replace(/_/g, ' ')}</span>
        <div class="order-total">${totalText}</div>
        <div class="order-actions">
          <button class="btn-small" onclick="window.location.href='invoice-preview.html?orderId=${orderId}'">Preview</button>
          <button class="btn-small" onclick="downloadOrderInvoice('${orderId}')">Download</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderSavedPaymentMethods(user) {
  const paymentContainer = document.getElementById('payment-methods-container');
  if (!paymentContainer) return;

  const savedMethods = Array.isArray(user?.savedPaymentMethods) ? user.savedPaymentMethods : [];
  const preferred = user?.preferredPaymentMethod || 'cod';

  if (!savedMethods.length) {
    paymentContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-credit-card"></i>
        <p>No saved payment methods yet.</p>
        <p>Preferred checkout method: <strong>${preferred.toUpperCase()}</strong></p>
      </div>
    `;
    return;
  }

  paymentContainer.innerHTML = savedMethods.map((method) => `
    <div class="address-card">
      <div class="address-name">${method.brand || method.type || 'Payment Method'}</div>
      <div class="address-text">${method.label || method.last4 || preferred.toUpperCase()}</div>
    </div>
  `).join('');
}

async function deleteAddressHandler(addressId) {
  if (!confirm('Are you sure you want to delete this address?')) return;

  try {
    await deleteUserAddress(addressId);
    renderAccountPage();
    showToast('Address deleted successfully.');
  } catch (error) {
    showToast(error.message || 'Unable to delete address.');
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

    // Populate form with address data
    document.getElementById('addr-name').value = address.name || '';
    document.getElementById('addr-type').value = address.type || 'shipping';
    document.getElementById('addr-line1').value = address.street || '';
    document.getElementById('addr-city').value = address.city || '';
    document.getElementById('addr-state').value = address.state || '';
    document.getElementById('addr-postal').value = address.zipCode || '';
    document.getElementById('addr-country').value = address.country || 'India';
    document.getElementById('addr-phone').value = address.phone || '';
    document.getElementById('addr-default').checked = address.isDefault || false;

    // Change form submission to update instead of add
    const form = document.getElementById('add-address-form');
    const oldOnSubmit = form.onsubmit;
    form.onsubmit = async (event) => {
      event.preventDefault();
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

      try {
        await updateUserAddress(addressId, addressData);
        closeAddressModal();
        form.onsubmit = oldOnSubmit;
        renderAccountPage();
        showToast('Address updated successfully.');
      } catch (error) {
        showToast(error.message || 'Unable to update address.');
      }
    };

    document.getElementById('add-address-modal')?.classList.add('active');
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
    profileUpdates.shippingAddress = {
      ...(user.shippingAddress || {}),
      phone
    };
  }

  try {
    const updatedUser = await updateUserProfile(profileUpdates);
    if (updatedUser) {
      closeEditModal();
      renderAccountPage();
      showToast('Profile saved successfully.');
    }
  } catch (error) {
    showToast(error.message || 'Unable to save profile.');
  }
}

async function handleAddAddressSubmit(event) {
  event.preventDefault();
  const token = getAuthToken();
  if (!token) {
    showToast('Please sign in to save addresses.');
    return;
  }

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
    showToast('Please fill in all required address fields.');
    return;
  }

  try {
    await addUserAddress(addressData);
    closeAddressModal();
    renderAccountPage();
    showToast('Address saved successfully.');
  } catch (error) {
    showToast(error.message || 'Unable to save address.');
  }
}

function closeAddressModal() {
  const modal = document.getElementById('add-address-modal');
  if (modal) modal.classList.remove('active');
  const form = document.getElementById('add-address-form');
  if (form) {
    form.reset();
    form.onsubmit = handleAddAddressSubmit;
  }
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
  if (editPhone) editPhone.value = user.shippingAddress?.phone || '';
}

async function renderAccountPage() {
  let user = getCurrentUser();

  if (getAuthToken()) {
    const profile = await syncUserProfile();
    if (profile) {
      user = profile;
    }
  }

  const currentUserId = user?.id || user?._id;
  if (!user || !currentUserId) {
    window.location.href = 'signin.html';
    return;
  }

  const accountNameHeader = document.getElementById('account-name-header');
  const accountEmailHeader = document.getElementById('account-email-header');
  const accountAvatarLarge = document.getElementById('account-avatar-large');
  const sidebarName = document.getElementById('sidebar-name');
  const sidebarEmail = document.getElementById('sidebar-email');
  const sidebarPhone = document.getElementById('sidebar-phone');
  const accountName = document.getElementById('account-name');
  const accountAddress = document.getElementById('account-address');
  const contactName = document.getElementById('account-contact-name');
  const contactEmail = document.getElementById('account-contact-email');
  const contactPhone = document.getElementById('account-contact-phone');
  const contactLocation = document.getElementById('account-contact-location');
  const editProfileBtn = document.getElementById('edit-profile-btn');
  const signoutBtn = document.getElementById('account-signout-btn');
  const editProfileForm = document.getElementById('edit-profile-form');
  const addAddressForm = document.getElementById('add-address-form');

  const displayName = user.name || user.email;
  if (accountNameHeader) accountNameHeader.textContent = `Welcome back, ${displayName}`;
  if (accountEmailHeader) accountEmailHeader.textContent = user.email || 'No email available';
  if (accountAvatarLarge) accountAvatarLarge.textContent = (displayName[0] || 'P').toUpperCase();
  if (sidebarName) sidebarName.textContent = `Name: ${user.name || 'N/A'}`;
  if (sidebarEmail) sidebarEmail.textContent = `Email: ${user.email || 'N/A'}`;
  if (sidebarPhone) sidebarPhone.textContent = `Phone: ${user.shippingAddress?.phone || 'Not set'}`;
  if (accountName) accountName.textContent = displayName;

  const address = user.shippingAddress || {};
  const addressLines = [];
  if (address.fullName) addressLines.push(address.fullName);
  if (address.line1) addressLines.push(address.line1);
  if (address.line2) addressLines.push(address.line2);
  const cityState = [address.city, address.state].filter(Boolean).join(', ');
  if (cityState) addressLines.push(cityState);
  const postalCountry = [address.postalCode, address.country].filter(Boolean).join(', ');
  if (postalCountry) addressLines.push(postalCountry);
  if (address.phone) addressLines.push(`Phone: ${address.phone}`);

  if (accountAddress) {
    accountAddress.innerHTML = addressLines.length > 0
      ? addressLines.map((line) => line === `Phone: ${address.phone}` ? `<strong>${line}</strong>` : line).join('<br>')
      : 'No saved shipping address yet. Update your account to save an address.';
  }
  if (contactName) contactName.innerHTML = `<strong>${displayName}</strong>`;
  if (contactEmail) contactEmail.innerHTML = `<i class="fas fa-envelope"></i> ${user.email || 'Not available'}`;
  if (contactPhone) contactPhone.innerHTML = `<i class="fas fa-phone"></i> ${address.phone || 'No phone number saved'}`;
  if (contactLocation) contactLocation.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${[address.city, address.state, address.country].filter(Boolean).join(', ') || 'No location set'}`;

  if (editProfileBtn) {
    editProfileBtn.onclick = () => {
      populateEditProfileForm(user);
      document.getElementById('edit-profile-modal')?.classList.add('active');
    };
  }

  if (signoutBtn) {
    signoutBtn.onclick = (event) => {
      event.preventDefault();
      signOut();
    };
  }

  if (editProfileForm) {
    editProfileForm.onsubmit = handleEditProfileSubmit;
  }

  if (addAddressForm) {
    addAddressForm.onsubmit = handleAddAddressSubmit;
  }

  renderAccountAddresses(user);
  const orders = await loadUserOrders();
  renderLoyaltySummary(user, orders);
  renderOrderTrackingBadges(orders);
  renderAccountWishlist();
  renderAccountInvoices(orders);
  renderSavedPaymentMethods(user);
  await renderAdminDashboard(user);
}

window.formatOrderData = formatOrderData;
window.loadUserOrders = loadUserOrders;
window.getLoyaltyInfo = getLoyaltyInfo;
window.renderLoyaltySummary = renderLoyaltySummary;
window.renderOrderTrackingBadges = renderOrderTrackingBadges;
window.downloadOrderInvoice = downloadOrderInvoice;
window.renderAccountAddresses = renderAccountAddresses;
window.renderAccountWishlist = renderAccountWishlist;
window.renderAccountInvoices = renderAccountInvoices;
window.renderSavedPaymentMethods = renderSavedPaymentMethods;
window.deleteAddressHandler = deleteAddressHandler;
window.editAddress = editAddress;
window.handleEditProfileSubmit = handleEditProfileSubmit;
window.handleAddAddressSubmit = handleAddAddressSubmit;
window.closeAddressModal = closeAddressModal;
window.closeEditModal = closeEditModal;
window.populateEditProfileForm = populateEditProfileForm;
window.renderAccountPage = renderAccountPage;
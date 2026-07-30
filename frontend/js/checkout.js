let razorpayKeyId = null;


async function loadPaymentConfig() {
  try {
    const response = await fetch(apiUrl('/api/v1/payments/config'), { credentials: 'include' });
    if (response.ok) {
      const config = await response.json();
      razorpayKeyId = config.razorpayKeyId || null;
      if (!config.razorpay?.configured) {
        setCheckoutMessage('Payment gateway is being configured. COD is available.', false);
      }
    }
  } catch (err) {
    console.warn('Could not load payment config:', err);
  }
}

function checkout() {
  if (cart.length === 0) {
    showToast(translate('checkout.emptyCart'));
    return;
  }
  window.location.href = 'checkout.html';
}

function setCheckoutMessage(message, isError = false) {
  const messageEl = document.getElementById('checkout-message');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.style.color = isError ? '#ff8b94' : '#2f5130';
  messageEl.style.display = message ? 'flex' : 'none';
}

function getCheckoutItems() {
  return cart.map((item) => ({
    id: item.id,
    productId: item.productId || item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    variant: item.variant || 'Standard',
    category: item.category,
    subtitle: item.subtitle,
  }));
}

function getDeliveryInfo() {
  return {
    fullName: document.getElementById('delivery-fullname')?.value.trim() || '',
    phone: document.getElementById('delivery-phone')?.value.trim() || '',
    address: document.getElementById('delivery-address')?.value.trim() || '',
    city: document.getElementById('delivery-city')?.value.trim() || '',
    state: document.getElementById('delivery-state')?.value.trim() || '',
    postalCode: document.getElementById('delivery-postal')?.value.trim() || '',
    country: document.getElementById('delivery-country')?.value.trim() || 'India',
    instructions: document.getElementById('delivery-instructions')?.value.trim() || ''
  };
}

function validateDeliveryForm() {
  const requiredFields = [
    'delivery-fullname', 'delivery-phone', 'delivery-address',
    'delivery-city', 'delivery-state', 'delivery-postal', 'delivery-country'
  ];
  for (const fieldId of requiredFields) {
    const field = document.getElementById(fieldId);
    if (!field || !field.value.trim()) {
      setCheckoutMessage('Please fill in all required delivery fields.', true);
      if (field) field.focus();
      return false;
    }
  }
  return true;
}

function selectPaymentMethod(method) {
  document.querySelectorAll('.payment-tab').forEach(tab => {
    tab.classList.remove('active');
    const body = tab.querySelector('.payment-tab-body');
    if (body) body.style.display = 'none';
  });
  const selected = document.querySelector(`.payment-tab[data-method="${method}"]`);
  if (selected) {
    selected.classList.add('active');
    const body = selected.querySelector('.payment-tab-body');
    if (body) body.style.display = 'block';
  }
  if (method === 'cod') {
    updateCODAmount();
  }
}

function updateCODAmount() {
  const totals = getCartTotals();
  const codAmount = document.getElementById('cod-amount');
  if (codAmount) {
    codAmount.textContent = formatCurrency(totals.total + 50);
  }
}

async function createOrderBackend(paymentMethod, extras = {}) {
  if (cart.length === 0) {
    setCheckoutMessage('Your cart is empty.', true);
    return null;
  }
  if (!validateDeliveryForm()) return null;

  const deliveryInfo = getDeliveryInfo();
  const totals = getCartTotals();
  const orderData = {
    items: getCheckoutItems(),
    paymentMethod,
    shipping: totals.shipping + (extras.shippingFee || 0),
    discount: totals.discount,
    tax: totals.tax,
    deliveryInfo,
    notes: extras.notes || ''
  };

  const { response, data } = await apiFetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
  });

  if (!response.ok) {
    throw new Error(data?.error || 'Order creation failed');
  }

  return data;
}

async function startCardCheckout() {
  if (!validateDeliveryForm()) return;

  if (!razorpayKeyId) {
    setCheckoutMessage('Card payment is not available right now. Please use COD or try again later.', true);
    return;
  }

  setCheckoutMessage('Preparing secure payment...');

  try {
    const totals = getCartTotals();
    const deliveryInfo = getDeliveryInfo();
    const orderNumber = `PJ-${Date.now()}`;

    const { response: rpResponse, data: rpData } = await apiFetch('/api/v1/payments/razorpay/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totals.total,
        currency: 'INR',
        receipt: orderNumber,
        notes: { orderNumber }
      }),
    });

    if (!rpResponse.ok || !rpData?.orderId) {
      throw new Error(rpData?.error || 'Failed to create payment order');
    }

    setCheckoutMessage('Opening secure payment form...');

    const options = {
      key: razorpayKeyId,
      amount: rpData.amount,
      currency: rpData.currency || 'INR',
      name: 'PAP-JOY',
      description: `Order #${orderNumber}`,
      order_id: rpData.orderId,
      handler: async function (response) {
        setCheckoutMessage('Verifying payment...');
        try {
          const { response: verifyRes, data: verifyData } = await apiFetch('/api/v1/payments/razorpay/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              items: getCheckoutItems(),
              deliveryInfo,
              shipping: totals.shipping,
              discount: totals.discount,
              notes: 'Card payment via Razorpay'
            }),
          });

          if (!verifyRes.ok) {
            throw new Error(verifyData?.error || 'Payment verification failed');
          }

          sessionStorage.setItem('papjoy-order', JSON.stringify({
            provider: 'card',
            order: verifyData.order
          }));
          resetCartState();
          syncCart();
          window.location.href = 'thankyou.html?provider=card';
        } catch (verifyErr) {
          console.error('Payment verification error:', verifyErr);
          setCheckoutMessage('Payment received but verification failed. Please contact support with Payment ID: ' + response.razorpay_payment_id, true);
        }
      },
      prefill: {
        name: deliveryInfo.fullName || '',
        contact: deliveryInfo.phone || '',
        email: getCurrentUser?.()?.email || ''
      },
      theme: {
        color: '#1f4b3f'
      },
      modal: {
        ondismiss: function () {
          setCheckoutMessage('Payment cancelled. You can try again.', true);
        },
        confirm_close: true,
        escape: false
      }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', function (response) {
      console.error('Payment failed:', response.error);
      setCheckoutMessage('Payment failed: ' + (response.error?.description || 'Unknown error. Please try again.'), true);
    });
    rzp.open();
  } catch (error) {
    console.error('Card checkout error:', error);
    setCheckoutMessage(error.message || 'Card payment failed. Please try again.', true);
  }
}





async function startCODCheckout() {
  if (!validateDeliveryForm()) return;

  const codNotes = document.getElementById('cod-notes')?.value.trim() || '';
  setCheckoutMessage('Placing your COD order...');

  try {
    const result = await createOrderBackend('cod', { shippingFee: 50, notes: codNotes });
    if (!result) return;

    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'cod', order: result.order }));
    resetCartState();
    syncCart();
    window.location.href = 'thankyou.html?provider=cod';
  } catch (error) {
    console.error('COD order error:', error);
    setCheckoutMessage(error.message || 'COD order failed. Please try again.', true);
  }
}

function renderCheckoutItems() {
  const container = document.getElementById('checkout-items');
  if (!container) return;
  container.innerHTML = '';
  if (cart.length === 0) {
    container.innerHTML = `<div class="checkout-item">${translate('cart.empty')}</div>`;
    return;
  }
  cart.forEach((item) => {
    const itemRow = document.createElement('div');
    itemRow.className = 'checkout-item';
    itemRow.innerHTML = `
      <span>${escapeHTML(item.name)} x ${item.quantity}</span>
      <span>${formatCurrency(item.price * item.quantity)}</span>
    `;
    container.appendChild(itemRow);
  });
}

async function renderCheckoutPage() {
  renderCheckoutItems();
  updateCartSummary();
  updateCheckoutSummary();

  await loadPaymentConfig();

  const gpsButton = document.getElementById('fill-delivery-address-btn');
  if (gpsButton) {
    gpsButton.removeEventListener('click', fillDeliveryAddressWithGPS);
    gpsButton.addEventListener('click', fillDeliveryAddressWithGPS);
  }

  const user = getCurrentUser();
  const signinPrompt = document.getElementById('signin-prompt');
  if (!user && signinPrompt) {
    signinPrompt.style.display = 'grid';
  }

  if (user) {
    loadDeliveryInfo();
    loadCheckoutAddresses();
  }

  selectPaymentMethod('card');

  const params = getQueryParams();
  if (params.checkout === 'canceled') {
    setCheckoutMessage('Checkout was cancelled.', true);
  }
  if (params.payment === 'failed') {
    setCheckoutMessage('Payment failed. Please try again.', true);
  }
}

function loadDeliveryInfo() {
  const user = getCurrentUser();
  if (!user) return;
  const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  f('delivery-fullname', user.shippingAddress?.fullName || user.name || '');
  f('delivery-phone', user.shippingAddress?.phone || user.phone || '');
  f('delivery-address', user.shippingAddress?.line1 || '');
  f('delivery-city', user.shippingAddress?.city || '');
  f('delivery-state', user.shippingAddress?.state || '');
  f('delivery-postal', user.shippingAddress?.postalCode || '');
  f('delivery-country', user.shippingAddress?.country || 'India');
}

async function loadCheckoutAddresses() {
  const container = document.getElementById('checkout-addresses');
  if (!container) return;
  try {
    const addresses = await loadUserAddresses();
    if (!addresses || !addresses.length) { container.innerHTML = ''; return; }
    container.innerHTML = '<p style="margin-bottom:0.5rem;font-size:0.85rem;opacity:0.7;">Saved addresses:</p>' +
      addresses.map((addr, i) => `<button type="button" class="checkout-button secondary" style="margin:0.25rem;padding:0.4rem 0.75rem;font-size:0.8rem;" onclick="fillAddressFromSaved(${i})">${escapeHTML(addr.name || 'Address ' + (i+1))}${addr.isDefault ? ' *' : ''}</button>`).join('');
    window.__checkoutAddresses = addresses;
  } catch (error) {
    console.warn('Failed to load saved addresses:', error);
  }
}

function fillAddressFromSaved(index) {
  const addresses = window.__checkoutAddresses;
  if (!addresses || !addresses[index]) return;
  const addr = addresses[index];
  const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  f('delivery-fullname', addr.name);
  f('delivery-phone', addr.phone);
  f('delivery-address', addr.street);
  f('delivery-city', addr.city);
  f('delivery-state', addr.state);
  f('delivery-postal', addr.zipCode);
  f('delivery-country', addr.country || 'India');
}

async function fillDeliveryAddressWithGPS() {
  if (!navigator.geolocation) {
    setCheckoutMessage('Your browser does not support GPS location.', true);
    return;
  }
  setCheckoutMessage('Fetching your current location...');
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, maximumAge: 60000, timeout: 15000,
      });
    });
    const { latitude, longitude } = position.coords;
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      { timeout: 10000 }
    );
    if (!response.ok) throw new Error('Unable to resolve address.');
    const data = await response.json();
    const address = data.address || {};
    const streetParts = [address.road, address.neighbourhood, address.suburb, address.village, address.town, address.city].filter(Boolean);
    document.getElementById('delivery-address').value = streetParts.join(', ') || data.display_name || '';
    document.getElementById('delivery-city').value = address.city || address.town || address.village || address.county || '';
    document.getElementById('delivery-state').value = address.state || address.region || '';
    document.getElementById('delivery-postal').value = address.postcode || '';
    document.getElementById('delivery-country').value = address.country || 'India';
    setCheckoutMessage('Address autofill complete. Please verify the fields.');
  } catch (error) {
    console.error('GPS autofill failed:', error);
    setCheckoutMessage('Unable to autofill address. Please enter it manually.', true);
  }
}

function renderSuccessDetails(order) {
  const container = document.getElementById('success-details');
  if (!container || !order) return;
  container.innerHTML = '';
  const providerKey = (order.paymentMethod || 'card').toLowerCase();
  const readableProvider = { card: 'Online Payment', cod: 'Cash on Delivery' }[providerKey] || providerKey;
  const summary = [
    { label: 'Payment Method', value: readableProvider },
    { label: 'Order Number', value: order.orderNumber || order._id || order.id || 'N/A' },
    { label: 'Payment Status', value: order.paymentStatus || 'pending' },
    { label: 'Order Status', value: order.status || 'confirmed' },
    { label: 'Total', value: order.total ? formatCurrency(order.total) : 'N/A' },
  ];
  if (order.paymentDetails?.razorpayPaymentId) {
    summary.push({ label: 'Payment ID', value: order.paymentDetails.razorpayPaymentId });
  }
  if (order.paymentDetails?.card) {
    const c = order.paymentDetails.card;
    const brand = c.network || c.type || '';
    const last = c.last4 || '';
    if (brand || last) summary.push({ label: 'Card Used', value: `${brand}${last ? ' •••• ' + last : ''}`.trim() });
    if (c.issuer) summary.push({ label: 'Bank/Issuer', value: c.issuer });
  }
  if (order.paymentDetails?.bank) {
    summary.push({ label: 'Bank', value: order.paymentDetails.bank });
  }
  if (order.paymentDetails?.method === 'wallet') {
    summary.push({ label: 'Wallet', value: order.paymentDetails.wallet || 'Wallet' });
  }
  summary.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'receipt-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(row);
  });
  if (Array.isArray(order.items) && order.items.length > 0) {
    const listTitle = document.createElement('h3');
    listTitle.textContent = 'Items';
    listTitle.style.marginTop = '1rem';
    container.appendChild(listTitle);
    order.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'receipt-row';
      row.innerHTML = `<span>${escapeHTML(item.name)} x ${item.quantity}</span><strong>${formatCurrency(item.price * item.quantity)}</strong>`;
      container.appendChild(row);
    });
  }
  const actionsDiv = document.createElement('div');
  actionsDiv.style.marginTop = '1rem';
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '0.75rem';

  const invoiceBtn = document.createElement('button');
  invoiceBtn.className = 'checkout-button secondary';
  invoiceBtn.textContent = 'View Invoice';
  invoiceBtn.addEventListener('click', () => {
    const orderId = order._id || order.id;
    if (!orderId) return showToast('Invoice not available');
    const previewUrl = new URL('invoice-preview.html', window.location.href);
    previewUrl.searchParams.set('orderId', orderId);
    window.open(previewUrl.toString(), '_blank');
  });
  actionsDiv.appendChild(invoiceBtn);

  const trackBtn = document.createElement('button');
  trackBtn.className = 'checkout-button';
  trackBtn.textContent = 'Track Order';
  trackBtn.addEventListener('click', () => {
    window.location.href = `tracking.html?order=${order.orderNumber || order._id}`;
  });
  actionsDiv.appendChild(trackBtn);

  container.appendChild(document.createElement('hr'));
  container.appendChild(actionsDiv);
}

async function renderSuccessPage() {
  const params = getQueryParams();
  const statusEl = document.getElementById('success-status');
  const storedOrder = sessionStorage.getItem('papjoy-order');

  if (!statusEl) return;
  statusEl.textContent = translate('success.processing');
  statusEl.style.color = '#666';

  try {
    if (storedOrder) {
      const { order } = JSON.parse(storedOrder);
      renderSuccessDetails(order);
      resetCartState();
      syncCart();
      const providerMessages = {
        card: 'Online payment confirmed!',
        cod: 'COD order placed successfully!'
      };
      statusEl.textContent = providerMessages[params.provider] || translate('success.orderComplete');
      statusEl.style.color = '#4CAF50';
      sessionStorage.removeItem('papjoy-order');
      return;
    }
    statusEl.textContent = translate('success.noInfo');
    statusEl.style.color = '#FF9800';
  } catch (error) {
    console.error('Success page error:', error);
    statusEl.textContent = error.message || translate('error.verifyOrder');
    statusEl.style.color = '#F44336';
  }
}

async function renderThankYouPage() {
  const params = getQueryParams();
  const storedOrder = sessionStorage.getItem('papjoy-order');
  const orderNumEl = document.getElementById('thankyou-order-number');
  const detailsEl = document.getElementById('thankyou-details');
  const trackBtn = document.getElementById('thankyou-track-btn');
  const invoiceBtn = document.getElementById('thankyou-invoice-btn');

  try {
    if (storedOrder) {
      const { order } = JSON.parse(storedOrder);
      if (orderNumEl) orderNumEl.textContent = order.orderNumber || order._id || 'N/A';
      if (detailsEl) renderSuccessDetails(order);
      resetCartState();
      syncCart();
      sessionStorage.removeItem('papjoy-order');

      const orderId = order._id || order.id;
      if (trackBtn && orderId) {
        trackBtn.href = `tracking.html?order=${order.orderNumber || orderId}`;
      }
      if (invoiceBtn && orderId) {
        invoiceBtn.href = `invoice-preview.html?orderId=${orderId}`;
      }
      return;
    }
    if (orderNumEl) orderNumEl.textContent = 'Order placed';
  } catch (error) {
    console.error('Thank you page error:', error);
  }
}

async function renderInvoicePreviewPage() {
  const params = getQueryParams();
  const orderId = params.orderId;
  const guestEmail = params.email;
  const previewContainer = document.getElementById('invoice-preview-container');
  const previewMessage = document.getElementById('invoice-preview-message');
  const previewTitle = document.getElementById('invoice-preview-title');

  if (!previewContainer || !previewMessage || !previewTitle) return;
  if (!orderId) {
    previewMessage.textContent = 'Missing order ID for invoice preview.';
    previewMessage.style.color = 'red';
    return;
  }
  const token = getAuthToken();
  if (!token && !guestEmail) {
    previewMessage.textContent = 'Please sign in to view this invoice.';
    previewMessage.style.color = 'red';
    return;
  }
  try {
    previewTitle.textContent = `Invoice Preview for Order ${orderId}`;
    const url = new URL(`${API_BASE_URL}/api/v1/invoices/${orderId}`);
    if (!token && guestEmail) url.searchParams.set('email', guestEmail);
    const response = await fetch(url.toString(), {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Unable to load invoice');
    }
    const invoice = await response.json();
    const invoiceData = invoice.invoice || invoice;
    const rows = (invoiceData.items || []).map((item) => `
      <tr>
        <td>${escapeHTML(item.productName || item.name || 'Item')}</td>
        <td>${item.quantity || 1}</td>
        <td>${formatCurrency(item.unitPrice || item.price || 0)}</td>
        <td>${item.gstRate != null ? item.gstRate + '%' : '--'}</td>
        <td>${formatCurrency(item.total || 0)}</td>
      </tr>
    `).join('');
    previewContainer.innerHTML = `
      <div class="invoice-summary">
        <div><strong>Invoice #</strong> ${escapeHTML(invoiceData.invoiceNumber || invoiceData.orderNumber || '')}</div>
        <div><strong>Status</strong> ${escapeHTML(invoiceData.status || 'issued')}</div>
        <div><strong>Payment</strong> ${escapeHTML(invoiceData.paymentStatus || 'pending')}</div>
        <div><strong>Total</strong> ${formatCurrency(invoiceData.total || 0)}</div>
      </div>
      <section class="invoice-details">
        <div class="invoice-block"><h3>Customer</h3><p>${escapeHTML(invoiceData.customerName || '')}</p><p>${escapeHTML(invoiceData.customerEmail || '')}</p><p>${escapeHTML(invoiceData.customerPhone || '')}</p></div>
        <div class="invoice-block"><h3>Billing</h3><p>${escapeHTML(invoiceData.billingAddress?.street || '')}</p><p>${escapeHTML(invoiceData.billingAddress?.city || '')} ${escapeHTML(invoiceData.billingAddress?.state || '')}</p><p>${escapeHTML(invoiceData.billingAddress?.zipCode || '')} ${escapeHTML(invoiceData.billingAddress?.country || '')}</p></div>
        <div class="invoice-block"><h3>Seller</h3><p>${escapeHTML(invoiceData.companyName || 'PAP-JOY')}</p><p>${escapeHTML(invoiceData.companyGSTIN || '')}</p></div>
      </section>
      <table class="invoice-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>GST</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="invoice-total">
        <div>Subtotal: ${formatCurrency(invoiceData.subtotal || 0)}</div>
        <div>GST: ${formatCurrency(invoiceData.taxTotal || invoiceData.tax || 0)}</div>
        <div>Shipping: ${formatCurrency(invoiceData.shippingCharges || invoiceData.shipping || 0)}</div>
        <div>Discount: ${formatCurrency(invoiceData.discount || 0)}</div>
        <strong>Total: ${formatCurrency(invoiceData.total || 0)}</strong>
      </div>
    `;
    previewMessage.textContent = '';
  } catch (error) {
    console.error('Invoice preview error:', error);
    previewMessage.textContent = error.message || 'Failed to load invoice preview.';
    previewMessage.style.color = 'red';
  }
}

async function renderSignInPage() {
  const user = getCurrentUser();
  const statusMessage = document.getElementById('auth-message');
  const signinForm = document.getElementById('auth-form');

  if (user) {
    if (statusMessage) {
      statusMessage.textContent = translate('signin.alreadySignedIn').replace('{email}', user.email);
      statusMessage.style.color = '#d7d7ff';
    }
    setTimeout(() => { window.location.href = 'account.html'; }, 1200);
    return;
  }
  if (!signinForm) return;

  const passwordToggle = document.getElementById('password-toggle');
  const passwordInput = document.getElementById('password');
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      passwordToggle.textContent = translate(show ? 'signin.hidePassword' : 'signin.showPassword');
    });
  }

  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!email || !password) {
      if (statusMessage) { statusMessage.textContent = translate('signin.enterCredentials'); statusMessage.style.color = '#ff8b94'; }
      return;
    }
    if (statusMessage) { statusMessage.textContent = translate('signin.loggingIn'); statusMessage.style.color = '#d7d7ff'; }
    try {
      const remember = document.getElementById('remember')?.checked;
      const { response, data } = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        if (statusMessage) { statusMessage.textContent = data?.error || data?.message || translate('signin.invalidCredentials'); statusMessage.style.color = '#ff8b94'; }
        return;
      }
      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (statusMessage) { statusMessage.textContent = translate('signin.welcomeBack').replace('{email}', userData.email || email); statusMessage.style.color = '#d7d7ff'; }
      setTimeout(() => { window.location.href = 'account.html'; }, 1000);
    } catch (error) {
      console.error('Sign in error:', error);
      if (statusMessage) { statusMessage.textContent = translate('signin.loginError'); statusMessage.style.color = '#ff8b94'; }
    }
  });

  await initGoogleSignIn('google-signin-button', 'remember');
}

async function renderSignUpPage() {
  const user = getCurrentUser();
  const signupForm = document.getElementById('signup-form');
  const signupMessage = document.getElementById('signup-message');
  const signupPassword = document.getElementById('signup-password');
  const confirmPassword = document.getElementById('confirm-password');
  const signupPasswordToggle = document.getElementById('signup-password-toggle');
  const confirmPasswordToggle = document.getElementById('confirm-password-toggle');
  const passwordStrengthFill = document.getElementById('signup-password-strength-fill');
  const passwordStrengthText = document.getElementById('signup-password-strength-text');

  function updatePasswordStrength(value) {
    if (!passwordStrengthFill || !passwordStrengthText) return;
    let score = 0;
    if (value.length >= 8) score += 1;
    if (/[A-Z]/.test(value)) score += 1;
    if (/[a-z]/.test(value)) score += 1;
    if (/[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9]/.test(value)) score += 1;
    const strengthMap = [
      { label: 'Very weak', width: '12%', color: '#d9534f' },
      { label: 'Weak', width: '28%', color: '#f0ad4e' },
      { label: 'Fair', width: '48%', color: '#f7c948' },
      { label: 'Strong', width: '72%', color: '#5bc0de' },
      { label: 'Very strong', width: '100%', color: '#4caf50' }
    ];
    const state = strengthMap[Math.max(0, Math.min(strengthMap.length - 1, score - 1))];
    passwordStrengthFill.style.width = state.width;
    passwordStrengthFill.style.background = state.color;
    passwordStrengthText.textContent = value ? `${state.label} password` : 'Use 8+ characters with a mix of letters, numbers, and symbols.';
  }

  function toggleVisibility(input) { if (input) input.type = input.type === 'password' ? 'text' : 'password'; }
  if (signupPasswordToggle && signupPassword) { signupPasswordToggle.addEventListener('click', () => toggleVisibility(signupPassword)); signupPassword.addEventListener('input', () => updatePasswordStrength(signupPassword.value)); updatePasswordStrength(signupPassword.value); }
  if (confirmPasswordToggle && confirmPassword) { confirmPasswordToggle.addEventListener('click', () => toggleVisibility(confirmPassword)); }
  if (user) { if (signupMessage) { signupMessage.textContent = translate('signup.success'); signupMessage.style.color = '#d7d7ff'; } setTimeout(() => { window.location.href = 'account.html'; }, 1200); return; }
  if (!signupForm) return;

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const confirmPasswordValue = document.getElementById('confirm-password').value.trim();
    if (!email || !password || !name || !phone) { if (signupMessage) { signupMessage.textContent = 'Please fill in all required fields.'; signupMessage.style.color = '#ff8b94'; } return; }
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) { if (signupMessage) { signupMessage.textContent = 'Enter a valid phone number.'; signupMessage.style.color = '#ff8b94'; } return; }
    if (password.length < 8) { if (signupMessage) { signupMessage.textContent = 'Password must be at least 8 characters.'; signupMessage.style.color = '#ff8b94'; } return; }
    if (password !== confirmPasswordValue) { if (signupMessage) { signupMessage.textContent = translate('signup.passwordMismatch'); signupMessage.style.color = '#ff8b94'; } return; }
    if (signupMessage) { signupMessage.textContent = translate('signup.registering'); signupMessage.style.color = '#d7d7ff'; }
    try {
      const remember = document.getElementById('remember-signup')?.checked;
      const { response, data } = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, phone, marketingOptIn: document.getElementById('marketing')?.checked }),
      });
      if (!response.ok) { if (signupMessage) { signupMessage.textContent = data?.error || data?.message || translate('signup.registerError'); signupMessage.style.color = '#ff8b94'; } return; }
      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (signupMessage) { signupMessage.textContent = translate('signup.success'); signupMessage.style.color = '#4caf50'; }
      setTimeout(() => { window.location.href = 'account.html'; }, 1200);
    } catch (error) {
      console.error('Signup error:', error);
      if (signupMessage) { signupMessage.textContent = translate('signup.registerError'); signupMessage.style.color = '#ff8b94'; }
    }
  });

  await initGoogleSignIn('google-signup-button', 'remember-signup');
}

async function renderForgotPasswordPage() {
  const form = document.getElementById('forgot-password-form');
  const statusMessage = document.getElementById('auth-message');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) { if (statusMessage) { statusMessage.textContent = 'Please enter your email address.'; statusMessage.style.color = '#ff8b94'; } return; }
    if (statusMessage) { statusMessage.textContent = 'Sending password reset link...'; statusMessage.style.color = '#d7d7ff'; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to send reset link.');
      if (statusMessage) {
        if (data.resetUrl) {
          statusMessage.innerHTML = `Password reset link generated.<br /><strong>Reset link:</strong> <a href="${data.resetUrl}">${data.resetUrl}</a><br /><small style="color:#888;">(This link appears here because email is not configured. In production it will be emailed.)</small>`;
        } else {
          statusMessage.textContent = data.message || 'If that email is registered, password reset instructions will be sent.';
        }
        statusMessage.style.color = '#4CAF50';
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      if (statusMessage) { statusMessage.textContent = error.message || 'Unable to send reset link.'; statusMessage.style.color = '#ff8b94'; }
    }
  });
}

async function renderResetPasswordPage() {
  const form = document.getElementById('reset-password-form');
  const statusMessage = document.getElementById('auth-message');
  if (!form) return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) { if (statusMessage) { statusMessage.textContent = 'Invalid reset link.'; statusMessage.style.color = '#ff8b94'; } return; }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    if (!password || !confirmPassword) { if (statusMessage) { statusMessage.textContent = 'Please enter and confirm your new password.'; statusMessage.style.color = '#ff8b94'; } return; }
    if (password !== confirmPassword) { if (statusMessage) { statusMessage.textContent = 'Passwords do not match.'; statusMessage.style.color = '#ff8b94'; } return; }
    if (statusMessage) { statusMessage.textContent = 'Resetting password...'; statusMessage.style.color = '#d7d7ff'; }
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to reset password.');
      if (statusMessage) { statusMessage.textContent = 'Password reset successfully. You may now sign in.'; statusMessage.style.color = '#4CAF50'; }
      setTimeout(() => { window.location.href = 'signin.html'; }, 1600);
    } catch (error) {
      console.error('Reset password error:', error);
      if (statusMessage) { statusMessage.textContent = error.message || 'Unable to reset password.'; statusMessage.style.color = '#ff8b94'; }
    }
  });
}

window.checkout = checkout;
window.setCheckoutMessage = setCheckoutMessage;
window.getCheckoutItems = getCheckoutItems;
window.startCardCheckout = startCardCheckout;
window.startCODCheckout = startCODCheckout;
window.selectPaymentMethod = selectPaymentMethod;
window.renderInvoicePreviewPage = renderInvoicePreviewPage;
window.renderCheckoutItems = renderCheckoutItems;
window.renderSuccessDetails = renderSuccessDetails;
window.renderCheckoutPage = renderCheckoutPage;
window.loadDeliveryInfo = loadDeliveryInfo;
window.fillDeliveryAddressWithGPS = fillDeliveryAddressWithGPS;
window.getDeliveryInfo = getDeliveryInfo;
window.validateDeliveryForm = validateDeliveryForm;
window.renderThankYouPage = renderThankYouPage;
window.renderSuccessPage = renderSuccessPage;
window.renderSignInPage = renderSignInPage;
window.renderSignUpPage = renderSignUpPage;
window.renderForgotPasswordPage = renderForgotPasswordPage;
window.renderResetPasswordPage = renderResetPasswordPage;
window.fillAddressFromSaved = fillAddressFromSaved;
window.loadCheckoutAddresses = loadCheckoutAddresses;

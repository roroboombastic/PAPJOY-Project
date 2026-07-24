function checkout() {
  if (cart.length === 0) {
    showToast(translate('checkout.emptyCart'));
    return;
  }

  const user = getCurrentUser();
  if (!user) {
    showToast('Sign in for faster checkout and better order tracking.');
  }

  window.location.href = 'checkout.html';
}

function setCheckoutMessage(message, isError = false) {
  const messageEl = document.getElementById('checkout-message');
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.style.color = isError ? '#ff8b94' : '#d7d7ff';
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

async function startStripeCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addStripe'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.redirectStripe'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/stripe/session'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo: getDeliveryInfo() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.stripeFail'));
    }

    const { url } = await response.json();
    if (!url) {
      throw new Error(translate('error.stripeCheckoutUrl'));
    }

    window.location.href = url;
  } catch (error) {
    console.error('Stripe checkout error', error);
    setCheckoutMessage(translate('checkout.stripeRedirectFail'), true);
  }
}

async function startPayPalCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addPayPal'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.redirectPayPal'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/paypal/create'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo: getDeliveryInfo() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.paypalFail'));
    }

    const { approvalUrl } = await response.json();
    if (!approvalUrl) {
      throw new Error(translate('error.paypalApprovalUrl'));
    }

    window.location.href = approvalUrl;
  } catch (error) {
    console.error('PayPal checkout error', error);
    setCheckoutMessage(error.message || translate('checkout.paypalFail'), true);
  }
}

async function startRazorpayCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.addRazorpay'), true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();

  setCheckoutMessage(translate('checkout.preparingRazorpay'));
  const totals = getCartTotals();
  const headers = getAuthHeaders();

  try {
    const response = await fetch(apiUrl('/api/v1/payments/razorpay/create'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount: totals.total, items: getCheckoutItems(), shipping: totals.shipping, discount: totals.discount, tax: totals.tax, deliveryInfo }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.razorpayFail'));
    }

    const { order, key_id } = await response.json();
    if (!order || !key_id) {
      throw new Error(translate('error.razorpayOrderFailed'));
    }

    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    if (!window.Razorpay) {
      throw new Error('Razorpay SDK failed to load');
    }

    const razorpayToken = getAuthToken();
    const options = {
      key: key_id,
      amount: order.amount,
      currency: 'INR',
      name: 'PAP-JOY',
      description: 'Complete your order with Razorpay',
      order_id: order.id,
      handler: async function (razorResponse) {
        try {
          const verifyPayload = {
            paymentId: razorResponse.razorpay_payment_id,
            orderId: razorResponse.razorpay_order_id,
            signature: razorResponse.razorpay_signature,
            products: getCheckoutItems(),
            amount: totals.total,
            shipping: totals.shipping,
            discount: totals.discount,
            tax: totals.tax,
            deliveryInfo
          };
          const verifyHeaders = { 'Content-Type': 'application/json' };
          if (razorpayToken) verifyHeaders.Authorization = `Bearer ${razorpayToken}`;
          const verifyResponse = await fetch(apiUrl('/api/v1/payments/razorpay/verify'), {
            method: 'POST',
            headers: verifyHeaders,
            body: JSON.stringify(verifyPayload),
          });

          if (!verifyResponse.ok) {
            const errorBody = await verifyResponse.json().catch(() => null);
            throw new Error(errorBody?.error || translate('checkout.verifyFail'));
          }
          const verifyResult = await verifyResponse.json();
          sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'razorpay', order: verifyResult.order }));
          resetCartState();
          syncCart();
          window.location.href = 'success.html?provider=razorpay';
        } catch (verifyError) {
          console.error('Razorpay verification failed', verifyError);
          setCheckoutMessage(verifyError.message || translate('checkout.verifyFail'), true);
        }
      },
      modal: {
        ondismiss: function () {
          setCheckoutMessage(translate('checkout.razorpayCanceled'), true);
        },
      },
      theme: {
        color: '#f5a442',
      },
    };

    const razorpay = new Razorpay(options);
    razorpay.open();
  } catch (error) {
    console.error('Razorpay checkout error', error);
    setCheckoutMessage(error.message || translate('checkout.razorpayStartFail'), true);
  }
}

async function submitWebOrder() {
  if (cart.length === 0) {
    setCheckoutMessage(translate('checkout.webOrderEmpty'), true);
    return;
  }

  setCheckoutMessage(translate('checkout.submittingOrder'));

  try {
    const deliveryInfo = getDeliveryInfo();
    const totals = getCartTotals();
    const orderData = {
      items: getCheckoutItems(),
      amount: totals.total,
      shipping: totals.shipping,
      discount: totals.discount,
      tax: totals.tax,
      currency: currentCurrency,
      deliveryInfo,
      paymentMethod: 'web'
    };
    const headers = getAuthHeaders();
    const response = await fetch(apiUrl('/api/v1/orders'), {
      method: 'POST',
      headers,
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || translate('checkout.webFail'));
    }

    const result = await response.json();
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'web', order: result.order }));
    resetCartState();
    syncCart();
    window.location.href = 'success.html?provider=web';
  } catch (error) {
    console.error('Web order error', error);
    setCheckoutMessage(error.message || translate('checkout.webFail'), true);
  }
}

async function startCODCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before selecting COD.', true);
    return;
  }

  if (!validateDeliveryForm()) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const codNotes = document.getElementById('cod-notes').value.trim();
  const totals = getCartTotals();
  const codFee = 50;

  setCheckoutMessage('Processing Cash on Delivery order...');

  try {
    const orderData = {
      items: getCheckoutItems(),
      paymentMethod: 'cod',
      shipping: totals.shipping + codFee,
      discount: totals.discount,
      tax: totals.tax,
      deliveryInfo,
      codNotes
    };
    const headers = getAuthHeaders();
    const response = await fetch(apiUrl('/api/v1/orders'), {
      method: 'POST',
      headers,
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'COD order failed');
    }

    const result = await response.json();
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'cod', order: result.order }));
    resetCartState();
    syncCart();
    window.location.href = 'success.html?provider=cod';
  } catch (error) {
    console.error('COD order error', error);
    setCheckoutMessage(error.message || 'COD order failed. Please try again later.', true);
  }
}

async function startPaytmCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Paytm.', true);
    return;
  }

  setCheckoutMessage('Redirecting to Paytm...');
  // Simulate Paytm payment
  setTimeout(() => {
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'paytm', order: { id: 'simulated-paytm-' + Date.now() } }));
    resetCartState();
    syncCart();
    window.location.href = 'success.html?provider=paytm';
  }, 2000);
}

async function startCreditCardCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Credit Card.', true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  // Validate credit card form
  if (!validateCardForm('credit')) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const cardInfo = getCardInfo('credit');

  setCheckoutMessage('Processing credit card payment...');

  // Simulate payment processing
  setTimeout(async () => {
    try {
      const user = getCurrentUser();
      const orderData = { 
        items: getCheckoutItems(), 
        paymentMethod: 'creditcard',
        shipping: getCartTotals().shipping,
        discount: getCartTotals().discount,
        tax: getCartTotals().tax,
        deliveryInfo: deliveryInfo,
        cardInfo: cardInfo
      };
      if (user && user.id) {
        orderData.userId = user.id;
      }
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(apiUrl('/api/v1/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Credit card payment failed');
      }

      const result = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'creditcard', order: result.order }));
      resetCartState();
      syncCart();
      window.location.href = 'success.html?provider=creditcard';
    } catch (error) {
      console.error('Credit card payment error', error);
      setCheckoutMessage('Credit card payment failed. Please try again.', true);
    }
  }, 2000);
}

async function startDebitCardCheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with Debit Card.', true);
    return;
  }

  // Validate delivery form
  if (!validateDeliveryForm()) {
    return;
  }

  // Validate debit card form
  if (!validateCardForm('debit')) {
    return;
  }

  const deliveryInfo = getDeliveryInfo();
  const cardInfo = getCardInfo('debit');

  setCheckoutMessage('Processing debit card payment...');

  // Simulate payment processing
  setTimeout(async () => {
    try {
      const user = getCurrentUser();
      const orderData = { 
        items: getCheckoutItems(), 
        paymentMethod: 'debitcard',
        shipping: getCartTotals().shipping,
        discount: getCartTotals().discount,
        tax: getCartTotals().tax,
        deliveryInfo: deliveryInfo,
        cardInfo: cardInfo
      };
      if (user && user.id) {
        orderData.userId = user.id;
      }
      const token = getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(apiUrl('/api/v1/orders'), {
        method: 'POST',
        headers,
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        throw new Error('Debit card payment failed');
      }

      const result = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'debitcard', order: result.order }));
      resetCartState();
      syncCart();
      window.location.href = 'success.html?provider=debitcard';
    } catch (error) {
      console.error('Debit card payment error', error);
      setCheckoutMessage('Debit card payment failed. Please try again.', true);
    }
  }, 2000);
}

function validateCardForm(type) {
  const number = document.getElementById(`${type}-number`).value.trim();
  const expiry = document.getElementById(`${type}-expiry`).value.trim();
  const cvv = document.getElementById(`${type}-cvv`).value.trim();
  const name = document.getElementById(`${type}-name`).value.trim();

  if (!number || !expiry || !cvv || !name) {
    setCheckoutMessage('Please fill in all card details.', true);
    return false;
  }

  // Basic validation
  const cardNumberRegex = /^\d{4}\s?\d{4}\s?\d{4}\s?\d{4}$/;
  if (!cardNumberRegex.test(number.replace(/\s/g, ''))) {
    setCheckoutMessage('Please enter a valid card number.', true);
    return false;
  }

  const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  if (!expiryRegex.test(expiry)) {
    setCheckoutMessage('Please enter a valid expiry date (MM/YY).', true);
    return false;
  }

  if (cvv.length < 3 || cvv.length > 4) {
    setCheckoutMessage('Please enter a valid CVV.', true);
    return false;
  }

  return true;
}

function getCardInfo(type) {
  return {
    number: document.getElementById(`${type}-number`).value.trim(),
    expiry: document.getElementById(`${type}-expiry`).value.trim(),
    cvv: document.getElementById(`${type}-cvv`).value.trim(),
    name: document.getElementById(`${type}-name`).value.trim()
  };
}

// Card input formatting
function formatCardNumber(input) {
  let value = input.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  let formattedValue = '';
  for (let i = 0; i < value.length; i++) {
    if (i > 0 && i % 4 === 0) {
      formattedValue += ' ';
    }
    formattedValue += value[i];
  }
  input.value = formattedValue;
}

function formatExpiry(input) {
  let value = input.value.replace(/\D/g, '');
  if (value.length >= 2) {
    value = value.substring(0, 2) + '/' + value.substring(2, 4);
  }
  input.value = value;
}

// Initialize card formatting
function initCardFormatting() {
  const cardInputs = ['credit-number', 'debit-number'];
  const expiryInputs = ['credit-expiry', 'debit-expiry'];
  
  cardInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => formatCardNumber(input));
    }
  });
  
  expiryInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => formatExpiry(input));
    }
  });
}

// UPI Checkout
async function startUPICheckout() {
  if (cart.length === 0) {
    setCheckoutMessage('Add items to your cart before paying with UPI.', true);
    return;
  }

  setCheckoutMessage('Redirecting to UPI payment...');
  // Simulate UPI payment
  setTimeout(() => {
    sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'upi', order: { id: 'simulated-upi-' + Date.now() } }));
    resetCartState();
    syncCart();
    window.location.href = 'success.html?provider=upi';
  }, 2000);
}

// Invoice Preview
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
    if (!token && guestEmail) {
      url.searchParams.set('email', guestEmail);
    }
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
        <td>${item.productName || item.name || 'Item'}</td>
        <td>${item.quantity || 1}</td>
        <td>${formatCurrency(item.unitPrice || item.price || 0)}</td>
        <td>${item.gstRate != null ? item.gstRate + '%' : '—'}</td>
        <td>${formatCurrency(item.total || 0)}</td>
      </tr>
    `).join('');

    previewContainer.innerHTML = `
      <div class="invoice-summary">
        <div><strong>Invoice #</strong> ${invoiceData.invoiceNumber || invoiceData.orderNumber || ''}</div>
        <div><strong>Status</strong> ${invoiceData.status || 'issued'}</div>
        <div><strong>Payment</strong> ${invoiceData.paymentStatus || 'pending'}</div>
        <div><strong>Total</strong> ${formatCurrency(invoiceData.total || 0)}</div>
      </div>
      <section class="invoice-details">
        <div class="invoice-block">
          <h3>Customer</h3>
          <p>${invoiceData.customerName || invoiceData.billingAddress?.name || ''}</p>
          <p>${invoiceData.customerEmail || ''}</p>
          <p>${invoiceData.customerPhone || ''}</p>
        </div>
        <div class="invoice-block">
          <h3>Billing Address</h3>
          <p>${invoiceData.billingAddress?.street || ''}</p>
          <p>${invoiceData.billingAddress?.city || ''} ${invoiceData.billingAddress?.state || ''}</p>
          <p>${invoiceData.billingAddress?.zipCode || ''} ${invoiceData.billingAddress?.country || ''}</p>
        </div>
        <div class="invoice-block">
          <h3>Seller</h3>
          <p>${invoiceData.companyName || 'PAP-JOY'}</p>
          <p>${invoiceData.companyGSTIN || '09CZDPK9498Q1Z2'}</p>
          <p>${invoiceData.companyEmail || 'support@papjoy.com'}</p>
        </div>
      </section>
      <table class="invoice-table">
        <thead>
          <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>GST</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="invoice-total">
        <div>Subtotal: ${formatCurrency(invoiceData.subtotal || 0)}</div>
        <div>CGST: ${formatCurrency(invoiceData.cgstTotal || 0)}</div>
        <div>SGST: ${formatCurrency(invoiceData.sgstTotal || 0)}</div>
        <div>GST: ${formatCurrency(invoiceData.taxTotal || invoiceData.tax || 0)}</div>
        <div>Shipping: ${formatCurrency(invoiceData.shippingCharges || invoiceData.shipping || 0)}</div>
        <div>Discount: ${formatCurrency(invoiceData.discount || 0)}</div>
        <strong>Total: ${formatCurrency(invoiceData.total || 0)}</strong>
      </div>
      <button class="checkout-button" onclick="downloadOrderInvoice('${orderId}')">Download PDF</button>
    `;
    previewMessage.textContent = '';
  } catch (error) {
    console.error('Invoice preview error:', error);
    previewMessage.textContent = error.message || 'Failed to load invoice preview.';
    previewMessage.style.color = 'red';
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
      <span>${item.name} × ${item.quantity}</span>
      <span>${formatCurrency(item.price * item.quantity)}</span>
    `;
    container.appendChild(itemRow);
  });
}

function renderSuccessDetails(order) {
  const container = document.getElementById('success-details');
  if (!container || !order) return;

  container.innerHTML = '';
  const providerKey = (order.provider || 'web').toLowerCase();
  const readableProvider = translate(`provider.${providerKey}`) || order.provider || translate('provider.web');
  const summary = [
    { label: translate('success.summaryProvider'), value: readableProvider },
    { label: translate('success.summaryOrderId'), value: order._id || order.id || 'N/A' },
    { label: translate('success.summaryPaymentId'), value: order.paymentId || 'N/A' },
    { label: translate('success.summaryStatus'), value: order.status || 'Completed' },
    { label: translate('success.summaryAmount'), value: order.amount ? formatCurrency(order.amount) : 'N/A' },
  ];

  summary.forEach(({ label, value }) => {
    const row = document.createElement('div');
    row.className = 'receipt-row';
    row.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    container.appendChild(row);
  });

  if (Array.isArray(order.products) && order.products.length > 0) {
    const listTitle = document.createElement('h3');
      listTitle.textContent = translate('success.summaryItems');
    order.products.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'receipt-row';
      row.innerHTML = `<span>${item.name} × ${item.quantity}</span><strong>${formatCurrency(item.price * item.quantity)}</strong>`;
      container.appendChild(row);
    });
  }

  // Invoice button: open preview page with auth or guest email as needed
  const invoiceBtn = document.createElement('button');
  invoiceBtn.className = 'checkout-button';
  invoiceBtn.textContent = translate('success.viewInvoice') || 'View Invoice';
  invoiceBtn.addEventListener('click', () => {
    const orderId = order._id || order.id;
    if (!orderId) return showToast('Invoice not available');
    const previewUrl = new URL('invoice-preview.html', window.location.href);
    previewUrl.searchParams.set('orderId', orderId);
    const guestEmail = order.email || order.customerEmail || order.userEmail || order.billingAddress?.email || order.shippingAddress?.email;
    if (!getAuthToken() && guestEmail) {
      previewUrl.searchParams.set('email', guestEmail);
    }
    window.open(previewUrl.toString(), '_blank');
  });
  container.appendChild(document.createElement('hr'));
  container.appendChild(invoiceBtn);
}

let paymentProviders = null;

async function loadPaymentConfig() {
  try {
    const response = await fetch(apiUrl('/api/v1/payments/config'));
    if (response.ok) {
      paymentProviders = await response.json();
      const cards = document.querySelectorAll('.payment-card');
      cards.forEach((card) => {
        const button = card.querySelector('.checkout-button');
        if (!button) return;
        const action = button.getAttribute('onclick') || '';
        if (action.includes('startStripe') && paymentProviders && !paymentProviders.stripe?.enabled) {
          button.disabled = true; button.textContent = 'Stripe unavailable';
        }
        if (action.includes('startPayPal') && paymentProviders && !paymentProviders.paypal?.enabled) {
          button.disabled = true; button.textContent = 'PayPal unavailable';
        }
        if (action.includes('startRazorpay') && paymentProviders && !paymentProviders.razorpay?.enabled) {
          button.disabled = true; button.textContent = 'Razorpay unavailable';
        }
      });
    }
  } catch (error) {
    console.warn('Payment config unavailable, showing all options:', error);
  }
}

async function loadCheckoutAddresses() {
  const container = document.getElementById('checkout-addresses');
  if (!container) return;
  try {
    const addresses = await loadUserAddresses();
    if (!addresses || !addresses.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '<p style="margin-bottom:0.5rem;font-size:0.85rem;opacity:0.7;">Saved addresses:</p>' +
      addresses.map((addr, i) => `<button type="button" class="checkout-button secondary" style="margin:0.25rem;padding:0.4rem 0.75rem;font-size:0.8rem;" onclick="fillAddressFromSaved(${i})">${addr.name || 'Address ' + (i+1)}${addr.isDefault ? ' ★' : ''}</button>`).join('');
    window.__checkoutAddresses = addresses;
  } catch (error) {
    console.warn('Failed to load saved addresses:', error);
  }
}

function fillAddressFromSaved(index) {
  const addresses = window.__checkoutAddresses;
  if (!addresses || !addresses[index]) return;
  const addr = addresses[index];
  const nameEl = document.getElementById('delivery-fullname');
  const phoneEl = document.getElementById('delivery-phone');
  const streetEl = document.getElementById('delivery-address');
  const cityEl = document.getElementById('delivery-city');
  const stateEl = document.getElementById('delivery-state');
  const postalEl = document.getElementById('delivery-postal');
  const countryEl = document.getElementById('delivery-country');
  if (nameEl) nameEl.value = addr.name || '';
  if (phoneEl) phoneEl.value = addr.phone || '';
  if (streetEl) streetEl.value = addr.street || '';
  if (cityEl) cityEl.value = addr.city || '';
  if (stateEl) stateEl.value = addr.state || '';
  if (postalEl) postalEl.value = addr.zipCode || '';
  if (countryEl) countryEl.value = addr.country || 'India';
}

// Checkout page init
async function renderCheckoutPage() {
  renderCheckoutItems();
  updateCartSummary();
  updateCheckoutSummary();
  
  const gpsButton = document.getElementById('fill-delivery-address-btn');
  if (gpsButton) {
    gpsButton.removeEventListener('click', fillDeliveryAddressWithGPS);
    gpsButton.addEventListener('click', fillDeliveryAddressWithGPS);
  }
  
  const user = getCurrentUser();
  const signinPrompt = document.getElementById('signin-prompt');
  if (!user && signinPrompt) {
    signinPrompt.style.display = 'block';
  }
  
  if (user) {
    loadDeliveryInfo();
    await loadCheckoutAddresses();
  }
  
  await loadPaymentConfig();
  
  initCardFormatting();
  
  const params = getQueryParams();
  if (params.checkout === 'canceled') {
    setCheckoutMessage(translate('checkout.orderCanceled'), true);
  }
  if (params.paypal === 'canceled') {
    setCheckoutMessage(translate('checkout.paypalCanceled'), true);
  }
  if (params.payment === 'failed') {
    setCheckoutMessage(translate('checkout.paymentFailed'), true);
  }
}

function loadDeliveryInfo() {
  const user = getCurrentUser();
  if (!user) return;
  
  // Load from user shipping address if available
  document.getElementById('delivery-fullname').value = user.shippingAddress?.fullName || '';
  document.getElementById('delivery-phone').value = user.shippingAddress?.phone || '';
  document.getElementById('delivery-address').value = user.shippingAddress?.line1 || '';
  document.getElementById('delivery-city').value = user.shippingAddress?.city || '';
  document.getElementById('delivery-state').value = user.shippingAddress?.state || '';
  document.getElementById('delivery-postal').value = user.shippingAddress?.postalCode || '';
  document.getElementById('delivery-country').value = user.shippingAddress?.country || 'India';
  document.getElementById('delivery-instructions').value = user.deliveryPreferences?.instructions || '';
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
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 15000,
      });
    });

    const { latitude, longitude } = position.coords;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`;
    const response = await fetchWithTimeout(url, { timeout: 10000 });

    if (!response.ok) {
      throw new Error('Unable to resolve address from GPS coordinates.');
    }

    const data = await response.json();
    const address = data.address || {};

    const streetParts = [
      address.road,
      address.neighbourhood,
      address.suburb,
      address.village,
      address.town,
      address.city,
    ].filter(Boolean);

    document.getElementById('delivery-address').value = streetParts.join(', ') || data.display_name || '';
    document.getElementById('delivery-city').value = address.city || address.town || address.village || address.county || '';
    document.getElementById('delivery-state').value = address.state || address.region || '';
    document.getElementById('delivery-postal').value = address.postcode || '';
    document.getElementById('delivery-country').value = address.country || 'India';

    setCheckoutMessage('Address autofill complete. Please verify the fields before checkout.');
  } catch (error) {
    console.error('GPS autofill failed:', error);
    setCheckoutMessage('Unable to autofill address from GPS location. Please enter your delivery address manually.', true);
  }
}

function showCODForm() {
  const codForm = document.getElementById('cod-form');
  const totals = getCartTotals();
  const codAmount = document.getElementById('cod-amount');
  
  if (codForm.style.display === 'none' || codForm.style.display === '') {
    codForm.style.display = 'block';
    codAmount.value = formatCurrency(totals.total + 50);
  } else {
    codForm.style.display = 'none';
  }
}

function getDeliveryInfo() {
  const fullName = document.getElementById('delivery-fullname')?.value.trim() || '';
  const phone = document.getElementById('delivery-phone')?.value.trim() || '';
  const address = document.getElementById('delivery-address')?.value.trim() || '';
  const city = document.getElementById('delivery-city')?.value.trim() || '';
  const state = document.getElementById('delivery-state')?.value.trim() || '';
  const postalCode = document.getElementById('delivery-postal')?.value.trim() || '';
  const country = document.getElementById('delivery-country')?.value.trim() || 'India';
  const instructions = document.getElementById('delivery-instructions')?.value.trim() || '';
  return { fullName, phone, address, city, state, postalCode, country, instructions };
}

function showCreditForm() {
  const creditForm = document.getElementById('credit-form');
  if (creditForm.style.display === 'none' || creditForm.style.display === '') {
    creditForm.style.display = 'block';
  } else {
    creditForm.style.display = 'none';
  }
}

function showDebitForm() {
  const debitForm = document.getElementById('debit-form');
  if (debitForm.style.display === 'none' || debitForm.style.display === '') {
    debitForm.style.display = 'block';
  } else {
    debitForm.style.display = 'none';
  }
}

function validateDeliveryForm() {
  const requiredFields = [
    'delivery-fullname',
    'delivery-phone', 
    'delivery-address',
    'delivery-city',
    'delivery-state',
    'delivery-postal',
    'delivery-country'
  ];
  
  for (const fieldId of requiredFields) {
    const field = document.getElementById(fieldId);
    if (!field.value.trim()) {
      setCheckoutMessage(`Please fill in all required delivery information.`, true);
      field.focus();
      return false;
    }
  }
  return true;
}

async function renderSuccessPage() {
  const params = getQueryParams();
  const statusEl = document.getElementById('success-status');
  const storedOrder = sessionStorage.getItem('papjoy-order');

  if (!statusEl) return;

  // Show loading state
  statusEl.textContent = translate('success.processing');
  statusEl.style.color = '#666';

  try {
    if (params.provider === 'stripe' && params.session_id) {
      const response = await fetch(apiUrl('/api/v1/payments/stripe/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: params.session_id, items: getCheckoutItems() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || translate('error.stripeOrderConfirmationFailed'));
      }
      const { order } = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'stripe', order }));
      resetCartState();
      syncCart();
      renderSuccessDetails(order);
      statusEl.textContent = translate('success.stripeComplete');
      statusEl.style.color = '#4CAF50';
      return;
    }

    if (params.provider === 'paypal' && (params.token || params.orderId)) {
      const orderId = params.token || params.orderId;
      const response = await fetch(apiUrl('/api/v1/payments/paypal/capture'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, items: getCheckoutItems() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || translate('error.paypalOrderCaptureFailed'));
      }
      const { order } = await response.json();
      sessionStorage.setItem('papjoy-order', JSON.stringify({ provider: 'paypal', order }));
      resetCartState();
      syncCart();
      renderSuccessDetails(order);
      statusEl.textContent = translate('success.paypalComplete');
      statusEl.style.color = '#4CAF50';
      return;
    }

    if (params.provider === 'web' && storedOrder) {
      const { order } = JSON.parse(storedOrder);
      renderSuccessDetails(order);
      resetCartState();
      syncCart();
      statusEl.textContent = translate('success.orderPlaced');
      statusEl.style.color = '#4CAF50';
      sessionStorage.removeItem('papjoy-order');
      return;
    }

    if (storedOrder) {
      const { order } = JSON.parse(storedOrder);
      renderSuccessDetails(order);
      resetCartState();
      syncCart();
      statusEl.textContent = translate('success.orderComplete');
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

    // Show user-friendly error message
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-message';
    errorContainer.innerHTML = `
      <p>${translate('error.orderProcessing')}</p>
      <p><small>${error.message}</small></p>
      <button onclick="window.location.href='/'" class="btn btn-primary">${translate('error.returnHome')}</button>
    `;
    statusEl.parentNode.appendChild(errorContainer);
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
    setTimeout(() => {
      window.location.href = 'account.html';
    }, 1200);
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
      passwordToggle.setAttribute('aria-label', translate(show ? 'signin.hidePassword' : 'signin.showPassword'));
    });
  }

  signinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!email || !password) {
      if (statusMessage) {
        statusMessage.textContent = translate('signin.enterCredentials');
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = translate('signin.loggingIn');
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const remember = document.getElementById('remember')?.checked;
        const { response, data } = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (statusMessage) {
          statusMessage.textContent = data?.error || data?.message || translate('signin.invalidCredentials');
          statusMessage.style.color = '#ff8b94';
        }
        return;
      }

      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (statusMessage) {
        statusMessage.textContent = translate('signin.welcomeBack').replace('{email}', userData.email || email);
        statusMessage.style.color = '#d7d7ff';
      }

      setTimeout(() => {
        window.location.href = 'account.html';
      }, 1000);
    } catch (error) {
      console.error('Sign in error:', error);
      if (statusMessage) {
        statusMessage.textContent = translate('signin.loginError');
        statusMessage.style.color = '#ff8b94';
      }
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

  function toggleVisibility(input) {
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  if (signupPasswordToggle && signupPassword) {
    signupPasswordToggle.addEventListener('click', () => toggleVisibility(signupPassword));
    signupPassword.addEventListener('input', () => updatePasswordStrength(signupPassword.value));
    updatePasswordStrength(signupPassword.value);
  }

  if (confirmPasswordToggle && confirmPassword) {
    confirmPasswordToggle.addEventListener('click', () => toggleVisibility(confirmPassword));
  }

  if (user) {
    if (signupMessage) {
      signupMessage.textContent = translate('signup.success');
      signupMessage.style.color = '#d7d7ff';
    }
    setTimeout(() => {
      window.location.href = 'account.html';
    }, 1200);
    return;
  }

  if (!signupForm) return;

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const phone = document.getElementById('signup-phone').value.trim();
    const password = document.getElementById('signup-password').value.trim();
    const confirmPasswordValue = document.getElementById('confirm-password').value.trim();

    if (!email || !password || !name || !phone) {
      if (signupMessage) {
        signupMessage.textContent = translate('signup.missingFields') || 'Please fill in all required fields.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) {
      if (signupMessage) {
        signupMessage.textContent = 'Enter a valid phone number.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password.length < 8) {
      if (signupMessage) {
        signupMessage.textContent = 'Password must be at least 8 characters long.';
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password !== confirmPasswordValue) {
      if (signupMessage) {
        signupMessage.textContent = translate('signup.passwordMismatch');
        signupMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (signupMessage) {
      signupMessage.textContent = translate('signup.registering');
      signupMessage.style.color = '#d7d7ff';
    }

    try {
      const remember = document.getElementById('remember-signup')?.checked;
      const { response, data } = await apiFetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, phone, marketingOptIn: document.getElementById('marketing')?.checked }),
      });

      if (!response.ok) {
        if (signupMessage) {
          signupMessage.textContent = data?.error || data?.message || translate('signup.registerError');
          signupMessage.style.color = '#ff8b94';
        }
        return;
      }

      const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
      setCurrentUser(userData, remember);
      if (signupMessage) {
        signupMessage.textContent = translate('signup.success');
        signupMessage.style.color = '#4caf50';
      }
      setTimeout(() => {
        window.location.href = 'account.html';
      }, 1200);
    } catch (error) {
      console.error('Signup error:', error);
      if (signupMessage) {
        signupMessage.textContent = translate('signup.registerError');
        signupMessage.style.color = '#ff8b94';
      }
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
    if (!email) {
      if (statusMessage) {
        statusMessage.textContent = 'Please enter your email address.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = 'Sending password reset link...';
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to send reset link.');
      }
      if (statusMessage) {
        statusMessage.innerHTML = `If that email exists, a reset link is ready. <br /><strong>Reset link:</strong> <a href="${data.resetUrl}">${data.resetUrl}</a>`;
        statusMessage.style.color = '#4CAF50';
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      if (statusMessage) {
        statusMessage.textContent = error.message || 'Unable to send reset link.';
        statusMessage.style.color = '#ff8b94';
      }
    }
  });
}

async function renderResetPasswordPage() {
  const form = document.getElementById('reset-password-form');
  const statusMessage = document.getElementById('auth-message');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) {
    if (statusMessage) {
      statusMessage.textContent = 'Invalid reset link. Please request a new password reset.';
      statusMessage.style.color = '#ff8b94';
    }
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();

    if (!password || !confirmPassword) {
      if (statusMessage) {
        statusMessage.textContent = 'Please enter and confirm your new password.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (password !== confirmPassword) {
      if (statusMessage) {
        statusMessage.textContent = 'Passwords do not match.';
        statusMessage.style.color = '#ff8b94';
      }
      return;
    }

    if (statusMessage) {
      statusMessage.textContent = 'Resetting password...';
      statusMessage.style.color = '#d7d7ff';
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to reset password.');
      }
      if (statusMessage) {
        statusMessage.textContent = 'Password reset successfully. You may now sign in.';
        statusMessage.style.color = '#4CAF50';
      }
      setTimeout(() => {
        window.location.href = 'signin.html';
      }, 1600);
    } catch (error) {
      console.error('Reset password error:', error);
      if (statusMessage) {
        statusMessage.textContent = error.message || 'Unable to reset password.';
        statusMessage.style.color = '#ff8b94';
      }
    }
  });
}

// Attach all functions to window
window.checkout = checkout;
window.setCheckoutMessage = setCheckoutMessage;
window.getCheckoutItems = getCheckoutItems;
window.startStripeCheckout = startStripeCheckout;
window.startPayPalCheckout = startPayPalCheckout;
window.startRazorpayCheckout = startRazorpayCheckout;
window.submitWebOrder = submitWebOrder;
window.startCODCheckout = startCODCheckout;
window.startPaytmCheckout = startPaytmCheckout;
window.startCreditCardCheckout = startCreditCardCheckout;
window.startDebitCardCheckout = startDebitCardCheckout;
window.validateCardForm = validateCardForm;
window.getCardInfo = getCardInfo;
window.formatCardNumber = formatCardNumber;
window.formatExpiry = formatExpiry;
window.initCardFormatting = initCardFormatting;
window.startUPICheckout = startUPICheckout;
window.renderInvoicePreviewPage = renderInvoicePreviewPage;
window.renderCheckoutItems = renderCheckoutItems;
window.renderSuccessDetails = renderSuccessDetails;
window.paymentProviders = paymentProviders;
window.loadPaymentConfig = loadPaymentConfig;
window.loadCheckoutAddresses = loadCheckoutAddresses;
window.fillAddressFromSaved = fillAddressFromSaved;
window.renderCheckoutPage = renderCheckoutPage;
window.loadDeliveryInfo = loadDeliveryInfo;
window.fillDeliveryAddressWithGPS = fillDeliveryAddressWithGPS;
window.showCODForm = showCODForm;
window.getDeliveryInfo = getDeliveryInfo;
window.showCreditForm = showCreditForm;
window.showDebitForm = showDebitForm;
window.validateDeliveryForm = validateDeliveryForm;
window.renderSuccessPage = renderSuccessPage;
window.renderSignInPage = renderSignInPage;
window.renderSignUpPage = renderSignUpPage;
window.renderForgotPasswordPage = renderForgotPasswordPage;
window.renderResetPasswordPage = renderResetPasswordPage;

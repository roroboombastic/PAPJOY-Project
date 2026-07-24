async function loadOrderTracking(orderId) {
  if (!orderId) return null;
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(apiUrl(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`), {
      headers
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load tracking:', error);
    return null;
  }
}

function renderTrackingTimeline(tracking) {
  if (!tracking) return '';
  const timeline = Array.isArray(tracking.timeline)
    ? tracking.timeline
    : Array.isArray(tracking.events)
      ? tracking.events.map((event) => ({
          label: event.message || event.status || 'Update',
          date: event.timestamp || event.date || new Date().toISOString(),
          completed: event.status === 'delivered' || event.status === 'completed',
          current: !event.completed && !event.isPast,
        }))
      : [];

  if (!timeline.length) {
    return `
      <div class="tracking-timeline">
        <h3>Order Status Timeline</h3>
        <div class="timeline">
          <div class="timeline-step active">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-label">${tracking.status ? tracking.status.replace(/_/g, ' ') : 'Processing'}</div>
              <div class="timeline-date">${tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery).toLocaleDateString() : ''}</div>
            </div>
          </div>
        </div>
        ${tracking.trackingUrl ? `<a href="${tracking.trackingUrl}" target="_blank" class="btn btn-secondary">Track with ${tracking.carrier || 'Carrier'}</a>` : ''}
      </div>
    `;
  }

  return `
    <div class="tracking-timeline">
      <h3>Order Status Timeline</h3>
      <div class="timeline">
        ${timeline.map((step) => `
          <div class="timeline-item ${step.completed ? 'completed' : step.current ? 'active' : 'pending'}">
            <div class="timeline-icon">•</div>
            <div class="timeline-content">
              <h4>${step.label}</h4>
              <p>${step.current ? 'Current step' : step.completed ? 'Completed' : 'Pending'}</p>
              <span class="timeline-time">${new Date(step.date).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('')}
      </div>
      ${tracking.trackingUrl ? `<a href="${tracking.trackingUrl}" target="_blank" class="btn btn-secondary">Track with ${tracking.carrier || 'Carrier'}</a>` : ''}
    </div>
  `;
}

let trackingInterval;

function initTrackingPage() {
  const trackingForm = document.getElementById('tracking-form');
  const trackingMessage = document.getElementById('tracking-message');
  const orderIdInput = document.getElementById('order-id');
  const emailInput = document.getElementById('tracking-email');
  const user = getCurrentUser();
  const params = getQueryParams();

  if (!trackingForm) return;

  if (user?.email && emailInput && !emailInput.value) {
    emailInput.value = user.email;
  }

  if (params.order) {
    orderIdInput.value = params.order;
  }

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    const orderId = orderIdInput.value.trim();
    const email = emailInput.value.trim();

    if (!orderId || !email) {
      showTrackingMessage('Please enter both Order ID and Email.', true);
      return;
    }

    showTrackingMessage('Searching for your order...');

    try {
      const order = await findOrder(orderId, email);
      if (order) {
        displayTrackingResults(order);
        startGPSTracking();
        showTrackingMessage('Order status loaded successfully.');
      } else {
        showTrackingMessage('Order not found. Please check your Order ID and Email.', true);
      }
    } catch (error) {
      console.error('Tracking error:', error);
      showTrackingMessage('Unable to track order. Please try again later.', true);
    }
  };

  trackingForm.addEventListener('submit', handleSubmit);

  if (params.order && emailInput.value) {
    setTimeout(() => trackingForm.requestSubmit?.() ?? trackingForm.dispatchEvent(new Event('submit', { cancelable: true })), 250);
  }
}

async function findOrder(orderId, email) {
  const savedOrder = getLocalOrder(orderId, email);

  try {
    const tracking = await loadOrderTracking(orderId);
    if (tracking) {
      return {
        id: tracking.orderId || orderId,
        email: email,
        status: tracking.status || 'pending',
        shipment: tracking.shipment || null,
        estimatedDelivery: tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : null,
        placedAt: tracking.createdAt ? new Date(tracking.createdAt) : (savedOrder ? new Date(savedOrder.placedAt) : new Date()),
      };
    }
  } catch (error) {
    console.warn('Remote tracking lookup failed, falling back to local order if available.', error);
  }

  if (savedOrder) {
    return {
      ...savedOrder,
      placedAt: new Date(savedOrder.placedAt),
      estimatedDelivery: savedOrder.estimatedDelivery ? new Date(savedOrder.estimatedDelivery) : null,
    };
  }

  if (orderId && /\d/.test(orderId)) {
    return {
      id: orderId,
      email: email,
      status: 'out_for_delivery',
      placedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000),
      shipment: {
        status: 'out_for_delivery',
        trackingUrl: '',
        carrier: 'Local Delivery',
        timeline: [
          { label: 'Order Placed', date: new Date(Date.now() - 2 * 60 * 60 * 1000), completed: true },
          { label: 'Processing', date: new Date(Date.now() - 90 * 60 * 1000), completed: true },
          { label: 'Out for Delivery', date: new Date(Date.now() - 10 * 60 * 1000), current: true },
          { label: 'Delivered', date: new Date(Date.now() + 45 * 60 * 1000) }
        ]
      },
      currentLocation: {
        address: 'Sector 18, Noida',
      },
      distance: 2.3,
      driver: {
        name: 'Rajesh Kumar',
        phone: '+91 98765 43210',
      },
    };
  }

  return null;
}

function displayTrackingResults(order) {
  const resultsDiv = document.getElementById('tracking-results');
  const orderNumber = document.getElementById('order-number');
  const orderDate = document.getElementById('order-date');
  const timelineContainer = document.querySelector('.status-timeline');
  const trackingData = order.shipment || order;

  // Update order info
  orderNumber.textContent = `Order #${order.id}`;
  orderDate.textContent = `Placed on: ${order.placedAt.toLocaleDateString()}`;
  
  // Render timeline using backend or local shipment details
  if (timelineContainer) {
    timelineContainer.innerHTML = renderTrackingTimeline(trackingData);
  }

  // Update timeline based on status
  updateTimelineStatus(order.shipment?.status || order.status || 'processing');
  
  // Show invoice action when order ID is available
  const invoiceActions = document.getElementById('tracking-invoice-actions');
  const invoiceButton = document.getElementById('tracking-invoice-button');
  if (invoiceActions && invoiceButton && order.id) {
    window.currentTrackingOrder = order;
    invoiceButton.onclick = () => downloadOrderInvoice(order.id);
    invoiceActions.style.display = 'flex';
  }

  // Show results
  resultsDiv.style.display = 'block';
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
  
  // Update tracking details
  updateTrackingDetails(order);
}

function updateTimelineStatus(status) {
  const timelineItems = document.querySelectorAll('.timeline-item, .timeline-step');
  
  // Reset all items
  timelineItems.forEach(item => {
    item.classList.remove('completed', 'active', 'pending', 'current');
    item.classList.add('pending');
  });
  
  // Set status based on order status
  const statusMap = {
    'placed': 0,
    'processing': 1,
    'out_for_delivery': 2,
    'delivered': 3
  };
  
  const currentStep = statusMap[status] || 0;
  
  timelineItems.forEach((item, index) => {
    if (index < currentStep) {
      item.classList.remove('pending');
      item.classList.add('completed');
    } else if (index === currentStep) {
      item.classList.remove('pending');
      item.classList.add('active');
    }
  });
}

function updateTrackingDetails(order) {
  const currentLocation = document.getElementById('current-location');
  const distanceRemaining = document.getElementById('distance-remaining');
  const eta = document.getElementById('eta');
  const driverContact = document.getElementById('driver-contact');
  const trackingSource = order.shipment || order;
  const locationAddress = trackingSource.currentLocation?.address || trackingSource.location?.address || 'Unknown location';
  const distanceValue = typeof trackingSource.distance === 'number' ? trackingSource.distance : parseFloat(trackingSource.distance) || null;
  const etaDate = trackingSource.estimatedDelivery ? new Date(trackingSource.estimatedDelivery) : null;
  const driverPhone = trackingSource.driver?.phone || order.driver?.phone || 'Unknown';

  if (currentLocation) {
    currentLocation.textContent = locationAddress;
  }
  if (distanceRemaining) {
    distanceRemaining.textContent = distanceValue != null ? `${distanceValue} km` : 'Unknown';
  }
  if (eta) {
    eta.textContent = etaDate ? etaDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown';
  }
  if (driverContact) {
    driverContact.textContent = driverPhone;
  }
}

function startGPSTracking() {
  // Clear any existing interval
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }
  
  // Simulate GPS movement every 30 seconds
  trackingInterval = setInterval(() => {
    updateGPSPosition();
  }, 30000);
  
  // Initial update
  updateGPSPosition();
}

function updateGPSPosition() {
  // Simulate movement towards destination
  const deliveryTruck = document.getElementById('delivery-truck');
  const currentLocation = document.getElementById('current-location');
  const distanceRemaining = document.getElementById('distance-remaining');
  const eta = document.getElementById('eta');
  
  // Simulate decreasing distance
  const distanceText = distanceRemaining.textContent.replace(/[^0-9.]/g, '');
  const currentDistance = parseFloat(distanceText) || 0;
  const newDistance = Math.max(0, currentDistance - 0.1);
  
  distanceRemaining.textContent = `${newDistance.toFixed(1)} km`;
  
  // Update location based on distance
  const locations = [
    'Sector 18, Noida',
    'Sector 15, Noida', 
    'Sector 12, Noida',
    'Crossing Republic, Ghaziabad',
    'Your Location'
  ];
  
  const locationIndex = Math.min(4, Math.floor((2.3 - newDistance) / 0.5));
  currentLocation.textContent = locations[locationIndex];
  
  // Update ETA
  const minutesRemaining = Math.max(1, Math.round(newDistance * 15)); // ~15 min per km
  const etaTime = new Date(Date.now() + minutesRemaining * 60 * 1000);
  eta.textContent = etaTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  // Add tracking update
  if (newDistance < 2.2 && newDistance > 2.0) {
    addTrackingUpdate('📍 Delivery vehicle has entered your area.');
  } else if (newDistance < 1.0 && newDistance > 0.8) {
    addTrackingUpdate('🚚 Your order is very close! Driver will arrive soon.');
  } else if (newDistance < 0.1) {
    addTrackingUpdate('✅ Order delivered successfully!');
    clearInterval(trackingInterval);
  }
}

function addTrackingUpdate(message) {
  const updatesList = document.getElementById('updates-list');
  const updateItem = document.createElement('div');
  updateItem.className = 'update-item';
  
  const now = new Date();
  const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  updateItem.innerHTML = `
    <div class="update-time">${timeString}</div>
    <div class="update-content">
      <p>${message}</p>
    </div>
  `;
  
  // Insert at the beginning
  updatesList.insertBefore(updateItem, updatesList.firstChild);
}

function showTrackingMessage(message, isError = false) {
  const messageEl = document.getElementById('tracking-message');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.style.color = isError ? '#ff8b94' : '#d7d7ff';
    messageEl.style.display = 'block';
  }
}

window.loadOrderTracking = loadOrderTracking;
window.renderTrackingTimeline = renderTrackingTimeline;
window.trackingInterval = trackingInterval;
window.initTrackingPage = initTrackingPage;
window.findOrder = findOrder;
window.displayTrackingResults = displayTrackingResults;
window.updateTimelineStatus = updateTimelineStatus;
window.updateTrackingDetails = updateTrackingDetails;
window.startGPSTracking = startGPSTracking;
window.updateGPSPosition = updateGPSPosition;
window.addTrackingUpdate = addTrackingUpdate;
window.showTrackingMessage = showTrackingMessage;
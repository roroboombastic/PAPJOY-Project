let trackingInterval;
let trackingMap = null;
let deliveryMarker = null;
let destinationMarker = null;
let routeLine = null;

async function loadOrderTracking(orderId, email) {
  if (!orderId) return null;
  const token = getAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!token && email) headers['Content-Type'] = 'application/json';

  try {
    const url = new URL(apiUrl(`/api/v1/orders/${encodeURIComponent(orderId)}/tracking`));
    if (!token && email) url.searchParams.set('email', email);
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load tracking:', error);
    return null;
  }
}

async function loadShipmentTracking(orderNumber) {
  try {
    const token = getAuthToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = apiUrl(`/api/v1/shipments/${encodeURIComponent(orderNumber)}/tracking`);
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Failed to load shipment tracking:', error);
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
            <div class="timeline-icon">&#8226;</div>
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

function initTrackingPage() {
  const trackingForm = document.getElementById('tracking-form');
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
    const tracking = await loadOrderTracking(orderId, email);
    if (tracking) {
      let shipmentData = null;
      if (tracking.orderNumber) {
        shipmentData = await loadShipmentTracking(tracking.orderNumber);
      }

      return {
        id: tracking.orderId || orderId,
        orderNumber: tracking.orderNumber || '',
        email: email,
        status: tracking.status || 'pending',
        shipment: tracking.shipment || null,
        shipmentExtended: shipmentData,
        estimatedDelivery: tracking.estimatedDelivery ? new Date(tracking.estimatedDelivery) : null,
        placedAt: tracking.createdAt ? new Date(tracking.createdAt) : (savedOrder ? new Date(savedOrder.placedAt) : new Date()),
        items: tracking.items || [],
        total: tracking.total || 0,
        paymentMethod: tracking.paymentMethod || '',
        paymentStatus: tracking.paymentStatus || '',
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

  return null;
}

function displayTrackingResults(order) {
  const resultsDiv = document.getElementById('tracking-results');
  const orderNumber = document.getElementById('order-number');
  const orderDate = document.getElementById('order-date');

  orderNumber.textContent = `Order #${order.orderNumber || order.id}`;
  orderDate.textContent = `Placed on: ${order.placedAt.toLocaleDateString()}`;

  renderOrderTimelineSteps(order.status || 'processing');

  const trackingData = order.shipment || order;
  const backendEvents = Array.isArray(trackingData.events) ? trackingData.events : [];
  if (backendEvents.length) {
    const updatesList = document.getElementById('updates-list');
    if (updatesList) {
      updatesList.innerHTML = backendEvents.map(ev => `
        <div class="update-item">
          <div class="update-time">${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}</div>
          <div class="update-content"><p>${ev.message || ev.status || ''}</p></div>
        </div>
      `).join('');
    }
  }

  const invoiceActions = document.getElementById('tracking-invoice-actions');
  const invoiceButton = document.getElementById('tracking-invoice-button');
  if (invoiceActions && invoiceButton && order.id) {
    window.currentTrackingOrder = order;
    invoiceButton.onclick = () => downloadOrderInvoice(order.id);
    invoiceActions.style.display = 'flex';
  }

  resultsDiv.style.display = 'block';
  resultsDiv.scrollIntoView({ behavior: 'smooth' });

  updateTrackingDetails(order);
  renderOrderItems(order);

  const shipmentExt = order.shipmentExtended;
  if (shipmentExt) {
    renderDeliveryPartner(shipmentExt);
    renderTrackingMap(shipmentExt);
    renderETACard(shipmentExt);
  }

  startAutoRefresh(order);
}

function renderDeliveryPartner(shipmentData) {
  const section = document.getElementById('delivery-partner-section');
  if (!section) return;

  const partner = shipmentData.deliveryPartner;
  if (!partner || !partner.name) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  section.innerHTML = `
    <div class="delivery-partner-card">
      <div class="partner-avatar"><i class="fas fa-user"></i></div>
      <div class="partner-info">
        <h4>${partner.name}</h4>
        <p>${partner.vehicleType || 'Delivery Partner'}${partner.vehicleNumber ? ` | ${partner.vehicleNumber}` : ''}</p>
      </div>
      ${partner.phone ? `<a href="tel:${partner.phone}" class="partner-call" title="Call driver"><i class="fas fa-phone"></i></a>` : ''}
    </div>
  `;
}

function renderETACard(shipmentData) {
  const etaCard = document.getElementById('eta-card');
  if (!etaCard) return;

  const hasLocation = shipmentData.currentLocation?.latitude && shipmentData.currentLocation?.longitude;
  if (!hasLocation && !shipmentData.estimatedDelivery) {
    etaCard.style.display = 'none';
    return;
  }

  etaCard.style.display = 'grid';

  const distanceEl = document.getElementById('tracking-distance');
  const etaEl = document.getElementById('tracking-eta');
  const locationEl = document.getElementById('tracking-current-location');
  const driverEl = document.getElementById('tracking-driver-contact');

  if (distanceEl) {
    distanceEl.textContent = shipmentData.currentLocation?.address ? 'In Transit' : '--';
  }
  if (etaEl) {
    etaEl.textContent = shipmentData.estimatedDelivery
      ? new Date(shipmentData.estimatedDelivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '--';
  }
  if (locationEl) {
    locationEl.textContent = shipmentData.currentLocation?.address || '--';
    if (locationEl.textContent.length > 20) {
      locationEl.textContent = locationEl.textContent.substring(0, 18) + '...';
      locationEl.title = shipmentData.currentLocation.address;
    }
  }
  if (driverEl) {
    driverEl.textContent = shipmentData.deliveryPartner?.phone || '--';
  }
}

function renderTrackingMap(shipmentData) {
  const mapContainer = document.getElementById('tracking-map-container');
  if (!mapContainer) return;

  const hasDeliveryLocation = shipmentData.currentLocation?.latitude && shipmentData.currentLocation?.longitude;
  const hasDestination = shipmentData.deliveryAddress?.latitude && shipmentData.deliveryAddress?.longitude;

  if (!hasDeliveryLocation && !hasDestination) {
    mapContainer.style.display = 'none';
    return;
  }

  mapContainer.style.display = 'block';

  const centerLat = hasDeliveryLocation ? shipmentData.currentLocation.latitude : (hasDestination ? shipmentData.deliveryAddress.latitude : 28.6139);
  const centerLng = hasDeliveryLocation ? shipmentData.currentLocation.longitude : (hasDestination ? shipmentData.deliveryAddress.longitude : 77.2090);

  if (trackingMap) {
    trackingMap.remove();
    trackingMap = null;
  }

  setTimeout(() => {
    try {
      trackingMap = L.map('tracking-map').setView([centerLat, centerLng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(trackingMap);

      const deliveryIcon = L.divIcon({
        html: '<div style="background:#5c7c63;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: ''
      });

      const destIcon = L.divIcon({
        html: '<div style="background:#e74c3c;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        className: ''
      });

      if (hasDeliveryLocation) {
        deliveryMarker = L.marker([shipmentData.currentLocation.latitude, shipmentData.currentLocation.longitude], { icon: deliveryIcon })
          .addTo(trackingMap)
          .bindPopup(`<b>Delivery Partner</b><br>${shipmentData.currentLocation.address || 'Current location'}`);
      }

      if (hasDestination) {
        destinationMarker = L.marker([shipmentData.deliveryAddress.latitude, shipmentData.deliveryAddress.longitude], { icon: destIcon })
          .addTo(trackingMap)
          .bindPopup('<b>Your Location</b><br>Delivery address');
      }

      if (hasDeliveryLocation && hasDestination) {
        const latlngs = [
          [shipmentData.currentLocation.latitude, shipmentData.currentLocation.longitude],
          [shipmentData.deliveryAddress.latitude, shipmentData.deliveryAddress.longitude]
        ];
        routeLine = L.polyline(latlngs, { color: '#5c7c63', weight: 3, opacity: 0.7, dashArray: '8, 8' }).addTo(trackingMap);

        const bounds = L.latLngBounds(latlngs);
        trackingMap.fitBounds(bounds, { padding: [40, 40] });
      }
    } catch (mapErr) {
      console.error('Map initialization failed:', mapErr);
      mapContainer.style.display = 'none';
    }
  }, 100);
}

function startAutoRefresh(order) {
  if (trackingInterval) clearInterval(trackingInterval);

  if (!order.orderNumber) return;

  trackingInterval = setInterval(async () => {
    try {
      const shipmentData = await loadShipmentTracking(order.orderNumber);
      if (shipmentData) {
        if (shipmentData.status !== order.status) {
          order.status = shipmentData.status;
          renderOrderTimelineSteps(shipmentData.status);
        }

        if (shipmentData.currentLocation?.latitude) {
          updateMapPosition(shipmentData.currentLocation.latitude, shipmentData.currentLocation.longitude, shipmentData.currentLocation.address);
        }

        if (shipmentData.events?.length) {
          const updatesList = document.getElementById('updates-list');
          if (updatesList) {
            updatesList.innerHTML = shipmentData.events.map(ev => `
              <div class="update-item">
                <div class="update-time">${ev.timestamp ? new Date(ev.timestamp).toLocaleString() : ''}</div>
                <div class="update-content"><p>${ev.message || ev.status || ''}</p></div>
              </div>
            `).join('');
          }
        }

        renderDeliveryPartner(shipmentData);
        renderETACard(shipmentData);
      }
    } catch (err) {
      console.warn('Auto-refresh failed:', err);
    }
  }, 30000);
}

function updateMapPosition(lat, lng, address) {
  if (!trackingMap || !deliveryMarker) return;
  deliveryMarker.setLatLng([lat, lng]);
  if (address) {
    deliveryMarker.setPopupContent(`<b>Delivery Partner</b><br>${address}`);
  }
  if (routeLine && destinationMarker) {
    const destLatLng = destinationMarker.getLatLng();
    routeLine.setLatLngs([[lat, lng], [destLatLng.lat, destLatLng.lng]]);
  }
}

function renderOrderTimelineSteps(status) {
  const container = document.querySelector('.status-timeline');
  if (!container) return;

  const steps = [
    { key: 'placed', label: 'Order Placed', icon: 'fa-receipt' },
    { key: 'processing', label: 'Processing', icon: 'fa-cog' },
    { key: 'packed', label: 'Packed', icon: 'fa-box' },
    { key: 'shipped', label: 'Shipped', icon: 'fa-truck' },
    { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'fa-route' },
    { key: 'delivered', label: 'Delivered', icon: 'fa-circle-check' },
  ];

  const statusOrder = ['pending', 'placed', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  const currentIdx = statusOrder.indexOf(status);
  const activeIdx = Math.max(0, currentIdx);

  const stepsHtml = steps.map((step, i) => {
    let cls = 'pending';
    if (i < activeIdx) cls = 'completed';
    else if (i === activeIdx) cls = 'active';
    return `
      <div class="timeline-item ${cls}">
        <div class="timeline-icon"><i class="fas ${step.icon}"></i></div>
        <div class="timeline-content">
          <h4>${step.label}</h4>
          <p>${cls === 'completed' ? 'Completed' : cls === 'active' ? 'Current step' : 'Pending'}</p>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<h3>Order Status Timeline</h3><div class="steps-timeline">${stepsHtml}</div>`;
}

function renderOrderItems(order) {
  const container = document.getElementById('tracking-order-items');
  if (!container || !order.items || !order.items.length) {
    if (container) container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = order.items.map(item => `
    <div class="tracking-order-item">
      <span>${item.name}${item.variant && item.variant !== 'Standard' ? ' — ' + item.variant : ''} × ${item.quantity}</span>
      <span>${formatCurrency(item.price * item.quantity)}</span>
    </div>
  `).join('');
}

function updateTimelineStatus(status) {
  renderOrderTimelineSteps(status);
}

function updateTrackingDetails(order) {
  const trackingSource = order.shipmentExtended || order.shipment || order;

  const currentLocationEl = document.getElementById('current-location');
  const distanceRemainingEl = document.getElementById('distance-remaining');
  const etaEl = document.getElementById('eta');
  const driverContactEl = document.getElementById('driver-contact');

  if (currentLocationEl) {
    currentLocationEl.textContent = trackingSource.currentLocation?.address || trackingSource.location?.address || 'Awaiting location update';
  }
  if (distanceRemainingEl) {
    distanceRemainingEl.textContent = 'In Transit';
  }
  if (etaEl) {
    const etaDate = trackingSource.estimatedDelivery ? new Date(trackingSource.estimatedDelivery) : null;
    etaEl.textContent = etaDate ? etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Calculating...';
  }
  if (driverContactEl) {
    driverContactEl.textContent = trackingSource.deliveryPartner?.phone || 'Not assigned';
  }
}

function showTrackingMessage(message, isError = false) {
  const messageEl = document.getElementById('tracking-message');
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
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
window.showTrackingMessage = showTrackingMessage;

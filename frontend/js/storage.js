window.AUTH_USER_KEY = 'papjoy-user';
window.AUTH_TOKEN_KEY = 'papjoy-token';
window.AUTH_REFRESH_TOKEN_KEY = 'papjoy-refresh-token';
var AUTH_USER_KEY = window.AUTH_USER_KEY;
var AUTH_TOKEN_KEY = window.AUTH_TOKEN_KEY;
var AUTH_REFRESH_TOKEN_KEY = window.AUTH_REFRESH_TOKEN_KEY;

function getCurrentUser() {
  const sessionUser = JSON.parse(sessionStorage.getItem(AUTH_USER_KEY) || 'null');
  if (sessionUser) return sessionUser;
  return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
}

function getAuthToken() {
  const sessionToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (sessionToken) return sessionToken;
  const localToken = localStorage.getItem(AUTH_TOKEN_KEY);
  if (localToken) return localToken;
  const user = getCurrentUser();
  return user?.token || null;
}

function getRefreshToken() {
  const sessionToken = sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (sessionToken) return sessionToken;
  const localToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  if (localToken) return localToken;
  const user = getCurrentUser();
  return user?.refreshToken || null;
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function setCurrentUser(user, remember = true) {
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  remoteCartLoaded = false;

  if (!user) return;

  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (user.token) {
    storage.setItem(AUTH_TOKEN_KEY, user.token);
  }
  if (user.refreshToken) {
    storage.setItem(AUTH_REFRESH_TOKEN_KEY, user.refreshToken);
  }

  updateUserLinks();
}

function getLocalOrders() {
  return JSON.parse(localStorage.getItem('papjoy-orders') || '[]');
}

function saveLocalOrders(orders) {
  localStorage.setItem('papjoy-orders', JSON.stringify(orders));
}

function getLocalOrder(orderId, email) {
  const orders = getLocalOrders();
  return orders.find((order) => order.id === orderId && (!email || order.email === email));
}

function storeLocalOrder(order) {
  const orders = getLocalOrders();
  orders.push(order);
  saveLocalOrders(orders);
}

window.getCurrentUser = getCurrentUser;
window.getAuthToken = getAuthToken;
window.getRefreshToken = getRefreshToken;
window.getAuthHeaders = getAuthHeaders;
window.setCurrentUser = setCurrentUser;
window.getLocalOrders = getLocalOrders;
window.saveLocalOrders = saveLocalOrders;
window.getLocalOrder = getLocalOrder;
window.storeLocalOrder = storeLocalOrder;

async function searchProducts(searchParams = {}) {
  const {
    q = '',
    category = '',
    priceMin = 0,
    priceMax = 500000,
    size = '',
    color = '',
    brand = '',
    sort = 'newest',
    limit = 20,
    page = 1,
    inStock = false,
    signal = null
  } = searchParams;

  const queryParams = new URLSearchParams({
    q, category, priceMin, priceMax, size, color, brand, sort, limit, page,
    inStock: inStock ? 'true' : 'false'
  });

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/search?${queryParams.toString()}`, { timeout: 5000, signal });
    if (!response.ok) return { products: [], pagination: {} };
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    console.error('Search failed:', error);
    return { products: [], pagination: {} };
  }
}

async function loadFilterOptions(category = '') {
  const queryParams = category ? `?category=${encodeURIComponent(category)}` : '';
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/filters/options${queryParams}`, { timeout: 5000 });
    if (!response.ok) return { brands: [], sizes: [], colors: [], priceRange: { min: 0, max: 0 } };
    return await response.json();
  } catch (error) {
    console.error('Failed to load filters:', error);
    return { brands: [], sizes: [], colors: [], priceRange: { min: 0, max: 0 } };
  }
}

async function loadProductReviews(productId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/reviews/${productId}`, { timeout: 5000 });
    if (!response.ok) return { reviews: [], pagination: {} };
    return await response.json();
  } catch (error) {
    console.error('Failed to load reviews:', error);
    return { reviews: [], pagination: {} };
  }
}

async function loadRatingSummary(productId) {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/products/${productId}/rating-summary`, { timeout: 5000 });
    if (!response.ok) return { averageRating: 0, totalReviews: 0, breakdown: {} };
    return await response.json();
  } catch (error) {
    console.error('Failed to load rating summary:', error);
    return { averageRating: 0, totalReviews: 0, breakdown: {} };
  }
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { response, data } = await apiFetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok || !data?.token) {
      signOut();
      return null;
    }

    const currentUser = getCurrentUser() || {};
    const remember = !!localStorage.getItem(AUTH_TOKEN_KEY) || !!localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
    const updatedUser = { ...currentUser, token: data.token, refreshToken: data.refreshToken || refreshToken };
    setCurrentUser(updatedUser, remember);
    return data.token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    signOut();
    return null;
  }
}

async function apiRequest(path, options = {}, retry = true) {
  const url = apiUrl(path);
  const headers = { ...(options.headers || {}) };
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && retry && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      return await apiRequest(path, { ...options, headers }, false);
    }
  }
  return response;
}

async function syncUserProfile() {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(apiUrl('/api/v1/auth/me'), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return null;
    const data = await safeParseJson(response);
    if (!data || !data.email) return null;

    const remember = !!localStorage.getItem('papjoy-token');
    const updatedUser = {
      token,
      id: data.id || data._id,
      _id: data._id || data.id,
      email: data.email,
      name: data.name || '',
      role: data.role || 'customer',
      shippingAddress: data.shippingAddress || {},
      addresses: data.addresses || [],
      createdAt: data.createdAt || '',
      phone: data.phone || ''
    };
    setCurrentUser(updatedUser, remember);
    return updatedUser;
  } catch (error) {
    console.error('Failed to sync profile:', error);
    return null;
  }
}

window.searchProducts = searchProducts;
window.loadFilterOptions = loadFilterOptions;
window.loadProductReviews = loadProductReviews;
window.loadRatingSummary = loadRatingSummary;
window.refreshAccessToken = refreshAccessToken;
window.apiRequest = apiRequest;
window.syncUserProfile = syncUserProfile;

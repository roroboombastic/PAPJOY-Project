async function initGoogleSignIn(buttonId, rememberCheckboxId) {
  const buttonContainer = document.getElementById(buttonId);
  if (!buttonContainer) return;

  try {
    const { response, data: config } = await apiFetch('/api/v1/auth/google-config');
    if (!response.ok || !config?.clientId) {
      buttonContainer.style.display = 'none';
      return;
    }

    const clientId = config.clientId;
    await loadScript('https://accounts.google.com/gsi/client');
    if (!window.google?.accounts?.id) {
      buttonContainer.style.display = 'none';
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        const remember = document.getElementById(rememberCheckboxId)?.checked;
        try {
          const { response: tokenResponse, data } = await apiFetch('/api/v1/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: response.credential })
          });
          if (!tokenResponse.ok) {
            throw new Error(data?.error || data?.message || 'Google login failed');
          }
          const userData = data.user ? { ...data.user, token: data.token, refreshToken: data.refreshToken } : { ...data, token: data.token, refreshToken: data.refreshToken };
          setCurrentUser(userData, remember);
          window.location.href = 'account.html';
        } catch (error) {
          console.error('Google sign-in error:', error);
          const statusMessage = document.getElementById('auth-message');
          if (statusMessage) {
            statusMessage.textContent = 'Google sign-in failed. Please try again.';
            statusMessage.style.color = '#ff8b94';
          }
        }
      }
    });

    window.google.accounts.id.renderButton(buttonContainer, {
      theme: 'outline',
      size: 'large',
      width: '100%'
    });
  } catch (error) {
    console.error('Google auth initialization error:', error);
    if (buttonContainer) buttonContainer.style.display = 'none';
  }
}

async function signOut() {
  const token = getAuthToken();
  if (token) {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.warn('Logout request did not complete:', error);
    }
  }

  setCurrentUser(null);
  remoteCartLoaded = false;
  wishlistUpdated = false;
  window.location.href = 'signin.html';
}

async function submitReview(productId, { rating, title, comment, images = [] }) {
  const user = getCurrentUser();
  if (!user) {
    showToast('❌ Please sign in to leave a review');
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
      body: JSON.stringify({ productId, rating: Number(rating), title, comment, images })
    });

    if (!response.ok) {
      const err = await response.json();
      showToast(`❌ ${err.error || 'Failed to submit review'}`);
      return false;
    }

    showToast('✅ Review submitted successfully!');
    return true;
  } catch (error) {
    console.error('Review submission error:', error);
    showToast('❌ Error submitting review');
    return false;
  }
}

async function updateUserProfile(profileUpdates) {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(profileUpdates)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update profile');
    }

    const updatedUser = await response.json();
    const remember = !!localStorage.getItem('papjoy-token');
    const savedUser = getCurrentUser() || {};
    const finalUser = { ...savedUser, ...updatedUser, token };
    setCurrentUser(finalUser, remember);
    return finalUser;
  } catch (error) {
    console.error('Profile update failed:', error);
    throw error;
  }
}

async function loadUserAddresses() {
  const token = getAuthToken();
  if (!token) return [];

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json().catch(() => null);
      return Array.isArray(data) ? data : (data?.addresses || []);
    }
  } catch (error) {
    console.error('Failed to load addresses:', error);
  }
  return [];
}

async function addUserAddress(addressData) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(addressData)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to add address');
  }
  return await response.json();
}

async function updateUserAddress(addressId, addressData) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses/${addressId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(addressData)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to update address');
  }
  return await response.json();
}

async function deleteUserAddress(addressId) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/addresses/${addressId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete address');
  }
  return await response.json();
}

async function restoreSessionFromStorage() {
  const storedUser = getCurrentUser();
  const storedToken = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
  const storedRefreshToken = localStorage.getItem(AUTH_REFRESH_TOKEN_KEY) || sessionStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  
  if ((storedUser && !storedToken) || (!storedUser && storedToken)) {
    setCurrentUser(null);
    return;
  }

  if (storedUser && storedToken) {
    const remember = !!localStorage.getItem(AUTH_TOKEN_KEY);
    const user = { ...storedUser, token: storedToken };
    if (storedRefreshToken) {
      user.refreshToken = storedRefreshToken;
    }
    setCurrentUser(user, remember);
    
    try {
      const latestProfile = await syncUserProfile();
      if (!latestProfile) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
          signOut();
        }
      }
    } catch (error) {
      console.warn('Failed to sync profile on restore:', error);
    }
  }
}

window.initGoogleSignIn = initGoogleSignIn;
window.signOut = signOut;
window.submitReview = submitReview;
window.updateUserProfile = updateUserProfile;
window.loadUserAddresses = loadUserAddresses;
window.addUserAddress = addUserAddress;
window.updateUserAddress = updateUserAddress;
window.deleteUserAddress = deleteUserAddress;
window.restoreSessionFromStorage = restoreSessionFromStorage;

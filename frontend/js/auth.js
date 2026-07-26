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

async function changeUserPassword(currentPassword, newPassword) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to change password');
  }
  return await response.json();
}

async function deleteUserAccount(password) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password: password || undefined })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete account');
  }
  return await response.json();
}

async function setAddressAsDefault(addressId) {
  return await updateUserAddress(addressId, { isDefault: true });
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
window.changeUserPassword = changeUserPassword;
window.deleteUserAccount = deleteUserAccount;
window.setAddressAsDefault = setAddressAsDefault;
window.restoreSessionFromStorage = restoreSessionFromStorage;

// ============================================================================
// LOGIN / REGISTER FORM HANDLERS
// ============================================================================

async function login(event) {
  event.preventDefault();
  const messageEl = document.getElementById('auth-message');
  const submitBtn = event.target.querySelector('button[type="submit"]');

  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const remember = document.getElementById('remember')?.checked || false;

  if (!email || !password) {
    if (messageEl) { messageEl.textContent = 'Please fill in all fields.'; messageEl.style.color = '#ff8b94'; }
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Signing in...'; }
  if (messageEl) { messageEl.textContent = ''; }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Login failed');
    }

    const userData = data.user
      ? { ...data.user, token: data.token, refreshToken: data.refreshToken }
      : { ...data, token: data.token, refreshToken: data.refreshToken };

    setCurrentUser(userData, remember);
    window.location.href = 'account.html';
  } catch (error) {
    console.error('Login error:', error);
    if (messageEl) {
      messageEl.textContent = error.message || 'Login failed. Please try again.';
      messageEl.style.color = '#ff8b94';
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Continue'; }
  }
}

async function register(event) {
  event.preventDefault();
  const messageEl = document.getElementById('signup-message');
  const submitBtn = event.target.querySelector('button[type="submit"]');

  const name = document.getElementById('name')?.value?.trim();
  const email = document.getElementById('signup-email')?.value?.trim();
  const phone = document.getElementById('signup-phone')?.value?.trim();
  const password = document.getElementById('signup-password')?.value;
  const confirmPassword = document.getElementById('confirm-password')?.value;
  const remember = document.getElementById('remember-signup')?.checked || false;
  const marketing = document.getElementById('marketing')?.checked || false;
  const terms = document.getElementById('terms')?.checked || false;

  if (!name || !email || !password) {
    if (messageEl) { messageEl.textContent = 'Please fill in all required fields.'; messageEl.style.color = '#ff8b94'; }
    return;
  }

  if (password !== confirmPassword) {
    if (messageEl) { messageEl.textContent = 'Passwords do not match.'; messageEl.style.color = '#ff8b94'; }
    return;
  }

  if (password.length < 8) {
    if (messageEl) { messageEl.textContent = 'Password must be at least 8 characters.'; messageEl.style.color = '#ff8b94'; }
    return;
  }

  if (!terms) {
    if (messageEl) { messageEl.textContent = 'You must agree to the Terms of Service.'; messageEl.style.color = '#ff8b94'; }
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating account...'; }
  if (messageEl) { messageEl.textContent = ''; }

  try {
    const body = { name, email, password, marketingOptIn: marketing };
    if (phone) body.phone = phone;

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Registration failed');
    }

    const userData = data.user
      ? { ...data.user, token: data.token, refreshToken: data.refreshToken }
      : { ...data, token: data.token, refreshToken: data.refreshToken };

    setCurrentUser(userData, remember);
    window.location.href = 'account.html';
  } catch (error) {
    console.error('Registration error:', error);
    if (messageEl) {
      messageEl.textContent = error.message || 'Registration failed. Please try again.';
      messageEl.style.color = '#ff8b94';
    }
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create account'; }
  }
}

function togglePasswordField(toggleBtn) {
  const field = toggleBtn.previousElementSibling || toggleBtn.closest('.password-field')?.querySelector('input');
  if (!field) return;
  const isPassword = field.type === 'password';
  field.type = isPassword ? 'text' : 'password';
  const icon = toggleBtn.querySelector('i');
  if (icon) {
    icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
  } else {
    toggleBtn.textContent = isPassword ? 'Hide' : 'Show';
  }
}

function initPasswordStrength() {
  const passwordInput = document.getElementById('signup-password');
  const fill = document.getElementById('signup-password-strength-fill');
  const text = document.getElementById('signup-password-strength-text');
  if (!passwordInput || !fill || !text) return;

  passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;
    let strength = 0;
    if (val.length >= 8) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;

    const levels = [
      { width: '0%', color: 'transparent', label: 'Use 8+ characters with a mix of letters, numbers, and symbols.' },
      { width: '25%', color: '#e74c3c', label: 'Weak — add more character types.' },
      { width: '50%', color: '#f39c12', label: 'Fair — getting better.' },
      { width: '75%', color: '#2ecc71', label: 'Good — almost there.' },
      { width: '100%', color: '#27ae60', label: 'Strong password!' }
    ];
    const level = levels[strength];
    fill.style.width = level.width;
    fill.style.backgroundColor = level.color;
    text.textContent = level.label;
  });
}

window.login = login;
window.register = register;
window.togglePasswordField = togglePasswordField;

document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', login);
    const passwordToggle = document.getElementById('password-toggle');
    if (passwordToggle) {
      passwordToggle.addEventListener('click', () => togglePasswordField(passwordToggle));
    }
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', register);

    ['signup-password-toggle', 'confirm-password-toggle'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => togglePasswordField(btn));
    });

    initPasswordStrength();
  }
});

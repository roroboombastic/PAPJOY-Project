const API_BASE = 'https://papjoy-project.onrender.com';
const STORE_URL = 'https://papjoy-project.onrender.com/';
const STORAGE_KEY = 'papjoyAuth';

const $ = (id) => document.getElementById(id);

const auth = {
  async get() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || null;
  },
  async set(value) {
    await chrome.storage.local.set({ [STORAGE_KEY]: value });
  },
  async clear() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
};

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

document.addEventListener('DOMContentLoaded', init);

function init() {
  $('open-store').addEventListener('click', () => chrome.tabs.create({ url: STORE_URL }));
  $('sign-out').addEventListener('click', onSignOut);
  $('refresh').addEventListener('click', () => loadNotifications());
  $('login-form').addEventListener('submit', onLogin);
  initAuth();
}

async function initAuth() {
  const saved = await auth.get();
  if (saved && saved.token) {
    showSignedIn(saved.user);
    loadNotifications();
  } else {
    showSignedOut();
  }
}

function showSignedOut() {
  $('signed-out').classList.remove('hidden');
  $('signed-in').classList.add('hidden');
}

function showSignedIn(user) {
  $('signed-out').classList.add('hidden');
  $('signed-in').classList.remove('hidden');
  $('user-name').textContent = (user && (user.name || user.email)) || 'Signed in';
}

async function onLogin(event) {
  event.preventDefault();
  const email = $('email').value.trim();
  const password = $('password').value;
  const errorEl = $('login-error');
  errorEl.classList.add('hidden');

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    errorEl.classList.remove('hidden');
    return;
  }

  $('login-btn').disabled = true;
  $('login-btn').textContent = 'Signing in…';
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) {
      errorEl.textContent = data.error || 'Sign-in failed. Check your credentials.';
      errorEl.classList.remove('hidden');
      return;
    }
    await auth.set({ token: data.token, user: data.user || { email } });
    showSignedIn(data.user);
    loadNotifications();
  } catch (e) {
    errorEl.textContent = 'Network error. Please try again.';
    errorEl.classList.remove('hidden');
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Sign in';
  }
}

async function onSignOut() {
  await auth.clear();
  $('password').value = '';
  showSignedOut();
}

async function loadNotifications() {
  const saved = await auth.get();
  const listEl = $('notification-list');
  if (!saved || !saved.token) return;

  let list;
  try {
    const res = await fetch(`${API_BASE}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${saved.token}` },
      credentials: 'include'
    });
    if (!res.ok) throw new Error('failed');
    list = await res.json();
  } catch (e) {
    listEl.innerHTML = '<li class="empty">Could not load notifications.</li>';
    return;
  }
  if (!Array.isArray(list) || list.length === 0) {
    listEl.innerHTML = '<li class="empty">No notifications yet.</li>';
    return;
  }

  listEl.innerHTML = '';
  list.slice(0, 30).forEach((n) => {
    const li = document.createElement('li');
    li.className = n.isRead ? '' : 'unread';
    const title = n.title || 'PAP-JOY';
    const msg = n.message || '';
    const time = timeAgo(n.createdAt);
    li.innerHTML = `
      <div class="n-title">${escapeHTML(title)}</div>
      <div class="n-msg">${escapeHTML(msg)}</div>
      <div class="n-time">${escapeHTML(time)}</div>
    `;
    li.addEventListener('click', () => markRead(n._id, li));
    listEl.appendChild(li);
  });
}

async function markRead(id, li) {
  const saved = await auth.get();
  if (!saved || !saved.token || !id) return;
  try {
    await fetch(`${API_BASE}/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved.token}` },
      credentials: 'include'
    });
    li.classList.remove('unread');
  } catch (e) { /* ignore */ }
}

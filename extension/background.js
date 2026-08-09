const API_BASE = 'https://papjoy-project.onrender.com';
const STORE_URL = 'https://papjoy-project.onrender.com/';
const ALARM_NAME = 'papjoy-poll';
const POLL_MINUTES = 5;
const MAX_DESKTOP_NOTIFICATIONS = 5;

chrome.runtime.onInstalled.addListener((details) => {
  ensureAlarm();
  if (details.reason === 'install') {
    chrome.storage.local.set({ papjoyLastSeen: 0 });
  }
});

chrome.runtime.onStartup.addListener(ensureAlarm);

function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: POLL_MINUTES });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) pollNotifications();
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  if (id && id.startsWith('papjoy-n-')) {
    const orderNumber = id.split(':')[1];
    const url = orderNumber
      ? `${STORE_URL}tracking.html?orderNumber=${encodeURIComponent(orderNumber)}`
      : STORE_URL;
    chrome.tabs.create({ url });
  }
});

async function getAuth() {
  const data = await chrome.storage.local.get('papjoyAuth');
  return data.papjoyAuth || null;
}

async function pollNotifications() {
  const auth = await getAuth();
  if (!auth || !auth.token) return;

  let list;
  try {
    const res = await fetch(`${API_BASE}/api/v1/notifications`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      credentials: 'include'
    });
    if (!res.ok) return;
    list = await res.json();
  } catch (e) {
    return;
  }
  if (!Array.isArray(list)) return;

  const unread = list.filter((n) => !n.isRead);
  const badge = unread.length;
  chrome.action.setBadgeBackgroundColor({ color: '#5c7c63' });
  chrome.action.setBadgeText({ text: badge > 0 ? String(Math.min(badge, 99)) : '' });

  const stored = await chrome.storage.local.get('papjoyLastSeen');
  const lastSeen = stored.papjoyLastSeen || 0;
  const fresh = unread.filter((n) => {
    const t = n.createdAt ? new Date(n.createdAt).getTime() : 0;
    return t > lastSeen;
  });

  if (fresh.length > 0) {
    fresh.slice(0, MAX_DESKTOP_NOTIFICATIONS).forEach((n) => {
      const orderNumber = (n.data && n.data.orderNumber) || '';
      const id = 'papjoy-n-' + (n._id || Date.now()) + (orderNumber ? ':' + encodeURIComponent(orderNumber) : '');
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: n.title || 'PAP-JOY',
        message: n.message || 'You have a new update.',
        priority: 1
      });
    });
    chrome.storage.local.set({ papjoyLastSeen: Date.now() });
  }
}

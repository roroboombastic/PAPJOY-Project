function onPageError(event) {
  console.error('Frontend runtime error', event.error || event.message || event);
}
function onUnhandledRejection(event) {
  console.error('Unhandled promise rejection', event.reason);
}
window.addEventListener('error', onPageError);
window.addEventListener('unhandledrejection', onUnhandledRejection);

window.addEventListener('pagehide', () => {
  window.removeEventListener('error', onPageError);
  window.removeEventListener('unhandledrejection', onUnhandledRejection);
  if (syncCartTimer) clearTimeout(syncCartTimer);
  syncCartImmediate();
  if (trackingInterval) clearInterval(trackingInterval);
  productsLoadPromise = null;
  wishlistUpdated = false;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('mobile-nav-open')) {
    closeMobileSidebar();
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  await restoreSessionFromStorage();
  createSidebar();
  createLocaleSwitcher();
  updateUserLinks();
  initCookieConsent();
  initPageTransitions();

  if (document.body.dataset.page === 'tracking') {
    initTrackingPage();
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => renderPage().catch(console.error));
  } else {
    setTimeout(() => renderPage().catch(console.error), 200);
  }
});

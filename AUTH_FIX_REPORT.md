# Auth Fix Report

## Summary
Consolidated duplicate auth logic in `frontend/script.js`. Removed 3 functions, cleaned up 6 others, decoupled auth from cart, removed diagnostic logging.

## Changes

### Removed Functions (3)
| Function | Reason |
|---|---|
| `logAuthDiagnostic()` | Removed 8 call sites, unnecessary console noise |
| `getStoredUser()` | Merged inline into `getCurrentUser()` |
| `setCurrentUserAndSyncCart()` | Decoupled auth from cart; callers now use `setCurrentUser()` directly |

### Cleaned Functions (6)
| Function | Changes |
|---|---|
| `getCurrentUser()` | Now inlines the sessionStorage/localStorage read logic directly |
| `setCurrentUser()` | Removed `logAuthDiagnostic` call and `user.cart` merge; keeps `remoteCartLoaded = false` |
| `refreshAccessToken()` | Minor cleanup, now preserves new refreshToken from server response |
| `syncUserProfile()` | Removed 3 `logAuthDiagnostic` calls |
| `signOut()` | Removed `cart = []`, `saveCart()`, `await syncCart()`, and `logAuthDiagnostic` — no longer touches cart |
| `restoreSessionFromStorage()` | Removed 2 `logAuthDiagnostic` calls, uses `getCurrentUser()` instead of `getStoredUser()` |

### Fixed Form Handlers (2)
| Handler | Changes |
|---|---|
| `renderSignInPage` | Removed `logAuthDiagnostic` call and `await loadUserCart()` — auth no longer triggers cart sync on login |
| `renderSignUpPage` | Removed `await loadUserCart()` — auth no longer triggers cart sync on signup |

### Preserved (Unchanged)
- `getAuthToken()` — reads sessionStorage → localStorage → user object fallback
- `getRefreshToken()` — same pattern as getAuthToken
- `apiRequest()` — auto-attaches Bearer token, retries on 401
- `syncCartToServer()` — kept as cart utility (used elsewhere)
- `loadUserCart()` — kept as cart utility (called from `renderPage()` etc.)
- All backend files (`authController.js`, `auth.js` middleware, `auth.js` routes)
- All other HTML files
- Cart, products, payments, admin features

## Storage Strategy
- `localStorage` used when `remember = true` (persist across sessions)
- `sessionStorage` used when `remember = false` (session-only)
- Token fallback: sessionStorage → localStorage → user object token field

## Files Modified
- `frontend/script.js` — all auth consolidation changes

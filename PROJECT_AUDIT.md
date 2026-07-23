# PAPJOY — Full Project Audit Report

Generated: 2026-07-23

---

## 1. CRITICAL: Exposed Secret Credentials in Repository

### 1.1 Razorpay Live/Test API Keys in CSV

| File | Severity |
|------|----------|
| `Backend/razorpay_test_api_keys_1775654455088.csv` | **Critical** |

Contains `rzp_test_Sb0rWGzTw4jMos` and `NgQ7MwsCGajT8X3mS09iE4AZ` — test API keys committed to version control. Attackers can use these to interact with Razorpay.

**Fix**: Remove the file from git history, revoke the keys in Razorpay dashboard, add `*.csv` to `.gitignore`.

### 1.2 MongoDB Atlas Credentials in .env

| File | Severity |
|------|----------|
| `Backend/.env` (line 9) | **Critical** |

Contains live MongoDB Atlas URI with embedded password: `mongodb+srv://ariktaprakash_db_user:bpvsdadAvPKL3lrH@cluster0.cyezfwa.mongodb.net/...`

**Fix**: Remove from git, rotate the MongoDB password, add `.env` to `.gitignore`.

### 1.3 PayPal Live/Test Secrets in .env

| File | Severity |
|------|----------|
| `Backend/.env` (lines 33-34) | **Critical** |

Contains real PayPal client ID and secret:
`PAYPAL_CLIENT_ID=ATCF2_Thhma1nuo31bhn38eX78HrO_bC9TVKOdsudrbRVCl3G2OM-crWVqUg9msThCS0oWHtG8BVkHZT`
`PAYPAL_SECRET=EOciQJeoHY_PJSofitmU5r1L3m0O0WgOpurbseomsjQ_xEP5WCyor3P10V14hjix5Gg6KFvDEJ48mG7b`

**Fix**: Rotate PayPal credentials, remove .env from version control.

### 1.4 Weak/Root-Level .env JWT Secrets

| File | Severity |
|------|----------|
| `.env` (lines 5-6) | **Critical** |

```env
JWT_SECRET=supersecretkey_dev_only
JWT_REFRESH_SECRET=supersecretrefresh_dev_only
```

These are the **fallback values** hardcoded in `config.js`. If the production .env is missing, the app uses these.

**Fix**: Remove fallback values in `config.js`, crash if `JWT_SECRET` is not set in production.

---

## 2. DUPLICATE PROJECT: Orphaned shoe-store React App

| File | Severity |
|------|----------|
| `Backend/shoe-store/` (entire directory) | **High** |

A completely separate React + Vite project (`shoe-store`) lives inside `Backend/`. Its `App.jsx` is the default Vite boilerplate — **entirely unrelated** to PAPJOY. Its `package.json` uses ESM (`"type": "module"`) while the main backend uses CommonJS.

**Fix**: Remove `Backend/shoe-store/`. It is dead code that bloats the repository.

---

## 3. DUPLICATE BACKEND SOURCE FILE

| File | Severity |
|------|----------|
| `Backend/arikta.txt` | **High** |

An 863-line file containing a **complete, outdated copy** of the Express backend. This is not imported by any module and serves only to confuse.

**Fix**: Delete `Backend/arikta.txt`.

---

## 4. DUPLICATE API CLIENT FUNCTIONS (Frontend)

| File | Severity |
|------|----------|
| `frontend/script.js` | **High** |

The file defines **four separate HTTP client utilities** with overlapping responsibilities:

| Function | Line | Purpose |
|----------|------|---------|
| `apiFetch(path, options)` | 49 | Fetches + parses JSON using `apiUrl()` |
| `fetchWithTimeout(resource, options)` | 85 | Fetch with AbortController timeout |
| `apiRequest(path, options, retry)` | 1588 | Fetch with auth header + auto token refresh |
| direct `fetch` calls | scattered | Dozens of raw `fetch()` calls bypassing all helpers |

Most frontend code calls `fetch(apiUrl(...))` directly **instead of** using `apiFetch` or `apiRequest`, meaning auth headers and retry logic are duplicated everywhere.

**Fix**: Consolidate into a single `apiClient` function. Replace all direct `fetch()` calls.

---

## 5. HARDCODED API BASE URL (Frontend)

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 10-22) | **High** |

```js
function getDefaultApiBaseUrl() {
  if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.__PAPJOY_API_BASE_URL) return window.__PAPJOY_API_BASE_URL;
  if (window.location.protocol === 'file:') return 'http://127.0.0.1:3000';
  if (window.location.hostname === '127.0.0.1' || ...) return 'http://127.0.0.1:3000';
  return 'https://papjoy-project.onrender.com';
}
```

Hardcoded production URL `https://papjoy-project.onrender.com` — changing deployment requires code changes. The same pattern is duplicated in every HTML file's inline `<script>` tag.

**Fix**: Use a build-time env var or a single config file loaded before script.js.

---

## 6. DUPLICATE API PATH FORMAT

| File | Severity |
|------|----------|
| `frontend/script.js` | **High** |

API paths are inconsistently formatted:

- `apiUrl('/api/v1/cart/sync')` → full URL
- `fetch(\`${API_BASE_URL}/api/v1/cart\`, ...)` → direct
- `apiFetch('/api/v1/auth/login', ...)` → via apiFetch
- `apiRequest('/api/cart/sync', ...)` → **missing `/v1`** (broken!)

**Identified broken path**: Line 1616 uses `/api/cart/sync` instead of `/api/v1/cart/sync`. This call will fail.

**Fix**: Normalize all paths to use a single helper. Use a constant for the API base path.

---

## 7. DUPLICATE CART IMPLEMENTATIONS

| File | Severity |
|------|----------|
| `frontend/script.js` (line 670) + `Backend/controllers/cartController.js` | **High** |

**Client-side cart**: `let cart = JSON.parse(localStorage.getItem('papjoy-cart'))` — stored in localStorage.
**Server-side cart**: `Cart` model in MongoDB with `userId` foreign key.

The sync mechanism (`syncCart()`, `syncCartToServer()`, `loadUserCart()`, `mergeServerCart()`) is fragile and called inconsistently — sometimes `syncCart()` is called, sometimes `syncCartToServer()`. Race conditions between local and remote state are likely.

**Fix**: Design a single source of truth. Either always use the server cart for logged-in users or always use local storage with batch upload.

---

## 8. DUPLICATE WISHLIST / SAVED ITEMS

| File | Severity |
|------|----------|
| `frontend/script.js` (line 679) + `Backend/controllers/wishlistController.js` | **High** |

**Client-side saved items**: `let savedItems = JSON.parse(localStorage.getItem('papjoy-saved')) || []`
**Server-side wishlist**: `Wishlist` model with `userId` and items array.

These represent the same concept but are treated as separate features. The `saveForLater()` function adds to `savedItems` and then calls `syncWishlistItem()` to mirror to the server wishlist, but the two lists can easily diverge.

**Fix**: Merge into one system — use the server wishlist as source of truth when authenticated.

---

## 9. MULTIPLE AUTHENTICATION STORAGE FUNCTIONS

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 1486-1586) | **Medium** |

Seven functions manage auth state:

| Function | Lines | Role |
|----------|-------|------|
| `getStoredUser()` | 1494 | Reads from sessionStorage then localStorage |
| `getCurrentUser()` | 1500 | Alias for getStoredUser |
| `getAuthToken()` | 1504 | Reads token from three possible places |
| `getRefreshToken()` | 1513 | Same pattern |
| `setCurrentUser()` | 1522 | Writes to both storage layers |
| `refreshAccessToken()` | 1560 | Refreshes JWT |
| `setCurrentUserAndSyncCart()` | 1605 | Combines setCurrentUser + sync |

Tokens can end up in sessionStorage, localStorage, both, or embedded in the user object. This makes logout and token refresh error-prone.

**Fix**: Consolidate into a single AuthService module with clear storage strategy (prefer sessionStorage, fall back to localStorage for "remember me").

---

## 10. DUPLICATE ROUTES (Backend)

| File | Severity |
|------|----------|
| `Backend/routes/products.js` (lines 10-11) | **Low** |

```js
router.get('/filters', productController.getFilterOptions);
router.get('/filters/options', productController.getFilterOptions);
```

Two different paths serve the exact same controller function.

**Fix**: Remove one of the duplicates.

---

## 11. SIDEBAR RENDERED TWICE

| File | Severity |
|------|----------|
| All `frontend/*.html` + `frontend/script.js` (`createSidebar()`) | **Medium** |

Every HTML page has the sidebar hardcoded in its body, **and** `createSidebar()` in `script.js` dynamically rebuilds it on page load. The static sidebar in HTML becomes dead weight once JS runs.

**Fix**: Remove sidebar HTML from all `.html` files. Let `createSidebar()` be the single source of truth.

---

## 12. MULTIPLE CHECKOUT FLOWS (Frontend)

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 2986-3401) | **Medium** |

Nine checkout functions:

| Function | Line | Real Backend? |
|----------|------|---------------|
| `startStripeCheckout()` | 2986 | Yes |
| `startPayPalCheckout()` | 3022 | Yes |
| `startRazorpayCheckout()` | 3058 | Yes |
| `submitWebOrder()` | 3161 | Yes |
| `startCODCheckout()` | 3208 | Yes |
| `startPaytmCheckout()` | 3260 | **No — simulated** |
| `startCreditCardCheckout()` | 3277 | **No — simulated + PCI violation** |
| `startDebitCardCheckout()` | 3340 | **No — simulated + PCI violation** |
| `startUPICheckout()` | 3775 | **No — simulated** |

Paytm, Credit Card, Debit Card, and UPI are all `setTimeout(2000)` simulations that create fake orders. The Credit/Debit card forms collect raw card numbers, expiry, and CVV — a **PCI DSS compliance violation**.

**Fix**: Remove simulated payment methods. Never collect raw card data on the frontend. Use a proper payment gateway for each method.

---

## 13. DUPLICATE calculateOrderTotals

| File | Severity |
|------|----------|
| `frontend/script.js` (line 2503) + `Backend/utils/gst.js` | **Medium** |

Both the frontend (`calculateOrderTotals`) and backend (`calculateOrderTotals` in `gst.js`) implement the same tax/shipping logic. This is a duplicate with potential for divergence.

**Fix**: Calculate totals only on the backend. Send raw items from the frontend.

---

## 14. BROKEN IMPORT / MISSING FILES

| File | Severity |
|------|----------|
| `Backend/routes/index.js` (line 8) | **Medium** |

```js
const { auth, optionalAuth } = require('../middlewares/auth');
```

The import is inside the router index rather than where these are used. `optionalAuth` is imported but only used inside `payments.js`. Not broken, but confusing.

More critically:

| File | Issue |
|------|-------|
| `Backend/server.js` (line 11) | `const { User, Product, Order } = require('./models');` — these are imported but only `mongoose` is used on line 43 |
| `Backend/routes/cart.js` | Line 9: `router.put('/', auth, cartController.syncCart)` — same function as `POST /sync` but different semantic verb |

**Fix**: Remove unused imports. Use proper HTTP semantics.

---

## 15. DEAD CODE FILES

| File | Severity | Reason |
|------|----------|--------|
| `audit_api.py` | Low | Python audit script, not part of the project |
| `audit_temp.py` | Low | Temp audit script |
| `audit_output.txt` | Low | Audit output |
| `test-e2e.js` | Low | Standalone test not referenced in any config |
| `test-invoice.js` | Low | Standalone test not referenced in any config |
| `Backend/tests/` | Low | Contains `paymentConfig.test.js` but no test runner in scripts |
| `Backend/test/` | Low | Contains `config.test.js` but no test runner in scripts |
| `frontend/tracking-test.html` | Low | Duplicate of tracking.html |
| `frontend/debug.html` | Low | Debug page, no production use |
| `frontend/setup-status.html` | Low | Setup page |
| `UPLOAD-FIX.bat` | Low | Windows batch file, not part of app |
| `DESIGN-FIXED.bat` | Low | Windows batch file |
| `DYNAMIC-UPLOAD.bat` | Low | Windows batch file |
| `ENHANCED-UPLOAD.bat` | Low | Windows batch file |
| `TODO.md` | Low | Internal notes |
| `frontend/TODO.md` | Low | Internal notes |
| `frontend/DESIGN-SYSTEM.md` | Low | Design document |
| `Backend/QUICK_START_SECURITY.md` | Low | Documentation |
| `Backend/SECURITY_AND_HTTPS_SETUP.md` | Low | Documentation |
| `Backend/SECURITY_IMPLEMENTATION.md` | Low | Documentation |
| `Backend/LOCAL_DEVELOPMENT.md` | Low | Documentation |

**Fix**: Remove all dead files and documentation from the production repo. Move documentation to a `/docs` folder if needed.

---

## 16. UNUSED HTML PAGES (No production links)

| File | Severity | Notes |
|------|----------|-------|
| `frontend/privacy.html` | Low | No navigation link exists |
| `frontend/terms.html` | Low | No navigation link exists |
| `frontend/cookies.html` | Low | No navigation link exists |
| `frontend/debug.html` | Low | No navigation link exists |
| `frontend/setup-status.html` | Low | No navigation link exists |
| `frontend/invoice-preview.html` | Low | Only used via query param redirect |
| `frontend/tracking-test.html` | Low | Duplicate of tracking.html |

**Fix**: Remove unused pages or add them to the navigation if needed.

---

## 17. DUAL BACKEND ENTRY POINT

| File | Severity |
|------|----------|
| `Backend/index.js` + `Backend/server.js` | **Low** |

`Backend/index.js` is only:
```js
require("./server");
```

`package.json` points `"main": "index.js"` and `"start": "node index.js"`. The index.js wrapper is unnecessary.

**Fix**: Set `"main": "server.js"` and `"start": "node server.js"`. Remove `index.js`.

---

## 18. MONGOOSE NOT USED PROPITIALLY

| File | Severity |
|------|----------|
| `Backend/server.js` (line 43) | **Medium** |

```js
app.use((req, res, next) => {
  if (req.method !== 'GET' && ... && mongoose.connection.readyState !== 1) {
    return res.status(503).json(...);
  }
  next();
});
```

This middleware checks `mongoose.connection.readyState` on every non-GET request. But `mongoose` is imported only in `server.js` (line 12) and not in `db.js` where connection management lives. The models are defined using Mongoose but the connection check creates tight coupling.

**Fix**: Move this check to a dedicated middleware that imports `mongoose` properly.

---

## 19. `body-parser` UNNECESSARY DEPENDENCY

| File | Severity |
|------|----------|
| `Backend/package.json` (line 21) | **Low** |

`body-parser` is listed as a dependency, but Express 4.16+ has built-in `express.json()` and `express.urlencoded()`, which the project already uses in `middlewares/security.js` (lines 60-61).

**Fix**: Remove `body-parser` from dependencies.

---

## 20. HSTS AND HELMET IN DEVELOPMENT

| File | Severity |
|------|----------|
| `Backend/middlewares/security.js` | **Low** |

```js
hsts: { maxAge: 63072000, includeSubDomains: true, preload: true }
```

HSTS is configured even in development mode. This can break local development on HTTP.

**Fix**: Only apply HSTS in production.

---

## 21. CREDIT CARD PCI COMPLIANCE VIOLATION

| File | Severity |
|------|----------|
| `frontend/checkout.html` (lines 166-219) + `frontend/script.js` (lines 3277-3442) | **Critical** |

Credit and Debit card forms collect:
- Full card number
- Expiry date (MM/YY)
- CVV/CVC code
- Cardholder name

These fields are sent to the backend as `cardInfo` in the order data and stored in `Order` documents. **This is a direct violation of PCI DSS Requirement 3** (do not store sensitive authentication data after authorization). Storing full card numbers and CVVs exposes the business to severe legal and financial liability.

**Fix**: Remove all card data collection. Use a PCI-compliant payment gateway (Stripe Elements, etc.) with tokenization. Never store raw card data.

---

## 22. NO INPUT VALIDATION ON CARD FORMS (Frontend)

| File | Severity |
|------|----------|
| `frontend/checkout.html` + `frontend/script.js` | **Medium** |

The `validateCardForm()` function only checks format (length, regex). There is no Luhn algorithm check, no proper BIN validation, and the validation is client-side only. Server-side does not validate card data either (since it shouldn't be collecting it).

**Fix**: Remove card collection entirely (see #21).

---

## 23. REMOTE CART SYNC INCONSISTENCY

| File | Severity |
|------|----------|
| `frontend/script.js` | **High** |

Two functions attempt to sync cart to server:

| Function | Line | URL Used | Method |
|----------|------|----------|--------|
| `syncCart()` | 1795 | `/api/v1/cart` | PUT |
| `syncCartToServer()` | 1612 | `/api/cart/sync` | POST |

Note that `syncCartToServer` uses the **wrong path** (`/api/cart/sync` instead of `/api/v1/cart/sync`). Also, `syncCart()` calls `PUT /api/v1/cart` but the route (`cart.js`) only defines:
- `GET /` — getCart
- `POST /item` — addCartItem
- `POST /sync` — syncCart
- `PUT /` — syncCart (same as POST /sync)

**Fix**: Use a single sync function with the correct path. Remove the duplicate.

---

## 24. TRANSLATIONS BLOAT IN MAIN JS FILE

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 760-1429) | **Medium** |

~670 lines of translation dictionaries are embedded directly in `script.js`. This adds ~20KB of data to every page load, even though most users only need one language.

**Fix**: Move translations to a separate JSON file loaded on demand. Or serve only the user's language based on their `Accept-Language` header.

---

## 25. NO BUILD SYSTEM / MODULE BUNDLING

| File | Severity |
|------|----------|
| `frontend/package.json` | **Medium** |

```json
{
  "scripts": {
    "build": "echo \"Static site - no build needed\""
  }
}
```

All frontend JS is a single ~4000+ line monolithic file with no imports, no modules, no bundling. Everything is on the global scope (`window.*`). This causes:
- No tree-shaking
- No code splitting
- Global namespace pollution
- Harder debugging and maintenance

**Fix**: Adopt a build tool (Vite, Webpack, etc.) and modularize the code.

---

## 26. `Content-Security-Policy` ALLOWS `'unsafe-inline'`

| File | Severity |
|------|----------|
| `Backend/middlewares/security.js` (lines 17-18) | **Medium** |

```js
scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
```

`'unsafe-inline'` defeats the purpose of CSP. It allows any inline script to execute.

**Fix**: Remove `'unsafe-inline'`. Use nonces or hashes for inline scripts. Or tighten the policy for production.

---

## 27. NO RATE LIMITING ON AUTH ENDPOINTS

| File | Severity |
|------|----------|
| `Backend/routes/auth.js` | **High** |

Login, register, forgot-password, and reset-password endpoints have no rate limiting. This exposes the app to brute-force attacks and credential stuffing.

**Fix**: Apply `express-rate-limit` (already in dependencies) to auth routes.

---

## 28. DUPLICATE SESSION/TOKEN STORAGE

| File | Severity |
|------|----------|
| `frontend/script.js` | **Medium** |

Auth tokens are stored in:
1. `localStorage` (`papjoy-token`, `papjoy-refresh-token`)
2. `sessionStorage` (same keys)
3. Inside the user object in `localStorage`/`sessionStorage` (`papjoy-user`)

This means the same token can exist in up to 3 different locations simultaneously. A logout that clears one may miss the others.

**Fix**: Pick one storage mechanism. Store user + token + refresh token as a single object.

---

## 29. OFFICIAL TEST FILES NOT CONFIGURED

| File | Severity |
|------|----------|
| `Backend/package.json` (line 9) | **Low** |

```json
"test": "node --test"
```

Test files exist in `Backend/tests/` and `Backend/test/` but there's no test watch, coverage, or CI configuration. The two test directories (plural + singular) is confusing.

**Fix**: Standardize on `tests/`, configure coverage, add a pretest lint step.

---

## 30. `hpp` (HTTP Parameter Pollution) MAY NOT WORK WITH EXPRESS 5

| File | Severity |
|------|----------|
| `Backend/middlewares/security.js` (line 65) | **Medium** |

```js
// mongoSanitize disabled due to Express 5 incompatibility - query property is read-only
// app.use(mongoSanitize({ replaceWith: '_' }));
app.use(hpp());
```

`hpp` is noted as compatible, but similar Express 5 middleware compatibility issues may exist.

**Fix**: Verify `hpp` works with Express 5. Consider upgrading `express-mongo-sanitize` or finding an alternative.

---

## 31. GLOBAL ERROR HANDLER REGISTERED AFTER STATIC FILES

| File | Severity |
|------|----------|
| `Backend/server.js` (lines 86-99) | **Low** |

```js
app.use(express.static(staticRoot, ...));
app.use((req, res, next) => { ... }); // 404 handler for API
app.use(errorHandler);
```

The error handler is after static middleware. If a static file request throws (e.g., `sendfile` crash for a missing file), it may not be caught properly.

**Fix**: Move error handler to be the last middleware. Add a catch-all for non-API routes.

---

## 32. `razorpay_test_api_keys_*.csv` NOT IN .gitignore

| File | Severity |
|------|----------|
| `Backend/.gitignore` | **High** |

The CSV file with API keys was committed. The `.gitignore` only has `*.csv` in the `Backend/.gitignore` but not in the root `.gitignore`. If git tracks the file before the rule, it will keep tracking it.

**Fix**: Add `*.csv` to root `.gitignore`. Use `git rm --cached` to remove tracked files. Revoke the exposed keys.

---

## 33. FRONTEND RENDERS PRODUCTS TWICE

| File | Severity |
|------|----------|
| `frontend/script.js` (renderProducts) | **Medium** |

`renderProducts` is called from:
1. `loadProducts()` — after API response or cache load
2. All filter/sort/category change event handlers

Each re-render replaces the entire DOM content via `productGrid.innerHTML = ''` followed by `productGrid.appendChild(fragment)`. For every filter change, products are re-fetched and re-rendered from scratch.

**Fix**: Use a virtual DOM approach, or at minimum cache the rendered DOM and show/hide elements instead of re-building.

---

## 34. INVENTORY CHECK HAPPENS ON BOTH FRONTEND AND BACKEND

| File | Severity |
|------|----------|
| `frontend/script.js` (line 2421) + `Backend/controllers/cartController.js` (line 20) | **Medium** |

Both sides check `availableStock` against requested quantity. If they disagree, the user gets a confusing experience.

**Fix**: Let the backend be the source of truth. Remove frontend inventory check or make it optimistic (let the backend reject).

---

## 35. FRONTEND CACHES PRODUCTS IN localStorage WITH NO INVALIDATION

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 267-279) | **Low** |

Products are cached in `localStorage` (`papjoy-products-cache`) with a 5-minute TTL. But:
- There is no cache busting mechanism
- If the server updates a product, the stale cache is served
- The fallback to `fallbackProducts` (hardcoded array) silently serves fake data

**Fix**: Use cache-busting with a versioned cache key. Never silently serve fallback products — show an error instead.

---

## 36. GPS TRACKING IS ENTIRELY SIMULATED

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 3690-3745) | **Medium** |

`startGPSTracking()` simulates delivery vehicle movement with:
- Fake GPS coordinates
- Fake location names ('Sector 18, Noida')
- Fake driver contact ('Rajesh Kumar', '+91 98765 43210')
- Distance that decreases by 0.1km every 30 seconds

This is not connected to any real delivery tracking provider. Users see fake tracking data.

**Fix**: Integrate with a real shipment tracking API (Shiprocket, Delhivery, etc.). Remove the simulation.

---

## 37. ORDER TRACKING FALLBACK GENERATES FAKE DATA

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 3567-3594) | **Medium** |

If no order is found in the database or localStorage, `findOrder()` returns a **fake order object** with fabricated status history, location, and driver info.

**Fix**: Return `null` and show "Order not found" instead of fabricating data.

---

## 38. DUPLICATE LOCALE/CURRENCY FORMATING

| File | Severity |
|------|----------|
| `frontend/script.js` (lines 692-747) | **Low** |

The code creates `currencyFormatter` with `new Intl.NumberFormat(...)` but then `updateCurrencyFormatter()` **always uses currency 'INR'** regardless of the selected region. The `regionRates` map and `localeRegionMap` are never used for actual currency conversion.

**Fix**: Either implement real multi-currency or remove the dead multi-currency code.

---

## 39. ADMIN HTML USES DIFFERENT NAVIGATION

| File | Severity |
|------|----------|
| `frontend/admin.html` | **Low** |

The admin page has its own sidebar and nav system, not using `createSidebar()` from script.js. It also doesn't use the i18n translations.

**Fix**: Unify the admin page with the rest of the app's layout system.

---

## 40. CONFIG EXPORTS BOTH MODULE AND INDIVIDUAL VARIABLES

| File | Severity |
|------|----------|
| `Backend/config.js` (lines 300-340) | **Low** |

The module exports both:
```js
module.exports = { ...config, NODE_ENV, PORT, APP_URL, ... };
module.exports._internals = { ... };
```

This means `require('./config')` returns a flat object with ALL variables. Some modules import specific destructured keys while others import the whole config object. Inconsistent.

**Fix**: Export only the config object. Consumers should use `config.NODE_ENV`, not `NODE_ENV`.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 10 |
| Medium | 15 |
| Low | 10 |
| **Total** | **40** |

The most urgent actions in order:
1. **Remove exposed secrets** from git history and revoke credentials
2. **Remove credit card data collection** (PCI violation)
3. **Delete dead code**: `shoe-store/`, `arikta.txt`, `.bat` files, audit scripts
4. **Consolidate cart + auth + API client** into single implementations
5. **Fix broken API paths** (especially `/api/cart/sync` → `/api/v1/cart/sync`)
6. **Remove simulated tracking and payment methods**
7. **Apply rate limiting to auth routes**

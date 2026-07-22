# PAPJOY Bug Report

## Bugs Found & Fixed

### 1. Backend config loads wrong `.env` file
- **File**: `Backend/config.js:2`
- **Bug**: Loaded `../.env` (root project) instead of `./.env` (Backend/.env)
- **Impact**: Backend used dev credentials instead of production MongoDB/API keys
- **Fix**: Changed to `path.resolve(__dirname, '.env')`

### 2. Razorpay env var name mismatch
- **File**: `Backend/config.js:41-42`
- **Bug**: Config read from `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, but older templates still referenced `RAZORPAY_KEY` and `RAZORPAY_SECRET`
- **Impact**: Razorpay payments were never configured, always returned 503
- **Fix**: Added fallback to read both naming conventions

### 3. Dead code in paymentConfig crashing server
- **File**: `Backend/utils/paymentConfig.js:39-50`
- **Bug**: Unused code referenced undefined variables (`PAYPAL_CLIENT_ID`, etc.) causing `ReferenceError`
- **Impact**: Server crashed on startup
- **Fix**: Removed dead code

### 4. Missing exports for GST utilities
- **File**: `Backend/utils/gst.js:134-144`
- **Bug**: `GST_RETURN_POLICY` and `CUSTOMER_SUPPORT` imported but not exported
- **Impact**: `invoiceController` received `undefined` for these values
- **Fix**: Added missing exports

### 5. InvoiceSequence upsert conflict (Mongoose v9)
- **File**: `Backend/controllers/invoiceController.js:15-23`
- **Bug**: `$setOnInsert` with `$inc` on the same field (`sequence`) caused Mongoose v9 conflict error
- **Impact**: Invoice generation failed silently, no invoices were created
- **Fix**: Replaced with find/create + increment approach

### 6. Invoice generation not awaited (race condition)
- **File**: `Backend/controllers/orderController.js:24-26`
- **Bug**: `generateInvoice()` called without `await` via `.catch()` handler
- **Impact**: Invoice retrieval immediately after order creation returned 404
- **Fix**: Changed to `await` with try/catch

### 7. Invoice access check fails with populated userId
- **File**: `Backend/controllers/invoiceController.js:29-38`
- **Bug**: `.populate('userId')` turns ObjectId into object, `toString()` returns `[object Object]`
- **Impact**: Authenticated users got 403 when accessing their own invoices
- **Fix**: Added `getInvoiceUserId()` helper to handle both populated and unpopulated cases

### 8. HTTPS redirect blocks 127.0.0.1 requests
- **File**: `Backend/middlewares/security.js:69-75`
- **Bug**: `FORCE_HTTPS` redirect only excluded `localhost`, not `127.0.0.1`
- **Impact**: API calls from frontend to `127.0.0.1:3000` were redirected to HTTPS
- **Fix**: Added `127.0.0.1` to the exclusion list

### 9. `looksConfigured()` rejects Razorpay test keys
- **File**: `Backend/utils/paymentConfig.js:1-7`
- **Bug**: Function marked any key containing "test" as unconfigured (Razorpay test keys start with `rzp_test_`)
- **Impact**: Razorpay always reported as "not configured" even with valid test keys
- **Fix**: Removed "test" from placeholder markers, used minimum length check instead

### 10. Admin routes missing CRUD endpoints
- **File**: `Backend/routes/admin.js`
- **Bug**: Only GET endpoints existed for products/categories; frontend sent POST/PUT/DELETE to same paths
- **Impact**: Admin panel's create/edit/delete operations failed
- **Fix**: Added POST/PUT/DELETE routes for products, categories, and order status updates

### 11. Duplicate GST state code entry
- **File**: `Backend/utils/gst.js:44-45`
- **Bug**: `'daman and diu'` entry duplicated
- **Impact**: Minor data redundancy
- **Fix**: Removed duplicate

### 12. Missing mongo-sanitize (Express 5 incompatible)
- **File**: `Backend/middlewares/security.js:64-65`
- **Bug**: `express-mongo-sanitize` was commented out due to Express 5 read-only query params
- **Impact**: Application vulnerable to NoSQL injection attacks
- **Fix**: Implemented custom sanitization middleware that works with Express 5

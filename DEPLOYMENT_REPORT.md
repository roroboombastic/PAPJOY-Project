# PAPJOY Deployment Report

## Backend (Railway)

### Configuration
- **Entry**: `Backend/index.js` → `Backend/server.js`
- **Start Command**: `node index.js` (already set in package.json)
- **Port**: Railway auto-sets `PORT` env var (defaults to 3000)

### Required Environment Variables (set in Railway Dashboard)

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `MONGO_URI` | `mongodb+srv://...` | MongoDB Atlas connection string |
| `JWT_SECRET` | `<random 64-char hex>` | Use `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | `<random 64-char hex>` | Separate from JWT_SECRET |
| `RAZORPAY_KEY_ID` | `rzp_live_...` | Razorpay live key |
| `RAZORPAY_KEY_SECRET` | `...` | Razorpay live secret |
| `APP_URL` | `https://papjoy.com` | Production domain |
| `CORS_ORIGIN` | `https://papjoy.vercel.app` | Vercel frontend URL |
| `TRUST_PROXY` | `true` | Required for Railway |
| `FORCE_HTTPS` | `true` | Enforce HTTPS redirect |
| `BUSINESS_NAME` | `PAP-JOY` | Invoice company name |
| `BUSINESS_GSTIN` | `...` | GSTIN for invoices |
| `CUSTOMER_SUPPORT` | `support@papjoy.com` | |

### Steps
1. Push `Backend/` to Railway
2. Set root directory to `Backend/` in Railway dashboard
3. Add all environment variables
4. Deploy

---

## Frontend (Vercel)

### Configuration
- **Root Directory**: `frontend/`
- **Framework**: Other
- **Build Command**: `npm run build`
- **Output Directory**: `.`
- **Node Version**: 20+

### vercel.json
The `frontend/vercel.json` has been configured with:
- Clean URLs (no `.html` extensions)
- API proxy rewrites to Railway backend
- SPA-style clean URL routing for all pages

### Steps
1. Push `frontend/` to Vercel
2. Set root directory to `frontend/`
3. No environment variables needed (API proxied via Vercel rewrites)
4. Deploy

---

## Database (MongoDB Atlas)

### Cluster
- Atlas cluster is already configured with the connection string in `Backend/.env`
- For production, use a dedicated M10+ cluster
- Enable IP whitelist for Railway's IP range (0.0.0.0/0 for dynamic IPs)

### Indexes
- All models have proper indexes on frequently queried fields (userId, orderId, status, etc.)
- Compound indexes can be added for common query patterns if needed

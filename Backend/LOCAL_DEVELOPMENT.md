# 🚀 PAP-JOY Backend Quick Start (Local Development)

## Prerequisites

✅ Node.js 16+ installed  
✅ MongoDB Community Edition installed (see MONGODB_LOCAL_SETUP.md)  

---

## Step 1: Install Dependencies

```powershell
cd "c:\Users\arikta\Desktop\PAPJOY - Copy\Backend"
npm install
```

Expected output:
```
added XXX packages
audited XXX packages in XXs
```

---

## Step 2: Configure for Local Development

The `.env` file contains both production and development configs.

**For LOCAL DEVELOPMENT**, edit `Backend/.env`:

```bash
# Change these lines:
MONGO_URI=mongodb://127.0.0.1:27017/papjoy
LOCAL_MONGO_URI=mongodb://127.0.0.1:27017/papjoy
APP_URL=http://localhost:3000
TRUST_PROXY=false
FORCE_HTTPS=false
HTTPS_ENABLED=false
```

**For PRODUCTION**, use the current settings (Atlas + HTTPS).

---

## Step 3: Start MongoDB

Open PowerShell and run:

```powershell
Start-Service MongoDB
```

Verify it's running:

```powershell
Get-Service MongoDB
```

---

## Step 4: Start Backend Server

```powershell
cd "c:\Users\arikta\Desktop\PAPJOY - Copy\Backend"
npm start
```

**Expected output:**
```
✅ Proxy trust disabled
✅ Connected to MongoDB: 127.0.0.1:27017/papjoy
⚙️ No products found in database, seeding sample catalog...
✅ Database seeded successfully
🚀 Server running on port 3000
📡 API available at http://localhost:3000/api/v1
```

---

## Step 5: Test the API

Open another PowerShell:

```powershell
curl http://localhost:3000/api/v1/products
```

You should see JSON with products.

---

## Step 6: Configure Frontend

Edit `frontend/script.js` (around line 8-14):

```javascript
const API_BASE_URL = window.location.origin === 'null'
  ? 'http://localhost:3000'  // Local backend
  : window.location.origin;   // Production
```

The frontend will automatically use `http://localhost:3000` when running locally.

---

## Available API Endpoints

### Public Endpoints

```
GET  /api/v1/products              - All products
GET  /api/v1/products/:slug        - Single product
POST /api/v1/auth/register         - Sign up
POST /api/v1/auth/login            - Sign in
POST /api/v1/auth/google           - Google login
```

### Protected Endpoints (require JWT token)

```
GET  /api/v1/auth/me            - Current user profile
PUT  /api/v1/auth/me            - Update profile
POST /api/v1/cart              - Create/update cart
GET  /api/v1/cart               - Get user cart
POST /api/v1/orders            - Create order
GET  /api/v1/orders             - User orders
```

### Admin Endpoints

```
POST /api/admin/products        - Create product
PUT  /api/admin/products/:id    - Update product
```

---

## Database Management

### View Database

```powershell
mongosh
use papjoy
show collections
db.products.find().pretty()
db.users.find().pretty()
```

### Reset Database

```javascript
use papjoy
db.dropDatabase()
```

Then restart backend (`npm start`) to re-seed.

### Backup Database

```powershell
mongodump --out "C:\backups\papjoy-backup" --db papjoy
```

---

## Troubleshooting

### MongoDB won't connect

```powershell
# 1. Check if service is running
Get-Service MongoDB

# 2. Start it
Start-Service MongoDB

# 3. Restart it
Restart-Service MongoDB
```

### Port 3000 already in use

```powershell
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual number)
taskkill /PID 12345 /F

# Or use different port
$env:PORT=3001
npm start
```

### "Cannot find module" errors

```powershell
# Clear and reinstall
Remove-Item -Path node_modules -Recurse -Force
npm install
```

---

## Development Checklist

- [ ] MongoDB running locally (`Get-Service MongoDB`)
- [ ] `.env` configured for local development
- [ ] Backend running (`npm start` from Backend dir)
- [ ] API responding (`curl http://localhost:3000/api/v1/products`)
- [ ] Database seeded with products
- [ ] Frontend configured to use `http://localhost:3000`

---

## Common Workflows

### Test User Signup

```powershell
$user = @{
    email = "test@example.com"
    password = "Test123!@#"
    name = "Test User"
    shippingAddress = @{
        fullName = "Test User"
        line1 = "123 Main St"
        city = "New York"
        state = "NY"
        postalCode = "10001"
        country = "USA"
        phone = "555-1234"
    }
    marketingOptIn = $true
}

curl -X POST http://localhost:3000/api/v1/auth/register `
  -Headers @{"Content-Type"="application/json"} `
  -Body ($user | ConvertTo-Json)
```

### Test Login

```powershell
$login = @{
    email = "test@example.com"
    password = "Test123!@#"
}

curl -X POST http://localhost:3000/api/v1/auth/login `
  -Headers @{"Content-Type"="application/json"} `
  -Body ($login | ConvertTo-Json)
```

Response includes token to use for authenticated requests.

---

## When Ready for Production

1. Comment out local MongoDB config in `.env`
2. Uncomment production MongoDB Atlas config
3. Set `APP_URL=https://www.papjoy.com`
4. Set `FORCE_HTTPS=true`
5. Set `HTTPS_ENABLED=true` with valid SSL cert paths
6. Ensure all required env vars are set (payment keys, etc.)
7. Deploy to production server

---

See `MONGODB_LOCAL_SETUP.md` for detailed MongoDB setup instructions.

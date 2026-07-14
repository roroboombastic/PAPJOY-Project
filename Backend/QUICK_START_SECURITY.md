# 🚀 QUICK START: Secure HTTPS Backend

## What Just Happened

Your backend has been upgraded with enterprise-grade security:

✅ **HTTPS/TLS** - Full encryption support  
✅ **Rate Limiting** - Protection against brute force & DDoS  
✅ **Input Validation** - SQL/NoSQL injection prevention  
✅ **Security Headers** - HSTS, CSP, X-Frame-Options, etc.  
✅ **Authentication** - Secure JWT with refresh tokens  
✅ **Password Security** - Bcrypt with strong requirements  
✅ **API Versioning** - `/api/v1/` prefix for stability  

---

## 🔧 Installation (Next Steps)

### Step 1: Install Security Packages

```bash
cd "c:\Users\arikta\Desktop\PAPJOY - Copy\Backend"
npm install
```

This installs:
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting
- `joi` - Input validation
- `express-mongo-sanitize` - NoSQL injection prevention
- `hpp` - HTTP Parameter Pollution protection
- `compression` - Response compression

### Step 2: Configure Environment

**For Development:**
```bash
cp .env.example .env
# Edit .env with your values
```

**For Production:**
```bash
cp .env.production .env
# Add real payment keys, database credentials, etc.
```

### Step 3: Generate Strong Secrets

Open PowerShell/Terminal and run:
```bash
# Generate JWT_SECRET
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# Generate JWT_REFRESH_SECRET
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
```

Add these values to your `.env` file.

### Step 4: Update Frontend API URLs

The API endpoints have changed from `/api/...` to `/api/v1/...`

**Update all frontend calls:**

```javascript
// Before (old)
fetch('/api/auth/login', ...)
fetch('/api/products', ...)

// After (new)
fetch('/api/v1/auth/login', ...)
fetch('/api/v1/products', ...)
```

**Common endpoints:**

```
Auth:
  POST   /api/v1/auth/register
  POST   /api/v1/auth/login
  POST   /api/v1/auth/logout
  POST   /api/v1/auth/refresh
  POST   /api/v1/auth/forgot-password
  POST   /api/v1/auth/reset-password
  GET    /api/v1/auth/me
  PUT    /api/v1/auth/me
  POST   /api/v1/auth/google

Products & Shopping:
  GET    /api/v1/products
  GET    /api/v1/products/:slug
  GET    /api/v1/categories
  GET    /api/v1/cart
  POST   /api/v1/cart
  PUT    /api/v1/cart
  POST   /api/v1/orders
  GET    /api/v1/orders

Payments:
  POST   /api/v1/payments/paypal/create
  POST   /api/v1/payments/paypal/capture
  POST   /api/v1/payments/stripe/session
  POST   /api/v1/payments/stripe/order
  POST   /api/v1/payments/razorpay/create
  POST   /api/v1/payments/razorpay/verify
```

---

## 🔒 HTTPS Setup

### For Development (Testing)
HTTPS is optional. Run with `HTTPS_ENABLED=false` in `.env`

### For Production (REQUIRED)

#### Option A: Reverse Proxy (RECOMMENDED ⭐)

Use **Nginx** in front of Node.js (handles SSL):

```bash
# Copy Nginx configuration from deploy folder
sudo cp deploy/nginx-papjoy.conf /etc/nginx/sites-available/papjoy
sudo ln -s /etc/nginx/sites-available/papjoy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Get free SSL from **Let's Encrypt**:
```bash
sudo certbot certonly --nginx -d yourdomain.com
```

Set in `.env`:
```
HTTPS_ENABLED=true
FORCE_HTTPS=true
TRUST_PROXY=true
APP_URL=https://yourdomain.com
```

#### Option B: Direct HTTPS in Node.js

Modify `index.js` to use native HTTPS:

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH)
};

https.createServer(options, app).listen(443, () => {
  console.log('✅ HTTPS Server running on port 443');
});
```

---

## 📚 Documentation Files

1. **SECURITY_AND_HTTPS_SETUP.md** - Complete production guide
2. **SECURITY_IMPLEMENTATION.md** - What's been added
3. **.env.example** - Environment variables template
4. **.env.production** - Production variables
5. **.gitignore** - Prevents accidental secret commits

---

## 🧪 Testing Your Setup

### Test Authentication
```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123","name":"Test User"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@123"}'
```

### Test Rate Limiting
```bash
# Try rapid requests
for i in {1..6}; do 
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
  echo $i
done
# Should get 429 Too Many Requests after 5 attempts
```

### Test Input Validation
```bash
# Weak password (should fail)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"weak","name":"Test"}'

# Invalid email (should fail)
curl -X POST http://localhost:3000/api/v1/auth/register \

  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"Test@123","name":"Test"}'
```

---

## ⚠️ IMPORTANT: Secrets Management

### 🚫 DO NOT
```javascript
// Never commit .env files
// Never hardcode secrets
const JWT_SECRET = "my_secret";  // ❌ WRONG

// Never expose errors in production
console.error(error);  // ❌ May expose internal info
```

### ✅ DO
```javascript
// Use environment variables
const JWT_SECRET = process.env.JWT_SECRET;  // ✅ RIGHT

// Add .env to .gitignore
// echo ".env*" >> .gitignore

// Use a secrets manager (production)
// AWS Secrets Manager, HashiCorp Vault, etc.
```

---

## 🚀 Deployment

### Using PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start index.js --name "papjoy-api" --env production

# Monitor
pm2 monit

# View logs
pm2 logs

# Restart on reboot
pm2 startup
pm2 save
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
```

```bash
docker build -t papjoy-api .
docker run -d --name papjoy-api \
  -e NODE_ENV=production \
  -e JWT_SECRET=your_secret_here \
  -p 3000:3000 \
  papjoy-api
```

---

## 🔍 Security Checklist

- [ ] All environment variables set in production
- [ ] JWT_SECRET and JWT_REFRESH_SECRET are strong random values
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Database backed up and tested
- [ ] Payment keys are LIVE (not sandbox/test)
- [ ] Rate limiting tested and working
- [ ] Input validation tested
- [ ] CORS_ORIGIN set to specific domains (not *)
- [ ] .env files added to .gitignore
- [ ] Logs monitored for suspicious activity
- [ ] Security headers verified with SSL Labs

---

## 📞 Troubleshooting

**Issue:** "Cannot find module 'helmet'"
```bash
npm install
```

**Issue:** "JWT_SECRET is not set"
```bash
# Check .env file exists
ls -la .env

# Generate and add values
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Issue:** "Too many requests" error
This is rate limiting working as expected. Wait 15 minutes or adjust rates in index.js.

**Issue:** "CORS error" in browser
Set `CORS_ORIGIN` in `.env` to include your frontend domain.

---

## 📖 Learn More

- OWASP Security: https://owasp.org/
- Express.js Best Practices: https://expressjs.com/en/advanced/best-practice-security.html
- Helmet.js: https://helmetjs.github.io/
- MongoDB Security: https://docs.mongodb.com/manual/security/

---

**Your backend is now ready for production! 🎉**

For complete details, see `SECURITY_AND_HTTPS_SETUP.md`

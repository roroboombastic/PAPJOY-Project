# PAP-JOY Backend Security & HTTPS Production Setup Guide

## ⚠️ CRITICAL SECURITY CHECKLIST

### 1. Environment Variables
- [ ] Generate strong JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- [ ] Generate JWT_REFRESH_SECRET with same method
- [ ] Use production payment keys (Stripe, PayPal, Razorpay)
- [ ] Set NODE_ENV=production
- [ ] HTTPS_ENABLED=true
- [ ] Set specific CORS_ORIGIN (not *)
- [ ] Add .env* to .gitignore

```bash
echo ".env*" >> .gitignore
echo "node_modules/" >> .gitignore
```

### 2. HTTPS/SSL Setup

#### Option A: Reverse Proxy (RECOMMENDED)
Use Nginx or AWS ALB in front of Node.js - handles HTTPS certificates.

**Nginx Configuration:**
```nginx
upstream papjoy_backend {
    server localhost:3000;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(self)" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

    location /api/v1/auth/ {
        limit_req zone=auth_limit burst=10 nodelay;
        proxy_pass http://papjoy_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://papjoy_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://papjoy_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**Set environment variables:**
```bash
HTTPS_ENABLED=true
FORCE_HTTPS=true
TRUST_PROXY=true
APP_URL=https://yourdomain.com
```

#### Option B: Direct HTTPS with Node.js
```javascript
// Use the latest secure version of the updated index.js
const fs = require('fs');
const https = require('https');

const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH)
};

https.createServer(options, app).listen(443, () => {
  console.log('🚀 HTTPS Server running on port 443');
});
```

### 3. SSL Certificate Setup

**Using Let's Encrypt (FREE):**
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### 4. Database Security

**MongoDB Atlas (Recommended):**
- [ ] Enable IP Whitelist only from your server IPs
- [ ] Use strong database password
- [ ] Enable authentication
- [ ] Use connection string: `mongodb+srv://user:pass@cluster.mongodb.net/papjoy`
- [ ] Enable SSL/TLS connections

**Local MongoDB:**
- [ ] Enable authentication
- [ ] Use strong password
- [ ] Only bind to 127.0.0.1 (localhost)
- [ ] Never expose port 27017 to internet

### 5. Payment Gateway Security

**Stripe:**
- [ ] Use LIVE keys for production (never test keys)
- [ ] Enable webhook signing
- [ ] Validate webhook signatures in code
- [ ] Use API version 2023-11-15 or later

**PayPal:**
- [ ] Use LIVE mode for production
- [ ] Enable signature verification
- [ ] Validate order amounts server-side

**Razorpay:**
- [ ] Use Live API keys
- [ ] Enable HMAC signature verification
- [ ] Validate amounts on server

### 6. Application Security

**Rate Limiting** (already implemented):
- Global: 100 requests per 15 minutes per IP
- Auth endpoints: 5 requests per 15 minutes per IP
- Payment endpoints: 10 requests per 1 minute per IP

**Input Validation** (already implemented):
- Email validation with regex
- Password: min 8 chars, uppercase, lowercase, number, special char
- NoSQL injection prevention with mongoSanitize
- HPP (HTTP Parameter Pollution) protection

**Headers** (already implemented via Helmet):
- Content-Security-Policy
- Strict-Transport-Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy

### 7. Deployment Checklist

**Before deploying to production:**

```bash
# 1. Install dependencies
npm install

# 2. Set production environment variables
cp .env.production .env
# Edit .env with real values

# 3. Verify environment
npm run validate-env  # (if you add this script)

# 4. Test application
npm test

# 5. Build/prepare for production
npm run build

# 6. Start with process manager (PM2 recommended)
npm install -g pm2
pm2 start index.js --name "papjoy-api" --env production
```

**PM2 Configuration (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'papjoy-api',
    script: './index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    listen_timeout: 10000,
    kill_timeout: 5000
  }]
};

// Start with: pm2 start ecosystem.config.js
```

### 8. Monitoring & Logging

**Recommended tools:**
- PM2 Plus (for monitoring)
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Sentry (error tracking)
- DataDog or New Relic

**Implement logging:**
```javascript
// Already added logger object in updated index.js
logger.error('Error message', { additionalData });
logger.warn('Warning message', { data });
logger.info('Info message', { data });
```

### 9. Secrets Management

**DO NOT hardcode secrets:**
```javascript
// ❌ DON'T DO THIS
const JWT_SECRET = "hardcoded_secret";

// ✅ DO THIS
const JWT_SECRET = process.env.JWT_SECRET;
```

**For CI/CD pipelines:**
- Use GitHub Secrets / GitLab CI Variables / AWS Secrets Manager
- Never log secrets
- Rotate secrets regularly

### 10. Security Headers Test

Test your HTTPS implementation:
```bash
# Using SSL Labs
https://www.ssllabs.com/ssltest/

# Expected score: A or A+
```

### 11. Regular Security Maintenance

- [ ] Update dependencies: `npm audit fix`
- [ ] Review logs regularly for suspicious activity
- [ ] Rotate JWT secrets periodically
- [ ] Update Node.js to latest LTS version
- [ ] Keep OS patches up to date
- [ ] Review and update security policies quarterly

### 12. Backup & Recovery

- [ ] MongoDB backups automated (Atlas handles this)
- [ ] Database restore tested regularly
- [ ] Application code backed up in Git
- [ ] Disaster recovery plan documented

---

## Quick Start Production Deployment

```bash
# 1. Clone repository
git clone <your-repo>
cd Backend

# 2. Install dependencies
npm install

# 3. Create production environment
cp .env.production .env

# 4. Edit environment variables with real values
nano .env

# 5. Setup Nginx (if using reverse proxy)
sudo cp nginx-papjoy.conf /etc/nginx/sites-available/papjoy
sudo ln -s /etc/nginx/sites-available/papjoy /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. Setup SSL certificate
sudo certbot certonly --nginx -d yourdomain.com

# 7. Start application with PM2
pm2 start index.js --name "papjoy-api" --env production
pm2 save
pm2 startup

# 8. Verify application
curl https://yourdomain.com/api/v1/products
```

## Troubleshooting

**HTTPS not working:**
- Check if reverse proxy is properly configured
- Verify SSL certificate paths
- Check firewall rules for port 443

**Database connection errors:**
- Verify MONGO_URI in .env
- Check IP whitelist in MongoDB Atlas
- Verify database credentials

**Payment failures:**
- Verify API keys are for production (not sandbox)
- Check webhook signatures
- Review payment gateway logs

---

**Last Updated:** 2026-05-17
**Maintainer:** Security Team
**Next Review:** 2026-08-17

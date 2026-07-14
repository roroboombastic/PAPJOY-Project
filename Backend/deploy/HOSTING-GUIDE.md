# PAPJOY Hosting Guide - Deploy to Internet

## 🚀 Quick Hosting Options

### Option 1: DigitalOcean (Recommended for Beginners)
- **Cost**: $6/month for basic VPS
- **Setup time**: 15-30 minutes
- **Pros**: Simple, good docs, one-click apps

### Option 2: Vultr
- **Cost**: $2.50/month for basic VPS
- **Setup time**: 15-30 minutes
- **Pros**: Cheap, fast global network

### Option 3: AWS EC2 (Free tier available)
- **Cost**: Free for 12 months, then ~$8/month
- **Setup time**: 30-45 minutes
- **Pros**: Enterprise-grade, scalable

---

## 📋 Step-by-Step Deployment

### Step 1: Get a VPS Server

#### DigitalOcean Setup:
1. Go to [digitalocean.com](https://digitalocean.com)
2. Sign up (use referral code if available)
3. Click "Create Droplet"
4. Choose Ubuntu 22.04 LTS
5. Select Basic plan ($6/month)
6. Choose datacenter (closest to your users)
7. Add SSH keys (recommended) or use password
8. Create droplet

#### Vultr Setup:
1. Go to [vultr.com](https://vultr.com)
2. Sign up
3. Click "Deploy" → "Server"
4. Choose Cloud Compute
5. Select Ubuntu 22.04 LTS
6. Choose location
7. Select $2.50/month plan
8. Add SSH key or password
9. Deploy

### Step 2: Connect to Your Server

```bash
# Replace with your server's IP
ssh root@YOUR_SERVER_IP
```

If using password, you'll be prompted. If using SSH key, it should connect directly.

### Step 3: Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl wget git htop ufw

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB (optional - we'll use cloud DB)
# sudo apt-get install gnupg
# wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -
# echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
# sudo apt-get update
# sudo apt-get install -y mongodb-org

# Install nginx
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Setup firewall
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### Step 4: Setup Domain DNS

1. Go to your domain registrar (where you bought PAPJOY.com)
2. Add A records:
   - `papjoy.com` → YOUR_SERVER_IP
   - `www` → YOUR_SERVER_IP
3. Wait 5-15 minutes for DNS propagation

### Step 5: Deploy Your Code

```bash
# Create app directory
sudo mkdir -p /var/www/papjoy
cd /var/www/papjoy

# Clone or upload your code (replace with your repo)
# git clone https://github.com/yourusername/papjoy.git .
# OR upload via SCP/SFTP

# For now, let's create the structure manually
sudo mkdir -p backend frontend

# Upload your backend files to /var/www/papjoy/backend/
# Upload your frontend files to /var/www/papjoy/frontend/
```

### Step 6: Configure Backend

```bash
cd /var/www/papjoy/backend

# Install dependencies
npm install

# Create production environment file
sudo mkdir -p /etc/papjoy
sudo nano /etc/papjoy/papjoy.env
```

Add this content to `/etc/papjoy/papjoy.env`:

```env
PORT=5000
APP_URL=https://www.papjoy.com
MONGO_URI=mongodb+srv://your-username:your-password@cluster0.xxxxx.mongodb.net/papjoy?retryWrites=true&w=majority
JWT_SECRET=your_secure_jwt_secret_here
RAZORPAY_KEY=your_razorpay_key
RAZORPAY_SECRET=your_razorpay_secret
# Add other payment keys as needed
```

```bash
# Secure the env file
sudo chown root:www-data /etc/papjoy/papjoy.env
sudo chmod 640 /etc/papjoy/papjoy.env
```

### Step 7: Setup Systemd Service

```bash
# Create service file
sudo nano /etc/systemd/system/papjoy.service
```

Add this content:

```ini
[Unit]
Description=PAPJOY Node.js Backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/papjoy/backend
EnvironmentFile=/etc/papjoy/papjoy.env
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5s
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=papjoy

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable papjoy.service
sudo systemctl start papjoy.service

# Check status
sudo systemctl status papjoy.service
```

### Step 8: Configure Nginx

```bash
# Copy our nginx config
sudo cp /var/www/papjoy/backend/deploy/nginx-papjoy.conf /etc/nginx/sites-available/papjoy

# Enable site
sudo ln -s /etc/nginx/sites-available/papjoy /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### Step 9: Setup SSL Certificate

```bash
# Get SSL certificate
sudo certbot --nginx -d papjoy.com -d www.papjoy.com

# Test renewal
sudo certbot renew --dry-run
```

### Step 10: Deploy Frontend Files

```bash
# Copy frontend to nginx root
sudo cp -r /var/www/papjoy/frontend/* /var/www/papjoy/

# Set proper permissions
sudo chown -R www-data:www-data /var/www/papjoy
sudo chmod -R 755 /var/www/papjoy
```

### Step 11: Test Your Site

1. Visit `https://papjoy.com`
2. Check that pages load
3. Test API endpoints: `https://papjoy.com/api/v1/products`
4. Verify backend logs: `sudo journalctl -u papjoy.service -f`

---

## 🔧 Troubleshooting

### Backend not starting:
```bash
sudo journalctl -u papjoy.service -n 50
```

### Nginx errors:
```bash
sudo nginx -t
sudo systemctl status nginx
```

### Permission issues:
```bash
sudo chown -R www-data:www-data /var/www/papjoy
```

### MongoDB connection issues:
- Check your MONGO_URI in `/etc/papjoy/papjoy.env`
- Ensure MongoDB Atlas allows your server IP
- Test connection: `mongosh "your-connection-string"`

---

## 💰 Cost Breakdown

- **Domain**: $10-15/year (PAPJOY.com)
- **VPS**: $2.50-6/month
- **MongoDB Atlas**: Free tier available, or $9/month for production
- **SSL**: Free via Let's Encrypt

**Total first year**: ~$50-100

---

## 🚀 Alternative: Heroku (Easier but More Expensive)

If you want zero-server management:

1. Go to [heroku.com](https://heroku.com)
2. Create account
3. Install Heroku CLI
4. Deploy backend: `heroku create papjoy-backend`
5. Add MongoDB addon: `heroku addons:create mongolab:sandbox`
6. Deploy frontend to Netlify/Vercel for free static hosting

Heroku cost: ~$7/month for basic dyno + $0.015/hour when active.

Let me know which hosting option you prefer and I can provide more specific commands!</content>
<parameter name="filePath">c:\Users\arikta\Desktop\PAP-JOY\PAPJOY - Copy\PAPJOY - Copy\Backend\deploy\HOSTING-GUIDE.md
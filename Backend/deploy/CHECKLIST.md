# PAPJOY Deployment Checklist

## Pre-Deployment
- [ ] Domain name (PAPJOY.com) purchased and accessible
- [ ] VPS server created (DigitalOcean/Vultr/AWS)
- [ ] Server IP address noted
- [ ] MongoDB Atlas account created
- [ ] MongoDB cluster created and connection string ready
- [ ] Payment gateway accounts configured (Razorpay/Stripe/etc.)

## DNS Setup
- [ ] A record: papjoy.com → SERVER_IP
- [ ] A record: www.papjoy.com → SERVER_IP
- [ ] DNS propagation confirmed (5-15 minutes)

## Server Setup
- [ ] SSH access to server working
- [ ] Run setup-server.sh script
- [ ] Node.js installed (version 18+)
- [ ] nginx installed and running
- [ ] Firewall configured (UFW)
- [ ] SSL certificates obtained (certbot)

## Code Deployment
- [ ] Backend code uploaded to /var/www/papjoy/backend/
- [ ] Frontend code uploaded to /var/www/papjoy/frontend/
- [ ] Dependencies installed: `npm install`
- [ ] Environment file created: /etc/papjoy/papjoy.env
- [ ] Production secrets configured

## Services Configuration
- [ ] systemd service created: /etc/systemd/system/papjoy.service
- [ ] nginx config deployed: /etc/nginx/sites-available/papjoy
- [ ] Services enabled and started
- [ ] Backend service running: `systemctl status papjoy`
- [ ] nginx reloaded: `nginx -t && systemctl reload nginx`

## Testing
- [ ] HTTPS working: https://papjoy.com
- [ ] HTTP redirects to HTTPS
- [ ] Frontend pages load correctly
- [ ] API endpoints accessible: https://papjoy.com/api/v1/products
- [ ] Database connection working
- [ ] Payment integration tested
- [ ] Contact forms working

## Monitoring & Maintenance
- [ ] SSL certificate auto-renewal configured
- [ ] Backup strategy implemented
- [ ] Monitoring/logging set up
- [ ] Domain renewal reminders set

## Performance Optimization
- [ ] Static asset caching configured
- [ ] Database indexes optimized
- [ ] Image optimization implemented
- [ ] CDN setup (optional)

## Launch
- [ ] Final testing completed
- [ ] Site announced/launched
- [ ] Support channels ready
- [ ] Analytics tracking installed

---

## Quick Commands Reference

### Server Access
```bash
ssh root@YOUR_SERVER_IP
```

### Service Management
```bash
sudo systemctl status papjoy
sudo systemctl restart papjoy
sudo journalctl -u papjoy -f
```

### nginx Management
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl status nginx
```

### SSL Renewal
```bash
sudo certbot renew
```

### File Upload (from local machine)
```bash
scp -r ./Backend/* root@YOUR_SERVER_IP:/var/www/papjoy/backend/
scp -r ./frontend/* root@YOUR_SERVER_IP:/var/www/papjoy/
```

---

## Emergency Contacts
- Hosting provider support
- Domain registrar support
- MongoDB Atlas support
- Payment gateway support
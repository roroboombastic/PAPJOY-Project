# PAPJOY Domain Registrar Quick Setup

## 🏷️ Popular Domain Registrars & Setup

### 1. GoDaddy
**Login:** godaddy.com → Sign In
**Steps:**
1. Go to "My Products" → "Domains"
2. Click on "PAPJOY.COM" → "DNS" (or "Manage DNS")
3. Click "Add" → "A"
4. **Name:** @ (leave blank)
5. **Value:** YOUR_SERVER_IP
6. **TTL:** 600
7. Click "Save"
8. Repeat for "www" subdomain

### 2. Namecheap
**Login:** namecheap.com → Sign In
**Steps:**
1. Go to "Domain List" → "PAPJOY.COM" → "Manage"
2. Go to "Advanced DNS" tab
3. Click "Add New Record"
4. **Type:** A Record
5. **Host:** @
6. **Value:** YOUR_SERVER_IP
7. **TTL:** Automatic
8. Click "Save Changes"
9. Repeat for Host: "www"

### 3. Google Domains
**Login:** domains.google → Sign In
**Steps:**
1. Select "PAPJOY.COM"
2. Go to "DNS" in left menu
3. Scroll to "Custom resource records"
4. Click "Create new record"
5. **Name:** leave blank (for root domain)
6. **Type:** A
7. **TTL:** 5m
8. **Data:** YOUR_SERVER_IP
9. Click "Save"
10. Repeat for Name: "www"

### 4. Hostinger
**Login:** hostinger.com → Login
**Steps:**
1. Go to "Domains" → "PAPJOY.COM"
2. Click "DNS / Name Servers"
3. Go to "DNS Records" tab
4. Click "Add Record" → "A"
5. **Name:** leave blank
6. **Points to:** YOUR_SERVER_IP
7. Click "Add"
8. Repeat for Name: "www"

### 5. Porkbun
**Login:** porkbun.com → Account
**Steps:**
1. Go to "Domains" → "PAPJOY.COM"
2. Click "DNS Records"
3. Click "Add" → "A Record"
4. **Name:** leave blank
5. **Type:** A
6. **Content:** YOUR_SERVER_IP
7. **TTL:** 600
8. Click "Add Record"
9. Repeat for Name: "www"

---

## 🔍 How to Find Your Server IP

### DigitalOcean:
1. Login to dashboard
2. Go to "Droplets"
3. Find your PAPJOY droplet
4. Copy the "Public IPv4 address"

### Vultr:
1. Login to customer portal
2. Go to "Servers"
3. Find your instance
4. Copy the "Main IP"

### AWS EC2:
1. Login to AWS Console
2. Go to EC2 → Instances
3. Find your instance
4. Copy the "Public IPv4 address"

### Linode:
1. Login to Cloud Manager
2. Go to "Linodes"
3. Find your Linode
4. Copy the "IP Address"

### Shared Hosting (cPanel):
1. Login to cPanel
2. Look for "Server Information" or "Account Information"
3. Find "Shared IP Address" or "Server IP"

---

## ⚡ Quick Test Commands

After setting up DNS, test with:

```bash
# Check DNS propagation
nslookup papjoy.com

# Test website
curl -I https://papjoy.com

# Run full test
chmod +x deploy/test-domain.sh
./deploy/test-domain.sh papjoy.com YOUR_SERVER_IP
```

---

## 🚨 Common Issues & Fixes

### "DNS not updating"
- Wait 5-30 minutes for propagation
- Clear DNS cache: `ipconfig /flushdns` (Windows)

### "Connection refused"
- Check if nginx is running: `sudo systemctl status nginx`
- Check firewall: `sudo ufw status`

### "SSL certificate error"
- Install SSL: `sudo certbot --nginx -d papjoy.com -d www.papjoy.com`

### "Wrong IP showing"
- Double-check DNS records in registrar
- Verify you're editing the correct domain

---

## 📞 Support Contacts

- **GoDaddy**: 1-480-505-8877
- **Namecheap**: support@namecheap.com
- **Google Domains**: domains.google/support
- **Hostinger**: support@hostinger.com
- **Porkbun**: support@porkbun.com

Tell me your domain registrar and hosting provider for specific help!</content>
<parameter name="filePath">c:\Users\arikta\Desktop\PAP-JOY\PAPJOY - Copy\PAPJOY - Copy\Backend\deploy\REGISTRAR-SETUP.md
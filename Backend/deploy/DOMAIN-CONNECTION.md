# PAPJOY Domain to Hosting Connection Guide

## 🎯 Quick DNS Setup

### Step 1: Get Your Hosting Server IP

First, find your server's IP address:

**If using DigitalOcean/Vultr/Linode/AWS:**
- Login to your hosting control panel
- Find your droplet/instance/server
- Note the **Public IP Address** (something like `123.456.789.0`)

**If using shared hosting:**
- Login to your hosting control panel (cPanel/Plesk)
- Look for "Server Information" or "Account Details"
- Find the **Shared IP** or **Server IP**

**If you have SSH access:**
```bash
# Run this on your server
curl -s ifconfig.me
# or
hostname -I | awk '{print $1}'
```

### Step 2: Access Your Domain Registrar

Go to where you bought your domain (PAPJOY.com):

**Common Registrars:**
- GoDaddy
- Namecheap
- Google Domains
- Hostinger
- Bluehost
- Porkbun

Login to your account and find **DNS Management** or **Name Servers**.

### Step 3: Configure DNS Records

#### For PAPJOY.COM (root domain):
Create an **A Record**:
- **Name/Host**: `@` or `papjoy.com`
- **Type**: A
- **Value**: `199.188.200.130` (shared server IP)
- **TTL**: 600 (or default)

#### For WWW.PAPJOY.COM (subdomain):
Create an **A Record**:
- **Name/Host**: `www`
- **Type**: A
- **Value**: `YOUR_SERVER_IP` (same as above)
- **TTL**: 600

### Step 4: Wait for DNS Propagation

DNS changes take **5-30 minutes** to propagate globally. You can check status at:
- [dnschecker.org](https://dnschecker.org)
- [whatismyipaddress.com](https://whatismyipaddress.com)

### Step 5: Verify Connection

Once DNS propagates, test your site:

```bash
# Test domain resolution
nslookup papjoy.com
nslookup www.papjoy.com

# Test website access
curl -I https://papjoy.com
curl -I https://www.papjoy.com
```

---

## 🔧 Troubleshooting

### Issue: "DNS_PROBE_FINISHED_NXDOMAIN"
- DNS hasn't propagated yet (wait longer)
- Check spelling in DNS records
- Verify domain registrar settings

### Issue: "Connection Refused" or "ERR_CONNECTION_REFUSED"
- Your server isn't running or firewall blocks port 80/443
- Check server status: `sudo systemctl status nginx`
- Check firewall: `sudo ufw status`

### Issue: "SSL Certificate Error"
- SSL certificate not installed or expired
- Run: `sudo certbot --nginx -d papjoy.com -d www.papjoy.com`

### Issue: "502 Bad Gateway"
- Your Node.js backend isn't running
- Check: `sudo systemctl status papjoy`
- Restart: `sudo systemctl restart papjoy`

---

## 📋 DNS Record Examples

### GoDaddy:
1. Login → My Products → PAPJOY.COM → DNS
2. Add record → A Record
   - Host: @
   - Points to: YOUR_IP
   - TTL: 600

### Namecheap:
1. Login → Domain List → PAPJOY.COM → Manage
2. Advanced DNS → Add New Record
   - Type: A Record
   - Host: @
   - Value: YOUR_IP

### Google Domains:
1. Login → PAPJOY.COM → DNS
2. Custom records → Create new record
   - Name: leave blank
   - Type: A
   - TTL: 5m
   - Data: YOUR_IP

---

## 🚀 Advanced Setup

### Custom Nameservers (if your hosting provides them):
Instead of A records, you might need to change nameservers:
- ns1.yourhosting.com
- ns2.yourhosting.com

### CDN Setup (Cloudflare):
1. Sign up at cloudflare.com
2. Add your domain
3. Change nameservers to Cloudflare's
4. Point A records to your server IP

### Load Balancer:
If using multiple servers, create A records pointing to load balancer IP.

---

## ✅ Verification Checklist

- [ ] Domain registrar login working
- [ ] Server IP address obtained
- [ ] A record for `@` created
- [ ] A record for `www` created
- [ ] DNS propagation confirmed (5-30 min)
- [ ] HTTPS working: `https://papjoy.com`
- [ ] WWW redirect working: `https://www.papjoy.com`
- [ ] API accessible: `https://papjoy.com/api/v1/products`

---

## 📞 Need Help?

If you're stuck:
1. Tell me your hosting provider (DigitalOcean, Bluehost, etc.)
2. Tell me your domain registrar (GoDaddy, Namecheap, etc.)
3. Share any error messages you're seeing

I can give you exact steps for your specific providers!</content>
<parameter name="filePath">c:\Users\arikta\Desktop\PAP-JOY\PAPJOY - Copy\PAPJOY - Copy\Backend\deploy\DOMAIN-CONNECTION.md
# PAPJOY.COM - Namecheap Shared Hosting Setup

## ✅ Current Status
- **DNS**: ✅ Correctly pointing to `199.188.200.130`
- **Hosting**: ✅ Namecheap shared hosting active
- **Website**: ❌ Showing default parking page (files not uploaded)

## 🛠️ SOLUTION: Upload Your Website Files

### Step 1: Access cPanel
1. Go to: `http://papjoy.com/cpanel`
2. Login with your Namecheap hosting credentials
3. You'll see the cPanel dashboard

### Step 2: Upload Files via File Manager
1. In cPanel, click **"File Manager"**
2. Navigate to `public_html` folder (this is your website root)
3. Click **"Upload"** button
4. Upload your frontend files:
   - `index.html`
   - `cart.html`
   - `checkout.html`
   - etc.
   - `script.js`
   - `style.css`
   - All files from your `frontend/` folder

### Step 3: Upload Images & Assets
1. Create folders in `public_html`:
   - `images/`
   - `css/`
   - `js/`
2. Upload your assets to appropriate folders

### Step 4: Test Your Website
After uploading, visit: `http://papjoy.com`

---

## ⚠️ IMPORTANT: Node.js Backend Limitation

**Namecheap shared hosting does NOT support Node.js backends.** Your current setup has:
- ✅ Frontend (HTML/CSS/JS) - will work on shared hosting
- ❌ Backend (Node.js/Express) - will NOT work on shared hosting

### Solutions for Backend:

#### Option A: Static Website Only (Recommended for now)
- Upload only frontend files
- Use static e-commerce (no dynamic features)
- Add "Coming Soon" for checkout features

#### Option B: Upgrade to VPS (Full functionality)
- Get a VPS server ($2.50/month on Vultr)
- Deploy full Node.js backend
- Connect to MongoDB Atlas
- Enable all features (users, payments, orders)

#### Option C: Use External Services
- Use services like:
  - Firebase for backend
  - Stripe Checkout for payments
  - No custom backend needed

---

## 📁 File Upload Checklist

Upload these files to `public_html/`:

### HTML Files:
- [ ] `index.html`
- [ ] `cart.html`
- [ ] `checkout.html`
- [ ] `product.html`
- [ ] `product-detail.html`
- [ ] `account.html`
- [ ] `signin.html`
- [ ] `signup.html`
- [ ] `success.html`
- [ ] `terms.html`
- [ ] `privacy.html`
- [ ] `cookies.html`

### Assets:
- [ ] `script.js`
- [ ] `style.css`
- [ ] `images/` folder
- [ ] Any other static assets

---

## 🚀 Quick Upload Commands (if you have SSH access)

If your hosting plan includes SSH:

```bash
# Connect to server
ssh your-username@papjoy.com

# Upload files
scp -r ./frontend/* /home/your-username/public_html/
```

---

## ✅ Expected Result

After uploading files, `http://papjoy.com` should show your PAPJOY website instead of the parking page.

**For HTTPS:** Namecheap shared hosting usually provides free SSL. It might take a few hours to activate.

---

## 🔄 Next Steps

1. **Access cPanel:** `http://papjoy.com/cpanel`
2. **Upload frontend files** to `public_html/`
3. **Test:** Visit `http://papjoy.com`
4. **For full functionality:** Consider upgrading to VPS hosting

**Need help with file upload?** Tell me your cPanel login details or if you need VPS setup instructions!</content>
<parameter name="filePath">c:\Users\arikta\Desktop\PAP-JOY\PAPJOY - Copy\PAPJOY - Copy\Backend\deploy\NAMECHEAP-SHARED-SETUP.md
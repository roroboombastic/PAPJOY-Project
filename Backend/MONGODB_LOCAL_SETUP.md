# 🛠️ MongoDB Local Setup Guide (Windows)

## Overview

This guide walks you through installing and configuring MongoDB locally on Windows for PAP-JOY backend development.

---

## Option A: MongoDB Community Edition (Recommended for Development)

### Step 1: Download & Install MongoDB

1. **Download** from [MongoDB Community Server](https://www.mongodb.com/try/download/community)
   - Select: Windows x64 (msi)
   - Latest version (currently 7.x or 8.x)

2. **Run Installer**
   - Double-click the `.msi` file
   - Accept license agreement
   - Choose: "Complete" installation
   - Click "Install MongoDB as a Windows Service"
   - Keep default port: **27017**
   - Uncheck "Install MongoDB Compass" (optional, we'll use CLI)
   - Click "Finish"

### Step 2: Verify Installation

Open PowerShell and check if MongoDB service is running:

```powershell
Get-Service | Where-Object {$_.Name -like "*MongoDB*"}
```

**Expected output:**
```
Status   Name                DisplayName
------   ----                -----------
Running  MongoDB             MongoDB
```

If not running, start it:
```powershell
Start-Service MongoDB
```

### Step 3: Connect to MongoDB

Open a new PowerShell terminal and run:

```powershell
mongosh
```

You should see:
```
Current Mongosh Log ID:  ...
Connecting to:          mongodb://127.0.0.1:27017
MongoSH version 2.x.x
...
test>
```

Type `exit` to quit.

---

## Option B: MongoDB via Docker (Alternative)

If you have Docker installed, run MongoDB in a container:

```powershell
docker run -d `
  --name papjoy-mongodb `
  -p 27017:27017 `
  -e MONGO_INITDB_ROOT_USERNAME=admin `
  -e MONGO_INITDB_ROOT_PASSWORD=password123 `
  -v mongodb_data:/data/db `
  mongo:latest
```

Then connect with authentication:
```powershell
mongosh "mongodb://admin:password123@localhost:27017"
```

Stop the container:
```powershell
docker stop papjoy-mongodb
```

---

## Configure Backend for Local MongoDB

### Step 1: Update `.env` File

Edit `Backend/.env` and set:

```bash
# Use local MongoDB
MONGO_URI=mongodb://127.0.0.1:27017/papjoy
LOCAL_MONGO_URI=mongodb://127.0.0.1:27017/papjoy

# MongoDB authentication (if enabled)
# MONGO_URI=mongodb://username:password@127.0.0.1:27017/papjoy

# Other settings (keep existing)
APP_URL=http://localhost:3000
TRUST_PROXY=false
FORCE_HTTPS=false
HTTPS_ENABLED=false
```

### Step 2: Start the Backend

In PowerShell, from the Backend directory:

```powershell
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

### Step 3: Verify Connection

Open another PowerShell and test the API:

```powershell
curl http://localhost:3000/api/v1/products -Headers @{"Content-Type"="application/json"}
```

You should see product JSON returned.

---

## Manage Local MongoDB

### View Databases

```powershell
mongosh
```

```javascript
show dbs
use papjoy
show collections
db.products.find().pretty()
```

### Create Admin User (Optional Security)

```javascript
use admin
db.createUser({
  user: "admin",
  pwd: "your_secure_password",
  roles: ["root"]
})
```

Then connect with:
```powershell
mongosh "mongodb://admin:your_secure_password@127.0.0.1:27017"
```

Update `.env`:
```bash
MONGO_URI=mongodb://admin:your_secure_password@127.0.0.1:27017/papjoy
```

### Backup Database

```powershell
mongodump --out "C:\backups\papjoy-backup" --db papjoy
```

### Restore Database

```powershell
mongorestore --db papjoy "C:\backups\papjoy-backup\papjoy"
```

### Delete All Data (⚠️ WARNING)

```powershell
mongosh
```

```javascript
use papjoy
db.dropDatabase()
```

---

## Troubleshooting

### "MongoDB service not starting"

**Solution 1:** Check if port 27017 is in use:
```powershell
netstat -ano | findstr :27017
```

**Solution 2:** Restart the service:
```powershell
Restart-Service MongoDB
```

**Solution 3:** Reinstall MongoDB (uninstall first, then follow Step 1)

### "mongosh: command not found"

**Solution:** Add MongoDB to PATH:
1. Open Environment Variables (Win+R → sysdm.cpl)
2. User Variables → Path → Edit
3. Add: `C:\Program Files\MongoDB\Server\7.0\bin`
4. Restart PowerShell

### Backend won't connect to MongoDB

**Check 1:** Is MongoDB service running?
```powershell
Get-Service MongoDB
```

**Check 2:** Is `.env` configured with correct URI?
```bash
MONGO_URI=mongodb://127.0.0.1:27017/papjoy
```

**Check 3:** Look at backend logs for errors:
```
❌ MongoDB connection error for 127.0.0.1:27017/papjoy
```

**Check 4:** Try connecting manually:
```powershell
mongosh "mongodb://127.0.0.1:27017/papjoy"
```

### Firewall Blocking Port 27017

**Windows Defender Firewall:**
1. Settings → Privacy & Security → Windows Defender Firewall
2. Allow an app through firewall
3. Add MongoDB or disable firewall for local development

---

## Development Workflow

### Daily Startup

```powershell
# 1. Ensure MongoDB is running
Start-Service MongoDB

# 2. Start backend
cd "c:\Users\arikta\Desktop\PAPJOY - Copy\Backend"
npm start

# 3. In another terminal, start frontend
cd "c:\Users\arikta\Desktop\PAPJOY - Copy\frontend"
# If using a dev server, start it here
```

### Daily Shutdown

```powershell
Stop-Service MongoDB

# Or just close terminals (services will keep running)
```

### Reset Database for Testing

```powershell
mongosh
use papjoy
db.dropDatabase()
exit
```

Then restart backend to re-seed:
```powershell
npm start
```

---

## Next Steps

Once MongoDB is running locally:

1. ✅ **Backend Setup**: Run `npm install` in Backend directory
2. ✅ **Environment**: Copy and edit `.env` with local MongoDB URI
3. ✅ **Start Server**: `npm start` (auto-seeds database)
4. ✅ **Test API**: `curl http://localhost:3000/api/v1/products`
5. ✅ **Frontend Development**: Point frontend to `http://localhost:3000`

---

## Production Migration

When ready to move to production:

1. **Create MongoDB Atlas account** at [atlas.mongodb.com](https://atlas.mongodb.com)
2. **Create cluster** and get connection string
3. **Update `.env`** with Atlas URI
4. **Whitelist IP addresses** in Atlas security settings
5. **Enable authentication** and strong passwords
6. **Set up backups** in Atlas console

---

## Resources

- **MongoDB Docs:** [docs.mongodb.com](https://docs.mongodb.com)
- **Mongosh CLI:** [mongosh documentation](https://www.mongodb.com/docs/mongosh/)
- **MongoDB Atlas:** [atlas.mongodb.com](https://atlas.mongodb.com)
- **PAP-JOY Backend:** See `Backend/index.js` for connection logic

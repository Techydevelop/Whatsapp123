# 🚀 Render Deployment Guide - WhatsApp GHL Integration

## 📋 Current Status
- **Backend:** Deployed on Render
- **Issue:** QR code generation not working

## ✅ Fix Applied
The code has been fixed to properly clear stale sessions and generate fresh QR codes.

---

## 🔧 Render Setup Steps

### Step 1: Push Latest Code to GitHub

```bash
# Make sure all changes are committed
git add .
git commit -m "Fixed QR code generation - clear stale sessions"
git push origin main
```

### Step 2: Render Dashboard Configuration

#### A. Service Settings
1. Go to: https://dashboard.render.com
2. Select your backend service
3. Check these settings:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Root Directory:** Leave empty (or `/`)

#### B. Environment Variables
Click "Environment" tab and add these:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://your-app.onrender.com/ghl/callback

PORT=3001
NODE_ENV=production

BACKEND_URL=https://your-app.onrender.com
FRONTEND_URL=https://your-frontend-url.vercel.app
```

**Important:** Replace `your-app.onrender.com` with your actual Render URL!

### Step 3: Persistent Disk Setup (Important!)

⚠️ **WhatsApp sessions need persistent storage!**

Render's filesystem is ephemeral (resets on each deploy). You need persistent disk:

1. Go to your service → "Disks" tab
2. Click "Add Disk"
3. Settings:
   - **Name:** `whatsapp-data`
   - **Mount Path:** `/opt/render/project/src/backend/data`
   - **Size:** 1 GB (minimum)
4. Click "Create"

**Alternative:** Use external storage (S3, etc.) but disk is easier.

### Step 4: Deploy

1. Click "Manual Deploy" → "Deploy latest commit"
2. Or auto-deploy is enabled by default on code push

---

## 🧪 Testing on Render

### Check Deployment Status
```bash
# View logs
# Go to: Render Dashboard → Your Service → Logs
```

### Test QR Generation

#### Option 1: Via Browser
```
https://your-app.onrender.com/ghl/provider?locationId=YOUR_LOCATION_ID
```

#### Option 2: Via API
```bash
# Windows PowerShell
Invoke-RestMethod -Uri "https://your-app.onrender.com/ghl/location/YOUR_LOCATION_ID/session" -Method POST

# Linux/Mac/Git Bash
curl -X POST https://your-app.onrender.com/ghl/location/YOUR_LOCATION_ID/session
```

### Check Health
```bash
curl https://your-app.onrender.com/
```

---

## 🔍 Important Render Considerations

### 1. **Data Persistence**
- ⚠️ Without persistent disk, WhatsApp sessions will be lost on redeploy
- Solution: Add persistent disk (see Step 3 above)
- Alternative: Store auth in database (more complex)

### 2. **Cold Starts**
- Free tier: Service spins down after inactivity
- First request after inactivity takes 30-60 seconds
- Solution: Upgrade to paid tier for always-on

### 3. **File Paths**
Render serves from: `/opt/render/project/src/`

Your paths should be:
```javascript
// backend/lib/baileys-wa.js
this.dataDir = path.join(__dirname, '../data'); // ✅ Correct
```

### 4. **Environment Variables**
- Set in Render Dashboard (not .env file)
- Changes require manual redeploy or auto-redeploy

---

## 🐛 Troubleshooting on Render

### Issue 1: QR Not Generating

**Check Render Logs:**
```
Render Dashboard → Your Service → Logs
```

Look for:
```
✅ Baileys client created for session: xxx
📱 QR already available, updating database immediately...
✅ QR updated in database immediately
```

**If missing, check:**
1. Is persistent disk mounted?
2. Are environment variables set?
3. Is Supabase accessible?

### Issue 2: Sessions Lost on Redeploy

**Cause:** No persistent disk
**Solution:** Add persistent disk (see Step 3)

### Issue 3: Service Unavailable

**Causes:**
- Service sleeping (free tier)
- Build failed
- Out of memory

**Check:**
1. Render Dashboard → Logs
2. Build logs for errors
3. Runtime logs for crashes

### Issue 4: Database Connection Errors

**Check:**
1. Supabase URL correct in env vars?
2. Service role key correct?
3. Supabase project active?

---

## 📊 Render-Specific Code Adjustments

### Current Code (Already Fixed)
```javascript
// backend/lib/baileys-wa.js - Line 8
this.dataDir = path.join(__dirname, '../data'); // ✅ Good

// This will be: /opt/render/project/src/backend/data
// Which maps to persistent disk if configured
```

### No Changes Needed!
The fix applied works perfectly with Render.

---

## 🔄 Deploy Workflow

### Option 1: Auto Deploy (Recommended)
1. Make changes locally
2. Commit to GitHub
3. Push to main branch
4. Render auto-deploys

```bash
git add .
git commit -m "Your changes"
git push origin main
# Wait 2-3 minutes for Render to deploy
```

### Option 2: Manual Deploy
1. Go to Render Dashboard
2. Select your service
3. Click "Manual Deploy"
4. Select branch/commit
5. Click "Deploy"

---

## 📱 Frontend Configuration

Update your frontend `.env`:

```env
# frontend/.env.local or Vercel environment variables
NEXT_PUBLIC_API_BASE_URL=https://your-app.onrender.com
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

---

## 🚀 Quick Fix for Current Deployment

### Step 1: Check Current Render Settings

Go to Render Dashboard and verify:
- [x] Environment variables set
- [x] Persistent disk added
- [x] Latest code deployed

### Step 2: Clear Old Data (One-time)

Since Render filesystem is ephemeral, old data should auto-clear on redeploy.

**But if persistent disk has old data:**

Option A: Delete and recreate disk
1. Render Dashboard → Disks
2. Delete `whatsapp-data` disk
3. Recreate with same settings
4. Redeploy service

Option B: Clear via SSH (if enabled)
```bash
# Connect via Render Shell
cd /opt/render/project/src/backend/data
rm -rf baileys_*
```

### Step 3: Redeploy

```bash
# Trigger redeploy
git commit --allow-empty -m "Redeploy to fix QR generation"
git push origin main
```

Or click "Manual Deploy" in Render Dashboard.

### Step 4: Test

```bash
curl -X POST https://your-app.onrender.com/ghl/location/YOUR_LOCATION_ID/session
```

---

## 📈 Monitoring

### Check Logs in Real-time
```
Render Dashboard → Your Service → Logs → Enable Auto-scroll
```

### Expected Logs After Fix:
```
🚀 Creating Baileys client for session: xxx
✅ Baileys client created for session: xxx
📱 QR already available, updating database immediately...
✅ QR updated in database immediately
```

### Metrics to Watch:
- Memory usage (should be < 512 MB)
- CPU usage (spikes during QR generation)
- Request duration (QR generation: 3-5 seconds)

---

## 💰 Render Pricing Considerations

### Free Tier
- ✅ Spins down after inactivity
- ⚠️ Cold starts (30-60s)
- ⚠️ Limited hours/month
- ⚠️ Can't add persistent disk

### Starter ($7/month)
- ✅ Always on
- ✅ Persistent disk support
- ✅ Better performance
- **Recommended for production**

---

## 🔐 Security Checklist

- [ ] All environment variables set (not in code)
- [ ] GHL_REDIRECT_URI matches Render URL
- [ ] BACKEND_URL matches Render URL
- [ ] Supabase RLS enabled
- [ ] HTTPS enabled (automatic on Render)
- [ ] No .env file committed to GitHub

---

## 📞 Support

### Render Issues
- Logs: Render Dashboard → Logs
- Status: https://status.render.com
- Docs: https://render.com/docs

### Code Issues
- Check: `TEST_QR_FIX.md`
- Check: `SETUP_GUIDE.md`

---

## ✅ Final Checklist for Render

- [ ] Latest code pushed to GitHub
- [ ] Render service connected to GitHub repo
- [ ] Environment variables configured in Render
- [ ] Persistent disk added and mounted to `/opt/render/project/src/backend/data`
- [ ] Service deployed successfully
- [ ] Logs show no errors
- [ ] QR generation tested and working
- [ ] Frontend updated with Render URL

---

## 🎯 Quick Commands

### Push Changes
```bash
git add .
git commit -m "Fixed QR generation"
git push origin main
```

### Test API
```bash
curl https://your-app.onrender.com/ghl/location/LOCATION_ID/session
```

### View Logs
```
https://dashboard.render.com → Your Service → Logs
```

---

**Your fix is ready! Just push to GitHub and Render will auto-deploy! 🚀**


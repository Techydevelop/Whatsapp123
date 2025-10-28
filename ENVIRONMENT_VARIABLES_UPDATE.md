# 🔧 Render Environment Variables Update

## ❌ Problem
Backend abhi bhi purane domain par URLs use kar raha hai kyunki Render mein environment variables update nahi hue.

## ✅ Solution
Render Dashboard mein in variables ko update karo:

---

## 📋 Environment Variables for Render Deployment

### Current Backend URL on Render:
Kya backend deployed hai on `api.octendr.com` domain? Agar nahi, to:

### Option 1: New Domain Setup
1. Render Dashboard mein jaao
2. Service settings → Custom Domain
3. Add domain: `api.octendr.com`
4. SSL certificate setup karo

### Option 2: Current Render URL Use Karein
Agar custom domain nahi setup hai, to environment variables mein actual Render URL use karo:

---

## 🔄 Update These Variables in Render Dashboard

### Navigate to: Render Dashboard → Your Backend Service → Environment

### 1. Update BACKEND_URL:
```
Key: BACKEND_URL
Value: https://api.octendr.com
```
OR (if custom domain not setup):
```
Value: https://whatsapp123-dhn1.onrender.com
```

### 2. Update FRONTEND_URL:
```
Key: FRONTEND_URL
Value: https://app.octendr.com
```
OR (if using Vercel):
```
Value: https://whatsapp123-frontend.vercel.app
```

### 3. Update GHL_REDIRECT_URI:
```
Key: GHL_REDIRECT_URI
Value: https://api.octendr.com/oauth/callback
```

### 4. Verify Other Variables:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
JWT_SECRET=your_jwt_secret
NODE_ENV=production
PORT=10000
```

---

## 🎯 Quick Checklist

### Step 1: Check Current Deployment
1. Go to Render Dashboard
2. Click on your backend service
3. Check "Environment" tab
4. Look for `BACKEND_URL` and `FRONTEND_URL`

### Step 2: Update Values
- Change to `https://api.octendr.com` (or your actual domain)
- Save changes
- Service will auto-restart

### Step 3: Verify
```bash
curl https://api.octendr.com/health
```
Should return: `{"status":"ok"}`

---

## 🔍 How to Check Which URLs Are Being Used

### In Backend Logs:
Render Dashboard → Logs → Check for:
```
Using BACKEND_URL: https://...
Provider webhook: https://...
```

### In Code (server.js):
Look at lines like:
```javascript
const webhook_url = `${process.env.BACKEND_URL || 'https://api.octendr.com'}/ghl/provider/webhook`
```

---

## 🚨 Current Issue
Agar `BACKEND_URL` environment variable Render mein set hai purane URL par, to:
- All webhook URLs wrong ban rahe hain
- Messages fail ho rahe hain
- OAuth redirects nahi chal rahe

**Solution**: Update environment variables aur service restart karo

---

## ✅ After Updating

1. Service auto-restart hoga
2. Wait 1-2 minutes
3. Test webhook URLs
4. GHL marketplace mein webhook URLs verify karo
5. Test message sending

---

**Note**: Agar custom domain (`api.octendr.com`) setup nahi hai, to Render ka default URL use karo: `https://your-service-name.onrender.com`


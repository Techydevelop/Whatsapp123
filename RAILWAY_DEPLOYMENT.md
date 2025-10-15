# 🚀 Railway Deployment Guide

## 📋 Prerequisites

1. **Railway Account** - Sign up at [railway.app](https://railway.app)
2. **GitHub Repository** - Your code should be on GitHub
3. **Environment Variables** - Supabase, GHL credentials ready

## 🔧 Step 1: Connect GitHub to Railway

1. **Go to Railway Dashboard**
2. **Click "New Project"**
3. **Select "Deploy from GitHub repo"**
4. **Choose your repository:** `Whatsapp123`
5. **Click "Deploy"**

## ⚙️ Step 2: Configure Service

### **Service Settings:**
- **Name:** `whatsapp-ghl-backend`
- **Root Directory:** `backend`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`

### **Environment Variables:**
```bash
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend.vercel.app

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# GHL Configuration
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://your-railway-url.up.railway.app/oauth/callback
```

## 🌐 Step 3: Get Railway URL

After deployment, Railway will provide:
- **Service URL:** `https://whatsapp-ghl-backend-production.up.railway.app`

## 🔄 Step 4: Update Frontend URLs

### **Update Vercel Environment Variables:**
```bash
NEXT_PUBLIC_API_URL=https://whatsapp-ghl-backend-production.up.railway.app
NEXT_PUBLIC_API_BASE_URL=https://whatsapp-ghl-backend-production.up.railway.app
```

### **Update GHL Redirect URI:**
```bash
GHL_REDIRECT_URI=https://whatsapp-ghl-backend-production.up.railway.app/oauth/callback
```

## 🎯 Step 5: Test Deployment

### **Health Check:**
```bash
curl https://whatsapp-ghl-backend-production.up.railway.app/health
```

### **Test QR Generation:**
1. **Go to Frontend**
2. **Create New Session**
3. **Check QR Code appears**

## 🚨 Troubleshooting

### **Common Issues:**

1. **Build Fails:**
   - Check Node.js version compatibility
   - Verify all dependencies in package.json

2. **Environment Variables:**
   - Ensure all required variables are set
   - Check variable names match exactly

3. **Database Connection:**
   - Verify Supabase credentials
   - Check database permissions

4. **GHL Integration:**
   - Update redirect URI in GHL dashboard
   - Verify client ID and secret

## 📊 Monitoring

### **Railway Dashboard:**
- **Logs:** Real-time application logs
- **Metrics:** CPU, Memory usage
- **Deployments:** Deployment history

### **Health Monitoring:**
- **Endpoint:** `/health`
- **Status:** Returns service status
- **Uptime:** Monitor service availability

## 🔄 Auto-Deploy

Railway automatically deploys when you push to GitHub:
1. **Push code to GitHub**
2. **Railway detects changes**
3. **Builds and deploys automatically**
4. **Service restarts with new code**

## 💡 Tips

1. **Use Railway CLI** for faster deployments
2. **Monitor logs** during first deployment
3. **Test all endpoints** after deployment
4. **Keep environment variables secure**

## 🎉 Success!

Once deployed successfully:
- ✅ **Service running** on Railway
- ✅ **QR generation** working
- ✅ **WhatsApp integration** active
- ✅ **GHL webhooks** connected

---

**Need Help?** Check Railway documentation or contact support!

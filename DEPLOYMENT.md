# Deployment Guide

## Quick Deploy to Production

### 1. Backend (Render)
1. Connect GitHub repo to Render
2. Create Web Service from this repo
3. Set environment variables in Render dashboard:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GHL_CLIENT_ID=your_ghl_client_id
   GHL_CLIENT_SECRET=your_ghl_client_secret
   GHL_REDIRECT_URI=https://your-backend.onrender.com/oauth/callback
   FRONTEND_URL=https://your-frontend.vercel.app
   PORT=3000
   NODE_ENV=production
   ```
4. Deploy

### 2. Frontend (Vercel)
1. Import `frontend` folder as Vercel project
2. Set environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```
3. Deploy

### 3. GoHighLevel Marketplace
1. Update Redirect URI to: `https://your-backend.onrender.com/oauth/callback`
2. Set scopes: `locations.readonly conversations.readonly conversations.write`
3. Set webhooks:
   - Lead: `https://your-backend.onrender.com/webhooks/ghl`
   - Agent Reply: `https://your-backend.onrender.com/webhooks/ghl-agent`

### 4. Test
1. Open Vercel URL → Login
2. Click "Login with GoHighLevel" → Complete OAuth
3. Select subaccount → Create WhatsApp session → Scan QR
4. Create test lead in GHL → Verify auto WhatsApp message

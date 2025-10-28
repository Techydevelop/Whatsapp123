# Environment Variables Setup

## Frontend (Vercel) Environment Variables

Add these environment variables in your Vercel dashboard:

### Required Variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend API Configuration
NEXT_PUBLIC_API_BASE_URL=https://api.octendr.com

# GHL OAuth Configuration (Frontend) - Use the same CLIENT_ID as backend
NEXT_PUBLIC_GHL_CLIENT_ID=your_ghl_client_id
```

### ⚠️ CRITICAL: GHL App Redirect URI Setup

**In your GHL Marketplace App settings, make sure you have added this exact redirect URI:**

```
https://api.octendr.com/oauth/callback
```

**Steps to add redirect URI in GHL:**
1. Go to GHL Marketplace → My Apps
2. Select your app
3. Go to Advanced Settings → Auth
4. In "Redirect URL" field, add: `https://api.octendr.com/oauth/callback`
5. Click "Add" button
6. Save changes

## Backend (Render) Environment Variables

Add these environment variables in your Render dashboard:

### Required Variables:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# GHL OAuth Configuration
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://api.octendr.com/oauth/callback
GHL_SCOPES=locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly users.readonly

# WhatsApp Configuration
WA_DATA_DIR=/opt/render/.wwebjs_auth

# Server Configuration
PORT=3001
FRONTEND_URL=https://whatsappghl.vercel.app
```

## How to Set Environment Variables:

### Vercel (Frontend):
1. Go to your Vercel dashboard
2. Select your project
3. Go to Settings → Environment Variables
4. Add each variable with its value

### Render (Backend):
1. Go to your Render dashboard
2. Select your service
3. Go to Environment tab
4. Add each variable with its value

## Important Notes:

- `NEXT_PUBLIC_` prefix is required for frontend environment variables
- Backend environment variables don't need any prefix
- Make sure to use the correct URLs for your deployments
- Keep your secrets secure and never commit them to version control

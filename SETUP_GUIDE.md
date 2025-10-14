# 🚀 WhatsApp-GHL Integration Setup Guide

## 📋 Prerequisites
- Node.js 18+ installed
- Supabase account
- GHL (GoHighLevel) account with API access

---

## 1️⃣ Backend Setup

### Step 1: Create Backend Environment File

Create `backend/.env` file with the following content:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_ANON_KEY=your_anon_key_here

# GHL Configuration
GHL_CLIENT_ID=your_ghl_client_id_here
GHL_CLIENT_SECRET=your_ghl_client_secret_here
GHL_REDIRECT_URI=http://localhost:3001/ghl/callback
GHL_SCOPES=locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly medias.write

# Server Configuration
PORT=3001
NODE_ENV=development

# Backend URL (for WhatsApp webhooks)
BACKEND_URL=http://localhost:3001

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### Step 2: Install Backend Dependencies

```bash
cd backend
npm install
```

### Step 3: Create Data Directory

```bash
mkdir -p backend/data
```

### Step 4: Start Backend Server

```bash
cd backend
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

---

## 2️⃣ Frontend Setup

### Step 1: Create Frontend Environment File

Create `frontend/.env.local` file with the following content:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# Backend API URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

# App Configuration
NEXT_PUBLIC_APP_NAME=WhatsApp GHL Integration
```

### Step 2: Install Frontend Dependencies

```bash
cd frontend
npm install
```

### Step 3: Start Frontend Development Server

```bash
cd frontend
npm run dev
```

The frontend will be available at: http://localhost:3000

---

## 3️⃣ Supabase Database Setup

### Required Tables:

#### 1. `ghl_accounts` Table
```sql
CREATE TABLE public.ghl_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  company_id TEXT NOT NULL,
  location_id TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_ghl_accounts_user_id ON public.ghl_accounts(user_id);
CREATE INDEX idx_ghl_accounts_location_id ON public.ghl_accounts(location_id);
```

#### 2. `sessions` Table
```sql
CREATE TABLE public.sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subaccount_id UUID NOT NULL REFERENCES public.ghl_accounts(id) ON DELETE CASCADE,
  phone_number TEXT,
  status TEXT NOT NULL CHECK (status IN ('initializing', 'qr', 'ready', 'disconnected')),
  qr TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_subaccount_id ON public.sessions(subaccount_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);
```

#### 3. `messages` Table (Optional - for logging)
```sql
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subaccount_id UUID NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_messages_session_id ON public.messages(session_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
```

---

## 4️⃣ GHL API Setup

### Step 1: Get GHL API Credentials

1. Login to your GHL account
2. Go to Settings → Integrations → API
3. Create a new OAuth app:
   - **App Name**: WhatsApp Integration
   - **Redirect URI**: `http://localhost:3001/ghl/callback` (for development)
   - **Scopes**: Select all required scopes (conversations, contacts, locations, media, etc.)
4. Copy the **Client ID** and **Client Secret**

### Step 2: Update Environment Variables

Update your `backend/.env` file with:
- `GHL_CLIENT_ID`
- `GHL_CLIENT_SECRET`
- `GHL_REDIRECT_URI`

---

## 5️⃣ Testing the Setup

### 1. Check Backend Status
Visit: http://localhost:3001/health (if you have a health endpoint)

### 2. Check Frontend
Visit: http://localhost:3000

### 3. Test GHL Connection
1. Login to the frontend
2. Go to Integrations → Connect GHL
3. Follow the OAuth flow

### 4. Test WhatsApp Connection
1. Go to Dashboard
2. Click "Create Session"
3. Scan QR code with WhatsApp
4. Wait for connection status to show "Connected"

---

## 6️⃣ File Structure

```
backend/
├── lib/
│   ├── baileys-wa.js       # WhatsApp client manager
│   ├── ghl.js              # GHL API client
│   └── phone.js            # Phone number utilities
├── mediaHandler.js         # Media upload handler (NEW)
├── server.js               # Main server file
├── package.json
└── .env                    # Environment variables (CREATE THIS)

frontend/
├── src/
│   ├── app/                # Next.js pages
│   ├── components/         # React components
│   └── lib/
│       ├── config.ts       # API configuration
│       └── supabase.ts     # Supabase client
├── package.json
└── .env.local              # Environment variables (CREATE THIS)
```

---

## 🔧 Troubleshooting

### Backend Issues

**Problem: Module not found errors**
```bash
cd backend
npm install
```

**Problem: Port already in use**
```bash
# Change PORT in backend/.env
PORT=3002
```

**Problem: Supabase connection errors**
- Check SUPABASE_URL and keys in `.env`
- Verify network connection
- Check Supabase project status

### Frontend Issues

**Problem: API connection errors**
- Ensure backend is running on correct port
- Check `NEXT_PUBLIC_API_BASE_URL` in `.env.local`
- Check browser console for CORS errors

**Problem: Build errors**
```bash
cd frontend
rm -rf .next node_modules
npm install
npm run dev
```

### WhatsApp Issues

**Problem: QR code not generating**
1. Check backend logs for errors
2. Verify `backend/data` directory exists and is writable
3. Clear old session data:
   ```bash
   rm -rf backend/data/baileys_*
   ```
4. Try creating a new session

**Problem: Connection drops frequently**
- WhatsApp may be logged in on multiple devices
- Check your internet connection
- Review backend logs for disconnect reasons

---

## 📚 Key Features

✅ **Multi-session WhatsApp Management**
- Multiple WhatsApp numbers per account
- QR code authentication
- Auto-reconnection

✅ **GHL Integration**
- Two-way messaging
- Contact sync
- Conversation management
- Media upload support

✅ **Media Handling**
- Image upload
- Video upload
- Voice message support
- Document handling

✅ **Session Management**
- Create/delete sessions
- Monitor connection status
- Session persistence

---

## 🔐 Security Notes

1. **Never commit `.env` files** to git
2. **Use strong secrets** for production
3. **Enable HTTPS** in production
4. **Restrict CORS** to your frontend domain
5. **Use Supabase RLS** (Row Level Security)

---

## 🚀 Production Deployment

### Backend (Render/Railway/Vercel)

1. Set environment variables in hosting platform
2. Update `GHL_REDIRECT_URI` to production URL
3. Update `BACKEND_URL` to production API URL
4. Enable HTTPS

### Frontend (Vercel/Netlify)

1. Set environment variables
2. Update `NEXT_PUBLIC_API_BASE_URL` to production backend URL
3. Deploy

---

## 📞 Support

If you encounter issues:
1. Check logs in `backend/` terminal
2. Check browser console for frontend errors
3. Verify all environment variables are set
4. Ensure Supabase tables are created correctly

---

## ✅ Checklist

- [ ] Backend `.env` file created with correct values
- [ ] Frontend `.env.local` file created with correct values
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] Supabase tables created
- [ ] GHL OAuth app created
- [ ] Backend server running
- [ ] Frontend server running
- [ ] Can access frontend at http://localhost:3000
- [ ] Can connect GHL account
- [ ] Can create WhatsApp session
- [ ] Can scan QR code successfully

---

**Happy coding! 🎉**


# ⚡ Quick Start Guide

## 🚀 Automated Setup (Recommended)

### Windows (PowerShell):
```powershell
.\setup.ps1
```

### Linux/Mac:
```bash
chmod +x setup.sh
./setup.sh
```

---

## 📝 Manual Setup

### 1. Backend Configuration

Create `backend/.env`:
```bash
cd backend
cp env.example .env
```

Edit `.env` and add:
- Supabase URL & Keys
- GHL Client ID & Secret
- Other configurations

### 2. Frontend Configuration

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

### 3. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 4. Create Data Directory

```bash
mkdir -p backend/data
```

---

## 🏃 Running the Application

### Terminal 1 - Backend:
```bash
cd backend
npm start
```

Backend runs on: http://localhost:3001

### Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

Frontend runs on: http://localhost:3000

---

## ✅ Files Created/Updated

### New Files:
- ✅ `backend/mediaHandler.js` - Media upload handler
- ✅ `SETUP_GUIDE.md` - Detailed setup instructions
- ✅ `setup.sh` - Automated setup (Linux/Mac)
- ✅ `setup.ps1` - Automated setup (Windows)

### Updated Files:
- ✅ `backend/server.js` - From GitHub (working version)
- ✅ `backend/lib/baileys-wa.js` - From GitHub (working version)

### Files You Need to Create:
- ⚠️ `backend/.env` - Backend environment variables
- ⚠️ `frontend/.env.local` - Frontend environment variables

---

## 🔧 Key Environment Variables

### Backend (`backend/.env`):
```env
SUPABASE_URL=              # From Supabase dashboard
SUPABASE_SERVICE_ROLE_KEY= # From Supabase dashboard  
SUPABASE_ANON_KEY=         # From Supabase dashboard
GHL_CLIENT_ID=             # From GHL API settings
GHL_CLIENT_SECRET=         # From GHL API settings
GHL_REDIRECT_URI=http://localhost:3001/ghl/callback
PORT=3001
BACKEND_URL=http://localhost:3001
```

### Frontend (`frontend/.env.local`):
```env
NEXT_PUBLIC_SUPABASE_URL=      # Same as backend
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Same as backend
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

---

## 📊 Supabase Tables

Run these SQL commands in Supabase SQL Editor:

```sql
-- 1. GHL Accounts Table
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

CREATE INDEX idx_ghl_accounts_user_id ON public.ghl_accounts(user_id);
CREATE INDEX idx_ghl_accounts_location_id ON public.ghl_accounts(location_id);

-- 2. Sessions Table
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

CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_subaccount_id ON public.sessions(subaccount_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);

-- 3. Messages Table (Optional)
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

CREATE INDEX idx_messages_session_id ON public.messages(session_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
```

---

## 🧪 Testing

1. **Backend Health Check:**
   ```bash
   curl http://localhost:3001/
   ```

2. **Frontend Access:**
   - Open: http://localhost:3000
   - Login with Supabase auth

3. **Test WhatsApp Connection:**
   - Create a new session
   - Scan QR code
   - Send test message

---

## 🐛 Common Issues

### Issue: "Module not found: mediaHandler"
**Solution:** File already created at `backend/mediaHandler.js`

### Issue: Backend won't start
**Solutions:**
- Check `.env` file exists in `backend/`
- Verify all environment variables are set
- Check port 3001 is not in use

### Issue: Frontend shows "Failed to fetch"
**Solutions:**
- Ensure backend is running
- Check `NEXT_PUBLIC_API_BASE_URL` in `.env.local`
- Verify CORS settings

### Issue: QR code not generating
**Solutions:**
- Clear old sessions: `rm -rf backend/data/baileys_*`
- Restart backend server
- Check backend logs for errors

---

## 📚 Documentation

- 📖 **Detailed Setup:** See `SETUP_GUIDE.md`
- 🔧 **GHL Integration:** See `GHL_INTEGRATION_GUIDE.md`
- 🔍 **Troubleshooting:** See `SETUP_GUIDE.md` Troubleshooting section

---

## 🎯 Feature Checklist

- ✅ WhatsApp multi-session management
- ✅ GHL OAuth integration
- ✅ Two-way messaging (WhatsApp ↔️ GHL)
- ✅ Media upload (images, videos, audio)
- ✅ Contact sync
- ✅ Conversation management
- ✅ Auto-reconnection
- ✅ QR code authentication

---

## 🚀 Production Deployment

For production deployment:
1. Update all URLs to production domains
2. Enable HTTPS
3. Set strong secrets
4. Enable Supabase RLS
5. Configure CORS properly

See `SETUP_GUIDE.md` for production deployment details.

---

**Need help? Check `SETUP_GUIDE.md` for detailed instructions!** 🎉


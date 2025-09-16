# WhatsApp SaaS Setup Guide

## 🚀 **Complete Setup Instructions**

### **1. Environment Variables Setup**

#### **Backend (.env file in root directory):**
```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# GHL Configuration
GHL_CLIENT_ID=your_ghl_client_id_here
GHL_CLIENT_SECRET=your_ghl_client_secret_here
GHL_REDIRECT_URI=http://localhost:3000/auth/ghl/callback
GHL_API_KEY=your_ghl_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

#### **Frontend (.env.local file in frontend directory):**
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### **2. Database Setup**

1. **Create Supabase Project:**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Copy your project URL and anon key

2. **Run Database Schema:**
   - Go to Supabase SQL Editor
   - Copy and paste the contents of `supabase-schema.sql`
   - Execute the SQL to create tables and RLS policies

### **3. GHL Integration Setup**

1. **Create GHL App:**
   - Go to [GoHighLevel Marketplace](https://marketplace.leadconnectorhq.com/)
   - Create a new app
   - Set redirect URI: `http://localhost:3000/auth/ghl/callback`
   - Copy Client ID and Client Secret

2. **Update Environment Variables:**
   - Add your GHL credentials to the backend `.env` file
   - Add `FRONTEND_URL=http://localhost:3001` to backend `.env`

### **4. Running the Application**

#### **Backend (Terminal 1):**
```bash
cd whatsapp-saas
npm install
node server.js
```
Backend will run on: http://localhost:3000

#### **Frontend (Terminal 2):**
```bash
cd whatsapp-saas/frontend
npm install
npm run dev
```
Frontend will run on: http://localhost:3001

### **5. Application Features**

#### **✅ What's Working:**
- ✅ **Next.js 14+ Frontend** with App Router
- ✅ **Express Backend** with WhatsApp multi-session support
- ✅ **Supabase Database** with RLS security
- ✅ **Real-time Chat** with Supabase subscriptions
- ✅ **QR Code Display** inline on dashboard
- ✅ **GHL OAuth Integration** ready
- ✅ **Multi-tenant Architecture** with subaccounts
- ✅ **WhatsApp Message Handling** (incoming/outgoing)

#### **🎯 User Flow:**
1. **Login Options:**
   - **GHL Direct Login** → Login with existing GHL account (recommended)
   - **Email/Password** → Traditional signup
2. **Auto-setup** → GHL users get automatic subaccount creation
3. **Create WhatsApp Session** → Scan QR code
4. **Real-time Chat** → Send/receive messages
5. **GHL Integration** → Auto-send messages to leads
6. **Multi-tenant** → Manage multiple GHL locations

### **6. Testing the Application**

1. **Open:** http://localhost:3001
2. **Login Options:**
   - **GHL Direct Login:** Click "Login with GoHighLevel" → Complete OAuth flow
   - **Email/Password:** Traditional signup/login
3. **GHL Users:** Automatic subaccount creation with your GHL location
4. **Create a WhatsApp session** and scan QR
5. **Test messaging** in the chat interface

### **7. GHL Integration Testing**

1. **Connect GHL Account** via OAuth
2. **Add Location ID** to subaccount
3. **Test webhook** by sending POST to:
   ```
   POST http://localhost:3000/webhooks/ghl
   {
     "subaccountId": "your-subaccount-id",
     "name": "Test Lead",
     "phone": "1234567890",
     "text": "Hello from GHL!"
   }
   ```

### **8. Deployment**

#### **Backend (Render):**
- Connect GitHub repository
- Set environment variables
- Deploy from main branch

#### **Frontend (Vercel):**
- Connect GitHub repository
- Set environment variables
- Deploy from main branch

### **9. Troubleshooting**

#### **Common Issues:**
- **Port conflicts:** Backend (3000), Frontend (3001)
- **Environment variables:** Make sure all are set correctly
- **Supabase RLS:** Check policies are enabled
- **WhatsApp QR:** Make sure to scan with phone camera

#### **Debug Commands:**
```bash
# Check backend health
curl http://localhost:3000/health

# Check frontend
curl http://localhost:3001

# Check Supabase connection
# Go to Supabase dashboard → Table Editor
```

### **10. Next Steps**

1. **Set up your environment variables**
2. **Run the database schema**
3. **Start both servers**
4. **Test the complete flow**
5. **Deploy to production**

---

## 🎉 **You're Ready to Go!**

The application is now fully built with:
- ✅ Modern Next.js 14+ frontend
- ✅ Robust Express backend
- ✅ Secure Supabase database
- ✅ Real-time WhatsApp integration
- ✅ GHL OAuth ready
- ✅ Multi-tenant architecture

**Just add your environment variables and you're good to go!**

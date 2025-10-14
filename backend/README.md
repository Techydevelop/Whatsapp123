# WhatsApp-GHL Integration Backend

## 🚀 Quick Start

```bash
npm install
npm start
```

Server runs on port 3001 (or PORT environment variable)

---

## 📦 Features

✅ **WhatsApp Integration** - Baileys library for WhatsApp Web  
✅ **GHL OAuth** - GoHighLevel account linking  
✅ **Text Messages** - Bidirectional text messaging (WhatsApp ↔ GHL)  
✅ **Multi-Session** - Multiple WhatsApp connections per user  
✅ **QR Code Generation** - Easy WhatsApp connection setup  

---

## 🔧 Environment Variables

Create `.env` file:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# GHL OAuth
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://your-backend-url.com/oauth/callback
GHL_SCOPES=locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly medias.write

# Server
PORT=3001
BACKEND_URL=https://your-backend-url.com

# GHL Provider (optional)
GHL_PROVIDER_ID=your_provider_id
```

---

## 📁 Project Structure

```
backend/
├── lib/
│   ├── baileys-wa.js    # WhatsApp client manager
│   ├── ghl.js           # GHL API client
│   └── phone.js         # Phone number utilities
├── mediaHandler.js      # Media upload/download
├── server.js            # Main Express server
├── package.json         # Dependencies
└── .env                 # Environment variables
```

---

## 🔗 API Endpoints

### WhatsApp Session Management
- `POST /ghl/location/:locationId/session` - Create new session
- `GET /ghl/location/:locationId/session` - Get session status
- `POST /ghl/location/:locationId/session/logout` - Disconnect session

### GHL Integration
- `GET /oauth/initiate` - Start GHL OAuth flow
- `GET /oauth/callback` - OAuth callback handler
- `GET /ghl/locations` - Get GHL locations
- `POST /webhooks/ghl/provider-outbound` - Send messages from GHL to WhatsApp

### Provider Testing
- `POST /ghl/provider/test` - Test WhatsApp provider in GHL

---

## 📱 How It Works

1. **User logs in** with Supabase Auth
2. **Connects GHL account** via OAuth
3. **Creates WhatsApp session** for each location
4. **Scans QR code** to link WhatsApp
5. **Text messages sync** bidirectionally (WhatsApp ↔ GHL)
6. **Note:** Media (images/videos) not supported - text only

---

## 🐛 Troubleshooting

### QR Code Not Generating

```bash
# Clear Baileys data
Remove-Item -Recurse -Force data/baileys_*

# Restart server
npm start
```

### Dependencies

```bash
# Reinstall
npm install

# Check Baileys version
npm list baileys
```

---

## 📚 Database Tables

### Required Supabase Tables:

1. **sessions** - WhatsApp session storage
2. **ghl_accounts** - GHL OAuth tokens
3. **messages** - Message history (optional)
4. **subaccounts** - Location/subaccount data (optional)

---

## ✅ Production Ready

- ✅ Supabase Auth integration
- ✅ GHL OAuth flow
- ✅ WhatsApp connection management
- ✅ Bidirectional text messages (WhatsApp ↔ GHL)
- ❌ Media not supported (images, videos, audio)
- ✅ Error handling
- ✅ Auto-reconnection
- ✅ Clean, minimal codebase

---

**For issues, check logs and ensure all environment variables are set correctly.**


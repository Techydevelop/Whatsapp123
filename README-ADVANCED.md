# 🚀 Advanced WhatsApp-GHL Integration System

A production-ready, multi-tenant WhatsApp integration that plugs into GoHighLevel (GHL) as a Conversations Provider. This system enables seamless two-way messaging between GoHighLevel and WhatsApp with real-time synchronization.

## 🏗️ Architecture

- **Frontend**: Next.js 14 App Router + Tailwind CSS (Deployed on Vercel)
- **Backend**: Node.js + Express (Deployed on Render/Railway)
- **WhatsApp**: whatsapp-web.js with LocalAuth (Multi-session support)
- **Database**: Supabase (PostgreSQL with RLS + Realtime)
- **Integration**: GoHighLevel Conversations Provider API

## 🚨 Important Notes

- **DO NOT** run whatsapp-web.js or puppeteer on Vercel
- Backend must run on Render/Railway/VPS for WhatsApp functionality
- Frontend can run on Vercel without issues

## 📋 Prerequisites

1. **GoHighLevel Account** with API access
2. **Supabase Project** with PostgreSQL
3. **Render/Railway Account** for backend deployment
4. **Vercel Account** for frontend deployment
5. **Node.js 18+** for local development

## 🔧 Environment Variables

### Frontend (Vercel)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_API_URL=https://whatsapp123-dhn1.onrender.com
```

### Backend (Render/Railway)
```env
PORT=3000
NODE_ENV=production

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Frontend
FRONTEND_URL=https://your-frontend-domain.vercel.app

# GoHighLevel
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://whatsapp123-dhn1.onrender.com/oauth/callback
GHL_API_KEY=your_ghl_api_key
PROVIDER_ID=your_conversation_provider_id

# WhatsApp (Optional)
WA_DATA_DIR=/data/wa
```

## 🗄️ Database Setup

1. **Create Supabase Project**
2. **Run the SQL Schema**:
   ```bash
   # Copy supabase-schema.sql content and run in Supabase SQL Editor
   ```

3. **Enable RLS** (already included in schema)
4. **Enable Realtime** (already included in schema)

## 🚀 Deployment

### Backend (Render/Railway)

1. **Create New Service**
2. **Connect GitHub Repository**
3. **Configure Build Settings**:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server-enhanced.js`
4. **Set Environment Variables** (see above)
5. **Deploy**

### Frontend (Vercel)

1. **Import Project from GitHub**
2. **Set Root Directory**: `frontend`
3. **Configure Environment Variables** (see above)
4. **Deploy**

## 🔗 GoHighLevel Setup

### 1. Create Marketplace App

1. Go to [GoHighLevel Marketplace](https://marketplace.leadconnectorhq.com/)
2. Create new app with these settings:
   - **App Name**: WhatsApp Integration
   - **Redirect URI**: `https://whatsapp123-dhn1.onrender.com/oauth/callback`
   - **Scopes**: 
     - `locations.readonly`
     - `conversations.readonly`  // ✅ Read conversations
     - `conversations.write`     // ✅ Write conversations

### 2. Configure Conversations Provider

1. In your GoHighLevel account, go to **Settings → Integrations → Conversations**
2. Add new provider:
   - **Provider Name**: WhatsApp Integration
   - **Provider Type**: Custom
   - **Always Show**: Yes
   - **Delivery URL**: `https://whatsapp123-dhn1.onrender.com/ghl/provider-outbound`

### 3. Get Provider ID

1. After creating the provider, note the `conversationProviderId`
2. Add it to your backend environment variables as `PROVIDER_ID`

## 📱 Features

### ✅ Core Features
- **Multi-tenant Architecture** with RLS security
- **Real-time Messaging** via Supabase Realtime
- **WhatsApp QR Code** authentication
- **Media Support** (images, documents, etc.)
- **Phone Number Normalization** (E.164 format)
- **Session Management** (multiple WhatsApp accounts)
- **Provider Status** monitoring

### ✅ GoHighLevel Integration
- **OAuth 2.0** authentication flow
- **Conversations Provider** API integration
- **Two-way Messaging** (GHL ↔ WhatsApp)
- **Location-based** subaccount management
- **Real-time** message synchronization
- **Conversation History** reading and display
- **Message Search** and filtering

### ✅ Advanced Features
- **Rate Limiting** on message sending
- **Error Handling** with detailed logging
- **Session Recovery** and reconnection
- **Provider Testing** tools
- **Multi-session** WhatsApp support

## 🧪 Testing

### 1. Test OAuth Flow
```bash
curl -X GET "https://whatsapp123-dhn1.onrender.com/auth/ghl/connect"
```

### 2. Test Session Creation
```bash
curl -X POST "https://whatsapp123-dhn1.onrender.com/admin/create-session" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subaccountId": "your-subaccount-id"}'
```

### 3. Test Message Sending
```bash
curl -X POST "https://whatsapp123-dhn1.onrender.com/messages/send" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "to": "923001234567",
    "body": "Test message",
    "mediaUrl": "https://example.com/image.jpg"
  }'
```

### 4. Test GHL Provider Outbound
```bash
curl -X POST "https://whatsapp123-dhn1.onrender.com/ghl/provider-outbound" \
  -H "Content-Type: application/json" \
  -d '{
    "locationId": "your-location-id",
    "phone": "923001234567",
    "message": "Test from GHL",
    "attachments": [{"url": "https://example.com/image.jpg", "mime": "image/jpeg"}]
  }'
```

## 📊 API Endpoints

### Authentication
- `GET /auth/ghl/connect` - Get GHL OAuth URL
- `GET /auth/ghl/callback` - Handle OAuth callback

### Session Management
- `POST /admin/create-session` - Create WhatsApp session
- `GET /admin/session/:id` - Get session status
- `GET /admin/sessions` - List user sessions

### Messaging
- `POST /messages/send` - Send WhatsApp message
- `GET /messages/session/:id` - Get session messages

### GHL Provider
- `POST /ghl/provider-outbound` - Handle GHL outbound messages
- `POST /ghl/message-status` - Update message status

### GHL Conversations (NEW!)
- `GET /admin/ghl/conversations` - Get GHL conversations
- `GET /admin/ghl/conversation/:id` - Get specific conversation
- `GET /admin/ghl/conversation/:id/messages` - Get conversation messages
- `GET /admin/ghl/search-conversations` - Search conversations

## 🔒 Security Features

- **JWT Authentication** for all protected routes
- **Row Level Security** (RLS) on all database tables
- **Rate Limiting** on message endpoints
- **Input Validation** and sanitization
- **CORS Protection** with specific origins
- **Helmet.js** security headers

## 📱 Phone Number Handling

The system automatically normalizes phone numbers to E.164 format:
- **Input**: `03001234567` or `+92 300 123 4567`
- **Normalized**: `+923001234567`
- **WhatsApp JID**: `923001234567@c.us`

## 🖼️ Media Support

- **Supported Types**: Images, Documents, Audio, Video
- **Outbound**: GHL → WhatsApp (via URL)
- **Inbound**: WhatsApp → GHL (via attachment)
- **Storage**: Temporary URL forwarding

## 🚨 Troubleshooting

### Common Issues

1. **WhatsApp QR Not Showing**
   - Check if backend is running on Render/Railway
   - Verify puppeteer installation
   - Check browser console for errors

2. **GHL OAuth Fails**
   - Verify redirect URI matches exactly
   - Check client ID and secret
   - Ensure scopes are correct

3. **Messages Not Syncing**
   - Check Supabase Realtime is enabled
   - Verify RLS policies
   - Check provider installation

4. **Session Disconnects**
   - WhatsApp Web sessions expire
   - Recreate session when needed
   - Check network connectivity

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
DEBUG=whatsapp-web.js:*
```

## 📈 Monitoring

### Health Checks
- `GET /` - Backend health status
- Session status monitoring
- Provider connection status

### Logs
- Structured logging with timestamps
- Error tracking and alerting
- Performance metrics

## 🔄 Updates & Maintenance

### Database Migrations
- All schema changes are backward compatible
- Use `IF NOT EXISTS` for safe updates
- Test migrations on staging first

### WhatsApp Updates
- Monitor whatsapp-web.js updates
- Test with new WhatsApp versions
- Update puppeteer as needed

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review logs in Render/Railway dashboard
3. Test with curl commands provided
4. Verify all environment variables

## 🎯 Production Checklist

- [ ] All environment variables set
- [ ] Database schema deployed
- [ ] RLS policies enabled
- [ ] Realtime subscriptions working
- [ ] GHL app configured correctly
- [ ] Provider installation complete
- [ ] Rate limiting configured
- [ ] Error monitoring setup
- [ ] Backup strategy in place
- [ ] SSL certificates valid

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**Built with ❤️ for seamless WhatsApp-GHL integration**

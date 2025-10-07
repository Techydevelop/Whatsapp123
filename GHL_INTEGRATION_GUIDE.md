# 🚀 GoHighLevel (GHL) Integration Guide

## 📋 Overview
This guide explains how to integrate with GoHighLevel API for custom applications. Perfect for building WhatsApp-GHL bridges, CRM integrations, or any GHL-based solutions.

## 🔑 Prerequisites

### 1. GHL Marketplace App Setup
1. Go to [GHL Marketplace](https://marketplace.gohighlevel.com/)
2. Create a new app
3. Set required scopes:
   ```
   locations.readonly
   conversations.write
   conversations.readonly
   conversations/message.readonly
   conversations/message.write
   contacts.readonly
   contacts.write
   businesses.readonly
   users.readonly
   medias.write
   medias.readonly
   ```

### 2. Environment Variables
```env
GHL_CLIENT_ID=your_client_id
GHL_CLIENT_SECRET=your_client_secret
GHL_REDIRECT_URI=https://yourdomain.com/ghl/callback
GHL_PROVIDER_ID=your_provider_id
```

## 🔄 OAuth 2.0 Flow

### Step 1: Authorization URL
```javascript
const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`;
```

### Step 2: Handle Callback
```javascript
app.get('/ghl/callback', async (req, res) => {
  const { code, locationId } = req.query;
  
  // Exchange code for tokens
  const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      redirect_uri: GHL_REDIRECT_URI
    })
  });
  
  const tokens = await tokenResponse.json();
  // Store tokens in database
});
```

### Step 3: Token Refresh
```javascript
async function refreshGHLToken(ghlAccount) {
  const formData = new URLSearchParams();
  formData.append('grant_type', 'refresh_token');
  formData.append('refresh_token', ghlAccount.refresh_token);
  formData.append('client_id', GHL_CLIENT_ID);
  formData.append('client_secret', GHL_CLIENT_SECRET);

  const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString()
  });

  const tokenData = await response.json();
  // Update database with new tokens
}
```

## 📊 Database Schema

### GHL Accounts Table
```sql
CREATE TABLE ghl_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  location_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  subaccount_id UUID REFERENCES ghl_accounts(id),
  status TEXT DEFAULT 'initializing',
  qr TEXT,
  phone_number TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🔗 Core API Endpoints

### 1. Create WhatsApp Session
```javascript
app.post('/ghl/location/:locationId/session', async (req, res) => {
  const { locationId } = req.params;
  
  // Get GHL account
  const { data: ghlAccount } = await supabase
    .from('ghl_accounts')
    .select('*')
    .eq('location_id', locationId)
    .single();
  
  // Create session
  const { data: session } = await supabase
    .from('sessions')
    .insert({
      user_id: ghlAccount.user_id,
      subaccount_id: ghlAccount.id,
      status: 'initializing'
    })
    .select()
    .single();
  
  // Initialize WhatsApp client
  const sessionName = `location_${locationId}_${session.id}`;
  await waManager.createClient(sessionName);
  
  res.json({ session_id: session.id, status: 'initializing' });
});
```

### 2. WhatsApp Webhook (Inbound Messages)
```javascript
app.post('/whatsapp/webhook', async (req, res) => {
  const { from, message, messageType, mediaUrl, sessionId } = req.body;
  
  // Get GHL account from session
  const { data: session } = await supabase
    .from('sessions')
    .select('*, ghl_accounts(*)')
    .eq('id', sessionId)
    .single();
  
  const ghlAccount = session.ghl_accounts;
  
  // Upsert contact
  const contactResponse = await fetch(`https://services.leadconnectorhq.com/contacts/upsert`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ghlAccount.access_token}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone: phone,
      name: phone,
      locationId: ghlAccount.location_id
    })
  });
  
  const contactData = await contactResponse.json();
  const contactId = contactData.contact?.id;
  
  // Send message to GHL
  const messagePayload = {
    type: "WhatsApp",
    contactId: contactId,
    message: message,
    direction: "inbound",
    status: "delivered",
    altId: `wa_${Date.now()}`
  };
  
  await fetch(`https://services.leadconnectorhq.com/conversations/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ghlAccount.access_token}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(messagePayload)
  });
  
  res.json({ status: 'success' });
});
```

### 3. GHL Provider Webhook (Outbound Messages)
```javascript
app.post('/ghl/provider/webhook', async (req, res) => {
  const { locationId, phone, message, contactId } = req.body;
  
  // Get GHL account
  const { data: ghlAccount } = await supabase
    .from('ghl_accounts')
    .select('*')
    .eq('location_id', locationId)
    .single();
  
  // Get WhatsApp session
  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('subaccount_id', ghlAccount.id)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  
  // Send WhatsApp message
  const clientKey = `location_${locationId}_${session.id}`;
  const waNumber = phone.replace('+', '') + '@s.whatsapp.net';
  
  await waManager.sendMessage(clientKey, waNumber, message, 'text', null);
  
  res.json({ status: 'success' });
});
```

## 📱 WhatsApp Integration (Baileys)

### Client Management
```javascript
class BaileysWhatsAppManager {
  async createClient(sessionId) {
    const authDir = path.join(this.dataDir, `baileys_${sessionId}`);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp-GHL', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: true,
      fireInitQueries: true,
      emitOwnEvents: false
    });
    
    // Handle connection updates
    socket.ev.on('connection.update', (update) => {
      if (update.connection === 'open') {
        console.log('✅ WhatsApp connected');
        this.clients.set(sessionId, {
          socket,
          status: 'connected',
          lastUpdate: Date.now()
        });
      }
    });
    
    // Handle incoming messages
    socket.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message || msg.key.fromMe) return;
      
      // Send to webhook
      await fetch('https://yourdomain.com/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: msg.key.remoteJid,
          message: msg.message.conversation || 'Media message',
          messageType: msg.message.imageMessage ? 'image' : 'text',
          sessionId: sessionId,
          whatsappMsgId: msg.key.id
        })
      });
    });
  }
}
```

## 🎯 Dashboard Integration

### Connection Status
```javascript
const fetchGHLLocations = async () => {
  const response = await fetch('/api/ghl/locations');
  const data = await response.json();
  
  setGhlAccount(data.ghlAccount);
  setLocations(data.locations);
};
```

### Sync Subaccounts
```javascript
const syncAllSubaccounts = async () => {
  const response = await fetch('/admin/ghl/sync-all-subaccounts', {
    method: 'POST'
  });
  
  const result = await response.json();
  console.log('Sync completed:', result);
};
```

## 🔧 Media Handling

### Download WhatsApp Media
```javascript
async function downloadWhatsAppMedia(mediaUrl) {
  const response = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': 'WhatsApp/2.0',
      'Accept': '*/*'
    }
  });
  
  return Buffer.from(response.data);
}
```

### Upload to GHL
```javascript
async function uploadMediaToGHL(mediaBuffer, messageType, contactId, accessToken) {
  const formData = new FormData();
  formData.append('file', mediaBuffer, {
    filename: `whatsapp_${messageType}_${Date.now()}.${getFileExtension(messageType)}`,
    contentType: getMimeType(messageType)
  });
  formData.append('type', 'WhatsApp');
  formData.append('contactId', contactId);
  formData.append('message', getMediaMessageText(messageType));
  formData.append('direction', 'inbound');
  formData.append('status', 'delivered');
  
  const response = await axios.post(
    'https://services.leadconnectorhq.com/conversations/messages',
    formData,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28',
        ...formData.getHeaders()
      }
    }
  );
  
  return response.data;
}
```

## 🛡️ Security & Best Practices

### 1. Token Management
- Store tokens securely in database
- Implement automatic token refresh
- Handle token expiration gracefully

### 2. Webhook Security
- Validate webhook signatures
- Use HTTPS endpoints
- Implement rate limiting

### 3. Error Handling
```javascript
try {
  // API call
} catch (error) {
  if (error.response?.status === 401) {
    // Token expired, refresh and retry
    await refreshGHLToken(ghlAccount);
    // Retry API call
  }
}
```

## 📊 Monitoring & Logging

### Connection Health
```javascript
setInterval(async () => {
  for (const [sessionId, client] of this.clients) {
    try {
      if (client.socket && client.socket.user) {
        client.lastUpdate = Date.now();
        console.log(`✅ Connection healthy for ${sessionId}`);
      } else {
        client.status = 'disconnected';
        // Attempt reconnection
      }
    } catch (error) {
      console.error(`❌ Health check failed for ${sessionId}:`, error);
    }
  }
}, 30000); // Every 30 seconds
```

## 🚀 Deployment

### Environment Setup
```bash
# Install dependencies
npm install

# Set environment variables
export GHL_CLIENT_ID=your_client_id
export GHL_CLIENT_SECRET=your_client_secret
export GHL_REDIRECT_URI=https://yourdomain.com/ghl/callback

# Start server
npm start
```

### Render.com Deployment
```yaml
# render.yaml
services:
  - type: web
    name: ghl-whatsapp-bridge
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: GHL_CLIENT_ID
        sync: false
      - key: GHL_CLIENT_SECRET
        sync: false
```

## 🔗 Useful Resources

- [GHL API Documentation](https://highlevel.stoplight.io/docs/integrations)
- [GHL Marketplace](https://marketplace.gohighlevel.com/)
- [Baileys WhatsApp Library](https://github.com/WhiskeySockets/Baileys)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)

## 📞 Support

For issues or questions:
1. Check GHL API documentation
2. Review error logs
3. Test with GHL webhook simulator
4. Contact GHL support for API issues

---

**🎉 Happy Building! This guide covers everything you need to build custom GHL integrations.**

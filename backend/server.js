const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const GHLClient = require('./lib/ghl');
const BaileysWhatsAppManager = require('./lib/baileys-wa');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

// GHL configuration
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;
const GHL_REDIRECT_URI = process.env.GHL_REDIRECT_URI;
const GHL_SCOPES = process.env.GHL_SCOPES || 'locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly';

// WhatsApp Manager (Baileys)
const waManager = new BaileysWhatsAppManager();

// Restore WhatsApp clients from database on startup
async function restoreWhatsAppClients() {
  try {
    console.log('🔄 Restoring WhatsApp clients from database...');
    
    const { data: sessions, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('status', 'ready')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching sessions:', error);
      return;
    }

    if (!sessions || sessions.length === 0) {
      console.log('📋 No active WhatsApp sessions found in database');
      return;
    }

    console.log(`📋 Found ${sessions.length} active sessions to restore`);

    for (const session of sessions) {
      try {
        const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sessionName = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        console.log(`🔄 Restoring client for session: ${sessionName}`);
        await waManager.createClient(sessionName);
        
        // Wait a bit for client to initialize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const status = waManager.getClientStatus(sessionName);
        console.log(`📊 Client status for ${sessionName}:`, status?.status);
        
      } catch (error) {
        console.error(`❌ Error restoring client for session ${session.id}:`, error);
      }
    }

    console.log('✅ WhatsApp client restoration completed');
    console.log('📊 Active clients:', waManager.getAllClients().map(c => c.sessionId));
    
  } catch (error) {
    console.error('❌ Error in client restoration:', error);
  }
}

// Restore clients after a short delay
setTimeout(restoreWhatsAppClients, 3000);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://services.leadconnectorhq.com"],
      frameSrc: ["'self'", "https://app.gohighlevel.com", "https://*.gohighlevel.com"]
    }
  }
}));

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://whatsapp123-dhn1.onrender.com',
    'https://whatsapp-saas-backend.onrender.com',
    'https://whatsapp123-frontend.vercel.app',
    'https://whatsapp123-frontend-git-main-abjandal19s-projects.vercel.app',
    'https://whatsappghl.vercel.app',
    'https://*.vercel.app',
    'https://app.gohighlevel.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Add CSP headers for iframe embedding
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  next();
});

app.use(express.json());

// Handle preflight requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Auth middleware
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// GHL OAuth Routes
app.get('/auth/ghl/connect', (req, res) => {
  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`;
    res.redirect(authUrl);
});

// OAuth callback - handles GHL OAuth 2.0 flow
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, locationId } = req.query;
    
    console.log('OAuth Callback received - ALL PARAMS:', req.query);
    console.log('Specific params:', { code: !!code, locationId, state });
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }

    // Don't require locationId in query - GHL may provide it in token response
    console.log('Proceeding with token exchange...');

    // Exchange code for access token
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        user_type: 'Location', // Required by GHL OAuth 2.0
        redirect_uri: GHL_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
        clientId: GHL_CLIENT_ID ? 'SET' : 'MISSING',
        redirectUri: GHL_REDIRECT_URI
      });
      return res.status(400).json({ 
        error: 'Failed to exchange authorization code for token',
        details: errorText
      });
    }

    const tokenData = await tokenResponse.json();
    console.log('Token data received:', { 
      userType: tokenData.userType, 
      companyId: tokenData.companyId, 
      locationId: tokenData.locationId,
      userId: tokenData.userId 
    });

    // Use state as target user ID (passed from frontend)
    let targetUserId = null;
    if (state) {
      try {
        targetUserId = decodeURIComponent(state);
        console.log('Using target user ID from state:', targetUserId);
      } catch (e) {
        console.error('Error decoding state:', e);
        return res.status(400).json({ error: 'Invalid state parameter' });
      }
      } else {
      return res.status(400).json({ error: 'State parameter missing - user ID required' });
    }

    // Store GHL account information - use locationId from token response
    const finalLocationId = tokenData.locationId || locationId;
    console.log('Using location ID:', finalLocationId);
    
    const { error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: targetUserId,
        company_id: tokenData.companyId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        location_id: finalLocationId,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      });

    if (ghlError) {
      console.error('Error storing GHL account:', ghlError);
      return res.status(500).json({ error: 'Failed to store account information' });
    }

    console.log('GHL account stored successfully');
    const frontendUrl = process.env.FRONTEND_URL || 'https://whatsappghl.vercel.app';
    res.redirect(`${frontendUrl}/dashboard?ghl=connected`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// Admin routes
app.get('/admin/ghl/subaccounts', requireAuth, async (req, res) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data: subaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('user_id', user.id);

    res.json({ subaccounts: subaccounts || [] });
  } catch (error) {
    console.error('Error fetching subaccounts:', error);
    res.status(500).json({ error: 'Failed to fetch subaccounts' });
  }
});

// Connect new subaccount
app.post('/admin/ghl/connect-subaccount', requireAuth, async (req, res) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { ghl_location_id, name } = req.body;

    if (!ghl_location_id) {
      return res.status(400).json({ error: 'ghl_location_id is required' });
    }

    // Check if subaccount already exists
    const { data: existingSubaccount } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('ghl_location_id', ghl_location_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingSubaccount) {
      return res.json({ 
        success: true, 
        message: 'Subaccount already exists',
        subaccount: existingSubaccount
      });
    }

    // Create subaccount
    const { data: newSubaccount, error: subaccountError } = await supabaseAdmin
        .from('subaccounts')
      .insert({
        user_id: user.id,
        ghl_location_id,
        name: name || `Location ${ghl_location_id}`,
        status: 'pending_oauth'
        })
        .select()
        .single();

    if (subaccountError) {
      console.error('Error creating subaccount:', subaccountError);
      return res.status(500).json({ error: 'Failed to create subaccount' });
    }

    // Generate GHL OAuth URL for this specific location
    const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}&state=${encodeURIComponent(user.id)}`;

    res.json({ 
      success: true, 
      message: 'Subaccount created, redirect to GHL OAuth',
      authUrl: authUrl,
      subaccount: newSubaccount
    });
  } catch (error) {
    console.error('Error connecting subaccount:', error);
    res.status(500).json({ error: 'Failed to connect subaccount' });
  }
});

// GHL Provider Configuration (for marketplace app)
app.get('/ghl/provider/config', (req, res) => {
  res.json({
    name: "WhatsApp SMS Provider",
    description: "Connect WhatsApp as SMS provider for GoHighLevel",
    version: "1.0.0",
    provider: {
      type: "sms",
      name: "WhatsApp SMS",
      description: "Send and receive SMS via WhatsApp",
      capabilities: ["send", "receive", "status"],
      webhook_url: `${process.env.BACKEND_URL || 'https://whatsapp-saas-backend.onrender.com'}/ghl/provider/webhook`
    },
    settings: {
      webhook_url: {
        type: "url",
        label: "Webhook URL",
        description: "URL for receiving incoming messages",
        required: true,
        default: `${process.env.BACKEND_URL || 'https://whatsapp-saas-backend.onrender.com'}/ghl/provider/webhook`
      }
    }
  });
});

// GHL Provider Webhook (for incoming messages)
app.post('/ghl/provider/webhook', async (req, res) => {
  try {
    console.log('GHL Provider Webhook:', req.body);
    
    const { locationId, message, contactId } = req.body;
    
    if (!locationId || !message) {
      console.log('Missing required fields in webhook');
      return res.json({ status: 'success' });
    }
    
    // Get GHL account
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      console.log(`GHL account not found for location: ${locationId}`);
      return res.json({ status: 'success' });
    }

    // Get active WhatsApp session
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!session) {
      console.log(`No active WhatsApp session found for location: ${locationId}`);
      return res.json({ status: 'success' });
    }
    
    // Get WhatsApp client using Baileys - use the same key format as session creation
    const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const clientKey = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    console.log(`🔍 Looking for client with key: ${clientKey}`);
    const clientStatus = waManager.getClientStatus(clientKey);
    
    if (!clientStatus || clientStatus.status !== 'connected') {
      console.log(`❌ WhatsApp client not ready for key: ${clientKey}, status: ${clientStatus?.status}`);
      console.log(`📋 Available clients:`, waManager.getAllClients().map(c => c.sessionId));
      return res.json({ status: 'success' });
    }
    
    // Get phone number
    const phoneNumber = req.body.phone;
    if (!phoneNumber) {
      console.log(`No phone number found`);
      return res.json({ status: 'success' });
    }
    
    // Send message using Baileys
    try {
      await waManager.sendMessage(clientKey, phoneNumber, message);
      console.log('Message sent successfully via Baileys');
    } catch (sendError) {
      console.error('Error sending message via Baileys:', sendError);
    }
    
    res.json({ status: 'success' });
        } catch (error) {
    console.error('Webhook processing error:', error);
    res.json({ status: 'success' });
  }
});

// GHL Provider Send Message
app.post('/ghl/provider/send', async (req, res) => {
  try {
    const { to, message, locationId } = req.body;
    console.log('GHL Send Message:', { to, message, locationId });

    // Find session for this location
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    // Find active session
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return res.status(404).json({ error: 'No active WhatsApp session found' });
    }

    // Send message via WhatsApp - use consistent key format
    const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const clientKey = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    console.log(`🔍 Looking for WhatsApp client with key: ${clientKey}`);
    const clientStatus = waManager.getClientStatus(clientKey);
    
    if (clientStatus && clientStatus.status === 'connected') {
      console.log(`✅ Sending WhatsApp message to ${to}: ${message}`);
      await waManager.sendMessage(clientKey, to, message);
      res.json({ status: 'success', messageId: Date.now().toString() });
    } else {
      console.error(`❌ WhatsApp client not found or not connected for key: ${clientKey}, status: ${clientStatus?.status}`);
      console.log(`📋 Available clients:`, waManager.getAllClients().map(c => c.sessionId));
      res.status(500).json({ error: 'WhatsApp client not available' });
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GHL Provider Status
app.get('/ghl/provider/status', async (req, res) => {
  try {
    const { locationId } = req.query;
    
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      return res.json({ status: 'disconnected', message: 'GHL account not found' });
    }

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return res.json({ status: 'disconnected', message: 'No session found' });
    }

    res.json({ 
      status: session.status,
      phone_number: session.phone_number,
      message: session.status === 'ready' ? 'Connected' : 'Not connected'
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// GHL Provider UI (for custom menu link)
app.get('/ghl/provider', async (req, res) => {
  try {
    let { locationId, companyId } = req.query;
    
    // If no locationId provided, try to detect from GHL context or company
    if (!locationId && companyId) {
      console.log('No locationId provided, looking up by companyId:', companyId);
      
      // Find GHL account by company_id
      const { data: ghlAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('location_id')
        .eq('company_id', companyId)
        .maybeSingle();
        
      if (ghlAccount && ghlAccount.location_id) {
        locationId = ghlAccount.location_id;
        console.log('Found locationId from company:', locationId);
      }
    }
    
    if (!locationId) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
            <h2>⚠️ Setup Required</h2>
            <p>Please add your Location ID to the custom menu link:</p>
            <code style="background: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/ghl/provider?locationId=YOUR_LOCATION_ID
            </code>
            <p>Find your Location ID in GHL Settings → General → Location ID</p>
          </body>
        </html>
      `);
    }

    // Get subaccount name and connected phone number
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount?.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const subaccountName = ghlAccount ? `Location ${locationId}` : `Location ${locationId}`;
    const connectedNumber = session?.phone_number || null;
    
    // Replace template variables in HTML
    const htmlContent = `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>WhatsApp Provider - ${subaccountName}</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; 
              padding: 16px; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              margin: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px;
            }
            .card { 
              background: white; 
              border-radius: 16px; 
              padding: 32px; 
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }
            .header {
              text-align: center;
              margin-bottom: 32px;
            }
            .logo {
              width: 64px;
              height: 64px;
              background: #25D366;
              border-radius: 50%;
              margin: 0 auto 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 32px;
            }
            .title {
              font-size: 28px;
              font-weight: 700;
              color: #1f2937;
              margin: 0 0 8px 0;
            }
            .subtitle {
              color: #6b7280;
              font-size: 16px;
              margin: 0;
            }
            .info-section {
              background: #f8fafc;
              border-radius: 12px;
              padding: 20px;
              margin-bottom: 24px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .info-row:last-child {
              border-bottom: none;
            }
            .info-label {
              font-weight: 600;
              color: #374151;
            }
            .info-value {
              color: #6b7280;
              font-family: monospace;
            }
            .connected-number {
              color: #059669;
              font-weight: 600;
            }
            .qr-section {
              text-align: center;
              margin: 24px 0;
            }
            .qr-container {
              background: white;
              border: 2px solid #e5e7eb;
              border-radius: 12px;
              padding: 20px;
              display: inline-block;
              margin: 16px 0;
            }
            .qr-container img {
              max-width: 256px;
              height: auto;
            }
            .status {
              margin: 16px 0;
              padding: 12px;
              border-radius: 8px;
              font-weight: 500;
            }
            .status.initializing {
              background: #dbeafe;
              color: #1e40af;
              border: 1px solid #93c5fd;
            }
            .status.qr {
              background: #fef3c7;
              color: #92400e;
              border: 1px solid #fcd34d;
            }
            .status.ready {
              background: #d1fae5;
              color: #065f46;
              border: 1px solid #6ee7b7;
            }
            .status.disconnected {
              background: #fee2e2;
              color: #991b1b;
              border: 1px solid #fca5a5;
            }
            .instructions {
              background: #f0f9ff;
              border: 1px solid #bae6fd;
              border-radius: 12px;
              padding: 20px;
              margin: 24px 0;
            }
            .instructions h3 {
              color: #0c4a6e;
              margin: 0 0 12px 0;
              font-size: 18px;
            }
            .instructions ol {
              color: #075985;
              margin: 0;
              padding-left: 20px;
            }
            .instructions li {
              margin: 8px 0;
              line-height: 1.5;
            }
            .button-group {
              display: flex;
              gap: 12px;
              justify-content: center;
              margin-top: 24px;
            }
            button { 
              padding: 12px 24px; 
              border-radius: 8px; 
              border: none; 
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }
            .btn-primary {
              background: #3b82f6;
              color: white;
            }
            .btn-primary:hover {
              background: #2563eb;
            }
            .btn-secondary {
              background: #f3f4f6;
              color: #374151;
              border: 1px solid #d1d5db;
            }
            .btn-secondary:hover {
              background: #e5e7eb;
            }
            .btn-success {
              background: #10b981;
              color: white;
            }
            .btn-success:hover {
              background: #059669;
            }
            .loading {
              display: inline-block;
              width: 20px;
              height: 20px;
              border: 3px solid #f3f3f3;
              border-top: 3px solid #3b82f6;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo">📱</div>
                <h1 class="title">WhatsApp SMS Provider</h1>
                <p class="subtitle">Connect your WhatsApp to GoHighLevel</p>
              </div>

              <div class="info-section">
                <div class="info-row">
                  <span class="info-label">Subaccount:</span>
                  <span class="info-value">${subaccountName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Location ID:</span>
                  <span class="info-value">${locationId}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status:</span>
                  <span class="info-value" id="status-text">Checking...</span>
                </div>
                <div class="info-row" id="phone-row" style="display: none;">
                  <span class="info-label">Connected Number:</span>
                  <span class="info-value connected-number" id="phone-number"></span>
                </div>
              </div>

              <div class="qr-section">
                <div id="qr" class="qr-container" style="display: none;">
                  <div id="qr-image"></div>
                </div>
                <div id="status" class="status initializing">
                  <div class="loading"></div> Preparing WhatsApp session...
                </div>
              </div>

              <div class="instructions">
                <h3>📋 How to Connect:</h3>
                <ol>
                  <li><strong>Open WhatsApp</strong> on your phone</li>
                  <li><strong>Tap Menu</strong> (three dots) → <strong>Linked Devices</strong></li>
                  <li><strong>Tap "Link a Device"</strong></li>
                  <li><strong>Scan the QR code</strong> above with your phone</li>
                  <li><strong>Wait for "Connected"</strong> status</li>
                  <li><strong>Use in GHL</strong> as SMS provider</li>
                </ol>
              </div>

              <div class="button-group">
                <button id="reset" class="btn-secondary">🔄 Reset QR</button>
                <button id="refresh" class="btn-primary">🔄 Refresh Status</button>
                <button id="close" class="btn-success" style="display: none;">✅ Close</button>
              </div>
            </div>
          </div>
          <script>
            const qs = new URLSearchParams(window.location.search);
            const locId = qs.get('locationId');
            const companyId = qs.get('companyId');
            
            // Get DOM elements
            const statusEl = document.getElementById('status');
            const statusTextEl = document.getElementById('status-text');
            const qrEl = document.getElementById('qr');
            const qrImageEl = document.getElementById('qr-image');
            const phoneRowEl = document.getElementById('phone-row');
            const phoneNumberEl = document.getElementById('phone-number');
            const resetBtn = document.getElementById('reset');
            const refreshBtn = document.getElementById('refresh');
            const closeBtn = document.getElementById('close');

            function updateStatus(status, phoneNumber = null) {
              // Update status text
              statusTextEl.textContent = status;
              
              // Update status element
              statusEl.className = 'status ' + status;
              
              switch(status) {
                case 'initializing':
                  statusEl.innerHTML = '<div class="loading"></div> Preparing WhatsApp session...';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  break;
                  
                case 'qr':
                  statusEl.innerHTML = '📱 <strong>Scan QR Code</strong><br><small>Open WhatsApp → Menu → Linked Devices → Link a Device</small>';
                  qrEl.style.display = 'block';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  break;
                  
                case 'ready':
                  statusEl.innerHTML = '✅ <strong>Connected Successfully!</strong><br><small>WhatsApp is now linked to this location</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'flex';
                  phoneNumberEl.textContent = phoneNumber || 'Unknown';
                  closeBtn.style.display = 'inline-block';
                  break;
                  
                case 'disconnected':
                  statusEl.innerHTML = '❌ <strong>Disconnected</strong><br><small>WhatsApp session ended</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  break;
                  
                default:
                  statusEl.innerHTML = '❓ <strong>Unknown Status</strong><br><small>Status: ' + status + '</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
              }
            }

            async function create() {
              try {
                updateStatus('initializing');
                const r = await fetch('/ghl/location/' + encodeURIComponent(locId) + '/session' + (companyId ? ('?companyId=' + encodeURIComponent(companyId)) : ''), { method: 'POST' });
                const j = await r.json().catch(() => ({}));
                
                if (j.qr) {
                  qrImageEl.innerHTML = '<img src="' + j.qr + '" alt="QR Code" />';
                  updateStatus('qr');
                } else {
                  updateStatus(j.status || 'error');
                }
              } catch (e) {
                console.error('Create session error:', e);
                updateStatus('error');
              }
            }

            async function poll() {
              try {
                const r = await fetch('/ghl/location/' + encodeURIComponent(locId) + '/session');
                const j = await r.json().catch(() => ({}));
                
                if (j.qr) {
                  qrImageEl.innerHTML = '<img src="' + j.qr + '" alt="QR Code" />';
                  updateStatus('qr');
                } else {
                  updateStatus(j.status || 'unknown', j.phone_number);
                }
                
                // Stop polling if connected or disconnected
                if (j.status === 'ready' || j.status === 'disconnected') {
                  clearInterval(pollInterval);
                }
              } catch (e) {
                console.error('Poll error:', e);
                updateStatus('error');
              }
            }

            let pollInterval = setInterval(poll, 3000); // Poll every 3 seconds

            // Event listeners
            resetBtn.addEventListener('click', async () => {
              clearInterval(pollInterval);
              await create();
              pollInterval = setInterval(poll, 3000);
            });

            refreshBtn.addEventListener('click', () => {
              poll();
            });

            closeBtn.addEventListener('click', () => {
              window.close();
            });

            // Initialize
            (async () => {
              await create();
              poll();
            })();
          </script>
        </body>
      </html>
    `;
    
    res.send(htmlContent.replace(/\{locationId\}/g, locationId).replace(/\{subaccountName\}/g, subaccountName).replace(/\{connectedNumber\}/g, connectedNumber || 'Not connected'));
  } catch (error) {
    console.error('Provider UI error:', error);
    res.status(500).send('Failed to render provider');
  }
});

// Get GHL account status
app.get('/admin/ghl/account-status', async (req, res) => {
  try {
    // Get user from Authorization header
    const authHeader = req.headers.authorization;
    let userId = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        userId = user?.id;
      } catch (e) {
        console.log('Auth token validation failed:', e.message);
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get GHL account for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
      
    console.log('Account status check:', { userId, ghlAccount: !!ghlAccount, error: ghlError });

    res.json({ 
      account: ghlAccount,
      error: ghlError,
      connected: !!ghlAccount
    });
    
  } catch (error) {
    console.error('Error checking account status:', error);
    res.status(500).json({ error: 'Failed to check account status' });
  }
});

// Get locations from GHL API
app.get('/admin/ghl/locations', async (req, res) => {
  try {
    // Get user from Authorization header (if available)
    const authHeader = req.headers.authorization;
    let userId = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        userId = user?.id;
      } catch (e) {
        console.log('Auth token validation failed:', e.message);
      }
    }
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get GHL account for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token, location_id')
      .eq('user_id', userId)
      .single();

    if (ghlError || !ghlAccount) {
      console.error('GHL account lookup error:', ghlError);
      return res.status(404).json({ error: 'GHL account not found. Please connect your GHL account first.' });
    }
    
    // If we have a location_id, return that single location
    if (ghlAccount.location_id) {
      return res.json({
        locations: [{
          id: ghlAccount.location_id,
          name: `Location ${ghlAccount.location_id}`
        }]
      });
    }
    
    // Otherwise try to fetch from GHL API (if we have company-level access)
    try {
      const ghlResponse = await fetch('https://services.leadconnectorhq.com/locations/', {
        headers: {
          'Authorization': `Bearer ${ghlAccount.access_token}`,
          'Version': '2021-07-28'
        }
      });
      
      if (ghlResponse.ok) {
        const ghlData = await ghlResponse.json();
        return res.json(ghlData);
    } else {
        // Fallback to single location if API call fails
        return res.json({
          locations: [{
            id: ghlAccount.location_id || 'unknown',
            name: 'Connected Location'
          }]
        });
      }
    } catch (error) {
      console.error('GHL API error:', error);
      return res.json({
        locations: [{
          id: ghlAccount.location_id || 'unknown',
          name: 'Connected Location'
        }]
      });
    }

  } catch (error) {
    console.error('Error fetching GHL locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations', details: error.message });
  }
});

// Session management endpoints
app.post('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { companyId } = req.query;

    console.log(`Creating session for locationId: ${locationId}`);

    // Find GHL account - try by location_id first, then fallback to any account
    let ghlAccount = null;
    
    // First try to find account with matching location_id
    const { data: accountByLocation } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();
    
    if (accountByLocation) {
      ghlAccount = accountByLocation;
      console.log('Found GHL account by location_id:', locationId);
    } else {
      // Fallback: use any GHL account if location_id doesn't match
      const { data: anyAccount } = await supabaseAdmin
        .from('ghl_accounts')
      .select('*')
        .limit(1)
        .maybeSingle();
      
      if (anyAccount) {
        ghlAccount = anyAccount;
        console.log('Using fallback GHL account for location:', locationId);
      }
    }

    if (!ghlAccount) {
      console.error(`No GHL account found in database`);
      return res.status(404).json({ error: 'GHL account not found. Please connect GHL account first.' });
    }

    console.log('Using GHL account:', { id: ghlAccount.id, user_id: ghlAccount.user_id, company_id: ghlAccount.company_id, location_id: ghlAccount.location_id });

    // Remove this line since location_id might not exist

    // Check for existing session for this user/location combination
    // Use locationId as a unique identifier for the session
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('user_id', ghlAccount.user_id)
      .eq('subaccount_id', ghlAccount.id) // Use ghl_account ID as reference
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0 && existing[0].status !== 'disconnected') {
      console.log(`📋 Found existing session: ${existing[0].id}, status: ${existing[0].status}`);
      
      // If session exists but not connected, try to restore the client
      if (existing[0].status === 'ready' || existing[0].status === 'qr') {
        const cleanSubaccountId = existing[0].subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
        const sessionName = `location_${cleanSubaccountId}_${existing[0].id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        
        console.log(`🔄 Attempting to restore client for existing session: ${sessionName}`);
        
        // Try to restore the client
        try {
          await waManager.createClient(sessionName);
          console.log(`✅ Client restored for existing session: ${sessionName}`);
        } catch (error) {
          console.error(`❌ Failed to restore client for existing session:`, error);
        }
      }
      
      return res.json({ 
        status: existing[0].status, 
        qr: existing[0].qr, 
        phone_number: existing[0].phone_number,
        session_id: existing[0].id
      });
    }

    // Create new session - let database generate UUID automatically
    // Use ghl_account.id as subaccount_id (no need for separate subaccounts table)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        user_id: ghlAccount.user_id, 
        subaccount_id: ghlAccount.id, // Use ghl_account ID directly
        status: 'initializing' 
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    console.log('Created session:', session.id);
    console.log('Session details:', { 
      id: session.id, 
      user_id: session.user_id, 
      subaccount_id: session.subaccount_id, 
      status: session.status 
    });

    // Verify session was saved to database
    const { data: verifySession, error: verifyError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', session.id)
      .single();

    if (verifyError) {
      console.error('Session verification failed:', verifyError);
    } else {
      console.log('Session verified in database:', verifySession);
    }

    // Create WhatsApp client with subaccount-specific session name (clean format)
    const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    // Add timeout for WhatsApp client initialization
    const initTimeout = setTimeout(async () => {
      try {
        await supabaseAdmin
          .from('sessions')
          .update({ status: 'disconnected' })
          .eq('id', session.id);
        console.log(`WhatsApp initialization timeout for location ${locationId}`);
      } catch (e) {
        console.error('Timeout update error:', e);
      }
    }, 300000); // 300 seconds timeout (5 minutes for WhatsApp connection)

    console.log(`Creating Baileys WhatsApp client with sessionName: ${sessionName}`);
    
    // Create Baileys client
    try {
      const client = await waManager.createClient(sessionName);
      console.log(`✅ Baileys client created for session: ${sessionName}`);
    } catch (error) {
      console.error(`❌ Failed to create Baileys client:`, error);
      return res.status(500).json({ error: 'Failed to create WhatsApp client' });
    }
    
    // Set up QR code polling
    const qrPolling = setInterval(async () => {
      try {
        const qrCode = await waManager.getQRCode(sessionName);
        if (qrCode) {
          clearTimeout(initTimeout); // Clear timeout when QR is generated
          const qrDataUrl = await qrcode.toDataURL(qrCode);
          const { error: qrUpdateError } = await supabaseAdmin
            .from('sessions')
            .update({ qr: qrDataUrl, status: 'qr' })
            .eq('id', session.id);
          
          if (qrUpdateError) {
            console.error('QR update failed:', qrUpdateError);
          } else {
            console.log(`✅ QR generated and saved for location ${locationId}:`, session.id);
          }
        }
      } catch (e) {
        console.error('QR polling error:', e);
      }
    }, 3000); // Check every 3 seconds

    // Set up connection status polling
    const statusPolling = setInterval(async () => {
      try {
        const status = waManager.getClientStatus(sessionName);
        console.log(`📊 Status check for ${sessionName}:`, status);
        
        if (status && status.status === 'connected') {
          clearInterval(qrPolling);
          clearInterval(statusPolling);
          clearTimeout(initTimeout);
          
          // Get phone number from client
          const client = waManager.getClientsMap()?.get(sessionName);
          const phoneNumber = client?.phoneNumber || 'Unknown';
          
          console.log(`📱 Connected phone number: ${phoneNumber}`);
          
          const { error: readyUpdateError } = await supabaseAdmin
            .from('sessions')
            .update({ 
              status: 'ready', 
              qr: null,
              phone_number: phoneNumber
            })
            .eq('id', session.id);
          
          if (readyUpdateError) {
            console.error('Ready update failed:', readyUpdateError);
          } else {
            console.log(`✅ WhatsApp connected and saved for location ${locationId}`);
            console.log(`✅ Phone number stored: ${phoneNumber}`);
            console.log(`✅ Client stored with sessionName: ${sessionName}`);
            console.log(`📋 Available clients after connection:`, waManager.getAllClients().map(client => client.sessionId));
          }
        }
      } catch (e) {
        console.error('Status polling error:', e);
      }
    }, 5000); // Check every 5 seconds

    // Cleanup polling on timeout
    setTimeout(() => {
      clearInterval(qrPolling);
      clearInterval(statusPolling);
    }, 300000); // 5 minutes timeout

    // Return session info
    res.json({ 
      success: true, 
      session: {
        id: session.id,
        status: 'initializing',
        qr: null
      }
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;

    // Find GHL account for this location first (try by location_id, then fallback)
    let ghlAccount = null;
    
    const { data: accountByLocation } = await supabaseAdmin
      .from('ghl_accounts')
      .select('id, user_id')
      .eq('location_id', locationId)
      .maybeSingle();
    
    if (accountByLocation) {
      ghlAccount = accountByLocation;
    } else {
      // Fallback: use any GHL account
      const { data: anyAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('id, user_id')
        .limit(1)
        .maybeSingle();
      
      if (anyAccount) {
        ghlAccount = anyAccount;
      }
    }

    if (!ghlAccount) {
      return res.json({ status: 'none' });
    }

    // Get latest session for this GHL account
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!existing || existing.length === 0) {
      return res.json({ status: 'none' });
    }

    const s = existing[0];
    res.json({ status: s.status, qr: s.qr, phone_number: s.phone_number });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// GHL Conversations Provider endpoints
app.post('/ghl/provider/messages', async (req, res) => {
  try {
    const { locationId, contactId, message, type = 'text' } = req.body;

    if (!locationId || !contactId || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find subaccount and session
    const { data: subaccount } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('ghl_location_id', locationId)
      .maybeSingle();

    if (!subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', subaccount.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!session || session.length === 0) {
      return res.status(404).json({ error: 'No active WhatsApp session found' });
    }

    // Send message via WhatsApp using Baileys
    const sessionId = session[0].id;
    const clientStatus = waManager.getClientStatus(sessionId);
    if (!clientStatus || clientStatus.status !== 'connected') {
      return res.status(404).json({ error: 'WhatsApp client not found or not connected' });
    }

    // Store message in database
    const { data: messageRecord } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionId,
        contact_id: contactId,
        message: message,
        direction: 'outbound',
        status: 'sent'
      })
      .select()
      .single();

    // Send via WhatsApp using Baileys
    await waManager.sendMessage(sessionId, contactId, message);

    res.json({
      success: true,
      messageId: messageRecord.id,
      status: 'sent'
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Debug endpoint to check WhatsApp clients (Baileys)
app.get('/debug/whatsapp-clients', (req, res) => {
  try {
    const clients = waManager.getAllClients();
    const clientInfo = clients.map(client => ({
      sessionId: client.sessionId,
      status: client.status,
      lastUpdate: client.lastUpdate,
      hasQR: client.hasQR,
      isConnected: client.status === 'connected'
    }));
    
    res.json({
      totalClients: clients.length,
      clients: clientInfo,
      availableSessions: clients.map(client => client.sessionId)
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Failed to get client info' });
  }
});

// Debug endpoint to clear session data and force fresh connection
app.post('/debug/clear-session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`🗑️ Clearing session data for: ${sessionId}`);
    
    waManager.clearSessionData(sessionId);
    
    res.json({
      success: true,
      message: `Session data cleared for ${sessionId}`,
      sessionId
    });
  } catch (error) {
    console.error('Clear session error:', error);
    res.status(500).json({ error: 'Failed to clear session data' });
  }
});

// Debug endpoint to check session status
app.get('/debug/session-status/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    // Get GHL account
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();
    
    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }
    
    // Get session
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('user_id', ghlAccount.user_id)
      .eq('subaccount_id', ghlAccount.id)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!session || session.length === 0) {
      return res.json({ 
        session: null, 
        message: 'No session found' 
      });
    }
    
    const currentSession = session[0];
    const cleanSubaccountId = currentSession.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `location_${cleanSubaccountId}_${currentSession.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    // Get client status
    const clientStatus = waManager.getClientStatus(sessionName);
    
    res.json({
      session: currentSession,
      sessionName,
      clientStatus,
      allClients: waManager.getAllClients()
    });
    
  } catch (error) {
    console.error('Session status error:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

// Test message sending endpoint
app.post('/debug/send-message', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Phone number and message required' });
    }
    
    const clients = waManager.getAllClients();
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'No WhatsApp clients available' });
    }
    
    const client = clients[0];
    const sessionKey = client.sessionId;
    console.log(`Sending test message using client: ${sessionKey}`);
    
    await waManager.sendMessage(sessionKey, phoneNumber, message);
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      sessionKey,
      phoneNumber,
      message
    });
  } catch (error) {
    console.error('Test message error:', error);
    res.status(500).json({ error: 'Failed to send message', details: error.message });
  }
});

// Emergency message sending endpoint - creates new client if needed
app.post('/emergency/send-message', async (req, res) => {
  try {
    const { phoneNumber, message, locationId } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'Phone number and message required' });
    }
    
    console.log(`🚨 Emergency message sending to: ${phoneNumber}`);
    
    // Direct message sending without client dependency
    console.log(`🚨 Direct emergency message sending to: ${phoneNumber}`);
    
    // Try to find any available client first
    const clients = waManager.getAllClients();
    let messageSent = false;
    
    if (clients.length > 0) {
      console.log(`Found ${clients.length} available clients`);
      
      for (const client of clients) {
        try {
          const sessionKey = client.sessionId;
          console.log(`Trying client: ${sessionKey}`);
          console.log(`Client status:`, client.status);
          
          if (client.status === 'connected') {
            console.log(`Client ready, sending message...`);
            await waManager.sendMessage(sessionKey, phoneNumber, message);
            console.log(`✅ Message sent successfully via client: ${sessionKey}`);
            messageSent = true;
            break;
          } else {
            console.log(`Client not ready, skipping: ${sessionKey}`);
          }
        } catch (clientError) {
          console.error(`Error with client ${client.sessionId}:`, clientError);
          continue;
        }
      }
    } else {
      console.log(`No clients available`);
    }
    
    if (!messageSent) {
      console.log(`❌ No working clients found, message not sent`);
      return res.status(500).json({ 
        error: 'No working WhatsApp clients available',
        phoneNumber,
        message,
        availableClients: clients.length
      });
    }
    
    res.json({
      success: true,
      message: 'Emergency message sent successfully',
      phoneNumber,
      message,
      availableClients: clients.length
    });
    
  } catch (error) {
    console.error('Emergency message error:', error);
    res.status(500).json({ error: 'Failed to send emergency message', details: error.message });
  }
});

// Manual message dashboard
app.get('/manual-messages', async (req, res) => {
  try {
    const { data: pendingMessages } = await supabaseAdmin
      .from('pending_messages')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50);
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Manual WhatsApp Messages</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .message { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; background: #f9f9f9; }
        .phone { font-weight: bold; color: #25D366; }
        .text { margin: 5px 0; }
        .time { font-size: 12px; color: #666; }
        .whatsapp-btn { background: #25D366; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px; }
        .whatsapp-btn:hover { background: #128C7E; }
        .mark-sent { background: #007bff; color: white; padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; margin-left: 10px; }
        .mark-sent:hover { background: #0056b3; }
        h1 { color: #333; text-align: center; }
        .stats { background: #e9ecef; padding: 10px; border-radius: 5px; margin-bottom: 20px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 Manual WhatsApp Messages</h1>
        <div class="stats">
          <strong>Pending Messages: ${pendingMessages ? pendingMessages.length : 0}</strong>
        </div>
        ${pendingMessages && pendingMessages.length > 0 ? 
          pendingMessages.map(msg => `
            <div class="message">
              <div class="phone">📞 ${msg.phone_number}</div>
              <div class="text">💬 ${msg.message}</div>
              <div class="time">⏰ ${new Date(msg.created_at).toLocaleString()}</div>
              <div class="time">📍 Location: ${msg.location_id}</div>
                     <a href="${msg.whatsapp_web_url || `https://wa.me/${msg.phone_number.replace('+', '')}?text=${encodeURIComponent(msg.message)}`}"
                        target="_blank" class="whatsapp-btn">📱 Send via WhatsApp Web</a>
              <button class="mark-sent" onclick="markAsSent('${msg.id}')">✅ Mark as Sent</button>
            </div>
          `).join('') : 
          '<div class="message"><p>No pending messages! 🎉</p></div>'
        }
      </div>
      <script>
        async function markAsSent(messageId) {
          try {
            const response = await fetch('/mark-message-sent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId })
            });
            if (response.ok) {
              location.reload();
            }
          } catch (error) {
            alert('Error marking message as sent');
          }
        }
      </script>
    </body>
    </html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Manual messages error:', error);
    res.status(500).send('Error loading manual messages');
  }
});

// Mark message as sent
app.post('/mark-message-sent', async (req, res) => {
  try {
    const { messageId } = req.body;
    await supabaseAdmin
      .from('pending_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', messageId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark sent error:', error);
    res.status(500).json({ error: 'Failed to mark message as sent' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GHL OAuth URL: https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`);
  console.log(`📱 Manual Messages Dashboard: https://whatsapp-saas-backend.onrender.com/manual-messages`);
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const GHLClient = require('./lib/ghl');
const BaileysWhatsAppManager = require('./lib/baileys-wa');
const qrcode = require('qrcode');
const { processWhatsAppMedia } = require('./mediaHandler');
const { downloadContentFromMessage, downloadMediaMessage } = require('baileys');
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');

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
const GHL_SCOPES = process.env.GHL_SCOPES || 'locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly medias.write';

// Token refresh function
async function refreshGHLToken(ghlAccount) {
  try {
    console.log(`🔄 Refreshing token for GHL account: ${ghlAccount.id}`);
    console.log(`🔑 Using refresh token: ${ghlAccount.refresh_token ? 'Present' : 'Missing'}`);
    console.log(`🔑 Client ID: ${GHL_CLIENT_ID ? 'Present' : 'Missing'}`);
    console.log(`🔑 Client Secret: ${GHL_CLIENT_SECRET ? 'Present' : 'Missing'}`);
    
    if (!ghlAccount.refresh_token) {
      throw new Error('No refresh token available');
    }
    
    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
      throw new Error('GHL client credentials not configured');
    }
    
    // GHL OAuth requires form-urlencoded format
    const formData = new URLSearchParams();
    formData.append('grant_type', 'refresh_token');
    formData.append('refresh_token', ghlAccount.refresh_token);
    formData.append('client_id', GHL_CLIENT_ID);
    formData.append('client_secret', GHL_CLIENT_SECRET);

    const response = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    console.log(`📊 Token refresh response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Token refresh failed: ${response.status} - ${errorText}`);
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const tokenData = await response.json();
    console.log(`✅ Token refresh successful, expires in: ${tokenData.expires_in} seconds`);
    
    // Update token in database
    const { error } = await supabaseAdmin
      .from('ghl_accounts')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      })
      .eq('id', ghlAccount.id);

    if (error) {
      console.error(`❌ Database update failed:`, error);
      throw new Error(`Database update failed: ${error.message}`);
    }

    console.log(`✅ Token refreshed and saved successfully for GHL account: ${ghlAccount.id}`);
    return tokenData.access_token;
    
  } catch (error) {
    console.error(`❌ Token refresh failed for GHL account ${ghlAccount.id}:`, error);
    throw error;
  }
}

// Helper function for media message text
function getMediaMessageText(messageType) {
  const messages = {
    'image': '🖼️ Image received',
    'voice': '🎵 Voice note received',
    'audio': '🎵 Audio file received',
    'video': '🎥 Video received',
    'document': '📄 Document received'
  };
  return messages[messageType] || '📎 Media received';
}

// Check and refresh token if needed (DISABLED - using sync button instead)
async function ensureValidToken(ghlAccount) {
  try {
    console.log(`🔍 Using stored token for GHL account ${ghlAccount.id} (auto-refresh disabled)`);
    return ghlAccount.access_token; // Just return stored token, no auto-refresh
  } catch (error) {
    console.error(`❌ Token validation failed for GHL account ${ghlAccount.id}:`, error);
    console.error(`❌ Falling back to stored token (may be expired)`);
    return ghlAccount.access_token; // Return stored token even if expired, let GHL API handle the error
  }
}

// WhatsApp Manager (Baileys)
const waManager = new BaileysWhatsAppManager();

// Scheduled token refresh (every 6 hours - more frequent for 24-hour tokens)
setInterval(async () => {
  try {
    console.log('🔄 Running scheduled token refresh...');
    
    const { data: ghlAccounts } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .not('refresh_token', 'is', null);

    if (!ghlAccounts || ghlAccounts.length === 0) {
      console.log('📋 No GHL accounts found for token refresh');
      return;
    }

    console.log(`📋 Found ${ghlAccounts.length} GHL accounts to check for token refresh`);

    for (const account of ghlAccounts) {
      try {
        await ensureValidToken(account);
        console.log(`✅ Token check completed for GHL account: ${account.id}`);
      } catch (error) {
        console.error(`❌ Token refresh failed for GHL account ${account.id}:`, error);
      }
    }
    
    console.log('✅ Scheduled token refresh completed');
  } catch (error) {
    console.error('❌ Scheduled token refresh error:', error);
  }
}, 6 * 60 * 60 * 1000); // Every 6 hours

// Additional aggressive token refresh (every 2 hours for critical accounts)
setInterval(async () => {
  try {
    console.log('🔄 Running aggressive token refresh...');
    
    const { data: ghlAccounts } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .not('refresh_token', 'is', null);

    if (!ghlAccounts || ghlAccounts.length === 0) {
      return;
    }

    for (const account of ghlAccounts) {
      try {
        // Check if token expires within 8 hours
        const now = new Date();
        const expiresAt = new Date(account.token_expires_at);
        const eightHoursFromNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        
        if (expiresAt <= eightHoursFromNow) {
          console.log(`🔄 Aggressive refresh for account ${account.id} (expires in ${Math.round((expiresAt - now) / (60 * 60 * 1000))} hours)`);
          await refreshGHLToken(account);
        }
      } catch (error) {
        console.error(`❌ Aggressive token refresh failed for GHL account ${account.id}:`, error);
      }
    }
  } catch (error) {
    console.error('❌ Aggressive token refresh error:', error);
  }
}, 2 * 60 * 60 * 1000); // Every 2 hours

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
  // Allow iframe embedding from GHL domains
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com https://app.gohighlevel.com https://*.gohighlevel.com");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
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

// Simple webhook test
app.get('/whatsapp/webhook', (req, res) => {
  res.json({ status: 'WhatsApp webhook endpoint is working', timestamp: new Date().toISOString() });
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
      webhook_url: `${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/ghl/provider/webhook`
    },
    settings: {
      webhook_url: {
        type: "url",
        label: "Webhook URL",
        description: "URL for receiving incoming messages",
        required: true,
        default: `${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/ghl/provider/webhook`
      }
    }
  });
});

// GHL Provider Webhook (for incoming messages)
app.post('/ghl/provider/webhook', async (req, res) => {
  try {
    console.log('GHL Provider Webhook:', req.body);
    
    const { locationId, message, contactId, phone, attachments = [] } = req.body;
    
    // Check if this is a duplicate message (prevent echo)
    const messageKey = `${locationId}_${contactId}_${message}_${Date.now()}`;
    if (global.messageCache && global.messageCache.has(messageKey)) {
      console.log(`🚫 Duplicate message detected, ignoring: ${messageKey}`);
      return res.json({ success: true, status: 'duplicate_ignored' });
    }
    
    // Initialize message cache if not exists
    if (!global.messageCache) {
      global.messageCache = new Set();
    }
    
    // Add to cache with 5 minute expiry
    global.messageCache.add(messageKey);
    setTimeout(() => {
      global.messageCache.delete(messageKey);
    }, 5 * 60 * 1000);
    
    if (!locationId) {
      console.log('Missing required field "locationId" in webhook');
      return res.json({ status: 'success' });
    }
    
    // Allow empty message for attachment-only messages
    if (!message && (!attachments || attachments.length === 0)) {
      console.log('Missing message content in webhook');
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

    // Ensure valid token (auto-refresh if needed)
    try {
      const validToken = await ensureValidToken(ghlAccount);
      console.log(`✅ Token validated for GHL account: ${ghlAccount.id}`);
  } catch (error) {
      console.error(`❌ Token validation failed for GHL account ${ghlAccount.id}:`, error);
      return res.json({ status: 'error', message: 'Token validation failed' });
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
    
    // Get WhatsApp client using Baileys - use subaccount_id from session
    const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const clientKey = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    console.log(`🔍 Looking for client with key: ${clientKey}`);
    const clientStatus = waManager.getClientStatus(clientKey);
    
    if (!clientStatus || clientStatus.status !== 'connected') {
      console.log(`❌ WhatsApp client not ready for key: ${clientKey}, status: ${clientStatus?.status}`);
      console.log(`📋 Available clients:`, waManager.getAllClients().map(c => c.sessionId));
      
      // If client is in qr_ready status, provide helpful message
      if (clientStatus && clientStatus.status === 'qr_ready') {
        return res.json({ 
          status: 'error', 
          message: 'WhatsApp client QR code ready - please scan to connect',
          clientStatus: clientStatus.status,
          suggestion: 'Please scan the QR code in the dashboard to connect WhatsApp'
        });
      }
      
      return res.json({ 
        status: 'error', 
        message: 'WhatsApp client not connected',
        clientStatus: clientStatus?.status || 'not found',
        suggestion: 'Please reconnect WhatsApp'
      });
    }
    
    // Get phone number from webhook data
    const phoneNumber = req.body.phone;
    if (!phoneNumber) {
      console.log(`No phone number found in webhook data`);
      return res.json({ status: 'success' });
    }
    
    console.log(`📱 Sending message to phone: ${phoneNumber}`);
    
    // Check if this message was just received from WhatsApp (prevent echo)
    const recentMessageKey = `whatsapp_${phoneNumber}_${message}`;
    if (global.recentMessages && global.recentMessages.has(recentMessageKey)) {
      console.log(`🚫 Message echo detected, not sending back to WhatsApp: ${message}`);
      return res.json({ status: 'success', reason: 'echo_prevented' });
    }
    
    // Simple echo prevention - only block exact recent messages
    const messageContent = message.toLowerCase().trim();
    const recentMessages = global.recentMessages || new Set();
    let isRecentEcho = false;
    
    for (const key of recentMessages) {
      if (key.startsWith(`whatsapp_${phoneNumber}_`)) {
        const recentContent = key.split('_').slice(2).join('_').toLowerCase().trim();
        if (recentContent === messageContent) {
          isRecentEcho = true;
          console.log(`🚫 Echo detected: ${message} from ${phoneNumber}`);
          break;
        }
      }
    }
    
    if (isRecentEcho) {
      console.log(`🚫 Blocking echo message: ${message}`);
      return res.json({ status: 'success', reason: 'echo_prevented' });
    }
    
    
    console.log(`📱 Sending message to phone: ${phoneNumber} (from GHL webhook)`);
    
    // Send message using Baileys
    try {
      if (attachments && attachments.length > 0) {
        // Handle media message
        const attachment = attachments[0]; // Take first attachment
        const mediaUrl = attachment;
        
        // Detect media type from URL
        let mediaType = 'image'; // default
        if (mediaUrl.includes('.mp4') || mediaUrl.includes('.mov') || mediaUrl.includes('.avi')) {
          mediaType = 'video';
        } else if (mediaUrl.includes('.mp3') || mediaUrl.includes('.wav') || mediaUrl.includes('.ogg')) {
          mediaType = 'audio';
        } else if (mediaUrl.includes('.pdf') || mediaUrl.includes('.doc')) {
          mediaType = 'document';
        }
        
        console.log(`📎 Sending ${mediaType} with URL: ${mediaUrl}`);
        await waManager.sendMessage(clientKey, phoneNumber, message || '', mediaType, mediaUrl);
      } else {
        // Send text message
        await waManager.sendMessage(clientKey, phoneNumber, message || '');
      }
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

// Global GHL Configuration
const BASE = "https://services.leadconnectorhq.com";
const HEADERS = {
  Authorization: `Bearer ${process.env.GHL_LOCATION_API_KEY}`,
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// Provider ID is now loaded from environment variables

// Validate environment variables on startup (optional)
function validateEnvironment() {
  // Only check for GHL_PROVIDER_ID, others are optional
  if (!process.env.GHL_PROVIDER_ID) {
    console.log('⚠️ GHL_PROVIDER_ID not set - will use fallback provider ID');
    return false;
  }
  
  console.log('✅ GHL_PROVIDER_ID found');
  return true;
}

// Get provider ID from environment (with fallback)
function getProviderId() {
  return process.env.GHL_PROVIDER_ID || null;
}

// WhatsApp message receiver webhook (for incoming WhatsApp messages)
app.post('/whatsapp/webhook', async (req, res) => {
  try {
    console.log('📨 Received WhatsApp message:', req.body);
    console.log('📨 Webhook headers:', req.headers);
    console.log('📨 Webhook timestamp:', new Date().toISOString());
    
    const { from, message, messageType = 'text', mediaUrl, mediaMessage, timestamp: messageTimestamp, sessionId, whatsappMsgId } = req.body;
    
    if (!from) {
      console.log('Missing required field "from" in WhatsApp webhook');
      return res.json({ status: 'success' });
    }
    
    // Allow empty message for media messages
    if (!message && !mediaUrl && !mediaMessage) {
      console.log('Missing message content in WhatsApp webhook');
      return res.json({ status: 'success' });
    }
    
    // Deterministic mapping: phone → locationId → providerId → location_api_key
    const waNumber = from.replace('@s.whatsapp.net', '');
    const phone = "+" + waNumber; // E.164 format
    
    // Get GHL account from session or use first available
    let ghlAccount = null;
    if (sessionId) {
      const { data: session } = await supabaseAdmin
            .from('sessions')
        .select('*, ghl_accounts(*)')
        .eq('id', sessionId)
        .maybeSingle();
      
      if (session && session.ghl_accounts) {
        ghlAccount = session.ghl_accounts;
      }
    }
    
    // Fallback to any GHL account if session not found
    if (!ghlAccount) {
      const { data: anyAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
        .limit(1)
        .maybeSingle();
      
      if (anyAccount) {
        ghlAccount = anyAccount;
      }
    }
    
    if (!ghlAccount) {
      console.log(`❌ No GHL account found for message from: ${from}`);
      return res.json({ status: 'success' });
    }
    
    const locationId = ghlAccount.location_id;
    
    // Get provider ID from environment or fallback
    let providerId = getProviderId();
    if (!providerId) {
      // Fallback to account's conversation provider ID
      providerId = ghlAccount.conversation_provider_id;
      if (!providerId) {
        console.error('❌ No conversation provider ID found');
        return res.json({ status: 'error', message: 'Provider ID not available' });
      }
    }
    
    console.log(`📱 Processing WhatsApp message from: ${phone} for location: ${locationId}`);
    console.log(`📨 Raw message from WhatsApp:`, JSON.stringify(req.body, null, 2));
    console.log(`💬 Extracted message text:`, `"${message}"`);
    console.log(`🔍 Message type:`, typeof message);
    
    // Get valid token for this GHL account
    const validToken = await ensureValidToken(ghlAccount);
    
    // Upsert contact (same location)
    let contactId = null;
    try {
      const contactRes = await fetch(`${BASE}/contacts/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phone: phone,
          name: phone,
          locationId: locationId
        })
      });
      
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        contactId = contactData.contact?.id;
        console.log(`✅ Contact upserted: ${contactId}`);
      } else {
        const errorText = await contactRes.text();
        console.error(`❌ Failed to upsert contact:`, errorText);
        
        // Try to extract contactId from error if it's a duplicate contact error
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.meta && errorJson.meta.contactId) {
            contactId = errorJson.meta.contactId;
            console.log(`📝 Using contact ID from error message: ${contactId}`);
          }
        } catch (parseError) {
          console.error(`❌ Could not parse error response:`, parseError);
        }
      }
    } catch (contactError) {
      console.error(`❌ Error upserting contact:`, contactError);
    }
    
    if (!contactId) {
      console.log(`❌ No contact ID available, cannot forward message to GHL`);
      return res.json({ status: 'success' });
    }
    
    // Add INBOUND message (Custom provider)
    try {
        let attachments = [];
        
        let finalMessage = message || "—";
        
        // If this is a media message, process and upload to GHL
        if (mediaUrl && (messageType === 'image' || messageType === 'voice' || messageType === 'video' || messageType === 'audio')) {
          console.log(`📎 Processing media message: ${messageType}`);
          
          try {
            // Get GHL access token
            const accessToken = await ensureValidToken(ghlAccount);
            
            let mediaBuffer;
            
            // Check if this is encrypted media that needs decryption
            if (mediaUrl === 'ENCRYPTED_MEDIA' && mediaMessage) {
              console.log(`🔓 Decrypting encrypted media with Baileys...`);
              
              // Get the WhatsApp client for this session
              const client = waManager.getClient(sessionId);
              if (!client || !client.socket) {
                throw new Error('WhatsApp client not available for decryption');
              }
              
              // Decrypt the media using Baileys
              try {
                // Try downloadContentFromMessage first (newer method)
                console.log(`🔄 Trying downloadContentFromMessage...`);
                const stream = await downloadContentFromMessage(mediaMessage, messageType);
                const chunks = [];
                for await (const chunk of stream) {
                  chunks.push(chunk);
                }
                mediaBuffer = Buffer.concat(chunks);
                console.log(`✅ Decrypted ${mediaBuffer.length} bytes using downloadContentFromMessage`);
              } catch (downloadError) {
                console.error(`❌ downloadContentFromMessage failed:`, downloadError.message);
                
                // Fallback to downloadMediaMessage
                console.log(`🔄 Trying fallback method downloadMediaMessage...`);
                try {
                  mediaBuffer = await downloadMediaMessage(
                    mediaMessage,
                    'buffer',
                    {},
                    {
                      logger: console,
                      reuploadRequest: client.socket.updateMediaMessage
                    }
                  );
                  console.log(`✅ Decrypted ${mediaBuffer.length} bytes using downloadMediaMessage fallback`);
                } catch (decryptError) {
                  console.error(`❌ Media decryption failed:`, decryptError.message);
                  
                  // Try alternative approach - use the URL directly
                if (mediaMessage.message.audioMessage?.url) {
                  console.log(`🔄 Trying direct URL download as fallback...`);
                  const response = await fetch(mediaMessage.message.audioMessage.url);
                  if (response.ok) {
                    mediaBuffer = Buffer.from(await response.arrayBuffer());
                    console.log(`✅ Downloaded ${mediaBuffer.length} bytes via direct URL`);
                  } else {
                    throw new Error('Direct URL download also failed');
                  }
                } else {
                  throw decryptError;
                }
                }
              }
              
            } else if (mediaUrl && mediaUrl.includes('.enc')) {
              console.log(`🔓 Detected encrypted URL, trying direct download...`);
              // Try direct download first
              const response = await fetch(mediaUrl);
              if (response.ok) {
                mediaBuffer = Buffer.from(await response.arrayBuffer());
                console.log(`✅ Downloaded ${mediaBuffer.length} bytes`);
      } else {
                throw new Error('Failed to download encrypted media');
              }
            } else {
              // Regular URL download
              const response = await fetch(mediaUrl);
              if (response.ok) {
                mediaBuffer = Buffer.from(await response.arrayBuffer());
                console.log(`✅ Downloaded ${mediaBuffer.length} bytes`);
              } else {
                throw new Error('Failed to download media');
              }
            }
            
            // Upload decrypted/downloaded media to GHL
            const { uploadMediaToGHL } = require('./mediaHandler');
            const ghlResponse = await uploadMediaToGHL(
              mediaBuffer,
              messageType,
              contactId,
              accessToken
            );
            
            console.log(`✅ Media uploaded to GHL successfully:`, ghlResponse);
            
            // For successful upload, we don't need to send another message
            // The media is already in GHL conversation
            return res.json({ 
              status: 'success', 
              message: 'Media uploaded successfully',
              ghlResponse: ghlResponse
            });
            
          } catch (error) {
            console.error(`❌ Media processing failed:`, error.message);
            
            // Fallback: Send text notification
            finalMessage = `📎 ${getMediaMessageText(messageType)}\n\n⚠️ Media could not be processed. Please check WhatsApp directly.`;
          }
        }
        
        const payload = {
          type: "WhatsApp",
          contactId: contactId,
          message: finalMessage,
          direction: "inbound",
          status: "delivered",
          altId: whatsappMsgId || `wa_${Date.now()}` // idempotency
        };
        
        // Only add attachments if we have them
        if (attachments.length > 0) {
          payload.attachments = attachments;
        }
      
      console.log(`📤 Sending to GHL:`, JSON.stringify(payload, null, 2));
      console.log(`🔑 Using Provider ID:`, providerId);
      console.log(`👤 Using Contact ID:`, contactId);
      console.log(`💬 Message Content:`, `"${message}"`);
      console.log(`📏 Message Length:`, message.length);
      console.log(`📎 Attachments Count:`, attachments.length);
      
      const inboundRes = await fetch(`${BASE}/conversations/messages/inbound`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      
      if (inboundRes.ok) {
        const responseData = await inboundRes.json();
        console.log(`✅ Inbound message added to GHL conversation for contact: ${contactId}`);
        console.log(`📊 GHL Response:`, JSON.stringify(responseData, null, 2));
        console.log(`📊 Response Status:`, inboundRes.status);
        console.log(`📊 Response Headers:`, Object.fromEntries(inboundRes.headers.entries()));
        
        // Check if message was actually created
        if (responseData.messageId) {
          console.log(`📝 Message ID created: ${responseData.messageId}`);
          console.log(`💬 Message should be visible in GHL with content: "${message}"`);
          
          // Try to fetch the message back to verify it was created
          try {
            const verifyRes = await fetch(`${BASE}/conversations/${responseData.conversationId}/messages/${responseData.messageId}`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${validToken}`,
                Version: "2021-07-28",
                "Content-Type": "application/json"
              }
            });
            
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json();
              console.log(`🔍 Message verification:`, JSON.stringify(verifyData, null, 2));
            } else {
              console.log(`⚠️ Could not verify message: ${verifyRes.status}`);
            }
          } catch (verifyError) {
            console.log(`⚠️ Message verification failed:`, verifyError.message);
          }
        }
        
        // Track this message to prevent echo
        if (!global.recentInboundMessages) {
          global.recentInboundMessages = new Set();
        }
        const messageKey = `${contactId}_${message}`;
        global.recentInboundMessages.add(messageKey);
        setTimeout(() => {
          global.recentInboundMessages.delete(messageKey);
        }, 10000); // 10 seconds
      } else {
        const errorText = await inboundRes.text();
        console.error(`❌ Failed to add inbound message to GHL:`, errorText);
        console.error(`📊 Status Code:`, inboundRes.status);
        console.error(`📊 Headers:`, Object.fromEntries(inboundRes.headers.entries()));
      }
    } catch (inboundError) {
      console.error(`❌ Error adding inbound message to GHL:`, inboundError);
    }
    
    // IMPORTANT: Yahan WhatsApp ko kuch wapas send na karein (no echo)
    
    res.json({ status: 'success' });
  } catch (error) {
    console.error('WhatsApp webhook error:', error);
    res.json({ status: 'success' });
  }
});

// GHL Provider Outbound Message Webhook
app.post('/webhooks/ghl/provider-outbound', async (req, res) => {
  try {
    console.log('📤 GHL Provider Outbound Message:', req.body);
    
    // Check if this is an echo from our own inbound message
    const evt = req.body;
    const { contactId, text, message, messageType, mediaUrl, locationId, messageId, altId } = evt;
    
    // If altId starts with 'wa_' it's from our WhatsApp webhook - ignore it
    if (altId && altId.startsWith('wa_')) {
      console.log('🚫 Ignoring echo from our own WhatsApp message:', altId);
      return res.sendStatus(200);
    }
    
    // If message was sent in last 10 seconds, likely an echo
    const now = Date.now();
    if (global.recentInboundMessages && global.recentInboundMessages.has(`${contactId}_${text}`)) {
      console.log('🚫 Ignoring recent echo message');
      return res.sendStatus(200);
    }
    
    if (!contactId || !text) {
      console.log('Missing required fields in GHL outbound webhook');
      return res.sendStatus(200);
    }
    
    // Get GHL account for this location
    let ghlAccount = null;
    const targetLocationId = locationId || process.env.GHL_LOCATION_ID;
    
    if (targetLocationId) {
      const { data: account } = await supabaseAdmin
        .from('ghl_accounts')
        .select('*')
        .eq('location_id', targetLocationId)
        .maybeSingle();
      
      if (account) {
        ghlAccount = account;
      }
    }
    
    // Fallback to any GHL account
    if (!ghlAccount) {
      const { data: anyAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (anyAccount) {
        ghlAccount = anyAccount;
      }
    }
    
    if (!ghlAccount) {
      console.log(`❌ No GHL account found for outbound message`);
      return res.sendStatus(200);
    }
    
    const validToken = await ensureValidToken(ghlAccount);
    
    // Lookup phone by contact
    let phone = null;
    try {
      const contactRes = await fetch(`${BASE}/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        }
      });
      
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        phone = contactData.contact?.phone;
        console.log(`📱 Found phone for contact ${contactId}: ${phone}`);
      }
    } catch (contactError) {
      console.error(`❌ Error looking up contact:`, contactError);
    }
    
    if (!phone) {
      console.log(`❌ No phone found for contact: ${contactId}`);
      return res.sendStatus(200);
    }
    
    // Send message via WhatsApp
    try {
      const waNumber = phone.replace('+', '').replace('@s.whatsapp.net', '');
      const waJid = `${waNumber}@s.whatsapp.net`;
      
      // Find active WhatsApp session for this location
      const { data: session } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('subaccount_id', ghlAccount.id)
        .eq('status', 'ready')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!session) {
        console.log(`❌ No active WhatsApp session found for location: ${ghlAccount.location_id}`);
        return res.sendStatus(200);
      }

      // Use consistent client key format - use subaccount_id from session
      const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const clientKey = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      
      console.log(`🔍 Looking for client with key: ${clientKey}`);
      const clientStatus = waManager.getClientStatus(clientKey);
      
      if (clientStatus && clientStatus.status === 'connected') {
        console.log(`✅ Sending WhatsApp message to ${waJid}: ${text}`);
        await waManager.sendMessage(clientKey, waNumber, text, 'text', null);
        console.log(`✅ Message sent to WhatsApp: ${waJid}`);
      } else {
        console.log(`❌ WhatsApp client not ready for key: ${clientKey}, status: ${clientStatus?.status}`);
        console.log(`📋 Available clients:`, waManager.getAllClients().map(c => c.sessionId));
      }
    } catch (waError) {
      console.error(`❌ Error sending WhatsApp message:`, waError);
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('GHL outbound webhook error:', error);
    res.sendStatus(200);
  }
});

// GHL Provider Send Message (Legacy endpoint - keep for compatibility)
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
    
    if (clientStatus && (clientStatus.status === 'connected' || clientStatus.status === 'connecting')) {
      const messageText = text || message || 'Hello from GHL!';
      const msgType = messageType || 'text';
      const media = mediaUrl || null;
      
      console.log(`✅ Sending WhatsApp ${msgType} to ${to}: ${messageText}`);
      if (media) {
        console.log(`📎 Media URL: ${media}`);
      }
      await waManager.sendMessage(clientKey, to, messageText, msgType, media);
      res.json({ status: 'success', messageId: Date.now().toString() });
    } else {
      console.error(`❌ WhatsApp client not found or not ready for key: ${clientKey}, status: ${clientStatus?.status}`);
      console.log(`📋 Available clients:`, waManager.getAllClients().map(c => c.sessionId));
      res.status(500).json({ 
        error: 'WhatsApp client not available', 
        status: clientStatus?.status || 'not found',
        message: 'Please scan QR code or wait for connection'
      });
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
    // Set specific headers for iframe embedding
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com");
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
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
      
      // Wait a moment for QR to be generated
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if QR is already available
      const qrCode = await waManager.getQRCode(sessionName);
      if (qrCode) {
        console.log(`📱 QR already available, updating database immediately...`);
        const qrDataUrl = await qrcode.toDataURL(qrCode);
          await supabaseAdmin
            .from('sessions')
          .update({ qr: qrDataUrl, status: 'qr' })
            .eq('id', session.id);
        console.log(`✅ QR updated in database immediately`);
      }
        } catch (error) {
      console.error(`❌ Failed to create Baileys client:`, error);
      return res.status(500).json({ error: 'Failed to create WhatsApp client' });
    }
    
    // Set up QR code polling
    const qrPolling = setInterval(async () => {
      try {
        console.log(`🔍 Checking for QR code for session: ${sessionName}`);
        const qrCode = await waManager.getQRCode(sessionName);
        console.log(`📱 QR code result:`, qrCode ? 'Found' : 'Not found');
        
        if (qrCode) {
          clearTimeout(initTimeout); // Clear timeout when QR is generated
          console.log(`🔄 Converting QR to data URL...`);
          const qrDataUrl = await qrcode.toDataURL(qrCode);
          console.log(`💾 Saving QR to database...`);
          
          const { error: qrUpdateError } = await supabaseAdmin
            .from('sessions')
            .update({ qr: qrDataUrl, status: 'qr' })
            .eq('id', session.id);
          
          if (qrUpdateError) {
            console.error('❌ QR update failed:', qrUpdateError);
          } else {
            console.log(`✅ QR generated and saved for location ${locationId}:`, session.id);
            clearInterval(qrPolling); // Stop polling once QR is saved
          }
        }
      } catch (e) {
        console.error('❌ QR polling error:', e);
      }
    }, 1000); // Check every 1 second (fastest)

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

// Logout session (disconnect WhatsApp)
app.post('/ghl/location/:locationId/session/logout', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Disconnect WhatsApp client
    const sessionName = `location_${locationId}_${session.id}`;
    await waManager.disconnectClient(sessionName);
    
    // Clear session data
    waManager.clearSessionData(sessionName);
    
    // Update session status in database
    await supabaseAdmin
      .from('sessions')
      .update({ 
        status: 'disconnected',
        phone_number: null,
        qr: null
      })
      .eq('id', session.id);

    console.log(`✅ Session logged out for location: ${locationId}`);
    res.json({ status: 'success', message: 'Session logged out successfully' });
  } catch (error) {
    console.error('Logout session error:', error);
    res.status(500).json({ error: 'Failed to logout session' });
  }
});

// Delete subaccount
app.delete('/admin/ghl/delete-subaccount', async (req, res) => {
  try {
    const { locationId } = req.body;
    
    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    // Get GHL account
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    // Get all sessions for this subaccount
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id);

    // Disconnect all WhatsApp clients
    if (sessions) {
      for (const session of sessions) {
        const sessionName = `location_${locationId}_${session.id}`;
        await waManager.disconnectClient(sessionName);
        waManager.clearSessionData(sessionName);
      }
    }

    // Delete all sessions
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('subaccount_id', ghlAccount.id);

    // Delete GHL account
    await supabaseAdmin
      .from('ghl_accounts')
      .delete()
      .eq('id', ghlAccount.id);

    console.log(`✅ Subaccount deleted for location: ${locationId}`);
    res.json({ status: 'success', message: 'Subaccount deleted successfully' });
  } catch (error) {
    console.error('Delete subaccount error:', error);
    res.status(500).json({ error: 'Failed to delete subaccount' });
  }
});

// Sync all subaccounts (refresh tokens and reconnect WhatsApp)
app.post('/admin/ghl/sync-all-subaccounts', async (req, res) => {
  try {
    console.log('🔄 Starting sync for all subaccounts...');
    
    // Get all GHL accounts
    const { data: ghlAccounts } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .not('refresh_token', 'is', null);

    if (!ghlAccounts || ghlAccounts.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No subaccounts found to sync',
        syncedCount: 0 
      });
    }

    console.log(`📋 Found ${ghlAccounts.length} subaccounts to sync`);

    let syncedCount = 0;
    let errorCount = 0;
    const results = [];

    for (const ghlAccount of ghlAccounts) {
      try {
        console.log(`🔄 Syncing subaccount: ${ghlAccount.location_id}`);
        
        // 1. Refresh token
        let tokenRefreshed = false;
        try {
          await ensureValidToken(ghlAccount);
          tokenRefreshed = true;
          console.log(`✅ Token refreshed for: ${ghlAccount.location_id}`);
        } catch (tokenError) {
          console.error(`❌ Token refresh failed for ${ghlAccount.location_id}:`, tokenError);
        }

        // 2. Get existing sessions
        const { data: sessions } = await supabaseAdmin
      .from('sessions')
          .select('*')
          .eq('subaccount_id', ghlAccount.id)
          .order('created_at', { ascending: false });

        // 3. Reconnect WhatsApp sessions
        let sessionReconnected = false;
        if (sessions && sessions.length > 0) {
          const latestSession = sessions[0];
          const sessionName = `location_${ghlAccount.id}_${latestSession.id}`;
          
          try {
            // Check current client status
            const clientStatus = waManager.getClientStatus(sessionName);
            console.log(`🔍 Current client status for ${ghlAccount.location_id}: ${clientStatus?.status || 'not found'}`);
            
            // If client is not connected or in qr_ready state, reconnect
            if (!clientStatus || (clientStatus.status !== 'connected' && clientStatus.status !== 'connecting')) {
              // Disconnect existing client if any
              await waManager.disconnectClient(sessionName);
              waManager.clearSessionData(sessionName);
              
              // Create new client
              await waManager.createClient(sessionName);
              sessionReconnected = true;
              console.log(`✅ WhatsApp session reconnected for: ${ghlAccount.location_id}`);
    } else {
              console.log(`✅ WhatsApp session already active for: ${ghlAccount.location_id}`);
              sessionReconnected = true;
            }
          } catch (sessionError) {
            console.error(`❌ Session reconnect failed for ${ghlAccount.location_id}:`, sessionError);
          }
        }

        syncedCount++;
        results.push({
          locationId: ghlAccount.location_id,
          tokenRefreshed,
          sessionReconnected,
          status: 'success'
        });

      } catch (error) {
        errorCount++;
        console.error(`❌ Sync failed for ${ghlAccount.location_id}:`, error);
        results.push({
          locationId: ghlAccount.location_id,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log(`✅ Sync completed: ${syncedCount} successful, ${errorCount} failed`);

    res.json({ 
      success: true, 
      message: `Sync completed: ${syncedCount} subaccounts processed`,
      syncedCount,
      errorCount,
      results
    });

  } catch (error) {
    console.error('Sync all subaccounts error:', error);
    res.status(500).json({ 
      error: 'Failed to sync subaccounts',
      details: error.message 
    });
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

// Configure multer for voice messages
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Voice message handler
app.post('/api/send-voice-message', upload.single('audio'), async (req, res) => {
  try {
    console.log('🎤 Received voice message request');
    
    const { contactId, locationId } = req.body;
    const audioFile = req.file;
    
    console.log('📊 Voice message data:', {
      contactId,
      locationId,
      fileSize: audioFile ? audioFile.size : 0,
      mimeType: audioFile ? audioFile.mimetype : 'none'
    });
    
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    if (!contactId || !locationId) {
      return res.status(400).json({ error: 'Missing contactId or locationId' });
    }
    
    // Get GHL account
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();
    
    if (!ghlAccount) {
      console.log(`❌ GHL account not found for location: ${locationId}`);
      return res.status(404).json({ error: 'GHL account not found' });
    }
    
    console.log(`✅ Found GHL account: ${ghlAccount.id}`);
    
    // Get valid token
    const accessToken = await ensureValidToken(ghlAccount);
    console.log('✅ Got valid access token');
    
    // Upload audio to GHL media library
    const formData = new FormData();
    formData.append('file', audioFile.buffer, {
      filename: 'voice-message.webm',
      contentType: 'audio/webm'
    });
    
    console.log('📤 Uploading audio to GHL media library...');
    const mediaResponse = await axios.post(
      'https://services.leadconnectorhq.com/medias',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
      }
    );
    
    console.log('✅ Audio uploaded to GHL:', mediaResponse.data);
    
    // Get WhatsApp session for this location
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!session) {
      console.log(`❌ No active WhatsApp session found for location: ${locationId}`);
      return res.status(404).json({ error: 'No active WhatsApp session found' });
    }
    
    console.log(`✅ Found WhatsApp session: ${session.id}`);
    
    // Get contact phone number
    const contactResponse = await axios.get(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28'
        }
      }
    );
    
    const contact = contactResponse.data.contact;
    const phoneNumber = contact.phone;
    
    if (!phoneNumber) {
      console.log(`❌ No phone number found for contact: ${contactId}`);
      return res.status(400).json({ error: 'Contact has no phone number' });
    }
    
    console.log(`📱 Sending voice message to: ${phoneNumber}`);
    
    // Send voice message via WhatsApp
    const cleanSubaccountId = session.subaccount_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const clientKey = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    const clientStatus = waManager.getClientStatus(clientKey);
    if (!clientStatus || clientStatus.status !== 'connected') {
      console.log(`❌ WhatsApp client not connected for key: ${clientKey}, status: ${clientStatus?.status}`);
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }
    
    // Send voice message using Baileys
    const result = await waManager.sendMessage(
      clientKey, 
      phoneNumber, 
      '🎤 Voice Message', 
      'audio', 
      mediaResponse.data.url || mediaResponse.data.mediaUrl
    );
    
    console.log('✅ Voice message sent via WhatsApp:', result);
    
    // Also create conversation message in GHL
    const messagePayload = {
      type: "WhatsApp",
      contactId: contactId,
      message: "🎤 Voice Message",
      direction: "outbound",
      status: "sent",
      altId: `voice_${Date.now()}`,
      attachments: [{
        type: "audio",
        url: mediaResponse.data.url || mediaResponse.data.mediaUrl,
        name: "voice-message.webm"
      }]
    };
    
    console.log('📤 Creating conversation message in GHL...');
    const conversationResponse = await axios.post(
      'https://services.leadconnectorhq.com/conversations/messages',
      messagePayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Conversation message created:', conversationResponse.data);
    
    res.json({ 
      success: true, 
      messageId: conversationResponse.data.messageId,
      whatsappResult: result,
      mediaUrl: mediaResponse.data.url || mediaResponse.data.mediaUrl
    });
    
  } catch (error) {
    console.error('❌ Voice message error:', error);
    res.status(500).json({ 
      error: 'Failed to send voice message',
      details: error.message 
    });
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

// Manual token refresh endpoint
app.post('/debug/refresh-token/:locationId', async (req, res) => {
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

    // Force token refresh
    const newToken = await refreshGHLToken(ghlAccount);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      locationId,
      newToken: newToken.substring(0, 20) + '...' // Show first 20 chars only
    });
    
  } catch (error) {
    console.error('Manual token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// Test token endpoint
app.get('/debug/test-token/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;

    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .maybeSingle();

    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    // Test current token
    const testResponse = await fetch(`${BASE}/locations/${locationId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ghlAccount.access_token}`,
        Version: "2021-07-28",
        "Content-Type": "application/json"
      }
    });

    res.json({
      success: testResponse.ok,
      status: testResponse.status,
      message: testResponse.ok ? 'Token is valid' : 'Token is invalid',
      locationId,
      tokenExpires: ghlAccount.token_expires_at
    });
    
  } catch (error) {
    console.error('Token test error:', error);
    res.status(500).json({ 
      error: 'Failed to test token',
      details: error.message 
    });
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

// Test incoming message webhook
app.post('/debug/test-incoming', async (req, res) => {
  try {
    const { from, message, locationId } = req.body;
    
    if (!from || !message) {
      return res.status(400).json({ error: 'From and message required' });
    }
    
    // Simulate incoming WhatsApp message
    const webhookData = {
      from: from.includes('@') ? from : `${from}@s.whatsapp.net`,
      message,
      timestamp: Date.now(),
      whatsappMsgId: `test_${Date.now()}`
    };
    
    console.log('🧪 Testing webhook with data:', webhookData);
    
    // Call the webhook internally
    const webhookResponse = await fetch(`${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/whatsapp/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    const responseText = await webhookResponse.text();
    
    res.json({
      success: true,
      message: 'Test webhook called',
      webhookData,
      webhookStatus: webhookResponse.status,
      webhookResponse: responseText
    });
  } catch (error) {
    console.error('Test incoming webhook error:', error);
    res.status(500).json({ error: 'Failed to test webhook', details: error.message });
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


// Test GHL outbound webhook
app.post('/debug/test-outbound', async (req, res) => {
  try {
    const { contactId, text } = req.body;
    
    if (!contactId || !text) {
      return res.status(400).json({ error: 'ContactId and text required' });
    }
    
    // Simulate GHL outbound message
    const webhookData = {
      contactId: contactId,
      text: text,
      locationId: process.env.GHL_LOCATION_ID
    };
    
    console.log('🧪 Testing outbound webhook with data:', webhookData);
    
    // Call the webhook internally
    const webhookResponse = await fetch(`${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/webhooks/ghl/provider-outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookData)
    });
    
    res.json({ 
      status: 'success', 
      webhookResponse: webhookResponse.ok,
      message: 'Test outbound message sent to webhook'
    });
  } catch (error) {
    console.error('Test outbound error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GHL OAuth URL: https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`);
  
  // Validate environment variables (non-blocking)
  validateEnvironment();
});

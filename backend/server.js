const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const GHLClient = require('./lib/ghl');
const WhatsAppManager = require('./lib/wa');
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
const GHL_SCOPES = process.env.GHL_SCOPES || 'locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write users.readonly';

// WhatsApp Manager
const waManager = new WhatsAppManager();

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
    'https://whatsapp123-frontend.vercel.app',
    'https://whatsapp123-frontend-git-main-abjandal19s-projects.vercel.app',
    'https://whatsappghl.vercel.app',
    'https://*.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

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
    
    console.log('OAuth Callback received:', { code: !!code, locationId, state });

    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided' });
    }

    if (!locationId) {
      return res.status(400).json({ error: 'Location ID not provided. Please select a subaccount during OAuth flow.' });
    }

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

    // Determine target user ID
    let targetUserId = null;
    if (state) {
      try {
        targetUserId = decodeURIComponent(state);
      } catch (e) {
        console.error('Error decoding state:', e);
      }
    }

    // If no target user, try to find existing GHL account for this company
    if (!targetUserId) {
      const { data: existingAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('user_id')
        .eq('company_id', tokenData.companyId)
        .maybeSingle();
      
      if (existingAccount) {
        targetUserId = existingAccount.user_id;
        console.log('Found existing GHL account for company:', targetUserId);
      } else {
        // Create a service user for this GHL account
        const { data: serviceUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
          email: `ghl-${tokenData.companyId}@service.local`,
          password: Math.random().toString(36),
          email_confirm: true
        });
        
        if (userError) {
          console.error('Error creating service user:', userError);
          return res.status(500).json({ error: 'Failed to create user account' });
        }
        
        targetUserId = serviceUser.user.id;
        console.log('Created service user for GHL account:', targetUserId);
      }
    }

    // Store GHL account information
    const { error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: targetUserId,
        company_id: tokenData.companyId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        location_id: locationId,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      });

    if (ghlError) {
      console.error('Error storing GHL account:', ghlError);
      return res.status(500).json({ error: 'Failed to store account information' });
    }

    // Create subaccount entry
    const { error: subaccountError } = await supabaseAdmin
      .from('subaccounts')
      .upsert({
        user_id: targetUserId,
        ghl_location_id: locationId,
        name: `Location ${locationId}`,
        status: 'connected'
      });

    if (subaccountError) {
      console.error('Error creating subaccount:', subaccountError);
      return res.status(500).json({ error: 'Failed to create subaccount' });
    }

    console.log('GHL account and subaccount created successfully');
    res.redirect('/dashboard?ghl=connected');

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

// GHL Provider UI (for custom menu link)
app.get('/ghl/provider', async (req, res) => {
  try {
    const { locationId, companyId } = req.query;
    
    if (!locationId) {
      return res.status(400).send('Location ID is required');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>WhatsApp Provider</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; padding: 16px; }
            .card { max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
            .muted { color: #6b7280; font-size: 14px; }
            .center { text-align: center; }
            img { max-width: 100%; }
            .status { margin-top: 8px; }
            button { padding: 8px 12px; border-radius: 6px; border: 1px solid #d1d5db; background:#fff; cursor:pointer; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2 class="center">Connect WhatsApp</h2>
            <p class="muted center">Location: ${locationId}</p>
            <div id="qr" class="center" style="margin-top:12px;"></div>
            <div id="info" class="center status muted">Preparing session…</div>
            <div class="center" style="margin-top:12px;"><button id="reset">Reset QR</button></div>
          </div>
          <script>
            const qs = new URLSearchParams(window.location.search);
            const locId = qs.get('locationId');
            const companyId = qs.get('companyId');
            const info = document.getElementById('info');
            const qr = document.getElementById('qr');
            const resetBtn = document.getElementById('reset');

            async function create() {
              try {
                const r = await fetch('/ghl/location/' + encodeURIComponent(locId) + '/session' + (companyId ? ('?companyId=' + encodeURIComponent(companyId)) : ''), { method: 'POST' });
                const j = await r.json().catch(() => ({}));
                if (j.qr) qr.innerHTML = '<img src="' + j.qr + '" alt="QR" />';
                info.textContent = 'Status: ' + (j.status || r.status);
              } catch (e) {
                info.textContent = 'Error creating session';
              }
            }

            async function poll() {
              try {
                const r = await fetch('/ghl/location/' + encodeURIComponent(locId) + '/session');
                const j = await r.json().catch(() => ({}));
                if (j.qr) qr.innerHTML = '<img src="' + j.qr + '" alt="QR" />';
                if (j.status === 'ready') {
                  info.textContent = 'Connected: ' + (j.phone_number || 'Unknown');
                  clearInterval(pollInterval);
                } else if (j.status === 'disconnected') {
                  info.textContent = 'Disconnected';
                  clearInterval(pollInterval);
                } else {
                  info.textContent = 'Status: ' + (j.status || 'Unknown');
                }
              } catch (e) {
                info.textContent = 'Error polling status';
              }
            }

            let pollInterval = setInterval(poll, 2000);

            resetBtn.addEventListener('click', async () => {
              await create();
            });

            (async () => {
              await create();
              poll();
            })();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Provider UI error:', error);
    res.status(500).send('Failed to render provider');
  }
});

// Session management endpoints
app.post('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { companyId } = req.query;

    console.log(`Creating session for locationId: ${locationId}`);

    // Find subaccount for this location
    const { data: subaccount, error: subErr } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('ghl_location_id', locationId)
      .maybeSingle();

    if (subErr) {
      console.error('Database error:', subErr);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!subaccount) {
      console.error(`Subaccount not found for locationId: ${locationId}`);
      return res.status(404).json({ error: 'Subaccount not found. Please connect GHL subaccount first.' });
    }

    console.log('Found subaccount:', { id: subaccount.id, user_id: subaccount.user_id });

    // Check for existing session
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', subaccount.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0 && existing[0].status !== 'disconnected') {
      return res.json({ 
        status: existing[0].status, 
        qr: existing[0].qr, 
        phone_number: existing[0].phone_number 
      });
    }

    // Create new session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({ 
        user_id: subaccount.user_id, 
        subaccount_id: subaccount.id, 
        status: 'initializing' 
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    console.log('Created session:', session.id);

    // Create WhatsApp client
    const client = waManager.createClient(
      session.id,
      async (qrValue) => {
        try {
          const qrDataUrl = await qrcode.toDataURL(qrValue);
          await supabaseAdmin
            .from('sessions')
            .update({ qr: qrDataUrl, status: 'qr' })
            .eq('id', session.id);
        } catch (e) {
          console.error('QR update error:', e);
        }
      },
      async (info) => {
        try {
          await supabaseAdmin
            .from('sessions')
            .update({ status: 'ready', qr: null, phone_number: info.wid.user })
            .eq('id', session.id);
        } catch (e) {
          console.error('Session ready update error:', e);
        }
      },
      async () => {
        try {
          await supabaseAdmin
            .from('sessions')
            .update({ status: 'disconnected' })
            .eq('id', session.id);
          waManager.removeClient(session.id);
        } catch (e) {
          console.error('Session disconnect update error:', e);
        }
      },
      async () => {}
    );

    // Initialize WhatsApp client
    client.initialize().catch((e) => console.error('WA init error:', e));

    res.json({ status: 'initializing' });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;

    // Find subaccount for this location
    const { data: subaccount, error: subErr } = await supabaseAdmin
      .from('subaccounts')
      .select('id')
      .eq('ghl_location_id', locationId)
      .maybeSingle();

    if (subErr) {
      console.error('Database error:', subErr);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    // Get latest session
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', subaccount.id)
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

    // Send message via WhatsApp
    const client = waManager.getClient(session[0].id);
    if (!client) {
      return res.status(404).json({ error: 'WhatsApp client not found' });
    }

    // Store message in database
    const { data: messageRecord } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: session[0].id,
        contact_id: contactId,
        message: message,
        direction: 'outbound',
        status: 'sent'
      })
      .select()
      .single();

    // Send via WhatsApp
    await client.sendMessage(contactId, message);

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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GHL OAuth URL: https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`);
});

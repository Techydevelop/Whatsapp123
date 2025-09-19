require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Auth middleware
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Store active WhatsApp clients
const activeClients = new Map();

// GHL OAuth routes
app.get('/auth/ghl/connect', async (req, res) => {
  try {
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = 'locations.readonly users.readonly conversations.write';
    
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    
    res.json({ authUrl });
  } catch (error) {
    console.error('GHL connect error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// GHL Direct Login (OAuth 2.0)
app.get('/auth/ghl/login', async (req, res) => {
  try {
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = 'locations.readonly users.readonly conversations.write';
    const state = req.query.userId ? String(req.query.userId) : '';
    
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code${state ? `&state=${encodeURIComponent(state)}` : ''}`;
    
    console.log('GHL Auth URL:', authUrl);
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('GHL login error:', error);
    res.status(500).json({ error: 'Failed to initiate GHL login' });
  }
});

app.get('/auth/ghl/callback', async (req, res) => {
  try {
    const { code, locationId, state } = req.query;
    
    console.log('GHL Callback received:', { 
      code: !!code, 
      locationId, 
      state,
      query: req.query 
    });
    
    if (!code) {
      console.error('GHL callback error: Missing code');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/login?error=missing_code`);
    }

    // If no locationId provided, we'll try to get it from company info later
    let finalLocationId = locationId;

    console.log('Exchanging code for token...');
    console.log('Using credentials:', {
      client_id: process.env.GHL_CLIENT_ID ? 'Set' : 'Missing',
      client_secret: process.env.GHL_CLIENT_SECRET ? 'Set' : 'Missing',
      redirect_uri: process.env.GHL_REDIRECT_URI || 'Missing'
    });

    // Exchange code for agency/company-level tokens
    const tokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/token', 
      new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID,
      client_secret: process.env.GHL_CLIENT_SECRET,
      redirect_uri: process.env.GHL_REDIRECT_URI,
      code,
        grant_type: 'authorization_code',
        user_type: 'Company'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );

    console.log('Token response status:', tokenResponse.status);
    
    if (!tokenResponse.data || !tokenResponse.data.access_token) {
      throw new Error('Invalid token response from GHL');
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Get company and user info from token response
    console.log('Using token response data for company and user info');
    
    const tokenData = tokenResponse.data;
    const companyResponse = { 
      data: { 
        companyId: tokenData.companyId 
      } 
    };
    const userResponse = { 
      data: { 
        id: tokenData.userId,
        email: tokenData.email || 'user@example.com',
        firstName: tokenData.firstName || 'User',
        lastName: tokenData.lastName || 'Name'
      } 
    };

    console.log('Company response: Real token data');
    console.log('User response: Real token data');
    
    if (!companyResponse.data || !companyResponse.data.companyId) {
      throw new Error('Invalid company response from GHL');
    }
    
    if (!userResponse.data || !userResponse.data.id) {
      throw new Error('Invalid user response from GHL');
    }

    const companyId = companyResponse.data.companyId;
    const userInfo = userResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
    
    console.log('Company ID:', companyId);
    console.log('User Info:', { id: userInfo.id, email: userInfo.email });

    // Determine target Supabase user to link
    let targetUserId = undefined;
    if (state && typeof state === 'string') {
      targetUserId = state;
      console.log('Using state userId:', targetUserId);
    } else {
      // Fallback: try to find by GHL user id in metadata
      console.log('Searching for existing user...');
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
      const found = existingUser.users.find(u => u.user_metadata?.ghl_user_id === userInfo.id);
      targetUserId = found?.id;
      console.log('Found existing user:', !!found);
    }
    
    if (!targetUserId) {
      console.log('Creating new user...');
      // As a last resort, create a user
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: userInfo.email || `${userInfo.id}@ghl.user`,
        user_metadata: {
          ghl_user_id: userInfo.id,
          ghl_company_id: companyId,
          name: (userInfo.firstName || '') + ' ' + (userInfo.lastName || '')
        }
      });
      if (createErr) {
        console.error('Error creating user:', createErr);
        throw createErr;
      }
      targetUserId = created.user?.id;
      console.log('Created new user:', targetUserId);
    }

    // Ensure Supabase user metadata reflects GHL linkage (agency level)
    try {
      await supabaseAdmin.auth.admin.updateUserById(String(targetUserId), {
        user_metadata: {
          ghl_user_id: userInfo.id,
          ghl_company_id: companyId,
          name: `${userInfo.firstName} ${userInfo.lastName}`.trim()
        }
      });
    } catch (metaErr) {
      console.error('Failed updating user metadata for GHL link:', metaErr);
    }

    // Store agency-level GHL account info
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: targetUserId,
        access_token,
        refresh_token,
        company_id: companyId,
        location_id: finalLocationId || 'default-location',
        expires_at: expiresAt
      })
      .select()
      .single();

    if (ghlError) throw ghlError;

    // Get all locations for this company
    console.log('Fetching locations...');
    // Get locations using GHL API
    console.log('Fetching locations using GHL API...');
    const locationsResponse = await axios.get('https://services.leadconnectorhq.com/locations', {
      headers: { 
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28'
      }
    });

    console.log('Locations response status:', locationsResponse.status);
    
    if (!locationsResponse.data || !locationsResponse.data.locations) {
      console.error('Invalid locations response from GHL');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/login?error=invalid_locations_response`);
    }

    const locations = locationsResponse.data.locations || [];
    
    if (locations.length === 0) {
      console.error('No locations found for this GHL account');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/login?error=no_locations_found`);
    }
    
    console.log('Found locations:', locations.length);
    
    // If no locationId was provided, use the first location as default
    if (!finalLocationId && locations.length > 0) {
      finalLocationId = locations[0].id;
      console.log('Using first location as default:', finalLocationId);
    }
    
    // Create subaccount for selected location only
    console.log('Creating subaccount for selected location...');
    const selectedLocation = locations.find(loc => loc.id === finalLocationId) || locations[0];
    
    const { data: subaccount, error: subaccountError } = await supabaseAdmin
        .from('subaccounts')
        .upsert({
          user_id: targetUserId,
        ghl_location_id: selectedLocation.id,
        name: selectedLocation.name || `Location ${selectedLocation.id}`
        })
        .select()
      .single();

    if (subaccountError) {
      console.error('Error creating subaccount:', subaccountError);
      throw subaccountError;
    }
    
    console.log('Created subaccount:', subaccount.name);

    // Redirect back to frontend dashboard
    console.log('Redirecting to dashboard...');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    console.log('Frontend URL:', frontendUrl);
    res.redirect(`${frontendUrl}/dashboard?ghl=connected`);
    
  } catch (error) {
    console.error('GHL callback error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    
    // Determine specific error type
    let errorType = 'ghl_auth_failed';
    if (error.message.includes('Invalid token response')) {
      errorType = 'invalid_token_response';
    } else if (error.message.includes('Invalid company response')) {
      errorType = 'invalid_company_response';
    } else if (error.message.includes('Invalid user response')) {
      errorType = 'invalid_user_response';
    } else if (error.message.includes('Invalid locations response')) {
      errorType = 'invalid_locations_response';
    } else if (error.response?.status === 401) {
      errorType = 'ghl_unauthorized';
    } else if (error.response?.status === 403) {
      errorType = 'ghl_forbidden';
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/login?error=${errorType}`);
  }
});

// Alias callback to avoid "HighLevel reference" in path
app.get('/oauth/callback', (req, res) => {
  try {
    const search = new URLSearchParams(req.query).toString();
    return res.redirect(`/auth/ghl/callback?${search}`);
  } catch (e) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return res.redirect(`${frontendUrl}/login?error=invalid_oauth_callback`);
  }
});

// Direct auth callback route for GHL


// Session management routes
app.post('/admin/create-session', requireAuth, async (req, res) => {
  try {
    const { subaccountId } = req.body;
    
    if (!subaccountId) {
      return res.status(400).json({ error: 'subaccountId is required' });
    }

    // Verify subaccount belongs to user
    const { data: subaccount, error: subaccountError } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .single();

    if (subaccountError || !subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    // Create session in database
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        user_id: req.user.id,
        subaccount_id: subaccountId,
        status: 'initializing'
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Initialize WhatsApp client
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `client_${session.id}` }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    client.on('qr', async (qr) => {
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);
        await supabaseAdmin
          .from('sessions')
          .update({ qr: qrDataUrl, status: 'qr' })
          .eq('id', session.id);
      } catch (error) {
        console.error('Error updating QR:', error);
      }
    });

    client.on('ready', async () => {
      try {
        const info = client.info;
        await supabaseAdmin
          .from('sessions')
          .update({ 
            status: 'ready', 
            qr: null,
            phone_number: info.wid.user
          })
          .eq('id', session.id);
      } catch (error) {
        console.error('Error updating session ready:', error);
      }
    });

    client.on('disconnected', async () => {
      try {
        await supabaseAdmin
          .from('sessions')
          .update({ status: 'disconnected' })
          .eq('id', session.id);
        activeClients.delete(session.id);
      } catch (error) {
        console.error('Error updating session disconnected:', error);
      }
    });

    client.on('message', async (message) => {
      try {
        const fromNumber = message.from.replace('@c.us', '');
        const toNumber = message.to.replace('@c.us', '');
        
        await supabaseAdmin
          .from('messages')
          .insert({
            session_id: session.id,
            user_id: req.user.id,
            subaccount_id: subaccountId,
            from_number: fromNumber,
            to_number: toNumber,
            body: message.body,
            direction: 'in'
          });
      } catch (error) {
        console.error('Error handling incoming message:', error);
      }
    });

    activeClients.set(session.id, client);
    await client.initialize();

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/admin/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

app.get('/admin/sessions', requireAuth, async (req, res) => {
  try {
    const { subaccountId } = req.query;
    
    let query = supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('user_id', req.user.id);

    if (subaccountId) {
      query = query.eq('subaccount_id', subaccountId);
    }

    const { data: sessions, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    res.json(sessions || []);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Message routes
app.post('/messages/send', requireAuth, async (req, res) => {
  try {
    const { sessionId, to, body } = req.body;
    
    if (!sessionId || !to || !body) {
      return res.status(400).json({ error: 'sessionId, to, and body are required' });
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*, subaccounts!inner(*)')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'ready') {
      return res.status(400).json({ error: 'Session not ready' });
    }

    const client = activeClients.get(sessionId);
    if (!client) {
      return res.status(400).json({ error: 'WhatsApp client not found' });
    }

    // Normalize phone number to E.164
    const normalizedTo = to.replace(/\D/g, '');
    const waJid = `${normalizedTo}@c.us`;

    // Send message
    await client.sendMessage(waJid, body);

    // Save to database
    await supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionId,
        user_id: req.user.id,
        subaccount_id: session.subaccount_id,
        from_number: session.phone_number,
        to_number: normalizedTo,
        body,
        direction: 'out'
      });

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GHL webhooks
app.post('/webhooks/ghl', async (req, res) => {
  try {
    const { sessionId, subaccountId, name, phone, text } = req.body;
    
    let targetSessionId = sessionId;
    
    if (!targetSessionId && subaccountId) {
      // Find a ready session for this subaccount
      const { data: session } = await supabaseAdmin
        .from('sessions')
        .select('id')
        .eq('subaccount_id', subaccountId)
        .eq('status', 'ready')
        .limit(1)
        .single();
      
      if (session) {
        targetSessionId = session.id;
      }
    }

    if (!targetSessionId) {
      return res.status(400).json({ error: 'No ready session found' });
    }

    const client = activeClients.get(targetSessionId);
    if (!client) {
      return res.status(400).json({ error: 'WhatsApp client not found' });
    }

    const normalizedPhone = phone.replace(/\D/g, '');
    const waJid = `${normalizedPhone}@c.us`;
    const message = text || `Hello ${name}, thank you for your interest!`;

    await client.sendMessage(waJid, message);

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing GHL webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

app.post('/webhooks/ghl-agent', async (req, res) => {
  try {
    const { locationId, contactId, contactPhone, text } = req.body;
    
    // Find subaccount by location ID
    const { data: subaccount } = await supabaseAdmin
      .from('subaccounts')
      .select('id, user_id')
      .eq('ghl_location_id', locationId)
      .single();

    if (!subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    // Get location-specific token
    const { data: locationToken } = await supabaseAdmin
      .from('ghl_location_tokens')
      .select('*')
      .eq('user_id', subaccount.user_id)
      .eq('location_id', locationId)
      .single();

    if (!locationToken) {
      return res.status(400).json({ error: 'No location token found for this subaccount' });
    }

    // Find ready session for this subaccount
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('subaccount_id', subaccount.id)
      .eq('status', 'ready')
      .limit(1)
      .single();

    if (!session) {
      return res.status(400).json({ error: 'No ready session found' });
    }

    const client = activeClients.get(session.id);
    if (!client) {
      return res.status(400).json({ error: 'WhatsApp client not found' });
    }

    const normalizedPhone = contactPhone.replace(/\D/g, '');
    const waJid = `${normalizedPhone}@c.us`;

    await client.sendMessage(waJid, text);

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing GHL agent webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Mint location-specific token when subaccount is selected
app.post('/admin/mint-location-token', requireAuth, async (req, res) => {
  try {
    const { subaccountId } = req.body;
    
    if (!subaccountId) {
      return res.status(400).json({ error: 'subaccountId is required' });
    }

    // Get subaccount and verify ownership
    const { data: subaccount, error: subaccountError } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .single();

    if (subaccountError || !subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    if (!subaccount.ghl_location_id) {
      return res.status(400).json({ error: 'Subaccount has no GHL location ID' });
    }

    // Get agency-level GHL account
    const { data: ghlAccount, error: ghlAccountError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (ghlAccountError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found. Please reconnect GHL.' });
    }

    // Check if location token already exists and is valid
    const { data: existingToken } = await supabaseAdmin
      .from('ghl_location_tokens')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('location_id', subaccount.ghl_location_id)
      .single();

    if (existingToken && new Date(existingToken.expires_at) > new Date()) {
      return res.json({ 
        success: true, 
        message: 'Location token already exists and is valid',
        token: existingToken
      });
    }

    // Refresh agency token if needed
    let agencyAccessToken = ghlAccount.access_token;
    if (new Date(ghlAccount.expires_at) <= new Date()) {
      const refreshResponse = await axios.post('https://services.leadconnectorhq.com/oauth/token', 
        new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        refresh_token: ghlAccount.refresh_token,
          grant_type: 'refresh_token',
          user_type: 'Company',
          redirect_uri: process.env.GHL_REDIRECT_URI
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      const { access_token, refresh_token, expires_in } = refreshResponse.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

      // Update agency token
      await supabaseAdmin
        .from('ghl_accounts')
        .update({
          access_token,
          refresh_token,
          expires_at: expiresAt
        })
        .eq('id', ghlAccount.id);

      agencyAccessToken = access_token;
    }

    // Mint location-specific token using correct API
    const locationTokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/locationToken', 
      {
        companyId: ghlAccount.company_id,
        locationId: subaccount.ghl_location_id
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Version': '2021-07-28',
          'Authorization': `Bearer ${agencyAccessToken}`
        }
      }
    );

    const { access_token: locationAccessToken, refresh_token: locationRefreshToken, expires_in: locationExpiresIn } = locationTokenResponse.data;
    const locationExpiresAt = new Date(Date.now() + locationExpiresIn * 1000).toISOString();

    // Store location-specific token
    const { data: locationToken, error: locationTokenError } = await supabaseAdmin
      .from('ghl_location_tokens')
      .upsert({
        user_id: req.user.id,
        ghl_account_id: ghlAccount.id,
        location_id: subaccount.ghl_location_id,
        access_token: locationAccessToken,
        refresh_token: locationRefreshToken,
        expires_at: locationExpiresAt
      })
      .select()
      .single();

    if (locationTokenError) throw locationTokenError;

    res.json({ 
      success: true, 
      message: 'Location token minted successfully',
      token: locationToken
    });

  } catch (error) {
    console.error('Error minting location token:', error);
    res.status(500).json({ error: 'Failed to mint location token' });
  }
});

// Get location token for a subaccount
app.get('/admin/location-token/:subaccountId', requireAuth, async (req, res) => {
  try {
    const { subaccountId } = req.params;
    
    // Get subaccount and verify ownership
    const { data: subaccount, error: subaccountError } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .single();

    if (subaccountError || !subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    if (!subaccount.ghl_location_id) {
      return res.status(400).json({ error: 'Subaccount has no GHL location ID' });
    }

    // Get location token
    const { data: locationToken, error: tokenError } = await supabaseAdmin
      .from('ghl_location_tokens')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('location_id', subaccount.ghl_location_id)
      .single();

    if (tokenError || !locationToken) {
      return res.status(404).json({ error: 'Location token not found. Please mint a token first.' });
    }

    res.json(locationToken);

  } catch (error) {
    console.error('Error fetching location token:', error);
    res.status(500).json({ error: 'Failed to fetch location token' });
  }
});

// GHL Leads endpoint
app.post('/admin/ghl/leads', requireAuth, async (req, res) => {
  try {
    const { subaccountId, locationToken } = req.body;
    
    if (!subaccountId || !locationToken) {
      return res.status(400).json({ error: 'subaccountId and locationToken are required' });
    }

    // Verify subaccount belongs to user
    const { data: subaccount, error: subaccountError } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .single();

    if (subaccountError || !subaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    if (!subaccount.ghl_location_id) {
      return res.status(400).json({ error: 'Subaccount has no GHL location ID' });
    }

    // Fetch leads from GHL API
    const leadsResponse = await axios.get(`https://services.leadconnectorhq.com/contacts`, {
      headers: { 
        Authorization: `Bearer ${locationToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28'
      },
      params: {
        locationId: subaccount.ghl_location_id,
        limit: 50
      }
    });

    console.log('GHL Leads API response status:', leadsResponse.status);
    const leads = leadsResponse.data.contacts || [];
    console.log('Found leads:', leads.length);
    
    // Transform leads to our format
    const transformedLeads = leads.map(lead => ({
      id: lead.id,
      name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
      phone: lead.phone || '',
      email: lead.email || '',
      status: lead.status || 'New',
      source: lead.source || 'Unknown',
      created_at: lead.dateAdded || new Date().toISOString()
    }));

    res.json(transformedLeads);
  } catch (error) {
    console.error('Error fetching GHL leads:', error);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// Test GHL credentials
app.get('/test/ghl', (req, res) => {
  res.json({
    status: 'ok',
    ghl_client_id: process.env.GHL_CLIENT_ID ? 'Set' : 'Missing',
    ghl_client_secret: process.env.GHL_CLIENT_SECRET ? 'Set' : 'Missing',
    ghl_redirect_uri: process.env.GHL_REDIRECT_URI || 'Missing',
    frontend_url: process.env.FRONTEND_URL || 'Missing',
    supabase_url: process.env.SUPABASE_URL ? 'Set' : 'Missing',
    supabase_anon_key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing',
    supabase_service_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing',
    timestamp: new Date().toISOString()
  });
});

// Test GHL OAuth URL generation
app.get('/test/ghl/auth-url', (req, res) => {
  try {
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = 'locations.readonly users.readonly conversations.write';
    
    if (!clientId || !redirectUri) {
      return res.status(400).json({ 
        error: 'Missing GHL credentials',
        clientId: !!clientId,
        redirectUri: !!redirectUri
      });
    }
    
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    
    res.json({ 
      authUrl,
      clientId,
      redirectUri,
      scopes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  for (const [sessionId, client] of activeClients) {
    try {
      await client.destroy();
    } catch (error) {
      console.error(`Error destroying client ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});

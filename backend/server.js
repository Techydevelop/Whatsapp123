require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode');
const axios = require('axios');
const crypto = require('crypto');

// Import utilities
const { normalizeToE164, toWhatsAppJID, fromWhatsAppJID } = require('./lib/phone');
const GHLClient = require('./lib/ghl');
const WhatsAppManager = require('./lib/wa');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Initialize WhatsApp manager
const waManager = new WhatsAppManager();

// Middleware
// Allow embedding provider UI inside GHL/LeadConnector iframes
app.use(helmet({
  frameguard: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'", "data:", "blob:"],
      "img-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      // Critical: permit GHL/LeadConnector to embed this app
      "frame-ancestors": [
        "'self'",
        "https://app.gohighlevel.com",
        "https://*.gohighlevel.com",
        "https://app.leadconnectorhq.com",
        "https://*.leadconnectorhq.com"
      ]
    }
  }
}));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'https://whatsappghl.vercel.app',
    'https://whatsapp123-tss8-2j8uzmt9q-techydevelops-projects.vercel.app',
    /^https:\/\/.*\.vercel\.app$/
  ],
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Rate limiting
const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: 'Too many messages sent, please try again later.'
});

// JWT Auth middleware
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

// Webhook signature verification middleware (Optional for GHL)
const verifyWebhookSignature = (req, res, next) => {
  try {
    // GHL Marketplace doesn't provide webhook secret configuration
    // So we'll skip signature verification for now
    // In production, you might want to implement IP whitelisting or other security measures
    
    console.log('GHL Webhook received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    // Optional: Check if request comes from GHL IP ranges
    // const clientIP = req.ip || req.connection.remoteAddress;
    // console.log('Webhook from IP:', clientIP);
    
    next();
  } catch (error) {
    console.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend up', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Test endpoint for frontend
app.get('/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// GHL OAuth routes

// Direct login redirect endpoint
app.get('/auth/ghl/login', async (req, res) => {
  try {
    const { userId } = req.query;
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = process.env.GHL_SCOPES || 'locations.readonly conversations.write users.readonly conversations.readonly conversations/message.readonly conversations/message.write conversations/reports.readonly conversations/livechat.write contacts.readonly';
    
    const state = userId ? encodeURIComponent(userId) : '';
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code${state ? `&state=${state}` : ''}`;
    
    res.redirect(authUrl);
  } catch (error) {
    console.error('GHL login error:', error);
    res.status(500).json({ error: 'Failed to redirect to GHL login' });
  }
});

// OAuth callback endpoint (for GHL marketplace)
app.get('/oauth/callback', async (req, res) => {
  try {
    const { code, locationId, state } = req.query;
    
    console.log('OAuth Callback received:', { 
      code: !!code, 
      locationId, 
      state,
      fullQuery: req.query 
    });
    
    if (!code) {
      return res.status(400).send('Authorization code is required');
    }

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/token', 
      new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
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

    const { access_token, refresh_token, expires_in, companyId } = tokenResponse.data;
    
    // Parse state parameter (simple userId)
    let targetUserId = state;
    
    console.log('OAuth callback state:', { targetUserId, locationId, state });
    
    // If no state provided, try to find existing GHL account for this company
    if (!targetUserId) {
      console.log('No targetUserId in state, looking for existing GHL account');
      
      // First, try to find existing GHL account for this company
      const { data: existingGhlAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('user_id')
        .eq('company_id', companyId)
        .maybeSingle();
        
      if (existingGhlAccount && existingGhlAccount.user_id) {
        targetUserId = existingGhlAccount.user_id;
        console.log('Found existing GHL account user:', targetUserId);
      } else {
        // Create a service user as fallback
        const serviceEmail = `${companyId || 'ghl'}@company.oauth`;
        const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
        const existing = usersList?.users?.find(u => u.email === serviceEmail);
        if (existing) {
          targetUserId = existing.id;
          console.log('Found existing service user:', targetUserId);
        } else {
          // Create a new service user (no password, confirmed)
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: serviceEmail,
            email_confirm: true,
            user_metadata: { ghl_company_id: companyId }
          });
          if (createErr) throw createErr;
          targetUserId = created.user?.id;
          console.log('Created new service user:', targetUserId);
        }
      }
    } else {
      console.log('Using targetUserId from state:', targetUserId);
    }

    // Store tokens in database for this user
    const upsertPayload = {
        user_id: targetUserId,
        company_id: companyId,
        access_token,
        refresh_token,
      expires_at: new Date(Date.now() + (expires_in * 1000)).toISOString()
    };
    
    // Find latest subaccount for this user to get locationId
    const { data: latestSubaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('ghl_location_id')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(1);

    const latestSubaccount = latestSubaccounts?.[0];

    const finalLocationId = latestSubaccount?.ghl_location_id || locationId;
    if (finalLocationId) {
      upsertPayload.location_id = finalLocationId;
    }

    const { error: insertError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert(upsertPayload);

    // Update subaccount name if needed (handle multiple rows)
    if (finalLocationId && !insertError) {
      console.log(`Updating subaccount for locationId: ${finalLocationId}, userId: ${targetUserId}`);
      
      const { data: subaccounts, error: subaccountError } = await supabaseAdmin
        .from('subaccounts')
        .update({ 
          name: `Location ${finalLocationId}`
        })
        .eq('user_id', targetUserId)
        .eq('ghl_location_id', finalLocationId)
        .select();
        
      if (subaccountError) {
        console.error('Error updating subaccount:', subaccountError);
      } else {
        console.log(`Updated ${subaccounts?.length || 0} subaccounts successfully`);
      }
    }

    if (insertError) {
      console.error('Error storing GHL account:', insertError);
      return res.status(500).send('Failed to store account information');
    }

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/auth/ghl/callback', (req, res) => {
  const query = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  return res.redirect(301, `/oauth/callback${query}`);
});

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

    // Create WhatsApp client
    const client = waManager.createClient(
      session.id,
      async (qr) => {
        try {
          const qrDataUrl = await qrcode.toDataURL(qr);
          await supabaseAdmin
            .from('sessions')
            .update({ qr: qrDataUrl, status: 'qr' })
            .eq('id', session.id);
        } catch (error) {
          console.error('Error updating QR:', error);
        }
      },
      async (info) => {
        try {
          await supabaseAdmin
            .from('sessions')
            .update({ 
              status: 'ready', 
              qr: null,
              phone_number: info.wid.user
            })
            .eq('id', session.id);

          // Map session to location
          await supabaseAdmin
            .from('location_session_map')
            .upsert({
              user_id: req.user.id,
              subaccount_id: subaccountId,
              ghl_location_id: subaccount.ghl_location_id,
              session_id: session.id
            });
        } catch (error) {
          console.error('Error updating session ready:', error);
        }
      },
      async (reason) => {
        try {
          await supabaseAdmin
            .from('sessions')
            .update({ status: 'disconnected' })
            .eq('id', session.id);
          waManager.removeClient(session.id);
        } catch (error) {
          console.error('Error updating session disconnected:', error);
        }
      },
      async (message) => {
        try {
          const fromNumber = fromWhatsAppJID(message.from);
          const toNumber = fromWhatsAppJID(message.to);
          
          // Insert message into database
          const { data: messageRecord, error: messageError } = await supabaseAdmin
            .from('messages')
            .insert({
              session_id: session.id,
              user_id: req.user.id,
              subaccount_id: subaccountId,
              from_number: fromNumber,
              to_number: toNumber,
              body: message.body,
              media_url: message.hasMedia ? message.mediaUrl : null,
              media_mime: message.hasMedia ? message.mediaMimetype : null,
              direction: 'in'
            })
            .select()
            .single();

          if (messageError) throw messageError;

          // Send to GHL as inbound message
          try {
            const ghlClient = new GHLClient(process.env.GHL_API_KEY, subaccount.ghl_location_id);
            await ghlClient.addInboundMessage({
              conversationProviderId: process.env.PROVIDER_ID,
              locationId: subaccount.ghl_location_id,
              phone: normalizeToE164(fromNumber),
              message: message.body,
              attachments: message.hasMedia ? [{ url: message.mediaUrl, mime: message.mediaMimetype }] : [],
              altId: messageRecord.id
            });
          } catch (ghlError) {
            console.error('Error sending to GHL:', ghlError);
          }
        } catch (error) {
          console.error('Error handling incoming message:', error);
        }
      }
    );

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

// Refresh GHL access token using refresh token
app.post('/admin/ghl/refresh-token', requireAuth, async (req, res) => {
  try {
    // Get current GHL account
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('refresh_token, company_id, user_id')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    if (!ghlAccount.refresh_token) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    // Exchange refresh token for new access token
    const tokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/token', 
      new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: ghlAccount.refresh_token,
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

    const { access_token, refresh_token, expires_in, companyId } = tokenResponse.data;

    // Update tokens in database
    const { error: updateError } = await supabaseAdmin
      .from('ghl_accounts')
      .update({
        access_token,
        refresh_token,
        expires_at: new Date(Date.now() + (expires_in * 1000)).toISOString()
      })
      .eq('user_id', req.user.id);

    if (updateError) throw updateError;

    res.json({ 
      success: true, 
      access_token,
      expires_in,
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing GHL token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

// GHL account management routes
app.put('/admin/ghl/location', requireAuth, async (req, res) => {
  try {
    const { location_id } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ error: 'location_id is required' });
    }

    const { data: updatedAccount, error: updateError } = await supabaseAdmin
      .from('ghl_accounts')
      .update({ location_id })
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedAccount);
  } catch (error) {
    console.error('Error updating GHL location:', error);
    res.status(500).json({ error: 'Failed to update GHL location' });
  }
});

app.put('/admin/ghl/update-location', requireAuth, async (req, res) => {
  try {
    const { location_id } = req.body;
    
    if (!location_id) {
      return res.status(400).json({ error: 'location_id is required' });
    }

    const { data: updatedAccount, error: updateError } = await supabaseAdmin
      .from('ghl_accounts')
      .update({ location_id })
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedAccount);
  } catch (error) {
    console.error('Error updating GHL location:', error);
    res.status(500).json({ error: 'Failed to update GHL location' });
  }
});

app.post('/admin/ghl/mint-location-token', requireAuth, async (req, res) => {
  try {
    const { locationId } = req.body;
    
    // Get GHL account
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token, company_id, location_id')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const targetLocationId = locationId || ghlAccount.location_id;
    if (!targetLocationId) {
      return res.status(400).json({ error: 'Location ID not provided or set' });
    }

    // Mint location-specific token using GHL API
    const locationTokenResponse = await axios.post('https://services.leadconnectorhq.com/oauth/locationToken', {
      companyId: ghlAccount.company_id,
      locationId: targetLocationId
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Version': '2021-07-28',
        'Authorization': `Bearer ${ghlAccount.access_token}`
      }
    });

    const { access_token, expires_in, refresh_token } = locationTokenResponse.data;

    // Update account with location token
    const { data: updatedAccount, error: updateError } = await supabaseAdmin
      .from('ghl_accounts')
      .update({ 
        location_token: access_token,
        location_token_expires: new Date(Date.now() + (expires_in * 1000)).toISOString(),
        location_id: targetLocationId
      })
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ 
      success: true, 
      location_token: access_token,
      expires_in: expires_in,
      location_id: targetLocationId
    });
  } catch (error) {
    console.error('Error minting location token:', error);
    res.status(500).json({ error: 'Failed to mint location token', details: error.message });
  }
});

// Subaccount management routes
app.put('/admin/subaccount/:subaccountId', requireAuth, async (req, res) => {
  try {
    const { subaccountId } = req.params;
    const { ghl_location_id, name } = req.body;
    
    if (!subaccountId) {
      return res.status(400).json({ error: 'Subaccount ID is required' });
    }

    // Verify the subaccount belongs to the user
    const { data: existingSubaccount, error: fetchError } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !existingSubaccount) {
      return res.status(404).json({ error: 'Subaccount not found' });
    }

    // Update the subaccount
    const updateData = {};
    if (ghl_location_id !== undefined) updateData.ghl_location_id = ghl_location_id;
    if (name !== undefined) updateData.name = name;

    const { data: updatedSubaccount, error: updateError } = await supabaseAdmin
      .from('subaccounts')
      .update(updateData)
      .eq('id', subaccountId)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(updatedSubaccount);
  } catch (error) {
    console.error('Error updating subaccount:', error);
    res.status(500).json({ error: 'Failed to update subaccount' });
  }
});

// GHL Subaccounts endpoint - fetch existing subaccounts from GHL
app.get('/admin/ghl/subaccounts', requireAuth, async (req, res) => {
  try {
    // Get GHL access token for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      console.error('GHL account lookup error:', ghlError);
      return res.status(404).json({ error: 'GHL account not found. Please connect your GHL account first.' });
    }

    const ghlClient = new GHLClient(ghlAccount.access_token);
    const locationsResponse = await ghlClient.getLocations();

    console.log('GHL Locations Response:', JSON.stringify(locationsResponse, null, 2));

    // Handle different response formats from GHL API
    let locations = [];
    if (locationsResponse.locations) {
      locations = locationsResponse.locations;
    } else if (Array.isArray(locationsResponse)) {
      locations = locationsResponse;
    } else if (locationsResponse.data) {
      locations = locationsResponse.data;
    }

    // Transform locations to subaccounts format
    const subaccounts = locations.map(location => ({
      id: location.id,
      name: location.name || `Location ${location.id}`,
      ghl_location_id: location.id,
      status: 'available'
    }));

    res.json({ subaccounts });
  } catch (error) {
    console.error('Error fetching GHL subaccounts:', error);
    res.status(500).json({ error: 'Failed to fetch GHL subaccounts', details: error.message });
  }
});

// Link an existing GHL company account (created without state) to the current user
app.post('/admin/ghl/link-company', requireAuth, async (req, res) => {
  try {
    const { company_id, location_id } = req.body || {};

    if (!company_id) {
      return res.status(400).json({ error: 'company_id is required' });
    }

    // Find any GHL account by company_id (regardless of user)
    const { data: existingAccount, error: findErr } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('company_id', company_id)
      .maybeSingle();

    if (findErr || !existingAccount) {
      return res.status(404).json({ error: 'GHL company not found' });
    }

    // Reassign to current user
    const { error: updateErr } = await supabaseAdmin
      .from('ghl_accounts')
      .update({ user_id: req.user.id })
      .eq('company_id', company_id);

    if (updateErr) throw updateErr;

    // Optionally ensure a subaccount exists for the provided location
    if (location_id) {
      await supabaseAdmin
        .from('subaccounts')
        .upsert({
          user_id: req.user.id,
          ghl_location_id: location_id,
          name: `Location ${location_id}`
        });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error linking GHL company to user:', error);
    res.status(500).json({ error: 'Failed to link GHL company to user' });
  }
});

// Manual GHL account linking for existing subaccounts
app.post('/admin/ghl/link-existing', requireAuth, async (req, res) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Find any GHL account that might be linked to this user's subaccounts
    const { data: subaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('ghl_location_id')
      .eq('user_id', user.id);

    if (!subaccounts || subaccounts.length === 0) {
      return res.status(404).json({ error: 'No subaccounts found for user' });
    }

    // Find any GHL account that might be orphaned
    const { data: orphanedAccounts } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .is('user_id', null)
      .limit(1);

    if (orphanedAccounts && orphanedAccounts.length > 0) {
      // Link the first orphaned account to current user
      const { error: linkError } = await supabaseAdmin
        .from('ghl_accounts')
        .update({ user_id: user.id })
        .eq('id', orphanedAccounts[0].id);

      if (linkError) throw linkError;

      res.json({ 
        success: true, 
        message: 'Linked existing GHL account to user',
        account: orphanedAccounts[0]
      });
    } else {
      res.json({ 
        success: false, 
        message: 'No orphaned GHL accounts found. Please connect GHL account first.' 
      });
    }
  } catch (error) {
    console.error('Error linking existing GHL account:', error);
    res.status(500).json({ error: 'Failed to link existing GHL account' });
  }
});

// Link webhook-created subaccounts to current user
app.post('/admin/ghl/link-webhook-subaccounts', requireAuth, async (req, res) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Find subaccounts that might be created by webhooks but not linked to current user
    const { data: webhookSubaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .neq('user_id', user.id)
      .eq('status', 'installed');

    if (!webhookSubaccounts || webhookSubaccounts.length === 0) {
      return res.json({ 
        success: false, 
        message: 'No webhook-created subaccounts found to link' 
      });
    }

    // Link all webhook subaccounts to current user
    const { error: linkError } = await supabaseAdmin
      .from('subaccounts')
      .update({ user_id: user.id })
      .in('id', webhookSubaccounts.map(s => s.id));

    if (linkError) throw linkError;

    res.json({ 
      success: true, 
      message: `Linked ${webhookSubaccounts.length} webhook subaccounts to current user`,
      subaccounts: webhookSubaccounts
    });
  } catch (error) {
    console.error('Error linking webhook subaccounts:', error);
    res.status(500).json({ error: 'Failed to link webhook subaccounts' });
  }
});

// Clean up duplicate subaccounts endpoint
app.post('/admin/ghl/cleanup-duplicates', requireAuth, async (req, res) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Get all subaccounts for this user
    const { data: allSubaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('user_id', user.id);

    if (!allSubaccounts || allSubaccounts.length === 0) {
      return res.json({ message: 'No subaccounts found', cleaned: 0 });
    }

    // Group by ghl_location_id and keep only the latest one
    const grouped = {};
    allSubaccounts.forEach(sub => {
      if (!grouped[sub.ghl_location_id] || new Date(sub.created_at) > new Date(grouped[sub.ghl_location_id].created_at)) {
        grouped[sub.ghl_location_id] = sub;
      }
    });

    // Delete duplicates
    const toDelete = allSubaccounts.filter(sub => sub.id !== grouped[sub.ghl_location_id].id);
    
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('subaccounts')
        .delete()
        .in('id', toDelete.map(s => s.id));

      if (deleteError) throw deleteError;
    }

    res.json({ 
      message: `Cleaned up ${toDelete.length} duplicate subaccounts`,
      cleaned: toDelete.length,
      remaining: Object.keys(grouped).length
    });
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    res.status(500).json({ error: 'Failed to clean up duplicates' });
  }
});

// Connect GHL subaccount endpoint
app.post('/admin/ghl/connect-subaccount', requireAuth, async (req, res) => {
  try {
    const { ghl_location_id, name } = req.body;
    
    if (!ghl_location_id) {
      return res.status(400).json({ error: 'ghl_location_id is required' });
    }

    // Check if subaccount already exists
    const { data: existingSubaccount } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('ghl_location_id', ghl_location_id)
      .single();

    let subaccount = existingSubaccount;
    
    // Only create if it doesn't exist
    if (!subaccount) {
      const { data: newSubaccount, error: subaccountError } = await supabaseAdmin
        .from('subaccounts')
        .insert({
          user_id: req.user.id,
          ghl_location_id,
          name: name || `Location ${ghl_location_id}`
        })
        .select()
        .single();

      if (subaccountError) throw subaccountError;
      subaccount = newSubaccount;
    }

    // Generate GHL OAuth URL for this specific location
    const scopes = process.env.GHL_SCOPES || 'locations.readonly conversations.write users.readonly conversations.readonly conversations/message.readonly conversations/message.write conversations/reports.readonly conversations/livechat.write contacts.readonly';
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI || `${process.env.BACKEND_URL}/oauth/callback`;
    
    if (!clientId) {
      return res.status(500).json({ error: 'GHL_CLIENT_ID not configured' });
    }

    // Store locationId in database before OAuth to track it later
    const { data: tempRecord, error: tempError } = await supabaseAdmin
      .from('subaccounts')
      .upsert({
        user_id: req.user.id,
        ghl_location_id: ghl_location_id,
        name: name || `Location ${ghl_location_id}`
      })
      .select()
      .single();

    if (tempError) throw tempError;

    // Use simple state parameter (just userId) since GHL doesn't support complex state
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(req.user.id)}`;

    res.json({ 
      success: true, 
      subaccount,
      authUrl: authUrl,
      message: 'Sub-account created. Redirecting to GHL...'
    });
  } catch (error) {
    console.error('Error connecting GHL subaccount:', error);
    res.status(500).json({ error: 'Failed to connect GHL subaccount' });
  }
});

// Message routes
app.post('/messages/send', requireAuth, messageRateLimit, async (req, res) => {
  try {
    const { sessionId, to, body, mediaUrl } = req.body;
    
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

    // Normalize phone number
    const normalizedTo = normalizeToE164(to);
    const waJid = toWhatsAppJID(normalizedTo);

    let messageResult;
    if (mediaUrl) {
      messageResult = await waManager.sendMediaMessage(sessionId, waJid, mediaUrl, body);
    } else {
      messageResult = await waManager.sendTextMessage(sessionId, waJid, body);
    }

    // Save to database
    const { data: messageRecord, error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionId,
        user_id: req.user.id,
        subaccount_id: session.subaccount_id,
        from_number: session.phone_number,
        to_number: normalizedTo,
        body,
        media_url: mediaUrl || null,
        media_mime: mediaUrl ? 'image/jpeg' : null,
        direction: 'out'
      })
      .select()
      .single();

    if (messageError) throw messageError;

    res.json({ 
      success: true, 
      messageId: messageRecord.id,
      whatsappId: messageResult.id._serialized
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GHL Conversations Provider - Outbound (GHL → Us → WhatsApp)
app.post('/ghl/provider-outbound', async (req, res) => {
  try {
    const { locationId, contactId, phone, message, attachments, userId, altId } = req.body;
    
    console.log('GHL Provider Outbound:', { locationId, contactId, phone, message });

    if (!locationId || !message) {
      return res.status(400).json({ error: 'locationId and message are required' });
    }

    // Find session for this location
    const { data: sessionMap, error: mapError } = await supabaseAdmin
      .from('location_session_map')
      .select('*, sessions!inner(*)')
      .eq('ghl_location_id', locationId)
      .eq('sessions.status', 'ready')
      .single();

    if (mapError || !sessionMap) {
      return res.status(404).json({ error: 'No active session found for this location' });
    }

    const session = sessionMap.sessions;
    const targetPhone = phone || contactId;

    if (!targetPhone) {
      return res.status(400).json({ error: 'phone or contactId is required' });
    }

    // Send message via WhatsApp
    const normalizedPhone = normalizeToE164(targetPhone);
    const waJid = toWhatsAppJID(normalizedPhone);

    let messageResult;
    if (attachments && attachments.length > 0) {
      // Send media message
      messageResult = await waManager.sendMediaMessage(session.id, waJid, attachments[0].url, message);
    } else {
      // Send text message
      messageResult = await waManager.sendTextMessage(session.id, waJid, message);
    }

    // Save to database
    const { data: messageRecord, error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: session.id,
        user_id: session.user_id,
        subaccount_id: sessionMap.subaccount_id,
        from_number: session.phone_number,
        to_number: normalizedPhone,
        body: message,
        media_url: attachments && attachments.length > 0 ? attachments[0].url : null,
        media_mime: attachments && attachments.length > 0 ? attachments[0].mime : null,
        direction: 'out'
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Return provider response
    res.json({
      success: true,
      messageId: messageRecord.id,
      altId: altId || messageRecord.id,
      status: 'sent'
    });

  } catch (error) {
    console.error('Error processing GHL provider outbound:', error);
    res.status(500).json({ error: 'Failed to process outbound message' });
  }
});

// GHL Webhook endpoints for real-time events
// App Install Webhook - Critical for tracking app installations
app.post('/ghl/webhook/install', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      type, 
      appId, 
      versionId, 
      installType, 
      locationId, 
      companyId, 
      userId, 
      companyName, 
      isWhitelabelCompany, 
      whitelabelDetails, 
      timestamp, 
      webhookId 
    } = req.body;

    console.log('GHL App Install Webhook:', { 
      type, 
      locationId, 
      companyId, 
      userId, 
      installType 
    });

    if (type !== 'INSTALL') {
      return res.status(400).json({ error: 'Invalid webhook type' });
    }

    // Store installation details in database
    const { error: installError } = await supabaseAdmin
      .from('ghl_installations')
      .upsert({
        webhook_id: webhookId,
        app_id: appId,
        version_id: versionId,
        install_type: installType,
        location_id: locationId,
        company_id: companyId,
        user_id: userId,
        company_name: companyName,
        is_whitelabel: isWhitelabelCompany,
        whitelabel_details: whitelabelDetails,
        installed_at: timestamp
      });

    if (installError) {
      console.error('Error storing installation:', installError);
      return res.status(500).json({ error: 'Failed to store installation' });
    }

    // Create subaccount entry if locationId is provided
    if (locationId && userId) {
      await supabaseAdmin
        .from('subaccounts')
        .upsert({
          user_id: userId,
          ghl_location_id: locationId,
          name: companyName || `Location ${locationId}`,
          status: 'installed'
        });
    }

    res.json({ success: true, message: 'Installation recorded' });
  } catch (error) {
    console.error('App Install webhook error:', error);
    res.status(500).json({ error: 'Failed to process installation webhook' });
  }
});

// Message Status Webhook - Track message delivery status
app.post('/ghl/webhook/message-status', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      messageId, 
      status, 
      locationId, 
      contactId, 
      phone, 
      timestamp,
      error 
    } = req.body;

    console.log('GHL Message Status Webhook:', { 
      messageId, 
      status, 
      locationId, 
      contactId 
    });

    // Update message status in database
    const { error: updateError } = await supabaseAdmin
      .from('messages')
      .update({ 
        status: status,
        status_updated_at: new Date().toISOString(),
        error_message: error || null
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating message status:', updateError);
      return res.status(500).json({ error: 'Failed to update message status' });
    }

    res.json({ success: true, message: 'Message status updated' });
  } catch (error) {
    console.error('Message status webhook error:', error);
    res.status(500).json({ error: 'Failed to process message status webhook' });
  }
});

// Conversation Webhook - Handle new conversations
app.post('/ghl/webhook/conversation', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      type, 
      conversationId, 
      locationId, 
      contactId, 
      phone, 
      message, 
      timestamp,
      direction 
    } = req.body;

    console.log('GHL Conversation Webhook:', { 
      type, 
      conversationId, 
      locationId, 
      contactId,
      direction 
    });

    // Store conversation in database
    const { error: conversationError } = await supabaseAdmin
      .from('ghl_conversations')
      .upsert({
        conversation_id: conversationId,
        location_id: locationId,
        contact_id: contactId,
        phone: phone,
        last_message: message,
        direction: direction,
        updated_at: timestamp
      });

    if (conversationError) {
      console.error('Error storing conversation:', conversationError);
      return res.status(500).json({ error: 'Failed to store conversation' });
    }

    res.json({ success: true, message: 'Conversation recorded' });
  } catch (error) {
    console.error('Conversation webhook error:', error);
    res.status(500).json({ error: 'Failed to process conversation webhook' });
  }
});

// Inbound Message Webhook - Handle incoming messages from GHL
app.post('/ghl/webhook/inbound-message', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      messageId, 
      locationId, 
      contactId, 
      phone, 
      message, 
      attachments,
      timestamp,
      direction 
    } = req.body;

    console.log('GHL Inbound Message Webhook:', { 
      messageId, 
      locationId, 
      contactId, 
      phone,
      direction 
    });

    // Find session for this location
    const { data: sessionMap, error: mapError } = await supabaseAdmin
      .from('location_session_map')
      .select('*, sessions!inner(*)')
      .eq('ghl_location_id', locationId)
      .eq('sessions.status', 'ready')
      .single();

    if (mapError || !sessionMap) {
      console.log('No active session found for location:', locationId);
      return res.json({ success: true, message: 'No active session' });
    }

    // Store message in database
    const { error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        session_id: sessionMap.session_id,
        user_id: sessionMap.user_id,
        subaccount_id: sessionMap.subaccount_id,
        from_number: phone,
        to_number: sessionMap.sessions.phone_number,
        body: message,
        media_url: attachments && attachments.length > 0 ? attachments[0].url : null,
        media_mime: attachments && attachments.length > 0 ? attachments[0].mime : null,
        direction: 'in',
        status: 'received'
      });

    if (messageError) {
      console.error('Error storing inbound message:', messageError);
    }

    res.json({ success: true, message: 'Inbound message processed' });
  } catch (error) {
    console.error('Inbound message webhook error:', error);
    res.status(500).json({ error: 'Failed to process inbound message' });
  }
});

// Outbound Message Webhook - Handle outgoing messages to GHL
app.post('/ghl/webhook/outbound-message', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      messageId, 
      locationId, 
      contactId, 
      phone, 
      message, 
      status,
      timestamp,
      error 
    } = req.body;

    console.log('GHL Outbound Message Webhook:', { 
      messageId, 
      locationId, 
      contactId, 
      status 
    });

    // Update message status in database
    const { error: updateError } = await supabaseAdmin
      .from('messages')
      .update({ 
        status: status,
        status_updated_at: new Date().toISOString(),
        error_message: error || null
      })
      .eq('id', messageId);

    if (updateError) {
      console.error('Error updating outbound message status:', updateError);
    }

    res.json({ success: true, message: 'Outbound message status updated' });
  } catch (error) {
    console.error('Outbound message webhook error:', error);
    res.status(500).json({ error: 'Failed to process outbound message' });
  }
});

// Contact Webhook - Handle contact creation/updates
app.post('/ghl/webhook/contact', verifyWebhookSignature, async (req, res) => {
  try {
    const { 
      type,
      contactId, 
      locationId, 
      phone, 
      email,
      firstName,
      lastName,
      timestamp 
    } = req.body;

    console.log('GHL Contact Webhook:', { 
      type,
      contactId, 
      locationId, 
      phone 
    });

    // Store contact in database if needed
    const { error: contactError } = await supabaseAdmin
      .from('ghl_contacts')
      .upsert({
        contact_id: contactId,
        location_id: locationId,
        phone: phone,
        email: email,
        first_name: firstName,
        last_name: lastName,
        updated_at: timestamp
      });

    if (contactError) {
      console.error('Error storing contact:', contactError);
    }

    res.json({ success: true, message: 'Contact processed' });
  } catch (error) {
    console.error('Contact webhook error:', error);
    res.status(500).json({ error: 'Failed to process contact' });
  }
});

// Generic webhook handler for all GHL events
app.post('/ghl/webhook', verifyWebhookSignature, async (req, res) => {
  try {
    const { type, webhookId, timestamp } = req.body;
    
    console.log('GHL Generic Webhook:', { type, webhookId, timestamp });

    // Route to specific handlers based on type
    switch (type) {
      case 'INSTALL':
        console.log('Processing INSTALL webhook:', req.body);
        // Handle app install webhook
        const { 
          appId, 
          versionId, 
          installType, 
          locationId, 
          companyId, 
          userId, 
          companyName, 
          isWhitelabelCompany, 
          whitelabelDetails, 
          timestamp, 
          webhookId 
        } = req.body;

        // Store installation details in database
        const { error: installError } = await supabaseAdmin
          .from('ghl_installations')
          .upsert({
            webhook_id: webhookId,
            app_id: appId,
            version_id: versionId,
            install_type: installType,
            location_id: locationId,
            company_id: companyId,
            user_id: userId,
            company_name: companyName,
            is_whitelabel: isWhitelabelCompany,
            whitelabel_details: whitelabelDetails,
            installed_at: timestamp
          });

        if (installError) {
          console.error('Error storing installation:', installError);
          return res.status(500).json({ error: 'Failed to store installation' });
        }

        // Create subaccount entry if locationId is provided
        if (locationId && userId) {
          // First, try to find if there's already a subaccount for this location
          const { data: existingSubaccount } = await supabaseAdmin
            .from('subaccounts')
            .select('*')
            .eq('ghl_location_id', locationId)
            .maybeSingle();
          
          if (existingSubaccount) {
            // Update existing subaccount with webhook data
            const { error: updateError } = await supabaseAdmin
              .from('subaccounts')
              .update({
                name: companyName || `Location ${locationId}`,
                status: 'installed'
              })
              .eq('id', existingSubaccount.id);
              
            if (updateError) {
              console.error('Error updating subaccount from webhook:', updateError);
            } else {
              console.log('Subaccount updated from webhook:', { locationId, companyName });
            }
          } else {
            // Create new subaccount - but we need to link it to a real user
            // For now, create it with the webhook userId and we'll link it later
            const { error: subaccountError } = await supabaseAdmin
              .from('subaccounts')
              .insert({
                user_id: userId,
                ghl_location_id: locationId,
                name: companyName || `Location ${locationId}`,
                status: 'installed'
              });
            
            if (subaccountError) {
              console.error('Error creating subaccount from webhook:', subaccountError);
            } else {
              console.log('Subaccount created from webhook:', { userId, locationId, companyName });
            }
          }
        }

        return res.json({ success: true, message: 'Installation recorded' });
        
      case 'InboundMessage':
        return app._router.handle(req, res, () => {
          // This will be handled by the inbound message webhook above
        });
      case 'OutboundMessage':
        return app._router.handle(req, res, () => {
          // This will be handled by the outbound message webhook above
        });
      case 'ContactCreate':
      case 'ContactUpdate':
        return app._router.handle(req, res, () => {
          // This will be handled by the contact webhook above
        });
      case 'ConversationUnreadUpdate':
        console.log('Conversation unread update:', req.body);
        return res.json({ success: true, message: 'Conversation update processed' });
      default:
        console.log('Unhandled webhook type:', type);
        res.json({ success: true, message: 'Webhook received but not processed' });
    }
  } catch (error) {
    console.error('Generic webhook error:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Provider UI (embedded in GHL custom menu link) - shows QR for a specific location
app.get('/ghl/provider', async (req, res) => {
  try {
    const { locationId } = req.query;
    if (!locationId) {
      return res.status(400).send('Missing locationId');
    }

    // Simple HTML that calls the public endpoints to create/poll the session
    res.send(`
      <!doctype html>
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
                  info.textContent = 'Connected: ' + (j.phone_number || 'OK');
                  return;
                } else {
                  info.textContent = 'Status: ' + (j.status || r.status);
                }
              } catch (e) {
                // ignore
              }
              setTimeout(poll, 1500);
            }

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

// Create or reuse WhatsApp session for a specific GHL location (no auth; called from GHL embedded page)
app.post('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { companyId } = req.query;

    // Find subaccount for this location (handle multiple rows)
    console.log(`Looking for subaccount with locationId: ${locationId}`);
    
    const { data: subaccounts, error: subErr } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('ghl_location_id', locationId);

    console.log('Subaccount query result:', { subaccounts, subErr, count: subaccounts?.length });

    if (subErr || !subaccounts || subaccounts.length === 0) {
      console.error(`Subaccount not found for locationId: ${locationId}`);
      return res.status(404).json({ error: 'Subaccount for location not found. Ensure OAuth callback stored this locationId.' });
    }

    // Use the first subaccount (they should all be the same)
    const subaccount = subaccounts[0];

    // Check for latest session
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', subaccount.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existing && existing.length > 0 && existing[0].status !== 'disconnected') {
      return res.json({ status: existing[0].status, qr: existing[0].qr, phone_number: existing[0].phone_number });
    }

    // Create a new session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({ user_id: subaccount.user_id, subaccount_id: subaccount.id, status: 'initializing' })
      .select()
      .single();

    if (sessionError) throw sessionError;

    const client = waManager.createClient(
      session.id,
      async (qrValue) => {
        try {
          const qrDataUrl = await qrcode.toDataURL(qrValue);
          await supabaseAdmin.from('sessions').update({ qr: qrDataUrl, status: 'qr' }).eq('id', session.id);
        } catch (e) { console.error('QR update error:', e); }
      },
      async (info) => {
        try {
          await supabaseAdmin
            .from('sessions')
            .update({ status: 'ready', qr: null, phone_number: info.wid.user })
            .eq('id', session.id);
          await supabaseAdmin
            .from('location_session_map')
            .upsert({ user_id: subaccount.user_id, subaccount_id: subaccount.id, ghl_location_id: locationId, session_id: session.id });
        } catch (e) { console.error('Session ready update error:', e); }
      },
      async () => {
        try {
          await supabaseAdmin.from('sessions').update({ status: 'disconnected' }).eq('id', session.id);
          waManager.removeClient(session.id);
        } catch (e) { console.error('Session disconnect update error:', e); }
      },
      async () => {}
    );

    // Initialize asynchronously
    client.initialize().catch((e) => console.error('WA init error:', e));

    return res.json({ status: 'initializing' });
  } catch (error) {
    console.error('Create location session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session status for a specific GHL location (no auth; called from GHL embedded page)
app.get('/ghl/location/:locationId/session', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { data: subaccount, error: subErr } = await supabaseAdmin
      .from('subaccounts')
      .select('id')
      .eq('ghl_location_id', locationId)
      .maybeSingle();

    if (subErr || !subaccount) {
      return res.status(404).json({ error: 'Subaccount for location not found' });
    }

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
    return res.json({ status: s.status, qr: s.qr, phone_number: s.phone_number });
  } catch (error) {
    console.error('Get location session error:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// Get messages for a session
app.get('/messages/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json(messages || []);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// GHL Conversations API endpoints
app.get('/admin/ghl/conversations', requireAuth, async (req, res) => {
  try {
    const { locationId, limit = 50 } = req.query;
    
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    // Get GHL access token for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const ghlClient = new GHLClient(ghlAccount.access_token);
    const conversations = await ghlClient.getConversations(locationId, limit);

    res.json(conversations);
  } catch (error) {
    console.error('Error fetching GHL conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

app.get('/admin/ghl/conversation/:conversationId', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;

    // Get GHL access token for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const ghlClient = new GHLClient(ghlAccount.access_token);
    const conversation = await ghlClient.getConversation(conversationId);

    res.json(conversation);
  } catch (error) {
    console.error('Error fetching GHL conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

app.get('/admin/ghl/conversation/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50 } = req.query;

    // Get GHL access token for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const ghlClient = new GHLClient(ghlAccount.access_token);
    const messages = await ghlClient.getMessages(conversationId, limit);

    res.json(messages);
  } catch (error) {
    console.error('Error fetching GHL conversation messages:', error);
    res.status(500).json({ error: 'Failed to fetch conversation messages' });
  }
});

app.get('/admin/ghl/search-conversations', requireAuth, async (req, res) => {
  try {
    const { locationId, query } = req.query;
    
    if (!locationId || !query) {
      return res.status(400).json({ error: 'locationId and query are required' });
    }

    // Get GHL access token for this user
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (ghlError || !ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found' });
    }

    const ghlClient = new GHLClient(ghlAccount.access_token);
    const conversations = await ghlClient.searchConversations(locationId, query);

    res.json(conversations);
  } catch (error) {
    console.error('Error searching GHL conversations:', error);
    res.status(500).json({ error: 'Failed to search conversations' });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await waManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await waManager.shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`WhatsApp data directory: ${process.env.WA_DATA_DIR || '.wwebjs_auth'}`);
});

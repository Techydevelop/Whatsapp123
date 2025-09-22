require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode');
const axios = require('axios');

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
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3001',
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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Backend up', 
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// GHL OAuth routes
app.get('/auth/ghl/connect', async (req, res) => {
  try {
    const { return_url } = req.query;
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = 'locations.readonly contacts.readonly conversations.readonly conversations.write';
    
    const state = return_url ? encodeURIComponent(return_url) : '';
    const authUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code${state ? `&state=${state}` : ''}`;
    
    res.json({ authUrl });
  } catch (error) {
    console.error('GHL connect error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Direct login redirect endpoint
app.get('/auth/ghl/login', async (req, res) => {
  try {
    const { userId } = req.query;
    const clientId = process.env.GHL_CLIENT_ID;
    const redirectUri = process.env.GHL_REDIRECT_URI;
    const scopes = 'locations.readonly contacts.readonly conversations.readonly conversations.write';
    
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
    
    console.log('OAuth Callback received:', { code: !!code, locationId, state });
    
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
    
    // Store tokens in database
    const { error: insertError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: state || 'anonymous',
        access_token,
        refresh_token,
        company_id: companyId,
        location_id: locationId,
        expires_at: new Date(Date.now() + expires_in * 1000).toISOString()
      });

    if (insertError) {
      console.error('Error storing GHL account:', insertError);
      return res.status(500).send('Failed to store account information');
    }

    // Redirect to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/dashboard-enhanced?ghl=connected`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/auth/ghl/callback', async (req, res) => {
  try {
    const { code, locationId, state } = req.query;
    
    console.log('GHL Callback received:', { code: !!code, locationId, state });
    
    if (!code) {
      console.error('GHL callback error: Missing code');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(`${frontendUrl}/login?error=missing_code`);
    }

    // Exchange code for tokens
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

    const { access_token, refresh_token, expires_in, companyId, userId } = tokenResponse.data;
    
    // Create or update user
    let targetUserId = state;
    if (!targetUserId) {
      // Try to find existing user by GHL user ID
      const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
      const found = existingUser.users.find(u => u.user_metadata?.ghl_user_id === userId);
      targetUserId = found?.id;
    }

    if (!targetUserId) {
      // Create new user
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: `${userId}@ghl.user`,
        user_metadata: {
          ghl_user_id: userId,
          ghl_company_id: companyId
        }
      });
      if (createErr) throw createErr;
      targetUserId = created.user?.id;
    }

    // Store GHL account
    const { data: ghlAccount, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: targetUserId,
        company_id: companyId,
        user_type: 'Company',
        access_token,
        refresh_token
      })
      .select()
      .single();

    if (ghlError) throw ghlError;

    // Get locations
    const ghlClient = new GHLClient(access_token);
    const locations = await ghlClient.getContacts();

    // Create subaccount for selected location
    if (locationId) {
      const { data: subaccount, error: subaccountError } = await supabaseAdmin
        .from('subaccounts')
        .upsert({
          user_id: targetUserId,
          ghl_location_id: locationId,
          name: `Location ${locationId}`
        })
        .select()
        .single();

      if (subaccountError) throw subaccountError;
    }

    // Return HTML that posts message to parent window
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const returnUrl = state ? decodeURIComponent(state) : `${frontendUrl}/dashboard?ghl=connected`;
    
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage('ghl:connected', '*');
            window.close();
          </script>
          <p>Connected successfully! You can close this window.</p>
        </body>
      </html>
    `);
    
  } catch (error) {
    console.error('GHL callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/login?error=ghl_auth_failed`);
  }
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

// GHL Locations endpoint
app.get('/admin/ghl/locations', requireAuth, async (req, res) => {
  try {
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
    const locations = await ghlClient.getLocations();

    res.json({ locations });
  } catch (error) {
    console.error('Error fetching GHL locations:', error);
    res.status(500).json({ error: 'Failed to fetch GHL locations' });
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

// GHL message status endpoint (optional)
app.post('/ghl/message-status', async (req, res) => {
  try {
    const { messageId, status } = req.body;
    
    // Update message status in database if needed
    // This is a stub - implement based on GHL requirements
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating message status:', error);
    res.status(500).json({ error: 'Failed to update message status' });
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

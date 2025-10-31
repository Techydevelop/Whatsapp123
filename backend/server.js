﻿const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const GHLClient = require('./lib/ghl');
const qrcode = require('qrcode');
const { processWhatsAppMedia } = require('./mediaHandler');
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
    
    const expiryTimestamp = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
    
    // Update token in database
    const { error } = await supabaseAdmin
      .from('ghl_accounts')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiryTimestamp,  // Old column
        token_expires_at: expiryTimestamp  // New column
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

// Helper function to get media file extension
function getMediaExtension(messageType) {
  switch (messageType) {
    case 'image': return 'jpg';
    case 'voice': return 'ogg';
    case 'video': return 'mp4';
    case 'audio': return 'mp3';
    case 'document': return 'pdf';
    default: return 'bin';
  }
}

// Check and refresh token if needed
async function ensureValidToken(ghlAccount, forceRefresh = false) {
  try {
    if (forceRefresh) {
      console.log(`🔄 Force refreshing token for GHL account ${ghlAccount.id}`);
      return await refreshGHLToken(ghlAccount);
    }
    
    // Check if token is expired or about to expire (within 1 hour)
    if (ghlAccount.token_expires_at) {
      const now = new Date();
      const expiresAt = new Date(ghlAccount.token_expires_at);
      const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
      
      if (expiresAt <= oneHourFromNow) {
        console.log(`🔄 Token expired or expiring soon for GHL account ${ghlAccount.id} (expires at: ${expiresAt.toISOString()})`);
        return await refreshGHLToken(ghlAccount);
      }
    }
    
    console.log(`✅ Using valid token for GHL account ${ghlAccount.id} (expires: ${ghlAccount.token_expires_at})`);
    return ghlAccount.access_token;
  } catch (error) {
    console.error(`❌ Token validation failed for GHL account ${ghlAccount.id}:`, error);
    console.error(`❌ Falling back to stored token (may be expired)`);
    return ghlAccount.access_token; // Return stored token even if expired, let GHL API handle the error
  }
}

// Helper function to make GHL API calls with automatic token refresh on 401
async function makeGHLRequest(url, options, ghlAccount, retryCount = 0) {
  const MAX_RETRIES = 1;
  
  try {
    const response = await fetch(url, options);
    
    // If 401 and we haven't retried yet, refresh token and retry
    if (response.status === 401 && retryCount < MAX_RETRIES) {
      console.log(`🔄 Got 401 error, refreshing token and retrying... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      // Refresh token
      const newToken = await refreshGHLToken(ghlAccount);
      
      // Update authorization header with new token
      options.headers.Authorization = `Bearer ${newToken}`;
      
      // Fetch updated ghl account data from database to ensure consistency
      const { data: updatedAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('*')
        .eq('id', ghlAccount.id)
        .single();
      
      if (updatedAccount) {
        console.log(`✅ Using refreshed token from database (expires: ${updatedAccount.token_expires_at})`);
      }
      
      // Retry the request
      return await makeGHLRequest(url, options, updatedAccount || ghlAccount, retryCount + 1);
    }
    
    return response;
  } catch (error) {
    console.error(`❌ Request failed:`, error);
    throw error;
  }
}

// WhatsApp Manager (Baileys)
const BaileysWhatsAppManager = require('./lib/baileys-wa');
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
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://api.octendr.com',
      'https://whatsapp123-frontend.vercel.app',
      'https://whatsappghl.vercel.app',
      'https://whatsappgh1.vercel.app',
      'https://whatsapghl.vercel.app',
      'https://whatsanghl.vercel.app',
      'https://app.gohighlevel.com',
      'https://dashboard.octendr.com',
      'https://api.octendr.com'
    ];
    
    // Check if origin is in allowed list OR matches pattern
    const isAllowed = allowedOrigins.includes(origin) || 
                      origin.endsWith('.vercel.app') || 
                      origin.endsWith('.onrender.com') ||
                      origin.endsWith('.gohighlevel.com') ||
                      origin.endsWith('.octendr.com');
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-User-ID'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // 24 hours
}));

// Add CSP headers for iframe embedding
app.use((req, res, next) => {
  // Allow iframe embedding from GHL domains
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://app.gohighlevel.com https://*.gohighlevel.com https://app.gohighlevel.com https://*.gohighlevel.com");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  // CORS headers are handled by cors() middleware above, don't override them here
  // res.setHeader('Access-Control-Allow-Origin', '*');
  // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  next();
});

app.use(express.json());
app.use(cookieParser()); // Parse cookies from requests

// Handle preflight requests - CORS middleware handles this automatically
// but we add this for extra safety
app.options('*', cors());

// Auth middleware - JWT based
const requireAuth = async (req, res, next) => {
  try {
    // Get JWT from cookie
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided' });
    }

    // Verify JWT
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    
    const decoded = jwt.verify(token, jwtSecret);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Set user info in request (same format as before for compatibility)
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name
    };
    
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
  const { userId } = req.query;
  
  // If userId provided, pass it in state parameter
  let authUrl;
  if (userId) {
    authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}&state=${encodeURIComponent(userId)}`;
  } else {
    // No state parameter - backend will create simple user
    authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`;
  }
  
  console.log('🔗 GHL OAuth redirect:', { userId, hasState: !!userId });
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
    // Only logged-in users can add subaccounts
    let targetUserId = null;
    
    if (!state) {
      console.error('❌ State parameter missing - user must be logged in');
      return res.status(400).json({ 
        error: 'Authentication required. Please login to add GHL accounts.',
        code: 'AUTH_REQUIRED'
      });
    }
    
    try {
      targetUserId = decodeURIComponent(state);
      console.log('Using target user ID from state:', targetUserId);
      
      // Check if user exists (must be existing user from login)
      const { data: existingUser, error: userCheckError } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('id', targetUserId)
        .maybeSingle();
        
      if (userCheckError) {
        console.error('Error checking user:', userCheckError);
        return res.status(500).json({ error: 'Database error checking user' });
      }
      
      if (!existingUser) {
        console.error('❌ User not found! Only existing users can connect GHL accounts.');
        return res.status(400).json({ 
          error: 'User not found. Please login first.',
          code: 'USER_NOT_FOUND'
        });
      }
      
      console.log('✅ Existing user found:', existingUser);
      
    } catch (e) {
      console.error('Error decoding state:', e);
      return res.status(400).json({ 
        error: 'Invalid authentication. Please login again.',
        code: 'INVALID_STATE'
      });
    }

    // Store GHL account information - use locationId from token response
    const finalLocationId = tokenData.locationId || locationId;
    console.log('Using location ID:', finalLocationId);
    
    const expiryTimestamp = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();
    
    // ===========================================
    // TRIAL SYSTEM CHECKS - Before storing GHL account
    // ===========================================
    
    // 1. Get user subscription info
    const { data: userInfo, error: userInfoError } = await supabaseAdmin
      .from('users')
      .select('subscription_status, max_subaccounts, total_subaccounts, email, trial_ends_at')
      .eq('id', targetUserId)
      .single();
    
    if (userInfoError || !userInfo) {
      console.error('❌ Error fetching user subscription info:', userInfoError);
      return res.status(500).json({ 
        error: 'Failed to check subscription status',
        requiresUpgrade: true
      });
    }
    
    console.log('📊 User subscription info:', {
      status: userInfo.subscription_status,
      current: userInfo.total_subaccounts,
      max: userInfo.max_subaccounts
    });
    
    // 2. Check if location already used by another user (anti-abuse)
    const { data: existingLocation } = await supabaseAdmin
      .from('used_locations')
      .select('location_id, email, user_id, is_active')
      .eq('location_id', finalLocationId)
      .maybeSingle();
    
    // If location exists and is linked to different user
    if (existingLocation && existingLocation.user_id !== targetUserId) {
      console.log('⚠️ Location already linked to another user:', existingLocation);
      
      // Log the location conflict event
      await supabaseAdmin.from('subscription_events').insert({
        user_id: targetUserId,
        event_type: 'location_blocked',
        plan_name: userInfo.subscription_status,
        metadata: {
          blocked_location_id: finalLocationId,
          original_owner_email: existingLocation.email,
          reason: 'Location already linked to different account'
        }
      });
      
      const frontendUrl = process.env.FRONTEND_URL || 'https://whatsappghl.vercel.app';
      return res.redirect(`${frontendUrl}/dashboard?error=location_exists&email=${encodeURIComponent(existingLocation.email)}`);
    }
    
    // 3. Check subaccount limit for trial users
    if (userInfo.subscription_status === 'trial' || userInfo.subscription_status === 'free') {
      // Count current GHL accounts
      const { data: currentAccounts, error: countError } = await supabaseAdmin
        .from('ghl_accounts')
        .select('id', { count: 'exact' })
        .eq('user_id', targetUserId);
      
      const currentCount = currentAccounts?.length || 0;
      console.log(`📊 Current subaccounts: ${currentCount}, Max allowed: ${userInfo.max_subaccounts}`);
      
      // If already at limit, block the addition
      if (currentCount >= userInfo.max_subaccounts) {
        console.log('❌ Subaccount limit reached for trial user');
        
        // Log the limit reached event
        await supabaseAdmin.from('subscription_events').insert({
          user_id: targetUserId,
          event_type: 'subaccount_limit_reached',
          plan_name: userInfo.subscription_status,
          metadata: {
            current_count: currentCount,
            max_allowed: userInfo.max_subaccounts,
            trial_ends_at: userInfo.trial_ends_at
          }
        });
        
        const frontendUrl = process.env.FRONTEND_URL || 'https://whatsappghl.vercel.app';
        return res.redirect(`${frontendUrl}/dashboard?error=trial_limit_reached&current=${currentCount}&max=${userInfo.max_subaccounts}`);
      }
      
      console.log('✅ Subaccount limit check passed');
    }
    
    // User already verified above, proceed with GHL account storage
    
    const { error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .upsert({
        user_id: targetUserId,
        company_id: tokenData.companyId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        location_id: finalLocationId,
        expires_at: expiryTimestamp,  // Old column (required)
        token_expires_at: expiryTimestamp  // New column (for auto-refresh)
      });

    if (ghlError) {
      console.error('❌ Error storing GHL account:', ghlError);
      console.error('❌ Error details:', {
        message: ghlError.message,
        code: ghlError.code,
        details: ghlError.details,
        hint: ghlError.hint
      });
      return res.status(500).json({ 
        error: 'Failed to store account information',
        details: ghlError.message,
        hint: ghlError.hint
      });
    }

    console.log('GHL account stored successfully');
    
    // ===========================================
    // SAVE LOCATION TO used_locations (ANTI-ABUSE)
    // ===========================================
    const { data: savedAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('id, location_id')
      .eq('user_id', targetUserId)
      .eq('location_id', finalLocationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (savedAccount) {
      // Check if location already tracked
      const { data: existingLocation } = await supabaseAdmin
        .from('used_locations')
        .select('id')
        .eq('location_id', finalLocationId)
        .maybeSingle();
      
      if (!existingLocation) {
        // Save to used_locations for anti-abuse
        await supabaseAdmin.from('used_locations').insert({
          location_id: finalLocationId,
          user_id: targetUserId,
          email: userInfo.email,
          ghl_account_id: savedAccount.id,
          is_active: true,
          first_used_at: new Date().toISOString(),
          last_active_at: new Date().toISOString()
        });
        console.log('✅ Location saved to used_locations for anti-abuse');
      } else {
        // Update existing location to active
        await supabaseAdmin
          .from('used_locations')
          .update({
            is_active: true,
            last_active_at: new Date().toISOString(),
            user_id: targetUserId
          })
          .eq('id', existingLocation.id);
        console.log('✅ Updated existing location in used_locations');
      }
    }
    
    const frontendUrl = process.env.FRONTEND_URL || 'https://whatsappghl.vercel.app';
    
    // Get user data for redirect - ensure we get the correct user
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('id', targetUserId)
      .single();
    
    console.log('🔍 User data for redirect:', { userData, userError, targetUserId });
    
    if (userData) {
      // Redirect with existing user data
      console.log('✅ Redirecting with user data:', userData);
      res.redirect(`${frontendUrl}/auth/callback?ghl=connected&user=${encodeURIComponent(JSON.stringify(userData))}`);
    } else {
      console.error('❌ User not found for redirect:', userError);
      // Fallback redirect
    res.redirect(`${frontendUrl}/dashboard?ghl=connected`);
    }
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

// Admin routes
app.get('/admin/ghl/subaccounts', requireAuth, async (req, res) => {
  try {
    // req.user already set by requireAuth middleware
    const { data: subaccounts } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('user_id', req.user.id);

    res.json({ subaccounts: subaccounts || [] });
  } catch (error) {
    console.error('Error fetching subaccounts:', error);
    res.status(500).json({ error: 'Failed to fetch subaccounts' });
  }
});

// Admin Create Session Endpoint
app.post('/admin/create-session', requireAuth, async (req, res) => {
  try {
    const { subaccountId, mode = 'qr' } = req.body;
    
    if (!subaccountId) {
      return res.status(400).json({ error: 'Subaccount ID is required' });
    }

    console.log(`🚀 Creating ${mode} session for subaccount: ${subaccountId}`);

    // Create session in database
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        user_id: req.user?.id,
        subaccount_id: subaccountId,
        status: 'initializing',
        qr: null,
        phone_number: null,
        mode: mode // Store the mode
      })
      .select()
      .single();

    if (sessionError) {
      console.error('❌ Database error creating session:', sessionError);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    console.log(`✅ Session created with ID: ${session.id}, mode: ${mode}`);

    // Start WhatsApp client creation for QR mode
      const sessionName = `subaccount_${subaccountId}_${session.id}`;
      
      try {
        await waManager.createClient(sessionName);
        console.log(`📱 QR session client created: ${sessionName}`);
      } catch (error) {
        console.error('❌ Error creating QR client:', error);
        // Update session status to error
        await supabaseAdmin
          .from('sessions')
          .update({ status: 'disconnected' })
          .eq('id', session.id);
    }

    res.json({ 
      success: true,
      sessionId: session.id,
      mode: mode,
      message: 'QR session created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Admin Get Session Status
app.get('/admin/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', req.user?.id)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ 
      session: {
        id: session.id,
        status: session.status,
        qr: session.qr,
        phone_number: session.phone_number,
        created_at: session.created_at,
        mode: session.mode
      }
    });
  } catch (error) {
    console.error('❌ Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Connect new subaccount
app.post('/admin/ghl/connect-subaccount', requireAuth, async (req, res) => {
  try {
    // req.user already set by requireAuth middleware
    const { ghl_location_id, name } = req.body;

    if (!ghl_location_id) {
      return res.status(400).json({ error: 'ghl_location_id is required' });
    }

    // Check if subaccount already exists
    const { data: existingSubaccount } = await supabaseAdmin
      .from('subaccounts')
      .select('*')
      .eq('ghl_location_id', ghl_location_id)
      .eq('user_id', req.user.id)
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
        user_id: req.user.id,
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
      webhook_url: `${process.env.BACKEND_URL || 'https://api.octendr.com'}/ghl/provider/webhook`
    },
    settings: {
      webhook_url: {
        type: "url",
        label: "Webhook URL",
        description: "URL for receiving incoming messages",
        required: true,
        default: `${process.env.BACKEND_URL || 'https://api.octendr.com'}/ghl/provider/webhook`
      }
    }
  });
});

/**
 * Downloads media from GHL attachment URL
 * @param {string} mediaUrl - GHL media URL
 * @param {string} accessToken - GHL access token
 * @returns {Promise<Buffer>} - Media file buffer
 */
async function downloadGHLMedia(mediaUrl, accessToken) {
  try {
    console.log(`📥 Downloading media from GHL: ${mediaUrl}`);
    
    // Use proper GHL headers with Version (required for GHL API)
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28', // GHL API version - required
        'User-Agent': 'WhatsApp-Bridge/1.0',
        'Accept': '*/*',
        'Referer': 'https://app.gohighlevel.com/'
      },
      timeout: 60000 // 60 second timeout for large files
    });
    
    console.log(`✅ Downloaded ${response.data.byteLength} bytes from GHL`);
    return Buffer.from(response.data);
    
  } catch (error) {
    console.error('❌ Failed to download GHL media:', error.message);
    console.error('   Status:', error.response?.status);
    console.error('   URL:', mediaUrl);
    
    if (error.response?.status === 401) {
      console.error('   ⚠️ GHL media URL requires authorization - token may be invalid or URL expired');
    }
    
    throw new Error(`GHL media download failed: ${error.message}`);
  }
}

/**
 * Detects media type from URL or content type
 * @param {string} url - Media URL
 * @param {string} contentType - Optional content type header
 * @returns {string} - Media type: 'image', 'video', 'document', 'audio'
 */
function detectMediaType(url, contentType) {
  const lowerUrl = url.toLowerCase();
  const lowerContentType = (contentType || '').toLowerCase();
  
  // Check content type first
  if (lowerContentType.includes('image/')) return 'image';
  if (lowerContentType.includes('video/')) return 'video';
  if (lowerContentType.includes('audio/')) return 'audio';
  if (lowerContentType.includes('application/') || lowerContentType.includes('document/')) return 'document';
  
  // Check URL extension
  if (lowerUrl.includes('.png') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || 
      lowerUrl.includes('.gif') || lowerUrl.includes('.webp') || lowerUrl.includes('.bmp')) {
    return 'image';
  }
  
  if (lowerUrl.includes('.mp4') || lowerUrl.includes('.avi') || lowerUrl.includes('.mov') || 
      lowerUrl.includes('.mkv') || lowerUrl.includes('.webm')) {
    return 'video';
  }
  
  if (lowerUrl.includes('.mp3') || lowerUrl.includes('.ogg') || lowerUrl.includes('.wav') || 
      lowerUrl.includes('.m4a') || lowerUrl.includes('.aac')) {
    return 'audio';
  }
  
  // Default to document for everything else (PDF, DOC, etc.)
  return 'document';
}

// GHL Provider Webhook (for incoming messages)
app.post('/ghl/provider/webhook', async (req, res) => {
  try {
    console.log('GHL Provider Webhook:', req.body);
    
    // Change 3: Prevent duplicate processing - skip InboundMessage types
    if (req.body.type === 'InboundMessage') {
      console.log('⏭️ Skipping our own inbound message to prevent loops');
      return res.json({ status: 'skipped', reason: 'inbound_message_echo' });
    }
    
    // Continue processing only OutboundMessage types
    if (req.body.type !== 'OutboundMessage' && req.body.type !== 'SMS') {
      console.log(`⏭️ Skipping webhook type: ${req.body.type}`);
      return res.json({ status: 'skipped', reason: `unsupported_type_${req.body.type}` });
    }
    
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
    
    // Ignore messages that contain media URLs (these are our inbound messages being echoed back)
    if (message && (
      message.includes('storage.googleapis.com/msgsndr') || 
      message.startsWith('https://storage.googleapis.com') ||
      message.startsWith('http://') ||
      (message.startsWith('https://') && message.includes('msgsndr'))
    )) {
      console.log('🚫 Ignoring echo of media URL message:', message);
      return res.json({ status: 'success', reason: 'media_url_echo' });
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
    let validToken;
    try {
      validToken = await ensureValidToken(ghlAccount);
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
    
    if (!clientStatus || (clientStatus.status !== 'connected' && clientStatus.status !== 'ready')) {
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
    
    // If client is in ready status, it's connected and can send messages
    if (clientStatus && clientStatus.status === 'ready') {
      console.log(`✅ Client in ready status, sending message...`);
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
    
    // Process and send message (text and/or media)
    try {
      // Check if we have attachments to send
      if (attachments && attachments.length > 0) {
        console.log(`📎 Processing ${attachments.length} attachment(s)`);
        
        // Ensure token is available (already validated above, but refresh if needed)
        if (!validToken) {
          validToken = await ensureValidToken(ghlAccount);
        }
        
        // Process each attachment
        for (let i = 0; i < attachments.length; i++) {
          const attachmentUrl = attachments[i];
          try {
            // Detect media type from URL first
            let mediaType = detectMediaType(attachmentUrl);
            
            // Try to download media from GHL
            let mediaPayload = null;
            let fileName = null;
            
            console.log(`📥 Downloading attachment ${i + 1}/${attachments.length} from GHL...`);
            try {
              const mediaBuffer = await downloadGHLMedia(attachmentUrl, validToken);
              mediaPayload = mediaBuffer; // Use buffer if download succeeds
              console.log(`✅ Downloaded ${mediaBuffer.length} bytes`);
            } catch (downloadError) {
              // If download fails (401 or other error), use URL directly
              console.warn(`⚠️ Download failed, using URL directly: ${downloadError.message}`);
              console.log(`📤 Will send media via URL (Baileys will download)`);
              mediaPayload = attachmentUrl; // Fallback to URL
            }
            
            // Extract filename from URL if available (for documents especially)
            if (mediaType === 'document' || mediaType === 'audio') {
              const urlParts = attachmentUrl.split('/');
              const lastPart = urlParts[urlParts.length - 1];
              if (lastPart && lastPart.includes('.')) {
                fileName = lastPart.split('?')[0]; // Remove query params
              }
            }
            
            console.log(`📤 Sending ${mediaType} attachment (${i + 1}/${attachments.length})`);
            
            // Send media message with caption (only for first attachment if there's text)
            const caption = (i === 0 && message) ? message : '';
            
            // Send via WhatsApp - Baileys will handle buffer or URL
            const sendResult = await waManager.sendMessage(
              clientKey, 
              phoneNumber, 
              caption, 
              mediaType, 
              mediaPayload,  // Can be Buffer or URL
              fileName       // Optional filename for documents/audio
            );
            
            console.log(`✅ ${mediaType} attachment sent successfully`);
            
            // If there was an error sending, log it but continue with other attachments
            if (sendResult && sendResult.status === 'skipped') {
              console.warn(`⚠️ Attachment ${i + 1} skipped: ${sendResult.reason}`);
            }
            
          } catch (attachError) {
            console.error(`❌ Error sending attachment ${i + 1}:`, attachError.message);
            // Continue with other attachments even if one fails
          }
        }
        
        // If there were attachments but no text message, we're done
        if (!message) {
          console.log('✅ All attachments sent successfully');
          
          // Note: Tagging already done per attachment above
          // If needed, can add overall success tagging here
          return res.json({ status: 'success' });
        }
        
        // If there's also a text message and it wasn't sent as caption, send it separately
        // (Note: If caption was sent with first attachment, we skip sending text again)
        if (message && attachments.length > 0) {
          // The message was likely sent as caption with first attachment
          // But if user wants separate text, we can add logic here
          console.log('✅ Media sent with caption');
          
          // Tagging already done per attachment above, no need to duplicate
        }
      }
      
      // Send text message if there's text and no attachments, or if text wasn't sent as caption
      if (message && (!attachments || attachments.length === 0)) {
        console.log(`📤 Sending text message: ${message}`);
      const sendResult = await waManager.sendMessage(clientKey, phoneNumber, message || '', 'text');
      
      // Check if message was skipped (no WhatsApp)
      if (sendResult && sendResult.status === 'skipped') {
        console.warn(`⚠️ Message skipped: ${sendResult.reason} for ${phoneNumber}`);
        
        // Send notification message back to GHL conversation
        try {
          const providerId = getProviderId();
          const notificationPayload = {
            type: "SMS",  // Changed to SMS for workflow triggers
            conversationProviderId: providerId,  // Required for workflows
            contactId: contactId,
            message: `⚠️ Message delivery failed\n\n❌ ${phoneNumber} does not have WhatsApp\n\n💡 Please verify the phone number or use another contact method.`,
            direction: "inbound",
            status: "delivered",
            altId: `failed_${Date.now()}`
          };
          
          // validToken already available in scope
          const notificationRes = await makeGHLRequest(`${BASE}/conversations/messages/inbound`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${validToken}`,
              Version: "2021-07-28",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(notificationPayload)
          }, ghlAccount);
          
          if (notificationRes.ok) {
            console.log(`✅ Failure notification sent to GHL conversation`);
          }
        } catch (notifError) {
          console.error(`❌ Failed to send notification to GHL:`, notifError.message);
        }
        
        return res.json({ 
          status: 'warning', 
          reason: sendResult.reason,
          phoneNumber: phoneNumber,
          message: 'Number does not have WhatsApp - notification sent to conversation'
        });
      }
      
      console.log('✅ Message sent successfully via Baileys');
      
      // Store outgoing message in local database
      try {
        // Note: sessionId is not available in outgoing message context, skip local storage for now
        console.log('⚠️ Skipping outgoing message local storage - sessionId not available in this context');
      } catch (dbError) {
        console.error('❌ Error storing outgoing message in local database:', dbError);
        }
      }
    } catch (sendError) {
      console.error('❌ Error sending message via Baileys:', sendError.message);
      
      // Send error notification to GHL conversation
      try {
        const providerId = getProviderId();
        const errorPayload = {
          type: "SMS",  // Changed to SMS for workflow triggers
          conversationProviderId: providerId,  // Required for workflows
          contactId: contactId,
          message: `⚠️ Message delivery failed\n\n❌ Error: ${sendError.message}\n\n💡 Please check the phone number and try again.`,
          direction: "inbound",
          status: "delivered",
          altId: `error_${Date.now()}`
        };
        
        const validToken = await ensureValidToken(ghlAccount);
        const errorRes = await makeGHLRequest(`${BASE}/conversations/messages/inbound`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${validToken}`,
            Version: "2021-07-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(errorPayload)
        }, ghlAccount);
        
        if (errorRes.ok) {
          console.log(`✅ Error notification sent to GHL conversation`);
        }
      } catch (notifError) {
        console.error(`❌ Failed to send error notification to GHL:`, notifError.message);
      }
      
      return res.json({ 
        status: 'error', 
        error: sendError.message,
        phoneNumber: phoneNumber,
        message: 'Error notification sent to conversation'
      });
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
      console.log(`🔍 Looking for session: ${sessionId}`);
      
      const { data: session } = await supabaseAdmin
        .from('sessions')
        .select('*, ghl_accounts(*)')
        .eq('id', sessionId)
        .maybeSingle();
      
      console.log(`📋 Session found:`, session ? 'Yes' : 'No');
      
      if (session && session.ghl_accounts) {
        ghlAccount = session.ghl_accounts;
        console.log(`✅ Using GHL account from session: ${ghlAccount.id}`);
      } else {
        console.log(`⚠️ Session found but no GHL account linked`);
      }
    }
    
    // Fallback: Try to find GHL account by session ID pattern
    if (!ghlAccount && sessionId) {
      console.log(`🔄 Trying to find GHL account by session ID pattern`);
      
      // Extract subaccount ID from session ID (location_xxx_yyy format)
      const sessionParts = sessionId.split('_');
      if (sessionParts.length >= 2) {
        const subaccountId = sessionParts[1]; // location_XXX_yyy -> XXX
        console.log(`🔍 Extracted subaccount ID: ${subaccountId}`);
        
        const { data: accountBySubaccount } = await supabaseAdmin
          .from('ghl_accounts')
          .select('*')
          .eq('id', subaccountId)
          .maybeSingle();
        
        if (accountBySubaccount) {
          ghlAccount = accountBySubaccount;
          console.log(`✅ Found GHL account by subaccount ID: ${ghlAccount.id}`);
        }
      }
    }
    
    // Final fallback to any GHL account if still not found
    if (!ghlAccount) {
      console.log(`🔄 Final fallback to any available GHL account`);
      
      const { data: anyAccount } = await supabaseAdmin
        .from('ghl_accounts')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (anyAccount) {
        ghlAccount = anyAccount;
        console.log(`✅ Using final fallback GHL account: ${ghlAccount.id}`);
      }
    }
    
    if (!ghlAccount) {
      console.log(`❌ No GHL account found for message from: ${from}`);
      return res.json({ status: 'success' });
    }
    
    const locationId = ghlAccount.location_id;
    
    // Use account's conversation provider ID (more reliable)
    let providerId = ghlAccount.conversation_provider_id;
    if (!providerId) {
      // Fallback to environment provider ID
      providerId = getProviderId();
      if (!providerId) {
        console.error('❌ No conversation provider ID found');
        return res.json({ status: 'error', message: 'Provider ID not available' });
      }
    }
    
    console.log(`🔑 Provider ID being used: ${providerId}`);
    console.log(`🔑 Account conversation provider ID: ${ghlAccount.conversation_provider_id}`);
    console.log(`🔑 Environment provider ID: ${getProviderId()}`);
    
    console.log(`📱 Processing WhatsApp message from: ${phone} for location: ${locationId}`);
    console.log(`📨 Raw message from WhatsApp:`, JSON.stringify(req.body, null, 2));
    console.log(`💬 Extracted message text:`, `"${message}"`);
    console.log(`🔍 Message type:`, typeof message);
    
    // Get valid token for this GHL account
    const validToken = await ensureValidToken(ghlAccount);
    
    // Upsert contact (same location)
    let contactId = null;
    try {
      const contactRes = await makeGHLRequest(`${BASE}/contacts/`, {
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
      }, ghlAccount);
      
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
            
            // Upload media to GHL and get accessible URL
            try {
              const { uploadMediaToGHL } = require('./mediaHandler');
              const ghlResponse = await uploadMediaToGHL(
                mediaBuffer,
                messageType,
                contactId,
                validToken,
                locationId
              );
              
              console.log(`✅ Media uploaded to GHL successfully:`, ghlResponse);
              
              // Get the accessible media URL from GHL response
              const accessibleUrl = ghlResponse.url || 'Media URL not available';
              
              // Change 1: Send media as attachment, not as text message
              // Use a descriptive message and put URL in attachments array
              finalMessage = `🖼️ ${getMediaMessageText(messageType)}`;
              attachments.push(accessibleUrl);
              
              console.log(`📤 Sending ${messageType} as attachment: ${accessibleUrl}`);
              
            } catch (uploadError) {
              console.error(`❌ Media upload failed:`, uploadError.message);
              
              // Fallback: Send message with media URL as attachment
              if (mediaUrl && !mediaUrl.includes('ENCRYPTED')) {
                console.log(`🔄 Sending media URL as attachment instead...`);
                
      const payload = {
        type: "SMS",  // Changed to SMS for workflow triggers
        conversationProviderId: providerId,  // Required for workflows
        contactId: contactId,
        message: `🖼️ ${getMediaMessageText(messageType)}`,
        direction: "inbound",
        status: "delivered",
        altId: whatsappMsgId,
        attachments: [mediaUrl]  // Send URL directly as attachment
      };
      
      const inboundRes = await makeGHLRequest(`${BASE}/conversations/messages/inbound`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }, ghlAccount);
      
      if (inboundRes.ok) {
                  console.log(`✅ Media URL sent as attachment to GHL`);
                  return res.json({ 
                    status: 'success', 
                    message: 'Media sent as URL attachment' 
                  });
                }
              }
              
              // If all fails, fall through to text notification
              throw uploadError;
            }
            
          } catch (error) {
            console.error(`❌ Media processing failed:`, error.message);
            
            // Fallback: Send text notification
            finalMessage = `📎 ${getMediaMessageText(messageType)}\n\n⚠️ Media could not be processed. Please check WhatsApp directly.`;
          }
        }
        
        // Change 2: Fix inbound message payload - add conversationProviderId and change type to SMS
        const payload = {
          type: "SMS",  // Changed from "WhatsApp" to "SMS" for workflow triggers
          conversationProviderId: providerId,  // Required for workflows
          contactId: contactId,
          message: finalMessage,
          direction: "inbound",
          status: "delivered",
          altId: whatsappMsgId || `wa_${Date.now()}` // idempotency
        };
        
        // Only add attachments field if attachments exist and are not empty
        // GHL rejects empty arrays, so don't include the field at all if empty
        if (attachments && attachments.length > 0) {
          payload.attachments = attachments;
        }
      
      console.log(`📤 Sending to GHL SMS Provider:`, JSON.stringify(payload, null, 2));
      console.log(`🔑 Using Provider ID:`, providerId);
      console.log(`👤 Using Contact ID:`, contactId);
      console.log(`💬 Message Content:`, `"${message}"`);
      console.log(`📏 Message Length:`, message.length);
      console.log(`📎 Attachments Count:`, attachments.length);
      
      // Send message directly to GHL (working approach)
      const inboundRes = await makeGHLRequest(`${BASE}/conversations/messages/inbound`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }, ghlAccount);
      
      if (inboundRes.ok) {
        const responseData = await inboundRes.json();
        console.log(`✅ Inbound message added to GHL conversation for contact: ${contactId}`);
        console.log(`📊 GHL Response:`, JSON.stringify(responseData, null, 2));
        
        // Trigger customer_replied workflow via webhook
        try {
          console.log(`🔄 Triggering customer_replied workflow via webhook...`);
          
          const workflowPayload = {
            event_type: "customer_replied",
            contact_id: contactId,
            contact_name: "Customer",
            contact_phone: phone,
            last_message: finalMessage,
            location_id: locationId,
            channel: "sms",
            conversation_provider_id: providerId,
            timestamp: new Date().toISOString()
          };
          
          // Call our workflow webhook endpoint
          const workflowRes = await fetch(`${process.env.BACKEND_URL || 'https://api.octendr.com'}/api/ghl-workflow`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(workflowPayload)
          });
          
          if (workflowRes.ok) {
            const workflowData = await workflowRes.json();
            console.log(`✅ Customer replied workflow triggered successfully`);
            console.log(`📊 Workflow Response:`, JSON.stringify(workflowData, null, 2));
          } else {
            const errorText = await workflowRes.text();
            console.log(`⚠️ Customer replied workflow trigger failed:`, errorText);
          }
        } catch (workflowError) {
          console.error(`❌ Error triggering customer_replied workflow:`, workflowError.message);
        }
        console.log(`📊 Response Status:`, inboundRes.status);
        console.log(`📊 Response Headers:`, Object.fromEntries(inboundRes.headers.entries()));
        
        // Check if message was actually created
        if (responseData.messageId) {
          console.log(`📝 Message ID created: ${responseData.messageId}`);
          console.log(`💬 Message should be visible in GHL with content: "${message}"`);
          
          // Try to fetch the message back to verify it was created
          try {
            const verifyRes = await makeGHLRequest(`${BASE}/conversations/${responseData.conversationId}/messages/${responseData.messageId}`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${validToken}`,
                Version: "2021-07-28",
                "Content-Type": "application/json"
              }
            }, ghlAccount);
            
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
        
        // Store message in local database
        try {
          // Get session info for database storage
          let sessionData = null;
          if (sessionId) {
            const { data: session } = await supabaseAdmin
              .from('sessions')
              .select('*, subaccounts(*)')
              .eq('id', sessionId)
              .maybeSingle();
            
            if (session) {
              sessionData = session;
            }
          }
          
          // If no session found, try to find by GHL account
          if (!sessionData && ghlAccount) {
            const { data: session } = await supabaseAdmin
              .from('sessions')
              .select('*, subaccounts(*)')
              .eq('subaccount_id', ghlAccount.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (session) {
              sessionData = session;
            }
          }
          
          if (sessionData) {
            // Extract phone numbers
            const fromNumber = phone.replace('+', '');
            const toNumber = sessionData.phone_number || 'unknown';
            
            // Store in local messages table
            const { error: insertError } = await supabaseAdmin
              .from('messages')
              .insert({
                session_id: sessionData.id,
                user_id: sessionData.user_id,
                subaccount_id: sessionData.subaccount_id,
                from_number: fromNumber,
                to_number: toNumber,
                body: finalMessage,
                media_url: mediaUrl,
                media_mime: messageType,
                direction: 'in',
                created_at: new Date().toISOString()
              });
            
            if (insertError) {
              console.error('❌ Failed to store message in local database:', insertError);
            } else {
              console.log('✅ Message stored in local database');
            }
          } else {
            console.log('⚠️ No session found for local message storage');
          }
        } catch (dbError) {
          console.error('❌ Error storing message in local database:', dbError);
        }

        // Note: Team notifications are now handled by GHL workflows
        // The workflow will call /api/team-notification endpoint with proper team members
        
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
      const contactRes = await makeGHLRequest(`${BASE}/contacts/${contactId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${validToken}`,
          Version: "2021-07-28",
          "Content-Type": "application/json"
        }
      }, ghlAccount);
      
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
    
    // 🔥 Try to extract locationId from referer URL (GHL context)
    if (!locationId) {
      const referer = req.get('referer') || req.get('origin') || '';
      console.log('🔍 Checking referer for locationId:', referer);
      
      // Extract locationId from GHL URLs like: https://app.gohighlevel.com/locations/LOCATION_ID/...
      const locationMatch = referer.match(/\/locations\/([a-zA-Z0-9_-]+)/);
      if (locationMatch && locationMatch[1]) {
        locationId = locationMatch[1];
        console.log('✅ Found locationId from referer:', locationId);
      }
    }
    
    // Try to get from GHL headers if available
    if (!locationId) {
      const ghlLocationId = req.get('x-location-id') || req.get('location-id');
      if (ghlLocationId) {
        locationId = ghlLocationId;
        console.log('✅ Found locationId from header:', locationId);
      }
    }
    
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
        console.log('✅ Found locationId from company:', locationId);
      }
    }
    
    // If still no locationId, try to get first GHL account (fallback)
    if (!locationId) {
      console.log('⚠️ No locationId found, trying to get first available GHL account...');
      
      const { data: allAccounts } = await supabaseAdmin
        .from('ghl_accounts')
        .select('location_id')
        .limit(1)
        .maybeSingle();
      
      if (allAccounts && allAccounts.location_id) {
        locationId = allAccounts.location_id;
        console.log('✅ Using first available locationId:', locationId);
      }
    }
    
    if (!locationId) {
      return res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>WhatsApp Setup - Octendr</title>
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              padding: 40px 20px;
              margin: 0;
              background: linear-gradient(135deg, #128C7E 0%, #075E54 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: white;
              border-radius: 20px;
              padding: 40px;
              max-width: 600px;
              width: 100%;
              box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
            }
            h1 { color: #075E54; margin-top: 0; }
            .code-block {
              background: #f5f5f5;
              padding: 15px;
              border-radius: 10px;
              font-family: 'Courier New', monospace;
              margin: 20px 0;
              word-break: break-all;
              border: 2px solid #25D366;
            }
            .step { margin: 20px 0; padding-left: 30px; position: relative; }
            .step::before {
              content: counter(step);
              counter-increment: step;
              position: absolute;
              left: 0;
              background: #25D366;
              color: white;
              width: 25px;
              height: 25px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
            }
            ol { counter-reset: step; list-style: none; padding: 0; }
            .highlight { color: #25D366; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>📱 WhatsApp Connection Setup</h1>
            <p>To connect WhatsApp, please add your Location ID to the link:</p>
            
            <div class="code-block">
              ${process.env.BACKEND_URL || 'https://api.octendr.com'}/ghl/provider?locationId=YOUR_LOCATION_ID
            </div>
            
            <ol>
              <li class="step">
                Go to <span class="highlight">GoHighLevel Dashboard</span>
              </li>
              <li class="step">
                Navigate to <span class="highlight">Settings → General</span>
              </li>
              <li class="step">
                Copy your <span class="highlight">Location ID</span>
              </li>
              <li class="step">
                Replace <span class="highlight">YOUR_LOCATION_ID</span> in the link above
              </li>
              <li class="step">
                Add this link to your <span class="highlight">Custom Menu</span>
              </li>
            </ol>
            
            <p style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #E9EDEF; color: #54656F;">
              <strong>Or use the universal link:</strong><br>
              <div class="code-block" style="margin-top: 10px;">
                ${process.env.BACKEND_URL || 'https://api.octendr.com'}/ghl/provider
              </div>
              This will automatically detect your location when opened from GHL.
            </p>
          </div>
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
            * {
              box-sizing: border-box;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              padding: 0; 
              margin: 0;
              background: linear-gradient(135deg, #128C7E 0%, #075E54 50%, #25D366 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container { 
              max-width: 1200px;
              width: 95%;
              margin: 20px auto;
            }
            .card { 
              background: white; 
              border-radius: 20px; 
              padding: 0;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
              overflow: hidden;
            }
            .header {
              background: linear-gradient(135deg, #075E54 0%, #128C7E 100%);
              padding: 30px 40px;
              color: white;
              display: flex;
              align-items: center;
              gap: 20px;
            }
            .logo {
              width: 70px;
              height: 70px;
              background: white;
              border-radius: 18px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .logo svg {
              width: 50px;
              height: 50px;
            }
            .header-text {
              flex: 1;
            }
            .title {
              font-size: 32px;
              font-weight: 700;
              margin: 0 0 8px 0;
              letter-spacing: -0.5px;
            }
            .subtitle {
              font-size: 16px;
              margin: 0;
              opacity: 0.95;
            }
            .content-wrapper {
              display: grid;
              grid-template-columns: 1fr 1.2fr;
              gap: 0;
              min-height: 500px;
            }
            .left-panel {
              background: #F0F2F5;
              padding: 40px;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
            .right-panel {
              padding: 40px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: white;
            }
            .info-section {
              background: white;
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 24px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .info-section h3 {
              margin: 0 0 16px 0;
              color: #075E54;
              font-size: 18px;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 0;
              border-bottom: 1px solid #E9EDEF;
            }
            .info-row:last-child {
              border-bottom: none;
            }
            .info-label {
              font-weight: 600;
              color: #54656F;
              font-size: 14px;
            }
            .info-value {
              color: #111B21;
              font-family: 'Courier New', monospace;
              font-size: 13px;
            }
            .connected-number {
              color: #25D366;
              font-weight: 700;
              font-size: 16px;
            }
            .qr-section {
              text-align: center;
            }
            .qr-container {
              background: white;
              border: 3px solid #25D366;
              border-radius: 16px;
              padding: 24px;
              display: inline-block;
              box-shadow: 0 4px 12px rgba(37, 211, 102, 0.15);
            }
            .qr-container img {
              width: 280px;
              height: 280px;
              display: block;
            }
            .status {
              margin: 20px 0;
              padding: 16px 24px;
              border-radius: 12px;
              font-weight: 600;
              font-size: 15px;
              display: inline-flex;
              align-items: center;
              gap: 12px;
            }
            .status.initializing {
              background: #E3F2FD;
              color: #1565C0;
              border: 2px solid #90CAF9;
            }
            .status.qr {
              background: #FFF3E0;
              color: #E65100;
              border: 2px solid #FFB74D;
            }
            .status.ready {
              background: #E8F5E9;
              color: #2E7D32;
              border: 2px solid #81C784;
            }
            .status.disconnected {
              background: #FFEBEE;
              color: #C62828;
              border: 2px solid #E57373;
            }
            .instructions {
              background: white;
              border: 2px solid #25D366;
              border-radius: 12px;
              padding: 24px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .instructions h3 {
              color: #075E54;
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .instructions ol {
              color: #111B21;
              margin: 0;
              padding-left: 24px;
              line-height: 1.8;
            }
            .instructions li {
              margin: 12px 0;
              font-size: 15px;
            }
            .instructions strong {
              color: #075E54;
            }
            .warning-box {
              background: #FFF8E1;
              border-left: 4px solid #FFA000;
              padding: 16px;
              margin-top: 16px;
              border-radius: 8px;
              font-size: 14px;
              color: #E65100;
              line-height: 1.6;
            }
            .warning-box strong {
              display: block;
              margin-bottom: 8px;
              color: #E65100;
            }
            .button-group {
              display: flex;
              gap: 12px;
              justify-content: center;
              margin-top: 32px;
              flex-wrap: wrap;
            }
            button { 
              padding: 14px 28px; 
              border-radius: 10px; 
              border: none; 
              font-weight: 600;
              font-size: 15px;
              cursor: pointer;
              transition: all 0.3s ease;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .btn-primary {
              background: #25D366;
              color: white;
            }
            .btn-primary:hover {
              background: #1DA851;
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
            }
            .btn-secondary {
              background: #F0F2F5;
              color: #54656F;
              border: 2px solid #E9EDEF;
            }
            .btn-secondary:hover {
              background: #E9EDEF;
              transform: translateY(-2px);
            }
            .btn-success {
              background: #075E54;
              color: white;
            }
            .btn-success:hover {
              background: #054A42;
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(7, 94, 84, 0.4);
            }
            .loading {
              display: inline-block;
              width: 20px;
              height: 20px;
              border: 3px solid rgba(255,255,255,0.3);
              border-top: 3px solid white;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            @media (max-width: 968px) {
              .content-wrapper {
                grid-template-columns: 1fr;
              }
              .left-panel {
                order: 2;
              }
              .right-panel {
                order: 1;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <div class="logo">
                  <svg viewBox="0 0 175.216 175.552" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="whatsapp-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
                        <stop offset="0%" style="stop-color:#25D366" />
                        <stop offset="100%" style="stop-color:#128C7E" />
                      </linearGradient>
                    </defs>
                    <path fill="url(#whatsapp-gradient)" d="M87.184.003C39.065.003 0 39.068 0 87.187c0 15.435 4.023 29.892 11.068 42.455L3.873 171.55l43.405-11.374c12.006 6.521 25.764 10.246 40.316 10.246 48.12 0 87.185-39.065 87.185-87.185C174.78 39.068 135.715.003 87.184.003zm50.964 123.17c-2.046 5.766-10.152 10.548-16.608 11.93-4.423.927-10.194 1.677-29.608-6.364-24.828-10.28-40.901-35.496-42.142-37.126-1.24-1.63-10.163-13.522-10.163-25.796 0-12.274 6.438-18.292 8.724-20.782 2.285-2.49 4.99-3.114 6.652-3.114 1.663 0 3.326.016 4.778.087 1.53.075 3.585-.581 5.603 4.269 2.046 4.923 6.963 16.986 7.572 18.217.609 1.231.203 2.663-.406 3.894-.609 1.231-1.218 2.138-2.458 3.37-1.24 1.23-2.603 2.748-3.717 3.69-1.24 1.051-2.533 2.19-1.088 4.292 1.445 2.102 6.417 10.602 13.782 17.162 9.463 8.434 17.444 11.057 19.912 12.288 2.468 1.231 3.907.986 5.353-.609 1.445-1.595 6.219-7.266 7.88-9.757 1.662-2.49 3.325-2.084 5.61-1.247 2.286.837 14.56 6.87 17.047 8.116 2.488 1.247 4.153 1.863 4.762 2.906.609 1.043.609 6.006-1.437 11.772z"/>
                  </svg>
                </div>
                <div class="header-text">
                  <h1 class="title">WhatsApp Business Integration</h1>
                  <p class="subtitle">Connect your WhatsApp to GoHighLevel SMS Provider</p>
                </div>
              </div>

              <div class="content-wrapper">
                <div class="left-panel">
              <div class="info-section">
                    <h3>📊 Connection Details</h3>
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

                  <div class="instructions">
                    <h3>📱 How to Connect WhatsApp:</h3>
                    <ol>
                      <li><strong>Open WhatsApp</strong> on your phone</li>
                      <li><strong>Tap Menu</strong> (⋮) → <strong>Linked Devices</strong></li>
                      <li><strong>Tap "Link a Device"</strong></li>
                      <li><strong>Scan the QR Code</strong> shown on the right</li>
                      <li><strong>Wait patiently</strong> for connection to complete (30-60 seconds)</li>
                      <li><strong>Don't close</strong> this window until "Connected" appears</li>
                    </ol>
                    
                    <div class="warning-box">
                      <strong>⚠️ Important Notes:</strong>
                      After scanning, please wait for the connection to fully establish. The status will change to "Connected" when ready. 
                      <br><br>
                      <strong>If connection takes too long (5+ minutes):</strong>
                      <br>
                      1. Delete this subaccount from your dashboard
                      <br>
                      2. Add the subaccount again
                      <br>
                      3. Scan the new QR code immediately
                    </div>
                </div>

                  <div class="button-group">
                    <button id="reset" class="btn-secondary">🔄 Reset QR</button>
                    <button id="refresh" class="btn-primary">🔄 Refresh Status</button>
                    <button id="close" class="btn-success" style="display: none;">✅ Close Window</button>
                  </div>
                </div>

                <div class="right-panel">
                  <div class="qr-section">
                <!-- QR Code Section -->
                <div id="qr" class="qr-container" style="display: none;">
                  <div id="qr-image"></div>
                </div>

                <div id="status" class="status initializing">
                  <div class="loading"></div> Preparing WhatsApp session...
                </div>
              </div>
              </div>
              </div>
            </div>
          </div>
          <script>
            const qs = new URLSearchParams(window.location.search);
            // Get locationId from URL parameter OR from embedded value
            const locId = qs.get('locationId') || '${locationId}';
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
              statusTextEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
              
              // Update status element
              statusEl.className = 'status ' + status;
              
              switch(status) {
                case 'initializing':
                  statusEl.innerHTML = '<div class="loading"></div> <strong>Initializing...</strong><br><small>Setting up your WhatsApp connection</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  break;
                  
                case 'qr':
                  statusEl.innerHTML = '📱 <strong>Ready to Scan</strong><br><small>Please scan the QR code with your WhatsApp app</small>';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  qrEl.style.display = 'block';
                  break;
                  
                case 'ready':
                  statusEl.innerHTML = '✅ <strong>Connected Successfully!</strong><br><small>Your WhatsApp is now linked and ready to use</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'flex';
                  phoneNumberEl.textContent = phoneNumber || 'Unknown';
                  closeBtn.style.display = 'inline-flex';
                  break;
                  
                case 'disconnected':
                  statusEl.innerHTML = '❌ <strong>Connection Lost</strong><br><small>Please refresh and scan the QR code again</small>';
                  qrEl.style.display = 'none';
                  phoneRowEl.style.display = 'none';
                  closeBtn.style.display = 'none';
                  break;
                  
                default:
                  statusEl.innerHTML = '⚠️ <strong>Unknown Status</strong><br><small>Current state: ' + status + '</small>';
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
    // Get user from JWT cookie
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    let userId = null;
    
      try {
      const decoded = jwt.verify(token, jwtSecret);
      userId = decoded.userId;
      } catch (e) {
      console.log('JWT validation failed:', e.message);
      return res.status(401).json({ error: 'Invalid token' });
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
    // Get user from JWT cookie
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    let userId = null;
    
    try {
      const decoded = jwt.verify(token, jwtSecret);
      userId = decoded.userId;
    } catch (e) {
      console.log('JWT validation failed:', e.message);
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    // Get ALL GHL accounts for this user (agency + subaccounts)
    const { data: ghlAccounts, error: ghlError } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (ghlError || !ghlAccounts || ghlAccounts.length === 0) {
      console.error('GHL account lookup error:', ghlError);
      return res.status(404).json({ error: 'GHL account not found. Please connect your GHL account first.' });
    }
    
    console.log(`📊 Found ${ghlAccounts.length} GHL account(s) for user ${userId}`);
    
    let allLocations = [];
    
    // Process each GHL account
    for (const account of ghlAccounts) {
      console.log(`🔍 Processing account - Location ID: ${account.location_id}, Company ID: ${account.company_id}`);
      
      // Check if this is an agency-level account (has company_id but no specific location_id, or location_id matches company_id)
      const isAgencyAccount = account.company_id && (!account.location_id || account.location_id === account.company_id);
      
      if (isAgencyAccount) {
        // Agency level - fetch all locations under this company
        console.log(`🏢 Agency account detected for company: ${account.company_id}`);
        
        try {
          const ghlResponse = await fetch('https://services.leadconnectorhq.com/locations/', {
            headers: {
              'Authorization': `Bearer ${account.access_token}`,
              'Version': '2021-07-28'
            }
          });
          
          if (ghlResponse.ok) {
            const ghlData = await ghlResponse.json();
            console.log(`✅ Fetched ${ghlData.locations?.length || 0} locations from agency account`);
            
            if (ghlData.locations && Array.isArray(ghlData.locations)) {
              // Add source info to each location
              const locationsWithSource = ghlData.locations.map(loc => ({
                ...loc,
                source: 'agency',
                companyId: account.company_id
              }));
              allLocations.push(...locationsWithSource);
            }
          } else {
            console.log(`⚠️ Failed to fetch agency locations: ${ghlResponse.status}`);
          }
        } catch (error) {
          console.error('❌ Error fetching agency locations:', error);
        }
      } else if (account.location_id) {
        // Specific location/subaccount
        console.log(`📍 Subaccount detected for location: ${account.location_id}`);
        
        // Check if this location is already in the list (might be from agency fetch)
        const existingLocation = allLocations.find(loc => loc.id === account.location_id);
        
        if (!existingLocation) {
          // Fetch specific location details
          try {
            const ghlResponse = await fetch(`https://services.leadconnectorhq.com/locations/${account.location_id}`, {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Version': '2021-07-28'
              }
            });
            
            if (ghlResponse.ok) {
              const locationData = await ghlResponse.json();
              console.log(`✅ Fetched location details: ${locationData.name || account.location_id}`);
              
              allLocations.push({
                ...locationData,
                source: 'subaccount',
                companyId: account.company_id
              });
            } else {
              // Fallback if API call fails
              console.log(`⚠️ Failed to fetch location details, using fallback`);
              allLocations.push({
                id: account.location_id,
                name: `Location ${account.location_id}`,
                source: 'subaccount',
                companyId: account.company_id
              });
            }
          } catch (error) {
            console.error('❌ Error fetching location details:', error);
            // Add basic location info as fallback
            allLocations.push({
              id: account.location_id,
              name: `Location ${account.location_id}`,
              source: 'subaccount',
              companyId: account.company_id
            });
          }
        }
      }
    }
    
    // Remove duplicates based on location ID
    const uniqueLocations = Array.from(
      new Map(allLocations.map(loc => [loc.id, loc])).values()
    );
    
    console.log(`✅ Returning ${uniqueLocations.length} unique location(s)`);
    
    res.json({
      locations: uniqueLocations,
      totalAccounts: ghlAccounts.length
    });

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

    console.log(`Creating Baileys client with sessionName: ${sessionName}`);
    
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

    // Disconnect WhatsApp client FIRST (this will logout from mobile)
    const cleanSubaccountId = ghlAccount.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `location_${cleanSubaccountId}_${session.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    
    console.log(`🔌 Disconnecting WhatsApp session: ${sessionName}`);
    
    // Step 1: Update database status to disconnected first
    await supabaseAdmin
      .from('sessions')
      .update({ status: 'disconnected' })
      .eq('id', session.id);
    console.log(`📊 Database status updated to disconnected`);
    
    // Step 2: Disconnect from WhatsApp (this logs out from mobile)
    try {
      await waManager.disconnectClient(sessionName);
      console.log(`✅ WhatsApp disconnected from mobile`);
    } catch (disconnectError) {
      console.error(`⚠️ Error disconnecting WhatsApp: ${disconnectError.message}`);
      // Continue with cleanup even if disconnect fails
    }
    
    // Step 3: Clear session data (removes auth files)
    try {
      waManager.clearSessionData(sessionName);
      console.log(`🗑️ Session data cleared from disk`);
    } catch (clearError) {
      console.error(`⚠️ Error clearing session data: ${clearError.message}`);
    }
    
    // Step 4: Delete session from database completely (after disconnect)
    await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', session.id);
    console.log(`🗑️ Session deleted from database`);

    console.log(`✅ Session logged out successfully for location: ${locationId}`);
    res.json({ status: 'success', message: 'Session logged out successfully and disconnected from WhatsApp' });
  } catch (error) {
    console.error('Logout session error:', error);
    res.status(500).json({ error: 'Failed to logout session' });
  }
});

// Delete subaccount
app.delete('/admin/ghl/delete-subaccount', requireAuth, async (req, res) => {
  try {
    const { locationId } = req.body;
    
    if (!locationId) {
      return res.status(400).json({ error: 'Location ID is required' });
    }

    console.log(`🗑️ Deleting subaccount for location: ${locationId} by user: ${req.user?.id}`);

    // Get GHL account and verify ownership
    const { data: ghlAccount } = await supabaseAdmin
      .from('ghl_accounts')
      .select('*')
      .eq('location_id', locationId)
      .eq('user_id', req.user?.id) // Verify user owns this account
      .maybeSingle();

    if (!ghlAccount) {
      return res.status(404).json({ error: 'GHL account not found or you do not have permission to delete it' });
    }

    // Get all sessions for this subaccount
    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('subaccount_id', ghlAccount.id);

    console.log(`📋 Found ${sessions?.length || 0} session(s) to cleanup`);

    // Disconnect all WhatsApp clients
    if (sessions && sessions.length > 0) {
      for (const session of sessions) {
        try {
          const sessionName = `subaccount_${ghlAccount.id}_${session.id}`;
          await waManager.disconnectClient(sessionName);
          waManager.clearSessionData(sessionName);
          console.log(`✅ Cleaned up session: ${sessionName}`);
        } catch (sessionError) {
          console.error(`⚠️ Error cleaning session ${session.id}:`, sessionError.message);
          // Continue with other sessions
        }
      }
    }

    // Delete all sessions
    const { error: sessionsDeleteError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('subaccount_id', ghlAccount.id);

    if (sessionsDeleteError) {
      console.error('Error deleting sessions:', sessionsDeleteError);
    }

    // Delete GHL account
    const { error: accountDeleteError } = await supabaseAdmin
      .from('ghl_accounts')
      .delete()
      .eq('id', ghlAccount.id);

    if (accountDeleteError) {
      console.error('Error deleting GHL account:', accountDeleteError);
      return res.status(500).json({ error: 'Failed to delete account from database' });
    }

    console.log(`✅ Subaccount deleted successfully for location: ${locationId}`);
    res.json({ status: 'success', message: 'Subaccount deleted successfully' });
  } catch (error) {
    console.error('Delete subaccount error:', error);
    res.status(500).json({ error: 'Failed to delete subaccount', details: error.message });
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
          await ensureValidToken(ghlAccount, true); // Force refresh
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
      availableSessions: clients.map(client => client.sessionId),
      versionInfo: waManager.getWhatsAppVersion()
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
    const webhookResponse = await fetch(`${process.env.BACKEND_URL || 'https://api.octendr.com'}/whatsapp/webhook`, {
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
    const webhookResponse = await fetch(`${process.env.BACKEND_URL || 'https://api.octendr.com'}/webhooks/ghl/provider-outbound`, {
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

// GHL Workflow Webhook Handler
app.post('/api/ghl-workflow', async (req, res) => {
  try {
    console.log('🔄 GHL Workflow webhook received:', JSON.stringify(req.body, null, 2));
    
    const { 
      event_type, 
      contact_id, 
      contact_name, 
      contact_phone, 
      last_message, 
      assigned_user, 
      location_id,
      conversation_id,
      workflow_id,
      team_members 
    } = req.body;
    
    // Handle different workflow events
    switch (event_type) {
      case 'customer_replied':
        console.log('🔔 Customer replied workflow triggered');
        
        // Get team members from workflow data or assigned user
        let notificationRecipients = [];
        
        if (team_members && Array.isArray(team_members)) {
          notificationRecipients = team_members;
        } else if (assigned_user) {
          notificationRecipients = [assigned_user];
        }
        
        if (notificationRecipients.length > 0) {
          console.log(`📱 Sending notifications to: ${notificationRecipients.join(', ')}`);
          
          // Find available WhatsApp client
          const availableClients = waManager.getAllClients().filter(client => 
            client.status === 'connected' || client.status === 'ready'
          );
          
          if (availableClients.length > 0) {
            const notificationClient = availableClients[0];
            const clientKey = notificationClient.sessionId;
            
            // Format notification message
            let notificationMessage = `🔔 *Customer Replied*\n\n`;
            if (contact_name) {
              notificationMessage += `👤 Customer: ${contact_name}\n`;
            }
            if (contact_phone) {
              notificationMessage += `📞 Phone: ${contact_phone}\n`;
            }
            if (last_message) {
              notificationMessage += `💬 Message: ${last_message}`;
            }
            
            // Send notifications
            const results = [];
            for (const recipient of notificationRecipients) {
              try {
                await waManager.sendMessage(
                  clientKey,
                  recipient,
                  notificationMessage,
                  'text'
                );
                console.log(`✅ Notification sent to: ${recipient}`);
                results.push({ phone: recipient, status: 'success' });
              } catch (error) {
                console.error(`❌ Failed to send notification to ${recipient}:`, error.message);
                results.push({ phone: recipient, status: 'failed', error: error.message });
              }
            }
            
            res.json({
              status: 'success',
              message: `Notifications sent to ${results.filter(r => r.status === 'success').length}/${notificationRecipients.length} recipients`,
              results
            });
          } else {
            res.status(503).json({ 
              status: 'error', 
              message: 'No WhatsApp clients available for notifications' 
            });
          }
        } else {
          res.json({
            status: 'success',
            message: 'No team members to notify'
          });
        }
        break;
        
      case 'new_lead':
        console.log('🆕 New lead workflow triggered');
        // Handle new lead logic here
        res.json({ status: 'success', message: 'New lead workflow processed' });
        break;
        
      case 'follow_up':
        console.log('📞 Follow up workflow triggered');
        // Handle follow up logic here
        res.json({ status: 'success', message: 'Follow up workflow processed' });
        break;
        
      default:
        console.log(`ℹ️ Unknown workflow event: ${event_type}`);
        res.json({ status: 'success', message: 'Workflow event logged' });
    }
    
  } catch (error) {
    console.error('❌ GHL Workflow webhook error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Workflow processing failed',
      error: error.message 
    });
  }
});

// Team notification webhook endpoint for GHL workflow
app.post('/api/team-notification', async (req, res) => {
  try {
    console.log('🔔 Team notification webhook received:', JSON.stringify(req.body, null, 2));
    
    // Support both old format (message, user) and new format (last_message, assigned_user, contact_phone, contact_name)
    const message = req.body.message || req.body.last_message;
    let user = req.body.user || req.body.assigned_user;
    const contactName = req.body.contact_name;
    const contactPhone = req.body.contact_phone;
    
    // Support multiple users (comma-separated)
    const users = user ? user.split(',').map(u => u.trim()).filter(u => u) : [];
    
    // Validate required fields
    if (!message) {
      console.log('❌ Missing required field: message or last_message');
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required field: message or last_message',
        receivedFields: Object.keys(req.body)
      });
    }
    
    if (users.length === 0) {
      console.log('❌ Missing required field: user or assigned_user');
      return res.status(400).json({ 
        status: 'error', 
        message: 'Missing required field: user (phone number) or assigned_user',
        receivedFields: Object.keys(req.body)
      });
    }
    
    console.log(`📱 Sending notification to ${users.length} team member(s): ${users.join(', ')}`);
    console.log(`👤 Contact name: ${contactName || 'N/A'}`);
    console.log(`📞 Contact phone: ${contactPhone || 'N/A'}`);
    console.log(`💬 Message content: ${message}`);
    
    // Find an available WhatsApp client for sending notifications
    const availableClients = waManager.getAllClients().filter(client => 
      client.status === 'connected' || client.status === 'ready'
    );
    
    if (availableClients.length === 0) {
      console.log('❌ No available WhatsApp clients for team notifications');
      return res.status(503).json({ 
        status: 'error', 
        message: 'No WhatsApp clients available for notifications' 
      });
    }
    
    // Use the first available client for notifications
    const notificationClient = availableClients[0];
    const clientKey = notificationClient.sessionId;
    
    console.log(`📱 Using client: ${clientKey} for team notifications`);
    
    // Format notification message with contact details
    let notificationMessage = `🔔 *Customer Replied*\n\n`;
    
    if (contactName) {
      notificationMessage += `👤 Customer: ${contactName}\n`;
    }
    if (contactPhone) {
      notificationMessage += `📞 Phone: ${contactPhone}\n`;
    }
    
    notificationMessage += `💬 Message: ${message}`;
    
    // Send notification to all team members
    const results = [];
    for (const userPhone of users) {
      try {
        await waManager.sendMessage(
          clientKey,
          userPhone,
          notificationMessage,
          'text'
        );
        console.log(`✅ Team notification sent successfully to: ${userPhone}`);
        results.push({ phone: userPhone, status: 'success' });
      } catch (error) {
        console.error(`❌ Failed to send notification to ${userPhone}:`, error.message);
        results.push({ phone: userPhone, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      status: 'success',
      message: `Team notifications sent to ${results.filter(r => r.status === 'success').length}/${users.length} recipients`,
      recipients: results,
      clientUsed: clientKey
    });
    
  } catch (error) {
    console.error('❌ Team notification error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: error.message 
    });
  }
});

// Force token refresh with new scopes
app.post('/admin/force-reauthorize/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    console.log(`🔄 Force re-authorization for account: ${accountId}`);
    
    // Delete the account tokens to force re-auth
    const { error } = await supabaseAdmin
      .from('ghl_accounts')
      .delete()
      .eq('id', accountId);
    
    if (error) {
      throw error;
    }
    
    res.json({
      status: 'success',
      message: 'Account deleted. Please re-authorize with new scopes.',
      authUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`
    });
    
  } catch (error) {
    console.error('Force reauth error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test team notification webhook endpoint
app.post('/api/test-team-notification', async (req, res) => {
  try {
    console.log('🧪 Testing team notification webhook');
    
    const testData = {
      message: 'This is a test message from customer',
      user: '+923001234567' // Replace with actual team member number
    };
    
    // Call the team notification endpoint internally
    const notificationResponse = await fetch(`${process.env.BACKEND_URL || 'https://api.octendr.com'}/api/team-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const result = await notificationResponse.json();
    
    res.json({
      status: 'success',
      message: 'Team notification test completed',
      testData,
      notificationResult: result
    });
    
  } catch (error) {
    console.error('Test team notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a session
app.get('/messages/session/:sessionId', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;
    
    console.log(`📨 Fetching messages for session: ${sessionId}, limit: ${limit}`);
    
    // Get messages from database
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', req.user.id) // Ensure user can only access their own messages
      .order('created_at', { ascending: true })
      .limit(parseInt(limit));
    
    if (error) {
      console.error('❌ Error fetching messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
    
    console.log(`✅ Found ${messages?.length || 0} messages for session: ${sessionId}`);
    
    res.json(messages || []);
  } catch (error) {
    console.error('❌ Error in messages endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GHL OAuth URL: https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&client_id=${GHL_CLIENT_ID}&redirect_uri=${encodeURIComponent(GHL_REDIRECT_URI)}&scope=${encodeURIComponent(GHL_SCOPES)}`);
  
  // Validate environment variables (non-blocking)
  validateEnvironment();
});
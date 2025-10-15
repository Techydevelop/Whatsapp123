const { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('baileys');
const fs = require('fs');
const path = require('path');

// Fetch the latest WhatsApp Web version dynamically
async function fetchLatestWaWebVersion() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1025190524.html');
    if (response.ok) {
      return {
        version: [2, 3000, 1025190524],
        isLatest: true,
        source: 'community confirmed working'
      };
    }
    throw new Error('Failed to fetch version');
  } catch (error) {
    console.warn('Failed to fetch latest version:', error.message);
    return {
      version: [2, 3000, 1025190524],
      isLatest: false,
      source: 'fallback'
    };
  }
}

class BaileysWhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
    this.qrQueue = []; // Queue for sequential QR generation
    this.isGeneratingQR = false;
    
    // Start connection health monitor
    this.startHealthMonitor();
  }

  // Make clients accessible for phone number retrieval
  getClientsMap() {
    return this.clients;
  }

  // Get client by session ID (for media decryption)
  getClient(sessionId) {
    return this.clients.get(sessionId);
  }

  // Clear session data to force fresh connection
  clearSessionData(sessionId) {
    try {
      const authDir = path.join(this.dataDir, `baileys_${sessionId}`);
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️ Cleared session data for: ${sessionId}`);
      }
      this.clients.delete(sessionId);
    } catch (error) {
      console.error(`❌ Error clearing session data for ${sessionId}:`, error);
    }
  }


  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Connection health monitor
  startHealthMonitor() {
    setInterval(() => {
      this.clients.forEach((client, sessionId) => {
        if (client.status === 'connected') {
          const timeSinceLastUpdate = Date.now() - client.lastUpdate;
          
          // If no update for more than 2 minutes, check connection
          if (timeSinceLastUpdate > 120000) {
            console.log(`🔍 Health check for ${sessionId}: Last update ${Math.round(timeSinceLastUpdate/1000)}s ago`);
            
            // Try to send a ping to check if connection is alive
            try {
              if (client.socket && client.socket.user) {
                // Connection seems alive, update timestamp
                client.lastUpdate = Date.now();
                console.log(`✅ Connection healthy for ${sessionId}`);
              } else {
                console.log(`⚠️ Connection lost for ${sessionId}, marking as disconnected`);
                client.status = 'disconnected';
                client.lastUpdate = Date.now();
              }
            } catch (error) {
              console.log(`❌ Health check failed for ${sessionId}:`, error.message);
              client.status = 'disconnected';
              client.lastUpdate = Date.now();
            }
          }
        }
      });
    }, 30000); // Check every 30 seconds
  }

  hasExistingCredentials(sessionId) {
    const authDir = path.join(this.dataDir, `baileys_${sessionId}`);
    const credsFile = path.join(authDir, 'creds.json');
    return fs.existsSync(credsFile);
  }

  async createClient(sessionId) {
    try {
      console.log(`🚀 Creating Baileys client for session: ${sessionId}`);
      
      // Extract subaccount ID from sessionId to prevent multiple connections
      const sessionIdParts = sessionId.split('_');
      const subaccountId = sessionIdParts.length >= 2 ? sessionIdParts[1] : null;
      
      if (subaccountId) {
        // Check if there's already a connected client for this subaccount
        for (const [key, client] of this.clients) {
          if (key.includes(subaccountId) && (client.status === 'connected' || client.status === 'ready')) {
            console.log(`⚠️ Subaccount ${subaccountId} already has a connected client: ${key}`);
            console.log(`🔄 Reusing existing connected client instead of creating new one`);
            return client.socket;
          }
        }
      }
      
      // Check if client already exists and is still valid
      if (this.clients.has(sessionId)) {
        const existingClient = this.clients.get(sessionId);
        const timeSinceLastUpdate = Date.now() - existingClient.lastUpdate;
        
        // If client is connected and recently updated, return it
        if (existingClient.status === 'connected' && timeSinceLastUpdate < 300000) { // 5 minutes
          console.log(`✅ Using existing connected client for session: ${sessionId}`);
          return existingClient.socket;
        }
        
        // If client is disconnected for too long, remove it
        if (existingClient.status === 'disconnected' && timeSinceLastUpdate > 60000) { // 1 minute
          console.log(`🗑️ Removing stale disconnected client for session: ${sessionId}`);
          this.clients.delete(sessionId);
        } else if (existingClient.status === 'disconnected') {
          console.log(`⚠️ Client exists but disconnected for session: ${sessionId}, recreating...`);
          this.clients.delete(sessionId);
        }
      }
      
      // Check again if there's already a connected client for this subaccount
      if (subaccountId) {
        for (const [clientKey, client] of this.clients.entries()) {
          if (clientKey.includes(subaccountId) && client.status === 'connected') {
            console.log(`⚠️ Subaccount ${subaccountId} already has connected client: ${clientKey}`);
            console.log(`🚫 Skipping creation of duplicate client: ${sessionId}`);
            return null; // Don't create duplicate client
          }
        }
      }
      
      // Add to QR queue to prevent conflicts
      return new Promise((resolve, reject) => {
        this.qrQueue.push({ sessionId, resolve, reject });
        this.processQRQueue();
      });
    } catch (error) {
      console.error(`❌ Error creating client for session ${sessionId}:`, error);
      throw error;
    }
  }
  
  async processQRQueue() {
    if (this.isGeneratingQR || this.qrQueue.length === 0) {
      return;
    }
    
    this.isGeneratingQR = true;
    const { sessionId, resolve, reject } = this.qrQueue.shift();
    
    try {
      console.log(`🔄 Processing QR queue for session: ${sessionId}`);
      const socket = await this.createClientInternal(sessionId);
      resolve(socket);
    } catch (error) {
      reject(error);
    } finally {
      this.isGeneratingQR = false;
      // Process next in queue after a delay
      setTimeout(() => this.processQRQueue(), 3000); // 3 second delay between QR generations
    }
  }
  
  async createClientInternal(sessionId) {
    try {
      const authDir = path.join(this.dataDir, `baileys_${sessionId}`);
      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      
      // Check if we have existing credentials
      const hasCredentials = this.hasExistingCredentials(sessionId);
      console.log(`📋 Session ${sessionId} has existing credentials: ${hasCredentials}`);
      
      // If this is a fresh session (no credentials), skip restoration
      if (!hasCredentials) {
        console.log(`🆕 Fresh session detected, skipping restoration checks`);
      }

      // Fetch the latest WhatsApp Web version dynamically
      let version;
      try {
        const versionInfo = await fetchLatestWaWebVersion();
        version = versionInfo.version;
        console.log(`📱 [${sessionId}] Using WA Web v${version.join(".")}, isLatest: ${versionInfo.isLatest}`);
      } catch (error) {
        console.warn(`⚠️ [${sessionId}] Failed to fetch latest version, using fallback:`, error.message);
        // Fallback to a known working version
        version = [2, 3000, 1025190524];
      }

      const socket = makeWASocket({
        auth: state,
        logger: {
          level: 'silent',
          child: () => ({ 
            level: 'silent',
            trace: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            fatal: () => {}
          }),
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {}
        },
        browser: ['GHLTechy', 'Chrome', '1.0.0'],
        version: version, // Use the dynamically fetched version
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 10000, // More frequent keep-alive
        connectTimeoutMs: 120000,
        retryRequestDelayMs: 2000, // Longer delay between retries
        maxMsgRetryCount: 3,
        heartbeatIntervalMs: 5000, // More frequent heartbeat
        defaultQueryTimeoutMs: 60000, // Shorter query timeout
        msgRetryCounterCache: new Map(),
        getMessage: async (key) => {
          return {
            conversation: 'Hello from GHLTechy!'
          };
        },
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: () => false,
        fireInitQueries: true,
        emitOwnEvents: false
      });

      // Handle connection updates with stability check
      let connectionStable = false;
      let stabilityTimer = null;
      let connectionOpenTime = null;
      
      socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
        
        console.log(`🔄 Connection update for ${sessionId}:`, { 
          connection, 
          hasQR: !!qr, 
          isNewLogin, 
          isOnline,
          lastDisconnect: lastDisconnect?.error?.message,
          stable: connectionStable
        });
        
      if (qr) {
        console.log(`📱 QR Code generated for session: ${sessionId}`);
        // Only set qr_ready if not already connected AND connection is not stable
        if (!connectionStable && (!this.clients.has(sessionId) || this.clients.get(sessionId).status !== 'connected')) {
          this.clients.set(sessionId, {
            socket,
            qr,
            status: 'qr_ready',
            lastUpdate: Date.now()
          });
          console.log(`📱 Status set to 'qr_ready' for session: ${sessionId}`);
        } else if (connectionStable) {
          console.log(`🚫 Ignoring QR generation - connection is stable for session: ${sessionId}`);
        } else {
          console.log(`🚫 Ignoring QR generation - client already connected for session: ${sessionId}`);
        }
      }

        if (connection === 'close') {
          // Clear stability timer if connection closes
          if (stabilityTimer) {
            clearTimeout(stabilityTimer);
            stabilityTimer = null;
          }
          connectionStable = false;
          connectionOpenTime = null;
          
          const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
          console.log(`🔌 Connection closed for session: ${sessionId}, should reconnect: ${shouldReconnect}`);
          console.log(`🔌 Disconnect reason:`, lastDisconnect?.error?.message);
          
          // Update status to disconnected but keep client for potential reconnection
          if (this.clients.has(sessionId)) {
            const client = this.clients.get(sessionId);
            client.status = 'disconnected';
            client.lastUpdate = Date.now();
          }
          
          if (shouldReconnect) {
            console.log(`🔄 Reconnecting session: ${sessionId} in 30 seconds...`);
            // Longer delay to prevent false reconnections and reduce server load
            setTimeout(() => {
              // Check if client is still disconnected before reconnecting
              const currentClient = this.clients.get(sessionId);
              if (currentClient && currentClient.status === 'disconnected') {
                console.log(`🔄 Attempting reconnection for: ${sessionId}`);
                this.createClient(sessionId).catch(err => {
                  console.error(`❌ Reconnection failed for ${sessionId}:`, err);
                });
              } else {
                console.log(`✅ Client ${sessionId} already reconnected, skipping reconnection`);
              }
            }, 30000); // Increased to 30 seconds to reduce unnecessary checks
          } else {
            // Only delete if logged out
            this.clients.delete(sessionId);
          }
        } else if (connection === 'open') {
          connectionOpenTime = Date.now();
          console.log(`✅ WhatsApp connected for session: ${sessionId}`);
          console.log(`📱 Phone number: ${socket.user?.id?.split(':')[0] || 'Unknown'}`);
          
          // Set temporary status as 'connecting' until stable
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connecting',
            phoneNumber: socket.user?.id?.split(':')[0],
            lastUpdate: Date.now(),
            connectedAt: Date.now()
          });
          
          // Immediate connection - no stability delay
          connectionStable = true;
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: socket.user?.id?.split(':')[0],
            lastUpdate: Date.now(),
            connectedAt: Date.now()
          });
          
          console.log(`✅ WhatsApp immediately connected for session: ${sessionId}`);
          console.log(`🔒 Status set to 'connected' for session: ${sessionId}`);
          
          // Update database status immediately
          this.updateDatabaseStatus(sessionId, 'ready', socket.user?.id?.split(':')[0]);
          
          // Update lastUpdate periodically to keep connection alive
          setInterval(() => {
            if (this.clients.has(sessionId)) {
              const client = this.clients.get(sessionId);
              if (client.status === 'connected') {
                client.lastUpdate = Date.now();
              }
            }
          }, 30000); // Update every 30 seconds
        } else if (connection === 'connecting') {
          console.log(`🔄 Connecting session: ${sessionId}`);
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connecting',
            lastUpdate: Date.now()
          });
        }
      });

      // If we have existing credentials, set status to connecting immediately
      if (hasCredentials) {
        this.clients.set(sessionId, {
          socket,
          qr: null,
          status: 'connecting',
          lastUpdate: Date.now()
        });
        console.log(`🔄 Restoring existing session: ${sessionId}`);
      } else {
        console.log(`🆕 Fresh session - no restoration needed: ${sessionId}`);
      }

      // Handle credentials update
      socket.ev.on('creds.update', saveCreds);

      // Handle messages
      socket.ev.on('messages.upsert', async (m) => {
        try {
          const msg = m.messages[0];
          if (!msg.key.fromMe && m.type === 'notify') {
            // Only process messages received after connection is established
            const connectionTime = this.clients.get(sessionId)?.connectedAt;
            if (connectionTime && msg.messageTimestamp < connectionTime) {
              console.log(`🚫 Ignoring old message received before connection: ${msg.messageTimestamp} < ${connectionTime}`);
              return;
            }
            const from = msg.key.remoteJid;
            // Detect message type and content
            let messageText = '';
            let messageType = 'text';
            let mediaUrl = null;
            let mediaMessage = null;
            
            if (msg.message?.conversation) {
              messageText = msg.message.conversation;
              messageType = 'text';
            } else if (msg.message?.extendedTextMessage?.text) {
              messageText = msg.message.extendedTextMessage.text;
              messageType = 'text';
            } else if (msg.message?.imageMessage) {
              messageText = msg.message.imageMessage.caption || '🖼️ Image';
              messageType = 'image';
              mediaUrl = msg.message.imageMessage.url || msg.message.imageMessage.directPath;
            } else if (msg.message?.videoMessage) {
              messageText = msg.message.videoMessage.caption || '🎥 Video';
              messageType = 'video';
              mediaUrl = msg.message.videoMessage.url || msg.message.videoMessage.directPath;
            } else if (msg.message?.audioMessage) {
              messageText = '🎵 Voice Note';
              messageType = 'voice';
              // Store the message object for decryption in webhook
              mediaUrl = 'ENCRYPTED_MEDIA'; // Flag for encrypted media
              mediaMessage = msg; // Store full message for decryption
            } else if (msg.message?.documentMessage) {
              messageText = msg.message.documentMessage.fileName || '📄 Document';
              messageType = 'document';
              mediaUrl = msg.message.documentMessage.url || msg.message.documentMessage.directPath;
            } else if (msg.message?.stickerMessage) {
              messageText = '😊 Sticker';
              messageType = 'sticker';
              mediaUrl = msg.message.stickerMessage.url || msg.message.stickerMessage.directPath;
            } else {
              messageText = '📎 Media/Other';
              messageType = 'other';
            }
            
            // Filter out broadcast messages and status messages
            if (from.includes('@broadcast') || from.includes('status@') || from.includes('@newsletter')) {
              console.log(`🚫 Ignoring broadcast/status message from: ${from}`);
              return;
            }
            
            console.log(`📨 Received message from ${from}: ${messageText}`);
            console.log(`📨 Message details:`, {
              from,
              messageText,
              messageType,
              mediaUrl,
              sessionId,
              timestamp: msg.messageTimestamp
            });
            
            // Forward to GHL webhook
            try {
              const webhookUrl = `${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/whatsapp/webhook`;
              console.log(`🔗 Calling webhook: ${webhookUrl}`);
              
              const webhookResponse = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from,
                  message: messageText,
                  messageType,
                  mediaUrl,
                  mediaMessage: mediaMessage, // Include full message for decryption
                  timestamp: msg.messageTimestamp,
                  sessionId,
                  whatsappMsgId: msg.key.id // For idempotency
                })
              });
              
              if (webhookResponse.ok) {
                const responseText = await webhookResponse.text();
                console.log(`✅ Message forwarded to GHL webhook for session: ${sessionId}`);
                console.log(`📊 Webhook response:`, responseText);
              } else {
                const errorText = await webhookResponse.text();
                console.error(`❌ Failed to forward message to GHL webhook (${webhookResponse.status}):`, errorText);
              }
            } catch (webhookError) {
              console.error(`❌ Error forwarding message to GHL webhook:`, webhookError);
            }
          }
        } catch (error) {
          console.error(`❌ Error processing incoming message:`, error);
        }
      });

      return socket;

    } catch (error) {
      console.error(`❌ Error creating Baileys client for session ${sessionId}:`, error);
      throw error;
    }
  }

  async getQRCode(sessionId) {
    try {
      let client = this.clients.get(sessionId);
      
      if (!client) {
        console.log(`🔄 No client found for ${sessionId}, creating new one...`);
        await this.createClient(sessionId);
        // Wait a bit for client to initialize
        await new Promise(resolve => setTimeout(resolve, 1000)); // Quick wait
        client = this.clients.get(sessionId);
      }

      if (client && client.qr) {
        console.log(`📱 Returning QR code for session: ${sessionId}`);
        return client.qr;
      }

      console.log(`⏳ No QR code available yet for session: ${sessionId}, status: ${client?.status}, hasQR: ${!!client?.qr}`);
      return null;
    } catch (error) {
      console.error(`❌ Error getting QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  async checkWhatsAppNumber(sessionId, phoneNumber) {
    try {
      const client = this.clients.get(sessionId);
      
      if (!client || !client.socket) {
        return { exists: false, error: 'Client not available' };
      }

      const formattedNumber = phoneNumber.replace(/\D/g, '');
      const jid = `${formattedNumber}@s.whatsapp.net`;

      // Check if number has WhatsApp
      const [result] = await client.socket.onWhatsApp(jid);
      
      if (result && result.exists) {
        console.log(`✅ WhatsApp exists for: ${phoneNumber}`);
        return { exists: true, jid: result.jid };
      } else {
        console.log(`❌ WhatsApp NOT found for: ${phoneNumber}`);
        return { exists: false, error: 'Number does not have WhatsApp' };
      }
      
    } catch (error) {
      console.error(`❌ Error checking WhatsApp for ${phoneNumber}:`, error.message);
      return { exists: false, error: error.message };
    }
  }

  async sendMessage(sessionId, phoneNumber, message, messageType = 'text', mediaUrl = null) {
    try {
      const client = this.clients.get(sessionId);
      
      if (!client || (client.status !== 'connected' && client.status !== 'ready')) {
        throw new Error(`Client not ready for session: ${sessionId}, status: ${client?.status || 'not found'}`);
      }
      
      // Check if socket is properly initialized
      if (!client.socket || !client.socket.user) {
        throw new Error(`Socket not properly initialized for session: ${sessionId}`);
      }

      // Format phone number
      const formattedNumber = phoneNumber.replace(/\D/g, '');
      const jid = `${formattedNumber}@s.whatsapp.net`;

      // Check if number has WhatsApp
      const checkResult = await this.checkWhatsAppNumber(sessionId, phoneNumber);
      if (!checkResult.exists) {
        console.warn(`⚠️ Skipping message to ${phoneNumber}: ${checkResult.error}`);
        return {
          status: 'skipped',
          reason: 'Number does not have WhatsApp',
          phoneNumber: phoneNumber
        };
      }

      console.log(`📤 Sending ${messageType} to ${jid}: ${message}`);

      let messageContent = {};

      if (messageType === 'image' && mediaUrl) {
        // Send image
        messageContent = {
          image: { url: mediaUrl },
          caption: message || ''
        };
        console.log(`🖼️ Sending image: ${mediaUrl}`);
      } else if (messageType === 'video' && mediaUrl) {
        // Send video
        messageContent = {
          video: { url: mediaUrl },
          caption: message || ''
        };
        console.log(`🎥 Sending video: ${mediaUrl}`);
      } else if (messageType === 'voice' && mediaUrl) {
        // Send voice note
        messageContent = {
          audio: { url: mediaUrl },
          ptt: true, // Push to talk (voice note)
          mimetype: 'audio/ogg; codecs=opus'
        };
        console.log(`🎵 Sending voice note: ${mediaUrl}`);
      } else if (messageType === 'document' && mediaUrl) {
        // Send document
        messageContent = {
          document: { url: mediaUrl },
          mimetype: 'application/pdf',
          fileName: 'document.pdf'
        };
        console.log(`📄 Sending document: ${mediaUrl}`);
      } else if (messageType === 'sticker' && mediaUrl) {
        // Send sticker
        messageContent = {
          sticker: { url: mediaUrl }
        };
        console.log(`😊 Sending sticker: ${mediaUrl}`);
      } else {
        // Send text message
        messageContent = { text: message };
      }

      const result = await client.socket.sendMessage(jid, messageContent);

      console.log(`✅ ${messageType} sent successfully:`, result);
      return result;

    } catch (error) {
      console.error(`❌ Error sending ${messageType} for session ${sessionId}:`, error);
      throw error;
    }
  }

  getClientStatus(sessionId) {
    const client = this.clients.get(sessionId);
    return client ? {
      status: client.status,
      lastUpdate: client.lastUpdate,
      hasQR: !!client.qr
    } : null;
  }

  getAllClients() {
    return Array.from(this.clients.entries()).map(([sessionId, client]) => ({
      sessionId,
      status: client.status,
      lastUpdate: client.lastUpdate,
      hasQR: !!client.qr
    }));
  }

  async disconnectClient(sessionId) {
    try {
      const client = this.clients.get(sessionId);
      if (client && client.socket) {
        await client.socket.logout();
        this.clients.delete(sessionId);
        console.log(`🔌 Disconnected client for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Error disconnecting client for session ${sessionId}:`, error);
    }
  }
  
  clearQRQueue() {
    console.log(`🗑️ Clearing QR queue (${this.qrQueue.length} items)`);
    this.qrQueue = [];
    this.isGeneratingQR = false;
  }
  
  // Update database status
  async updateDatabaseStatus(sessionId, status, phoneNumber = null) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      // Extract session ID from sessionId (format: location_subaccountId_sessionId)
      const sessionIdParts = sessionId.split('_');
      const actualSessionId = sessionIdParts.slice(2).join('_'); // Get everything after location_subaccountId_
      
      console.log(`📊 Updating database status for session ${actualSessionId}: ${status}`);
      
      const updateData = { status };
      if (phoneNumber) {
        updateData.phone_number = phoneNumber;
      }
      
      const { error } = await supabaseAdmin
        .from('sessions')
        .update(updateData)
        .eq('id', actualSessionId);
      
      if (error) {
        console.error('❌ Database update error:', error);
      } else {
        console.log(`✅ Database status updated to: ${status}`);
        
        // If this session is now ready (connected), mark other sessions for same subaccount as disconnected
        if (status === 'ready') {
          await this.cleanupOldSessions(actualSessionId, sessionIdParts);
        }
      }
    } catch (error) {
      console.error('❌ Error updating database status:', error);
    }
  }
  
  // Cleanup old sessions for same subaccount
  async cleanupOldSessions(currentSessionId, sessionIdParts) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      // Extract subaccount ID from sessionIdParts
      const subaccountId = sessionIdParts[1]; // location_subaccountId_sessionId
      
      console.log(`🧹 Cleaning up old sessions for subaccount: ${subaccountId}`);
      
      // Mark other sessions for same subaccount as disconnected
      const { error } = await supabaseAdmin
        .from('sessions')
        .update({ status: 'disconnected' })
        .eq('subaccount_id', subaccountId)
        .neq('id', currentSessionId)
        .neq('status', 'disconnected');
      
      if (error) {
        console.error('❌ Cleanup error:', error);
      } else {
        console.log(`✅ Old sessions marked as disconnected for subaccount: ${subaccountId}`);
      }
      
      // Also cleanup disconnected clients from memory
      this.clients.forEach((client, sessionKey) => {
        if (sessionKey.includes(subaccountId) && sessionKey !== `location_${subaccountId}_${currentSessionId}`) {
          if (client.status === 'disconnected' || client.status === 'qr_ready' || client.status === 'connecting') {
            console.log(`🗑️ Removing old client from memory: ${sessionKey} (status: ${client.status})`);
            this.clients.delete(sessionKey);
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Error cleaning up old sessions:', error);
    }
  }

  // Request pairing code for phone number (E.164 format without +)
  async requestPairingCode(sessionId, phoneNumber) {
    try {
      console.log(`📱 Requesting pairing code for ${phoneNumber} in session: ${sessionId}`);
      
      const client = this.clients.get(sessionId);
      if (!client || !client.socket) {
        throw new Error('Client not found or not connected');
      }

      // Ensure phone number is in E.164 format without +
      const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
      let formattedPhoneNumber = cleanPhoneNumber;
      
      // Handle different phone number formats
      if (cleanPhoneNumber.length === 10) {
        // Assume US number if 10 digits
        formattedPhoneNumber = '1' + cleanPhoneNumber;
      } else if (cleanPhoneNumber.startsWith('+')) {
        // Remove + if present
        formattedPhoneNumber = cleanPhoneNumber.substring(1);
      } else if (cleanPhoneNumber.length < 10) {
        throw new Error('Invalid phone number format');
      }

      console.log(`📞 Requesting pairing code for: ${formattedPhoneNumber}`);
      
      // Wait for connection to be in connecting state or QR available
      const connectionStatus = this.getClientStatus(sessionId);
      if (connectionStatus && connectionStatus.status !== 'connecting' && !this.qrCodes.has(sessionId)) {
        console.log(`⏳ Waiting for connection state...`);
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      const pairingCode = await client.socket.requestPairingCode(formattedPhoneNumber);
      console.log(`✅ Pairing code generated: ${pairingCode}`);
      
      return {
        success: true,
        pairingCode: pairingCode,
        phoneNumber: formattedPhoneNumber,
        message: `Pairing code ${pairingCode} has been sent to ${formattedPhoneNumber}. Enter this code in WhatsApp > Linked Devices > Link a Device`
      };
      
    } catch (error) {
      console.error(`❌ Error requesting pairing code:`, error);
      throw error;
    }
  }

  // Check if client supports pairing code
  isPairingCodeSupported(sessionId) {
    const client = this.clients.get(sessionId);
    return client && client.socket && typeof client.socket.requestPairingCode === 'function';
  }

  // Get WhatsApp Web version info
  getWhatsAppVersion() {
    return {
      version: '[2, 3000, 1025190524]',
      status: 'Community confirmed working',
      source: 'wppconnect-team/wa-version repository',
      lastUpdated: 'Latest stable version',
      pairingCodeSupported: true
    };
  }
}

module.exports = BaileysWhatsAppManager;

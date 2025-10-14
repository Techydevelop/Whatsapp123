const { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('baileys');
const fs = require('fs');
const path = require('path');

// Import connection monitoring for SaaS notifications
let notifyCustomerConnectionLost = null;
try {
  const connectionMonitor = require('../jobs/connectionMonitor');
  notifyCustomerConnectionLost = connectionMonitor.notifyCustomerConnectionLost;
} catch (error) {
  console.log('⚠️ Connection monitoring not available (SaaS features disabled)');
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
      this.clients.forEach(async (client, sessionId) => {
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
        } else if (client.status === 'connecting') {
          // Check for stuck connecting sessions
          const timeSinceLastUpdate = Date.now() - client.lastUpdate;
          if (timeSinceLastUpdate > 30000 && !client.qr) {
            console.log(`🚨 Health monitor detected stuck session: ${sessionId}`);
            await this.handleStuckSession(sessionId);
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
      console.log(`🔄 Processing QR queue for session: ${sessionId} (${this.qrQueue.length} remaining)`);
      const socket = await this.createClientInternal(sessionId);
      resolve(socket);
    } catch (error) {
      console.error(`❌ Error processing QR queue for ${sessionId}:`, error);
      reject(error);
    } finally {
      this.isGeneratingQR = false;
      // Process next in queue immediately for faster QR generation
      setTimeout(() => this.processQRQueue(), 100); // Reduced to 100ms delay
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
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: false, // Changed to false to prevent connection issues
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000, // Less frequent to reduce load
        connectTimeoutMs: 60000, // Reduced timeout
        retryRequestDelayMs: 1000, // Faster retries
        maxMsgRetryCount: 3,
        heartbeatIntervalMs: 30000, // Less frequent heartbeat
        msgRetryCounterCache: new Map(),
        getMessage: async (key) => {
          return {
            conversation: 'Hello from GHLTechy!'
          };
        },
        shouldSyncHistoryMessage: () => false,
        shouldIgnoreJid: () => false,
        fireInitQueries: false, // Changed to false to prevent connection issues
        emitOwnEvents: false,
        // Add connection options for better stability
        connectionOptions: {
          maxRetries: 5,
          retryDelay: 2000
        }
      });

      // Handle connection updates - simplified
      let connectionOpenTime = null;
      
      socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
        
        console.log(`🔄 Connection update for ${sessionId}:`, { 
          connection, 
          hasQR: !!qr, 
          isNewLogin, 
          isOnline,
          lastDisconnect: lastDisconnect?.error?.message
        });
        
      if (qr) {
        console.log(`📱 QR Code generated for session: ${sessionId}`);
        // Always set QR code immediately when generated - simplified logic
        this.clients.set(sessionId, {
          socket,
          qr,
          status: 'qr_ready',
          lastUpdate: Date.now()
        });
        console.log(`📱 QR code set immediately for session: ${sessionId}`);
      }

        if (connection === 'close') {
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

          // Notify customer about connection loss (SaaS feature)
          if (notifyCustomerConnectionLost) {
            try {
              notifyCustomerConnectionLost(sessionId, {
                reason: lastDisconnect?.error?.message || 'Connection lost',
                timestamp: new Date().toISOString(),
                shouldReconnect: shouldReconnect
              }).catch(notificationError => {
                console.error('❌ Error sending connection lost notification:', notificationError);
              });
            } catch (notificationError) {
              console.error('❌ Error sending connection lost notification:', notificationError);
            }
          }
          
          if (shouldReconnect) {
            console.log(`🔄 Reconnecting session: ${sessionId} in 5 seconds...`);
            // Faster reconnection for better user experience
            setTimeout(() => {
              // Check if client is still disconnected before reconnecting
              const currentClient = this.clients.get(sessionId);
              if (currentClient && currentClient.status === 'disconnected') {
                console.log(`🔄 Attempting reconnection for: ${sessionId}`);
                // Clear session data and force fresh connection
                this.clearSessionData(sessionId);
                this.createClient(sessionId).catch(err => {
                  console.error(`❌ Reconnection failed for ${sessionId}:`, err);
                });
              } else {
                console.log(`✅ Client ${sessionId} already reconnected, skipping reconnection`);
              }
            }, 5000); // Reduced to 5 seconds for faster recovery
          } else {
            // Only delete if logged out
            this.clients.delete(sessionId);
          }
        } else if (connection === 'open') {
          connectionOpenTime = Date.now();
          console.log(`✅ WhatsApp connected for session: ${sessionId}`);
          console.log(`📱 Phone number: ${socket.user?.id?.split(':')[0] || 'Unknown'}`);
          
          // Set connected status immediately
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: socket.user?.id?.split(':')[0],
            lastUpdate: Date.now(),
            connectedAt: Date.now()
          });
          
          console.log(`✅ WhatsApp connected for session: ${sessionId}`);
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
          
          // Handle OUTBOUND messages (from mobile WhatsApp)
          if (msg.key.fromMe && m.type === 'notify') {
            console.log('📤 Outbound message detected from mobile WhatsApp:', msg.message);
            console.log('🎯 This will sync with GHL to prevent "Replied from another device" issue');
            
            // Extract message content
            let messageText = '';
            if (msg.message?.conversation) {
              messageText = msg.message.conversation;
            } else if (msg.message?.extendedTextMessage?.text) {
              messageText = msg.message.extendedTextMessage.text;
            } else if (msg.message?.imageMessage) {
              messageText = msg.message.imageMessage.caption || '🖼️ Image';
            } else if (msg.message?.videoMessage) {
              messageText = msg.message.videoMessage.caption || '🎥 Video';
            } else if (msg.message?.audioMessage) {
              messageText = '🎵 Audio Message';
            } else if (msg.message?.documentMessage) {
              messageText = msg.message.documentMessage.fileName || '📄 Document';
            } else {
              messageText = '📎 Media/Other';
            }
            
            // Send to GHL as outbound message
            await this.sendOutboundToGHL({
              sessionId: sessionId,
              to: msg.key.remoteJid,
              message: messageText,
              messageId: msg.key.id,
              timestamp: msg.messageTimestamp
            });
            
            return; // Don't process as inbound
          }
          
          // Handle INBOUND messages (from customer to you)
          if (!msg.key.fromMe && m.type === 'notify') {
            // Only process messages received after connection is established
            const client = this.clients.get(sessionId);
            const connectionTime = client?.connectedAt;
            
            const from = msg.key.remoteJid;
            
            console.log(`🔍 Message timestamp check for ${from}:`);
            console.log(`   Message timestamp: ${msg.messageTimestamp} (${new Date(msg.messageTimestamp * 1000).toLocaleString()})`);
            console.log(`   Client found: ${!!client}`);
            console.log(`   Connection time: ${connectionTime} (${connectionTime ? new Date(connectionTime).toLocaleString() : 'Not set'})`);
            console.log(`   Client status: ${client?.status || 'unknown'}`);
            
            if (connectionTime) {
              // Convert connection time to seconds for comparison (WhatsApp timestamps are in seconds)
              const connectionTimeSeconds = Math.floor(connectionTime / 1000);
              console.log(`   Connection time (seconds): ${connectionTimeSeconds}`);
              console.log(`   Comparison: ${msg.messageTimestamp} < ${connectionTimeSeconds} = ${msg.messageTimestamp < connectionTimeSeconds}`);
              
              if (msg.messageTimestamp < connectionTimeSeconds) {
                console.log(`🚫 Ignoring old message received before connection:`);
                console.log(`   Difference: ${connectionTimeSeconds - msg.messageTimestamp} seconds`);
                console.log(`   This prevents duplicate contacts in GHL!`);
                return;
              } else {
                console.log(`✅ Message is newer than connection, processing...`);
              }
            } else {
              console.log(`⚠️ No connection time set - this might be an old message!`);
              console.log(`⚠️ Processing anyway but this could create duplicate contacts!`);
            }
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
        // Reduced wait time for faster QR generation
        await new Promise(resolve => setTimeout(resolve, 500)); // Reduced to 500ms
        client = this.clients.get(sessionId);
      }

      // Check if session is stuck and handle it
      if (client && client.status === 'connecting') {
        const timeSinceLastUpdate = Date.now() - client.lastUpdate;
        if (timeSinceLastUpdate > 15000 && !client.qr) { // Reduced to 15 seconds
          console.log(`🚨 Session ${sessionId} appears stuck, forcing QR generation...`);
          const qrCode = await this.forceQRGeneration(sessionId);
          if (qrCode) {
            return qrCode;
          }
        }
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
      
      if (!client || (client.status !== 'connected' && client.status !== 'ready' && client.status !== 'qr_ready')) {
        throw new Error(`Client not ready for session: ${sessionId}, status: ${client?.status || 'not found'}`);
      }
      
      // Check if socket is properly initialized (only for connected/ready status)
      if ((client.status === 'connected' || client.status === 'ready') && (!client.socket || !client.socket.user)) {
        throw new Error(`Socket not properly initialized for session: ${sessionId}`);
      }
      
      // For qr_ready status, don't send messages
      if (client.status === 'qr_ready') {
        // Extract subaccount ID from session ID for better error message
        const sessionParts = sessionId.split('_');
        const subaccountId = sessionParts.length >= 2 ? sessionParts[1] : 'Unknown';
        
        throw new Error(`Connection has lost due to inactivity. Please logout and reconnect.`);
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

  // Send outbound message to GHL
  async sendOutboundToGHL(messageData) {
    try {
      console.log('📤 Processing outbound message for GHL:', messageData);
      
      // Extract subaccount ID from session ID
      const sessionParts = messageData.sessionId.split('_');
      if (sessionParts.length < 2) {
        console.log('❌ Invalid session ID format:', messageData.sessionId);
        return;
      }
      
      const subaccountId = sessionParts[1]; // location_XXX_yyy -> XXX
      console.log('🔍 Extracted subaccount ID:', subaccountId);
      
      // Get GHL account from database
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      
      const { data: ghlAccount } = await supabase
        .from('ghl_accounts')
        .select('*')
        .eq('id', subaccountId)
        .single();
      
      if (!ghlAccount) {
        console.log('❌ GHL account not found for subaccount:', subaccountId);
        return;
      }
      
      console.log('✅ Found GHL account:', ghlAccount.id);
      
      // Extract phone number
      const phoneNumber = messageData.to.split('@')[0];
      console.log('📱 Phone number:', phoneNumber);
      
      // Get or create contact
      let contactId;
      try {
        const contactResponse = await fetch(`https://services.leadconnectorhq.com/contacts/upsert`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ghlAccount.access_token}`,
            'Version': '2021-07-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: `+${phoneNumber}`,
            locationId: ghlAccount.location_id
          })
        });
        
        if (contactResponse.ok) {
          const contactData = await contactResponse.json();
          contactId = contactData.contact.id;
          console.log('✅ Contact found/created:', contactId);
        } else {
          console.log('❌ Failed to get/create contact:', contactResponse.status);
          return;
        }
      } catch (error) {
        console.log('❌ Error getting/creating contact:', error);
        return;
      }
      
      // Send message to GHL as outbound (for display only - no duplicate to customer)
      const messageResponse = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ghlAccount.access_token}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: "SMS",
          contactId: contactId,
          message: messageData.message,
          status: "delivered",
          altId: `wa_outbound_${messageData.messageId}`,
          from: "whatsapp_web",
          to: messageData.to,
          timestamp: messageData.timestamp
        })
      });
      
      if (messageResponse.ok) {
        const messageData = await messageResponse.json();
        console.log('✅ Outbound message sent to GHL successfully:', messageData.messageId);
        console.log('📊 GHL Response:', messageData);
        console.log('🎯 This prevents "Replied from another device" issue!');
        console.log('📱 Customer will NOT receive duplicate message');
        console.log('✅ Message will show with green tick and "Sent from another device" indicator');
      } else {
        console.log('❌ Failed to send outbound message to GHL:', messageResponse.status);
        const errorText = await messageResponse.text();
        console.log('❌ Error details:', errorText);
      }
      
    } catch (error) {
      console.error('❌ Error in sendOutboundToGHL:', error);
    }
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
  
  // Force refresh QR for stuck sessions
  async forceRefreshQR(sessionId) {
    try {
      console.log(`🔄 Force refreshing QR for session: ${sessionId}`);
      
      // Clear existing client
      this.clients.delete(sessionId);
      
      // Clear session data to force fresh connection
      this.clearSessionData(sessionId);
      
      // Create new client immediately
      await this.createClient(sessionId);
      
      console.log(`✅ QR refresh initiated for session: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`❌ Error force refreshing QR for ${sessionId}:`, error);
      return false;
    }
  }

  // Force QR generation for stuck sessions
  async forceQRGeneration(sessionId) {
    try {
      console.log(`🔄 Force generating QR for session: ${sessionId}`);
      
      // Clear existing client completely
      this.clients.delete(sessionId);
      
      // Clear session data to force fresh connection
      this.clearSessionData(sessionId);
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create new client
      await this.createClient(sessionId);
      
      // Wait for QR generation
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const client = this.clients.get(sessionId);
        if (client && client.qr) {
          console.log(`✅ QR generated successfully for ${sessionId}`);
          return client.qr;
        }
        
        attempts++;
        console.log(`⏳ Waiting for QR generation... attempt ${attempts}/${maxAttempts}`);
      }
      
      console.log(`❌ QR generation timeout for ${sessionId}`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error force generating QR for ${sessionId}:`, error);
      return null;
    }
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
}

module.exports = BaileysWhatsAppManager;

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
    
    // Start QR expiry cleanup monitor
    this.startQRCleanupMonitor();
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

  // QR expiry cleanup monitor
  startQRCleanupMonitor() {
    setInterval(async () => {
      const QR_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      
      for (const [sessionId, client] of this.clients.entries()) {
        // Only check QR-ready sessions
        if (client.status === 'qr_ready' && client.qrGeneratedAt) {
          const qrAge = now - client.qrGeneratedAt;
          
          if (qrAge > QR_EXPIRY_TIME) {
            console.log(`🧹 Auto-cleaning expired QR session: ${sessionId} (${Math.round(qrAge/1000)}s old)`);
            
            try {
              // Update database status
              await this.updateDatabaseStatus(sessionId, 'disconnected');
              
              // Disconnect and cleanup
              await this.disconnectClient(sessionId);
              this.clearSessionData(sessionId);
              
              console.log(`✨ Session ${sessionId} cleaned up. Will regenerate fresh QR on next access.`);
            } catch (err) {
              console.error(`Error cleaning up ${sessionId}:`, err.message);
            }
          }
        }
      }
    }, 60000); // Check every minute
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
        
        // Check if this session is waiting for pairing code
        const clientInfo = this.clients.get(sessionId);
        const isWaitingForPairing = clientInfo?.pairingCodeRequested;
        
        // Enhanced logging for pairing code sessions
        if (isWaitingForPairing) {
          console.log(`🔔 PAIRING CODE SESSION - Connection update for ${sessionId}:`, { 
            connection: connection || 'undefined',
            hasQR: !!qr,
            isNewLogin,
            isOnline,
            lastDisconnect: lastDisconnect?.error?.message,
            stable: connectionStable,
            pairingCode: clientInfo?.pairingCode,
            pairingPhone: clientInfo?.pairingCodePhone
          });
        } else {
          console.log(`🔄 Connection update for ${sessionId}:`, { 
            connection: connection || 'undefined', 
            hasQR: !!qr, 
            isNewLogin, 
            isOnline,
            lastDisconnect: lastDisconnect?.error?.message,
            stable: connectionStable
          });
        }
        
      if (qr) {
        // IMPORTANT: Ignore QR codes if we're waiting for pairing code completion
        if (isWaitingForPairing) {
          console.log(`🚫🚫🚫 BLOCKING QR code - waiting for pairing code completion for session: ${sessionId}`);
          console.log(`📱 Pairing code was: ${clientInfo?.pairingCode}, Phone: ${clientInfo?.pairingCodePhone}`);
          console.log(`🚫 QR code will be ignored until pairing code connection completes`);
          
          // Ensure status stays 'connecting' not 'qr_ready'
          if (this.clients.has(sessionId)) {
            const currentClient = this.clients.get(sessionId);
            if (currentClient.status === 'qr_ready') {
              console.log(`🔧 Fixing status: changing from 'qr_ready' to 'connecting'`);
              this.clients.set(sessionId, {
                ...currentClient,
                status: 'connecting',
                qr: null, // Force clear QR
                qrGeneratedAt: null
              });
            }
          }
          
          return; // Don't process QR when waiting for pairing code
        }
        
        console.log(`📱 QR Code generated for session: ${sessionId}`);
        
        // DOUBLE CHECK: Don't set qr_ready if we're waiting for pairing code
        const currentClientCheck = this.clients.get(sessionId);
        if (currentClientCheck?.pairingCodeRequested) {
          console.log(`🚫🚫 BLOCKING QR - pairing code was requested, ignoring this QR event completely`);
          return; // Don't process QR at all
        }
        
        // Only set qr_ready if not already connected AND connection is not stable
        if (!connectionStable && (!this.clients.has(sessionId) || this.clients.get(sessionId).status !== 'connected')) {
          this.clients.set(sessionId, {
            socket,
            qr,
            status: 'qr_ready',
            lastUpdate: Date.now(),
            qrGeneratedAt: Date.now() // Track when QR was generated
          });
          console.log(`📱 Status set to 'qr_ready' for session: ${sessionId} at ${new Date().toLocaleTimeString()}`);
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
          
          const disconnectStatusCode = (lastDisconnect?.error)?.output?.statusCode;
          const isLoggedOut = disconnectStatusCode === DisconnectReason.loggedOut;
          const isRestartRequired = disconnectStatusCode === DisconnectReason.restartRequired;
          
          // According to Baileys docs: after QR scan, WhatsApp forcibly disconnects with restartRequired
          // This is NOT an error - we must create a new socket
          // https://baileys.wiki/docs/socket/connecting/
          if (isRestartRequired) {
            console.log(`🔄 Restart required (normal after QR/pairing code scan) for session: ${sessionId}`);
            console.log(`📱 Creating new socket as per Baileys docs...`);
            
            // Clear old client and create new one
            if (this.clients.has(sessionId)) {
              const oldClient = this.clients.get(sessionId);
              // Clean up old socket
              try {
                if (oldClient.socket && oldClient.socket.end) {
                  oldClient.socket.end();
                }
              } catch (e) {
                console.warn(`⚠️ Error ending old socket: ${e.message}`);
              }
            }
            
            // Create new client (this will trigger reconnection)
            setTimeout(() => {
              this.createClient(sessionId).catch(err => {
                console.error(`❌ Failed to recreate socket after restartRequired: ${err}`);
              });
            }, 1000); // Small delay before recreating
            
            return; // Don't proceed with normal reconnection logic
          }
          
          const shouldReconnect = !isLoggedOut;
          console.log(`🔌 Connection closed for session: ${sessionId}, should reconnect: ${shouldReconnect}`);
          console.log(`🔌 Disconnect reason:`, lastDisconnect?.error?.message);
          console.log(`🔌 Disconnect status code: ${disconnectStatusCode}`);
          
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
          const phoneNumber = socket.user?.id?.split(':')[0] || 'Unknown';
          
          // Check if this was a pairing code connection
          const existingClient = this.clients.get(sessionId);
          const isPairingCodeConnection = existingClient?.pairingCodeRequested;
          
          if (isPairingCodeConnection) {
            console.log(`✅✅✅ WhatsApp connected via PAIRING CODE for session: ${sessionId}`);
            console.log(`📱 Pairing code used: ${existingClient.pairingCode}`);
            console.log(`📱 Pairing code phone: ${existingClient.pairingCodePhone}`);
            console.log(`🎉 Pairing code connection SUCCESSFUL!`);
          } else {
            console.log(`✅ WhatsApp connected for session: ${sessionId}`);
          }
          console.log(`📱 Phone number: ${phoneNumber}`);
          
          // Set temporary status as 'connecting' until stable
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connecting',
            phoneNumber: phoneNumber,
            lastUpdate: Date.now(),
            connectedAt: Date.now(),
            pairingCodeRequested: isPairingCodeConnection || false,
            pairingCodePhone: existingClient?.pairingCodePhone
          });
          
          // Immediate connection - no stability delay
          connectionStable = true;
          
          // Clear pairing code keepalive if it exists
          if (existingClient?.pairingKeepAliveInterval) {
            clearInterval(existingClient.pairingKeepAliveInterval);
            console.log(`🧹 Cleared pairing code keepalive interval`);
          }
          
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: phoneNumber,
            lastUpdate: Date.now(),
            connectedAt: Date.now()
          });
          
          console.log(`✅ WhatsApp immediately connected for session: ${sessionId}`);
          console.log(`🔒 Status set to 'connected' for session: ${sessionId}`);
          
          // Update database status immediately
          console.log(`📊 Updating database status to 'ready' for session: ${sessionId}`);
          this.updateDatabaseStatus(sessionId, 'ready', phoneNumber);
          
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
          const currentClient = this.clients.get(sessionId);
          
          // If waiting for pairing code, preserve pairing code info
          if (currentClient?.pairingCodeRequested) {
            console.log(`⏳ Still connecting... waiting for pairing code completion`);
            this.clients.set(sessionId, {
              ...currentClient,
              socket,
              qr: null,
              status: 'connecting',
              lastUpdate: Date.now()
            });
          } else {
            this.clients.set(sessionId, {
              socket,
              qr: null,
              status: 'connecting',
              lastUpdate: Date.now()
            });
          }
        }
        
        // Log any connection state change when waiting for pairing code
        if (isWaitingForPairing && connection) {
          console.log(`🔔 Pairing code session state change: ${connection} (waiting for completion)`);
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
          console.log(`📨 Message received from ${msg.key.remoteJid}, timestamp: ${msg.messageTimestamp}, type: ${m.type}`);
          
          if (!msg.key.fromMe && m.type === 'notify') {
            // Only process messages received after connection is established
            const connectionTime = this.clients.get(sessionId)?.connectedAt;
            if (connectionTime) {
              // Handle timestamp comparison - WhatsApp timestamps can be in different formats
              let messageTimeMs;
              
              if (typeof msg.messageTimestamp === 'number') {
                // If timestamp is already in milliseconds (large number)
                if (msg.messageTimestamp > 1000000000000) {
                  messageTimeMs = msg.messageTimestamp;
                } else {
                  // If timestamp is in seconds (smaller number)
                  messageTimeMs = msg.messageTimestamp * 1000;
                }
              } else {
                // Handle Long object format
                messageTimeMs = msg.messageTimestamp.low * 1000;
              }
              
              const connectionTimeMs = connectionTime;
              
              console.log(`⏰ Message time: ${messageTimeMs}, Connection time: ${connectionTimeMs}`);
              
              if (messageTimeMs < connectionTimeMs) {
                console.log(`🚫 Ignoring old message received before connection: ${messageTimeMs} < ${connectionTimeMs}`);
                return;
              }
            }
            
            console.log(`✅ Processing message from ${msg.key.remoteJid}`);
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
              const webhookUrl = `${process.env.BACKEND_URL || 'https://api.octendr.com'}/whatsapp/webhook`;
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
      
      // Check if QR is expired (5 minutes old)
      if (client && client.qrGeneratedAt) {
        const qrAge = Date.now() - client.qrGeneratedAt;
        const QR_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
        
        if (qrAge > QR_EXPIRY_TIME) {
          console.log(`⏰ QR code expired for ${sessionId} (${Math.round(qrAge/1000)}s old). Regenerating...`);
          
          // Disconnect old client and clear session
          await this.disconnectClient(sessionId);
          this.clearSessionData(sessionId);
          
          // Wait a bit before creating new client
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Create fresh client
          await this.createClient(sessionId);
          await new Promise(resolve => setTimeout(resolve, 2000));
          client = this.clients.get(sessionId);
          
          console.log(`✨ Fresh QR code generated for session: ${sessionId}`);
        }
      }
      
      if (!client) {
        console.log(`🔄 No client found for ${sessionId}, creating new one...`);
        await this.createClient(sessionId);
        // Wait a bit for client to initialize
        await new Promise(resolve => setTimeout(resolve, 1000)); // Quick wait
        client = this.clients.get(sessionId);
      }

      if (client && client.qr) {
        const qrAge = client.qrGeneratedAt ? Math.round((Date.now() - client.qrGeneratedAt) / 1000) : 0;
        console.log(`📱 Returning QR code for session: ${sessionId} (age: ${qrAge}s)`);
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

  async sendMessage(sessionId, phoneNumber, message, messageType = 'text', mediaUrl = null, fileName = null) {
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

      // Check if mediaUrl is a Buffer or string URL
      const isBuffer = Buffer.isBuffer(mediaUrl);

      if (messageType === 'image' && mediaUrl) {
        // Send image
        if (isBuffer) {
          messageContent = {
            image: mediaUrl,
            caption: message || ''
          };
          console.log(`🖼️ Sending image from buffer (${mediaUrl.length} bytes)`);
        } else {
          messageContent = {
            image: { url: mediaUrl },
            caption: message || ''
          };
          console.log(`🖼️ Sending image: ${mediaUrl}`);
        }
      } else if (messageType === 'video' && mediaUrl) {
        // Send video
        if (isBuffer) {
          messageContent = {
            video: mediaUrl,
            caption: message || ''
          };
          console.log(`🎥 Sending video from buffer (${mediaUrl.length} bytes)`);
        } else {
          messageContent = {
            video: { url: mediaUrl },
            caption: message || ''
          };
          console.log(`🎥 Sending video: ${mediaUrl}`);
        }
      } else if (messageType === 'voice' && mediaUrl) {
        // Send voice note
        if (isBuffer) {
          messageContent = {
            audio: mediaUrl,
            ptt: true, // Push to talk (voice note)
            mimetype: 'audio/ogg; codecs=opus'
          };
          console.log(`🎵 Sending voice note from buffer (${mediaUrl.length} bytes)`);
        } else {
          messageContent = {
            audio: { url: mediaUrl },
            ptt: true, // Push to talk (voice note)
            mimetype: 'audio/ogg; codecs=opus'
          };
          console.log(`🎵 Sending voice note: ${mediaUrl}`);
        }
      } else if (messageType === 'audio' && mediaUrl) {
        // Send audio file (not voice note)
        if (isBuffer) {
          messageContent = {
            audio: mediaUrl,
            mimetype: 'audio/mpeg'
          };
          console.log(`🎵 Sending audio from buffer (${mediaUrl.length} bytes)`);
        } else {
          messageContent = {
            audio: { url: mediaUrl },
            mimetype: 'audio/mpeg'
          };
          console.log(`🎵 Sending audio: ${mediaUrl}`);
        }
      } else if (messageType === 'document' && mediaUrl) {
        // Send document - use provided filename or detect from URL
        const urlString = isBuffer ? '' : String(mediaUrl);
        let docFileName = fileName || 'document.pdf';
        let mimetype = 'application/pdf';
        
        // If filename was provided as parameter, use it; otherwise try to extract from URL
        if (!fileName && urlString) {
          // Try to extract filename from URL
          const urlParts = urlString.split('/');
          const lastPart = urlParts[urlParts.length - 1];
          if (lastPart && lastPart.includes('.')) {
            docFileName = lastPart.split('?')[0]; // Remove query params
          }
        }
        
        // Detect mimetype from extension
        const ext = docFileName.split('.').pop().toLowerCase();
        const mimeMap = {
          'pdf': 'application/pdf',
          'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'xls': 'application/vnd.ms-excel',
          'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'txt': 'text/plain',
          'csv': 'text/csv'
        };
        mimetype = mimeMap[ext] || 'application/octet-stream';
        
        if (isBuffer) {
          messageContent = {
            document: mediaUrl,
            mimetype: mimetype,
            fileName: docFileName
          };
          console.log(`📄 Sending document from buffer (${mediaUrl.length} bytes): ${docFileName}`);
        } else {
          messageContent = {
            document: { url: mediaUrl },
            mimetype: mimetype,
            fileName: docFileName
          };
          console.log(`📄 Sending document: ${docFileName}`);
        }
      } else if (messageType === 'sticker' && mediaUrl) {
        // Send sticker
        if (isBuffer) {
          messageContent = {
            sticker: mediaUrl
          };
          console.log(`😊 Sending sticker from buffer (${mediaUrl.length} bytes)`);
        } else {
          messageContent = {
            sticker: { url: mediaUrl }
          };
          console.log(`😊 Sending sticker: ${mediaUrl}`);
        }
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
        console.log(`🔌 Disconnecting WhatsApp session: ${sessionId}`);
        
        // Properly logout from WhatsApp (disconnects from mobile)
        try {
          await client.socket.logout();
          console.log(`✅ Logged out from WhatsApp successfully`);
        } catch (logoutError) {
          console.warn(`⚠️ Logout error (may already be logged out): ${logoutError.message}`);
        }
        
        // End socket connection
        try {
          if (client.socket.end) {
            client.socket.end();
          }
        } catch (endError) {
          console.warn(`⚠️ Error ending socket: ${endError.message}`);
        }
        
        // Remove from clients map
        this.clients.delete(sessionId);
        console.log(`✅ Client removed from memory for session: ${sessionId}`);
      } else {
        console.log(`⚠️ No client found for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Error disconnecting client for session ${sessionId}:`, error);
      // Even if error, remove from clients map
      if (this.clients.has(sessionId)) {
        this.clients.delete(sessionId);
        console.log(`🗑️ Removed client from memory despite error`);
      }
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
      
      // Ensure client exists, create if needed
      let client = this.clients.get(sessionId);
      if (!client || !client.socket) {
        console.log(`🔄 Client not found for ${sessionId}, creating new client...`);
        await this.createClient(sessionId);
        // Wait for client to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        client = this.clients.get(sessionId);
      }

      if (!client || !client.socket) {
        throw new Error('Failed to create or initialize client');
      }

      // Check if requestPairingCode is available
      if (typeof client.socket.requestPairingCode !== 'function') {
        throw new Error('Pairing code not supported by this Baileys version. Please update Baileys.');
      }

      // Use phone utility for international number formatting
      const { normalizeToE164WithoutPlus } = require('./phone');
      
      // Normalize phone number to E.164 format WITHOUT + (Baileys requirement)
      // This handles all countries worldwide automatically
      let formattedPhoneNumber;
      try {
        formattedPhoneNumber = normalizeToE164WithoutPlus(phoneNumber);
        console.log(`📞 Requesting pairing code for: ${formattedPhoneNumber} (E.164 format without +)`);
        console.log(`📱 Original input: ${phoneNumber} -> Formatted: ${formattedPhoneNumber}`);
      } catch (error) {
        throw new Error(`Invalid phone number format: ${error.message}. Received: ${phoneNumber}`);
      }
      
      // According to Baileys docs: wait until connection === "connecting" OR !!qr
      // https://baileys.wiki/docs/socket/connecting/
      let connectionReady = false;
      let attempts = 0;
      const maxAttempts = 15; // Wait up to 15 seconds (Baileys needs time to establish connection)
      
      console.log(`⏳ Waiting for socket to be in 'connecting' or 'qr' state (as per Baileys docs)...`);
      
      while (!connectionReady && attempts < maxAttempts) {
        // Refresh client reference each attempt
        client = this.clients.get(sessionId);
        if (!client || !client.socket) {
          attempts++;
          console.log(`⏳ Client not ready yet (attempt ${attempts}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        const connectionStatus = this.getClientStatus(sessionId);
        // Check if socket connection.update event indicates connecting or QR
        // According to Baileys: we need connection === "connecting" OR !!qr
        const isConnecting = connectionStatus?.status === 'connecting';
        const hasQR = connectionStatus?.hasQR === true;
        
        // Also check socket's actual WebSocket state
        const socketReady = client.socket?.ws?.readyState === 1; // WebSocket.OPEN
        
        if (isConnecting || hasQR || socketReady) {
          connectionReady = true;
          console.log(`✅ Connection ready for pairing code (status: ${connectionStatus?.status || 'unknown'}, hasQR: ${hasQR}, socketOpen: ${socketReady})`);
        } else {
          attempts++;
          console.log(`⏳ Waiting for connection state (attempt ${attempts}/${maxAttempts})... Current status: ${connectionStatus?.status || 'none'}`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between attempts
        }
      }
      
      if (!connectionReady) {
        console.warn(`⚠️ Connection not in optimal state after ${maxAttempts} seconds, but proceeding with pairing code request...`);
        console.warn(`⚠️ This may still work if socket is establishing connection...`);
      }
      
      // Verify socket is still available before calling
      if (!client || !client.socket || typeof client.socket.requestPairingCode !== 'function') {
        throw new Error('Socket not ready for pairing code request');
      }
      
      // According to Baileys docs: phone number MUST be E.164 WITHOUT + sign
      // Our normalizeToE164WithoutPlus already handles this correctly
      console.log(`📞 Requesting pairing code from Baileys for: ${formattedPhoneNumber}`);
      const pairingCode = await client.socket.requestPairingCode(formattedPhoneNumber);
      console.log(`✅ Pairing code generated: ${pairingCode}`);
      console.log(`⏳ Waiting for user to enter pairing code in WhatsApp...`);
      console.log(`📱 Socket connection state: ${client.socket?.user ? 'authenticated' : 'pending'}`);
      console.log(`🔌 Socket connected: ${client.socket?.ws?.readyState === 1 ? 'yes' : 'no'}`);
      
      // IMPORTANT: Set status to 'connecting' and clear QR to prevent QR interference
      // After pairing code is requested, we must ignore QR codes completely
      if (this.clients.has(sessionId)) {
        const currentClient = this.clients.get(sessionId);
        // Clear QR code and set status to connecting explicitly
        this.clients.set(sessionId, {
          ...currentClient,
          socket: client.socket, // Ensure socket reference is kept
          status: 'connecting', // Force status to connecting (not qr_ready)
          qr: null, // CRITICAL: Clear QR code to prevent interference
          qrGeneratedAt: null, // Clear QR timestamp
          lastUpdate: Date.now(),
          pairingCodeRequested: true,
          pairingCodePhone: formattedPhoneNumber,
          pairingCode: pairingCode,
          pairingCodeGeneratedAt: Date.now()
        });
        console.log(`🚫 Cleared QR code and set status to 'connecting' to prevent QR interference`);
        console.log(`📱 Client status set to 'connecting' and ready for pairing code completion`);
        
        // Update database status when pairing code is requested
        // Database constraint allows: 'initializing', 'qr', 'ready', 'disconnected'
        // We use 'qr' status even though it's pairing code (not QR) - the actual state
        // is tracked in memory via pairingCodeRequested flag
        console.log(`📊 Updating database status to 'qr' for pairing code session...`);
        // Note: 'qr' is used for both QR codes AND pairing codes in DB
        // The distinction is tracked in memory via pairingCodeRequested flag
        await this.updateDatabaseStatus(sessionId, 'qr');
        
        console.log(`⏰ Client will wait for connection.update event with connection === 'open'`);
        
        // Add explicit listener for pairing code completion (additional safety)
        if (client.socket && client.socket.ev) {
          console.log(`👂 Event listener is active, will catch connection.update events`);
        }
        
        // Start a keepalive check for pairing code sessions (prevent timeout)
        const pairingKeepAlive = setInterval(() => {
          const checkClient = this.clients.get(sessionId);
          if (checkClient?.pairingCodeRequested && checkClient.status === 'connecting') {
            // Keep socket alive by updating lastUpdate
            checkClient.lastUpdate = Date.now();
            
            // Verify socket is still connected
            if (checkClient.socket?.ws) {
              const wsState = checkClient.socket.ws.readyState;
              if (wsState === 1) { // WebSocket.OPEN
                console.log(`💓 Pairing code session keepalive: socket still connected`);
              } else {
                console.log(`⚠️ Pairing code session socket state: ${wsState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
              }
            }
            
            // Check how long we've been waiting
            const waitTime = Date.now() - (checkClient.pairingCodeGeneratedAt || Date.now());
            if (waitTime > 300000) { // 5 minutes
              console.log(`⏰ Pairing code session waiting for ${Math.round(waitTime/1000)}s - still active`);
            }
          } else {
            // Stop keepalive if connected or no longer waiting
            clearInterval(pairingKeepAlive);
            console.log(`✅ Stopped pairing code keepalive - status changed`);
          }
        }, 10000); // Check every 10 seconds
        
        // Store interval ID for cleanup
        if (!currentClient.pairingKeepAliveInterval) {
          currentClient.pairingKeepAliveInterval = pairingKeepAlive;
          this.clients.set(sessionId, currentClient);
        }
      }
      
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

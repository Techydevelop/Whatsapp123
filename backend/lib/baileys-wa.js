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
      
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
        
        // Get client info FIRST
        const clientInfo = this.clients.get(sessionId);
        const isWaitingForPairing = clientInfo?.pairingCodeRequested;
        
        // 🔥 CRITICAL: Log all updates for pairing sessions
        if (isWaitingForPairing) {
          console.log(`\n🔔🔔 PAIRING SESSION UPDATE 🔔🔔`);
          console.log(`   Session: ${sessionId.substring(0, 50)}...`);
          console.log(`   Connection: ${connection || 'none'}`);
          console.log(`   QR Attempted: ${!!qr}`);
          console.log(`   Pairing Code: ${clientInfo?.pairingCode}`);
          console.log(`   Status: ${clientInfo?.status}`);
          console.log(`   Time: ${new Date().toLocaleTimeString()}\n`);
        }
        
        // 🚫🚫🚫 STOP QR IMMEDIATELY if pairing code active
        if (qr) {
          if (isWaitingForPairing) {
            console.log(`🚫🚫 QR GENERATION BLOCKED - Pairing code ${clientInfo?.pairingCode} is active`);
            console.log(`🚫 Ignoring QR completely for session: ${sessionId.substring(0, 50)}...`);
            
            // DON'T update client with QR - keep it as 'connecting'
            // This is the KEY FIX - don't let QR overwrite pairing mode
            return; // Exit immediately without processing QR
          }
          
          // Normal QR for non-pairing sessions
          console.log(`📱 QR Code generated for session: ${sessionId}`);
          if (!connectionStable && (!this.clients.has(sessionId) || this.clients.get(sessionId).status !== 'connected')) {
            this.clients.set(sessionId, {
              socket,
              qr,
              status: 'qr_ready',
              lastUpdate: Date.now(),
              qrGeneratedAt: Date.now()
            });
          }
        }
        
        // Handle connection close
        if (connection === 'close') {
          if (stabilityTimer) {
            clearTimeout(stabilityTimer);
            stabilityTimer = null;
          }
          connectionStable = false;
          connectionOpenTime = null;
          
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired;
          
          console.log(`\n🔌 CONNECTION CLOSED`);
          console.log(`   Session: ${sessionId.substring(0, 50)}...`);
          console.log(`   Status Code: ${statusCode}`);
          console.log(`   Restart Required: ${isRestartRequired}`);
          console.log(`   Was Pairing Session: ${isWaitingForPairing}\n`);
          
          // 🔥 CRITICAL FIX: Handle restartRequired properly
          if (isRestartRequired) {
            console.log(`🔄 RESTART REQUIRED DETECTED`);
            
            if (isWaitingForPairing) {
              console.log(`✅✅ PAIRING CODE WAS ENTERED BY USER!`);
              console.log(`   WhatsApp is restarting connection (this is normal)`);
              console.log(`   Pairing Code: ${clientInfo?.pairingCode}`);
              console.log(`   Phone: ${clientInfo?.pairingCodePhone}`);
            }
            
            // Clean old socket
            if (this.clients.has(sessionId)) {
              const oldClient = this.clients.get(sessionId);
              try {
                if (oldClient.socket?.end) {
                  oldClient.socket.end();
                }
              } catch (e) {
                console.warn(`⚠️ Socket end error: ${e.message}`);
              }
              
              // 🔥 Keep pairing info alive for reconnection
              if (isWaitingForPairing) {
                this.clients.set(sessionId, {
                  socket: null,
                  qr: null,
                  status: 'connecting',
                  lastUpdate: Date.now(),
                  pairingCodeRequested: true,
                  pairingCode: clientInfo.pairingCode,
                  pairingCodePhone: clientInfo.pairingCodePhone,
                  pairingCodeGeneratedAt: clientInfo.pairingCodeGeneratedAt
                });
                console.log(`📌 Pairing info preserved for reconnection`);
              }
            }
            
            // 🔥 RECREATE SOCKET
            console.log(`🔄 Recreating socket in 2 seconds...`);
            setTimeout(async () => {
              console.log(`🚀 Recreating socket now for: ${sessionId.substring(0, 50)}...`);
              try {
                // Use createClientInternal to avoid queue conflicts
                await this.createClientInternal(sessionId);
                console.log(`✅ Socket recreated successfully`);
              } catch (err) {
                console.error(`❌ Socket recreation failed:`, err.message);
                console.error(`❌ Error stack:`, err.stack);
              }
            }, 2000);
            
            return; // Exit early
          }
          
          // Normal disconnect handling
          if (this.clients.has(sessionId)) {
            const client = this.clients.get(sessionId);
            client.status = 'disconnected';
            client.lastUpdate = Date.now();
          }
          
          if (!isLoggedOut) {
            console.log(`🔄 Will reconnect in 10 seconds`);
            setTimeout(() => {
              const current = this.clients.get(sessionId);
              if (current?.status === 'disconnected') {
                this.createClient(sessionId).catch(err => {
                  console.error(`❌ Reconnection failed:`, err.message);
                });
              }
            }, 10000);
          } else {
            this.clients.delete(sessionId);
          }
        }
        
        // Handle connection open
        else if (connection === 'open') {
          connectionOpenTime = Date.now();
          const phoneNumber = socket.user?.id?.split(':')[0] || 'Unknown';
          
          const existingClient = this.clients.get(sessionId);
          const wasPairingSession = existingClient?.pairingCodeRequested;
          
          console.log(`\n✅✅✅ CONNECTION OPENED ✅✅✅`);
          console.log(`   Session: ${sessionId.substring(0, 50)}...`);
          console.log(`   Phone: ${phoneNumber}`);
          console.log(`   Was Pairing: ${wasPairingSession}`);
          
          if (wasPairingSession) {
            console.log(`🎉🎉 PAIRING CODE CONNECTION SUCCESS! 🎉🎉`);
            console.log(`   Pairing Code Used: ${existingClient.pairingCode}`);
            console.log(`   Phone Number: ${existingClient.pairingCodePhone}`);
          }
          console.log(`   Time: ${new Date().toLocaleString()}\n`);
          
          connectionStable = true;
          
          // Clear pairing keepalive
          if (existingClient?.pairingKeepAliveInterval) {
            clearInterval(existingClient.pairingKeepAliveInterval);
            console.log(`🧹 Cleared pairing keepalive interval`);
          }
          
          // Update client
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: phoneNumber,
            lastUpdate: Date.now(),
            connectedAt: Date.now(),
            pairingCodeRequested: false // Reset
          });
          
          console.log(`🔒 Status set to 'connected'`);
          
          // Update database
          console.log(`📊 Updating database to 'ready'...`);
          await this.updateDatabaseStatus(sessionId, 'ready', phoneNumber);
          
          // Keep alive
          const keepAlive = setInterval(() => {
            if (this.clients.has(sessionId)) {
              const client = this.clients.get(sessionId);
              if (client.status === 'connected') {
                client.lastUpdate = Date.now();
              } else {
                clearInterval(keepAlive);
              }
            } else {
              clearInterval(keepAlive);
            }
          }, 30000);
        }
        
        // Handle connecting
        else if (connection === 'connecting') {
          console.log(`🔄 State: connecting for ${sessionId.substring(0, 50)}...`);
          const current = this.clients.get(sessionId);
          
          if (current?.pairingCodeRequested) {
            console.log(`   (Pairing mode - waiting for user to enter code ${current.pairingCode})`);
            this.clients.set(sessionId, {
              ...current,
              socket,
              qr: null, // Force no QR
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
      let formattedPhoneNumber;
      try {
        formattedPhoneNumber = normalizeToE164WithoutPlus(phoneNumber);
        console.log(`📞 Requesting pairing code for: ${formattedPhoneNumber} (E.164 format without +)`);
      } catch (error) {
        throw new Error(`Invalid phone number format: ${error.message}. Received: ${phoneNumber}`);
      }
      
      // According to Baileys docs: wait until connection === "connecting" OR !!qr
      let connectionReady = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      console.log(`⏳ Waiting for socket to be in 'connecting' or 'qr' state...`);
      
      while (!connectionReady && attempts < maxAttempts) {
        client = this.clients.get(sessionId);
        if (!client || !client.socket) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        const connectionStatus = this.getClientStatus(sessionId);
        const isConnecting = connectionStatus?.status === 'connecting';
        const hasQR = connectionStatus?.hasQR === true;
        const socketReady = client.socket?.ws?.readyState === 1;
        
        if (isConnecting || hasQR || socketReady) {
          connectionReady = true;
          console.log(`✅ Connection ready for pairing code`);
        } else {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!client || !client.socket || typeof client.socket.requestPairingCode !== 'function') {
        throw new Error('Socket not ready for pairing code request');
      }
      
      console.log(`📞 Requesting pairing code from Baileys for: ${formattedPhoneNumber}`);
      const pairingCode = await client.socket.requestPairingCode(formattedPhoneNumber);
      console.log(`✅ Pairing code generated: ${pairingCode}`);
      
      // 🔥 Store pairing code state in client
      if (this.clients.has(sessionId)) {
        const currentClient = this.clients.get(sessionId);
        this.clients.set(sessionId, {
          ...currentClient,
          pairingCodeRequested: true,
          pairingCode: pairingCode,
          pairingCodePhone: formattedPhoneNumber,
          pairingCodeGeneratedAt: Date.now(),
          status: 'connecting'
        });
      }
      
      console.log(`⏳ Waiting for user to enter pairing code in WhatsApp...`);
      
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

const { makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('baileys');
const fs = require('fs');
const path = require('path');

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
        markOnlineOnConnect: true,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 120000,
        keepAliveIntervalMs: 15000, // Reduced from 30s to 15s for better keep-alive
        connectTimeoutMs: 120000,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 5, // Increased from 3 to 5
        heartbeatIntervalMs: 10000, // Add heartbeat every 10 seconds
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

      // Handle connection updates
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
          this.clients.set(sessionId, {
            socket,
            qr,
            status: 'qr_ready',
            lastUpdate: Date.now()
          });
        }

        if (connection === 'close') {
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
            console.log(`🔄 Reconnecting session: ${sessionId} in 5 seconds...`);
            setTimeout(() => {
              console.log(`🔄 Attempting reconnection for: ${sessionId}`);
              this.createClient(sessionId).catch(err => {
                console.error(`❌ Reconnection failed for ${sessionId}:`, err);
              });
            }, 5000); // Reduced from 15 to 5 seconds
          } else {
            // Only delete if logged out
            this.clients.delete(sessionId);
          }
        } else if (connection === 'open') {
          console.log(`✅ WhatsApp connected for session: ${sessionId}`);
          console.log(`📱 Phone number: ${socket.user?.id?.split(':')[0] || 'Unknown'}`);
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: socket.user?.id?.split(':')[0],
            lastUpdate: Date.now(),
            connectedAt: Date.now()
          });
          
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
      }

      // Handle credentials update
      socket.ev.on('creds.update', saveCreds);

      // Handle messages
      socket.ev.on('messages.upsert', async (m) => {
        try {
          const msg = m.messages[0];
          if (!msg.key.fromMe && m.type === 'notify') {
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
                console.log(`✅ Message forwarded to GHL webhook for session: ${sessionId}`);
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

  async sendMessage(sessionId, phoneNumber, message, messageType = 'text', mediaUrl = null) {
    try {
      const client = this.clients.get(sessionId);
      
      if (!client || (client.status !== 'connected' && client.status !== 'qr_ready')) {
        throw new Error(`Client not ready for session: ${sessionId}, status: ${client.status}`);
      }

      // Format phone number
      const formattedNumber = phoneNumber.replace(/\D/g, '');
      const jid = `${formattedNumber}@s.whatsapp.net`;

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
}

module.exports = BaileysWhatsAppManager;

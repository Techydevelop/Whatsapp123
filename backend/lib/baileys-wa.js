const { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const pino = require('pino');

class BaileysWhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
    this.qrQueue = [];
    this.isGeneratingQR = false;
    this.reconnectAttempts = new Map(); // Track reconnection attempts
    this.startHealthMonitor();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }


  getClientsMap() {
    return this.clients;
  }

  getClient(sessionId) {
    return this.clients.get(sessionId);
  }

  clearSessionData(sessionId) {
    try {
      const authDir = path.join(this.dataDir, sessionId);
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️ Cleared session data for: ${sessionId}`);
      }
      this.clients.delete(sessionId);
      this.reconnectAttempts.delete(sessionId);
    } catch (error) {
      console.error(`❌ Error clearing session data for ${sessionId}:`, error);
    }
  }

  hasExistingCredentials(sessionId) {
    const authDir = path.join(this.dataDir, sessionId);
    return fs.existsSync(authDir) && fs.readdirSync(authDir).length > 0;
  }

  async createClient(sessionId) {
    try {
      console.log(`🚀 Creating Baileys client for session: ${sessionId}`);
      
      // Check reconnection attempts
      const attempts = this.reconnectAttempts.get(sessionId) || 0;
      if (attempts > 5) {
        console.error(`❌ Max reconnection attempts reached for ${sessionId}`);
        await this.updateDatabaseStatus(sessionId, 'error');
        this.reconnectAttempts.delete(sessionId);
        return null;
      }

      // Check if client already exists and is connected
      if (this.clients.has(sessionId)) {
        const existingClient = this.clients.get(sessionId);
        if (existingClient.status === 'connected') {
          console.log(`✅ Using existing connected client for session: ${sessionId}`);
          return existingClient.socket;
        }
      }

      const authDir = path.join(this.dataDir, sessionId);
      
      // Use simple stable auth state
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      // Fetch latest Baileys version for better compatibility
      let version;
      try {
        const { version: waVersion } = await fetchLatestBaileysVersion();
        version = waVersion;
        console.log(`📱 Using WhatsApp Web version: ${version.join('.')}`);
      } catch (err) {
        console.warn('⚠️ Could not fetch latest version, using default');
      }

      const socket = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        
        // CRITICAL: Optimized timeouts for Render environment
        connectTimeoutMs: 30000, // 30 seconds (reduced from 60s)
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 20000, // 20 seconds
        
        // Better retry configuration for cloud environment
        retryRequestDelayMs: 2000, // 2 seconds between retries
        maxMsgRetryCount: 2, // Reduced retry count
        
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        
        getMessage: async (key) => {
          return {
            conversation: 'Hello from Baileys!'
          };
        },
        
        // Use more generic browser info for better compatibility
        browser: ['Chrome (Linux)', '', ''],
        
        // Use Pino logger for proper Baileys compatibility
        logger: pino({ level: 'error' })
      });

      // CRITICAL: Add connection timeout handler
      let connectionTimeout;
      const CONNECTION_TIMEOUT = 35000; // 35 seconds
      
      connectionTimeout = setTimeout(() => {
        if (socket && !socket.user) {
          console.error(`⏰ Connection timeout for ${sessionId} - no user after ${CONNECTION_TIMEOUT/1000}s`);
          socket.end();
        }
      }, CONNECTION_TIMEOUT);

      // CRITICAL: Wrap connection.update in try-catch
      socket.ev.on('connection.update', async (update) => {
        try {
          const { connection, lastDisconnect, qr, isNewLogin } = update;
          
          // Clear timeout on successful connection
          if (connection === 'open' || connection === 'close') {
            if (connectionTimeout) {
              clearTimeout(connectionTimeout);
            }
          }
          
          console.log(`🔄 Connection update for ${sessionId}:`, { 
            connection, 
            qr: !!qr,
            isNewLogin,
            statusCode: lastDisconnect?.error?.output?.statusCode,
            errorMessage: lastDisconnect?.error?.message
          });
          
          // QR Code generation
          if (qr) {
            console.log(`📱 QR Code generated for session: ${sessionId}`);
            
            // Reset reconnection attempts on QR generation
            this.reconnectAttempts.delete(sessionId);
            
            this.clients.set(sessionId, {
              socket: socket,
              qr: qr,
              status: 'qr',
              lastUpdate: Date.now()
            });

            // Update database immediately
            await this.updateDatabaseStatus(sessionId, 'qr');
          }

          // Handle connection close
          if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown error';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`🔌 Connection closed for ${sessionId}`);
            console.log(`🔌 Status Code: ${statusCode}`);
            console.log(`🔌 Error Message: ${errorMessage}`);
            console.log(`🔌 Should Reconnect: ${shouldReconnect}`);
            
            // Increment reconnection attempts
            this.reconnectAttempts.set(sessionId, attempts + 1);
            
            if (shouldReconnect && attempts < 5) {
              // Exponential backoff: 10s, 20s, 40s, 80s, 160s
              const delay = Math.min(10000 * Math.pow(2, attempts), 160000);
              console.log(`🔄 Reconnecting session: ${sessionId} in ${delay/1000}s (attempt ${attempts + 1}/5)`);
              
              setTimeout(() => {
                this.createClient(sessionId);
              }, delay);
            } else {
              console.log(`❌ Session ended for: ${sessionId} (max attempts reached or logged out)`);
              this.clients.delete(sessionId);
              this.reconnectAttempts.delete(sessionId);
              await this.updateDatabaseStatus(sessionId, statusCode === DisconnectReason.loggedOut ? 'logged_out' : 'disconnected');
            }
          } 
          // Handle successful connection
          else if (connection === 'open') {
            console.log(`✅ Connected successfully for session: ${sessionId}`);
            
            // Reset reconnection attempts
            this.reconnectAttempts.delete(sessionId);
            
            // Get phone number with error handling
            let phoneNumber = null;
            try {
              phoneNumber = socket.user?.id?.split(':')[0];
              console.log(`📱 Connected phone number: ${phoneNumber}`);
            } catch (err) {
              console.error('❌ Error getting phone number:', err);
            }
            
            // Store client
            this.clients.set(sessionId, {
              socket: socket,
              qr: null,
              status: 'connected',
              lastUpdate: Date.now(),
              phoneNumber: phoneNumber
            });

            // Update database
            await this.updateDatabaseStatus(sessionId, 'connected', phoneNumber);
            
            // Update to ready after delay
            setTimeout(async () => {
              await this.updateDatabaseStatus(sessionId, 'ready', phoneNumber);
              console.log(`🎉 Session ready for: ${sessionId}`);
            }, 2000);
          }
          // Handle connecting state
          else if (connection === 'connecting') {
            console.log(`⏳ Connecting session: ${sessionId}`);
            this.clients.set(sessionId, {
              socket: socket,
              qr: null,
              status: 'connecting',
              lastUpdate: Date.now()
            });
          }
          
        } catch (error) {
          console.error(`❌ Error in connection.update handler for ${sessionId}:`, error);
          // Don't rethrow - let the connection continue
        }
      });

      // Save credentials with error handling
      socket.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (error) {
          console.error(`❌ Error saving credentials for ${sessionId}:`, error);
        }
      });

      // Listen for messages
      socket.ev.on('messages.upsert', async (m) => {
        try {
          const msg = m.messages[0];
          if (!msg.key.fromMe && m.type === 'notify') {
            await this.handleIncomingMessage(sessionId, msg);
          }
        } catch (error) {
          console.error(`❌ Error handling message for ${sessionId}:`, error);
        }
      });

      console.log(`✅ Baileys client created for session: ${sessionId}`);
      return socket;

    } catch (error) {
      console.error(`❌ Error creating Baileys client for session ${sessionId}:`, error);
      
      // Update database on failure
      await this.updateDatabaseStatus(sessionId, 'error');
      
      throw error;
    }
  }

  async getQRCode(sessionId) {
    try {
      console.log(`🔍 Checking for QR code for session: ${sessionId}`);
      const client = this.clients.get(sessionId);
      
      if (client && client.qr) {
        console.log(`📱 Returning QR code for session: ${sessionId}`);
        return client.qr;
      }

      console.log(`⏳ No QR code available yet for session: ${sessionId}`);
      return null;
    } catch (error) {
      console.error(`❌ Error getting QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  async sendMessage(sessionId, phoneNumber, message, messageType = 'text', mediaUrl = null) {
    try {
      const clientData = this.clients.get(sessionId);
      
      if (!clientData || !clientData.socket) {
        throw new Error(`Client not ready for session: ${sessionId}`);
      }

      const socket = clientData.socket;
      const formattedNumber = phoneNumber.replace(/\D/g, '') + '@s.whatsapp.net';

      console.log(`📤 Sending ${messageType} to ${formattedNumber}: ${message}`);

      let result;

      if (messageType === 'image' && mediaUrl) {
        result = await socket.sendMessage(formattedNumber, {
          image: { url: mediaUrl },
          caption: message || ''
        });
      } else if (messageType === 'video' && mediaUrl) {
        result = await socket.sendMessage(formattedNumber, {
          video: { url: mediaUrl },
          caption: message || ''
        });
      } else if (messageType === 'voice' && mediaUrl) {
        result = await socket.sendMessage(formattedNumber, {
          audio: { url: mediaUrl },
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        });
      } else if (messageType === 'document' && mediaUrl) {
        result = await socket.sendMessage(formattedNumber, {
          document: { url: mediaUrl },
          mimetype: 'application/pdf',
          fileName: 'document.pdf'
        });
      } else {
        result = await socket.sendMessage(formattedNumber, {
          text: message
        });
      }

      console.log(`✅ ${messageType} sent successfully`);
      return result;

    } catch (error) {
      console.error(`❌ Error sending ${messageType} for session ${sessionId}:`, error);
      throw error;
    }
  }

  getClientStatus(sessionId) {
    const client = this.clients.get(sessionId);
    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    
    return client ? {
      status: client.status,
      lastUpdate: client.lastUpdate,
      hasQR: !!client.qr,
      reconnectAttempts: attempts
    } : null;
  }

  getAllClients() {
    return Array.from(this.clients.entries()).map(([sessionId, client]) => ({
      sessionId,
      status: client.status,
      lastUpdate: client.lastUpdate,
      hasQR: !!client.qr,
      reconnectAttempts: this.reconnectAttempts.get(sessionId) || 0
    }));
  }

  async disconnectClient(sessionId) {
    try {
      const clientData = this.clients.get(sessionId);
      if (clientData && clientData.socket) {
        await clientData.socket.logout();
        this.clients.delete(sessionId);
        this.reconnectAttempts.delete(sessionId);
        console.log(`🔌 Disconnected client for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Error disconnecting client for session ${sessionId}:`, error);
    }
  }

  async handleIncomingMessage(sessionId, message) {
    try {
      const from = message.key.remoteJid;
      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || 
                         message.message?.imageMessage?.caption || 
                         message.message?.videoMessage?.caption || '';

      console.log(`📨 Received message from ${from}: ${messageText}`);

      // Forward to GHL webhook
      const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/whatsapp/webhook`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: from.replace('@s.whatsapp.net', ''),
          message: messageText,
          messageType: 'chat',
          timestamp: message.messageTimestamp,
          sessionId: sessionId,
          whatsappMsgId: message.key.id
        })
      });

      if (response.ok) {
        console.log(`✅ Message forwarded to GHL webhook for session: ${sessionId}`);
      } else {
        console.error(`❌ Failed to forward message to GHL webhook: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ Error processing incoming message:`, error);
    }
  }

  async updateDatabaseStatus(sessionId, status, phoneNumber = null) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing Supabase credentials');
        return;
      }
      
      const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
      
      // Extract session ID
      const sessionIdParts = sessionId.split('_');
      const actualSessionId = sessionIdParts.slice(2).join('_');
      
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
      }
    } catch (error) {
      console.error('❌ Error updating database status:', error);
    }
  }

  startHealthMonitor() {
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, sessionId) => {
        // Check for stale clients (no update in 10 minutes)
        if (now - client.lastUpdate > 600000) {
          console.log(`⚠️ Client ${sessionId} seems stale (no update in 10 min), cleaning up...`);
          this.clients.delete(sessionId);
          this.reconnectAttempts.delete(sessionId);
        }
      });
      
      // Log active clients
      console.log(`💚 Health Check: ${this.clients.size} active clients`);
    }, 60000); // Check every minute
  }
}

module.exports = BaileysWhatsAppManager;
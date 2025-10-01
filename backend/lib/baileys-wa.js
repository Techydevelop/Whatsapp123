const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('baileys');
const fs = require('fs');
const path = require('path');

class BaileysWhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
  }

  // Make clients accessible for phone number retrieval
  getClientsMap() {
    return this.clients;
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

  // Direct GHL API forwarding method
  async forwardToGHLDirectly(from, message, sessionId) {
    try {
      console.log(`🔄 Forwarding message directly to GHL: ${from} -> ${message}`);
      
      // Extract location ID from session ID
      const locationMatch = sessionId.match(/location_([^_]+)_/);
      if (!locationMatch) {
        console.error(`❌ Could not extract location ID from session: ${sessionId}`);
        return false;
      }
      
      const locationId = locationMatch[1];
      console.log(`📍 Extracted location ID: ${locationId}`);
      
      // Call the webhook endpoint directly
      try {
        const response = await fetch(`${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/whatsapp/webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from,
            message,
            timestamp: Date.now(),
            sessionId,
            locationId
          })
        });
        
        if (response.ok) {
          console.log(`✅ Message forwarded to GHL via direct call`);
          return true;
        } else {
          console.error(`❌ Direct GHL call failed: ${response.status}`);
          return false;
        }
      } catch (fetchError) {
        console.error(`❌ Direct GHL call error:`, fetchError);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error in direct GHL forwarding:`, error);
      return false;
    }
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  hasExistingCredentials(sessionId) {
    const authDir = path.join(this.dataDir, `baileys_${sessionId}`);
    const credsFile = path.join(authDir, 'creds.json');
    return fs.existsSync(credsFile);
  }

  async createClient(sessionId) {
    try {
      console.log(`🚀 Creating Baileys client for session: ${sessionId}`);
      
      // Check if client already exists
      if (this.clients.has(sessionId)) {
        console.log(`⚠️ Client already exists for session: ${sessionId}`);
        return this.clients.get(sessionId).socket;
      }
      
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
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 120000,
        retryRequestDelayMs: 1000,
        maxMsgRetryCount: 3,
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
          
          // Clear the client from memory
          this.clients.delete(sessionId);
          
          if (shouldReconnect) {
            console.log(`🔄 Reconnecting session: ${sessionId} in 15 seconds...`);
            setTimeout(() => {
              console.log(`🔄 Attempting reconnection for: ${sessionId}`);
              this.createClient(sessionId).catch(err => {
                console.error(`❌ Reconnection failed for ${sessionId}:`, err);
              });
            }, 15000);
          }
        } else if (connection === 'open') {
          console.log(`✅ WhatsApp connected for session: ${sessionId}`);
          console.log(`📱 Phone number: ${socket.user?.id?.split(':')[0] || 'Unknown'}`);
          this.clients.set(sessionId, {
            socket,
            qr: null,
            status: 'connected',
            phoneNumber: socket.user?.id?.split(':')[0],
            lastUpdate: Date.now()
          });
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
            const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || 'Media/Other';
            
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
                  timestamp: msg.messageTimestamp,
                  sessionId
                })
              });
              
              if (webhookResponse.ok) {
                console.log(`✅ Message forwarded to GHL webhook for session: ${sessionId}`);
              } else {
                const errorText = await webhookResponse.text();
                console.error(`❌ Failed to forward message to GHL webhook (${webhookResponse.status}):`, errorText);
                
                // Try direct GHL API call as fallback
                console.log(`🔄 Attempting direct GHL API call as fallback...`);
                await this.forwardToGHLDirectly(from, messageText, sessionId);
              }
            } catch (webhookError) {
              console.error(`❌ Error forwarding message to GHL webhook:`, webhookError);
              
              // Try direct GHL API call as fallback
              console.log(`🔄 Attempting direct GHL API call as fallback...`);
              await this.forwardToGHLDirectly(from, messageText, sessionId);
            }
            
            // Also try the debug webhook endpoint as additional fallback
            try {
              const debugWebhookUrl = `${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/debug/test-webhook`;
              console.log(`🔗 Trying debug webhook: ${debugWebhookUrl}`);
              
              const debugResponse = await fetch(debugWebhookUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from,
                  message: messageText,
                  timestamp: msg.messageTimestamp,
                  sessionId
                })
              });
              
              if (debugResponse.ok) {
                console.log(`✅ Message logged via debug webhook`);
              }
            } catch (debugError) {
              console.error(`❌ Debug webhook also failed:`, debugError);
            }
            
            // Final fallback: Store message in database
            try {
              const storeUrl = `${process.env.BACKEND_URL || 'https://whatsapp123-dhn1.onrender.com'}/store-message`;
              console.log(`🔗 Storing message: ${storeUrl}`);
              
              const storeResponse = await fetch(storeUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  from,
                  message: messageText,
                  sessionId,
                  locationId: sessionId.match(/location_([^_]+)_/)?.[1] || 'unknown'
                })
              });
              
              if (storeResponse.ok) {
                console.log(`✅ Message stored in database for processing`);
              } else {
                console.error(`❌ Failed to store message: ${storeResponse.status}`);
              }
            } catch (storeError) {
              console.error(`❌ Error storing message:`, storeError);
            }
            
            // Final fallback: Log message for manual processing
            console.log(`📝 MESSAGE FOR MANUAL PROCESSING:`);
            console.log(`📝 From: ${from}`);
            console.log(`📝 Message: ${messageText}`);
            console.log(`📝 Session: ${sessionId}`);
            console.log(`📝 Timestamp: ${new Date().toISOString()}`);
            console.log(`📝 Please forward this message to GHL manually or check webhook configuration`);
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
        await new Promise(resolve => setTimeout(resolve, 2000));
        client = this.clients.get(sessionId);
      }

      if (client && client.qr) {
        console.log(`📱 Returning QR code for session: ${sessionId}`);
        return client.qr;
      }

      console.log(`⏳ No QR code available yet for session: ${sessionId}, status: ${client?.status}`);
      return null;
    } catch (error) {
      console.error(`❌ Error getting QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  async sendMessage(sessionId, phoneNumber, message) {
    try {
      const client = this.clients.get(sessionId);
      
      if (!client || client.status !== 'connected') {
        throw new Error(`Client not connected for session: ${sessionId}`);
      }

      // Format phone number
      const formattedNumber = phoneNumber.replace(/\D/g, '');
      const jid = `${formattedNumber}@s.whatsapp.net`;

      console.log(`📤 Sending message to ${jid}: ${message}`);

      const result = await client.socket.sendMessage(jid, {
        text: message
      });

      console.log(`✅ Message sent successfully:`, result);
      return result;

    } catch (error) {
      console.error(`❌ Error sending message for session ${sessionId}:`, error);
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
}

module.exports = BaileysWhatsAppManager;

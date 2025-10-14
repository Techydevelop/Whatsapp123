const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('baileys');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

class BaileysWhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
    this.qrQueue = [];
    this.isGeneratingQR = false;
    this.startHealthMonitor();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Make clients accessible
  getClientsMap() {
    return this.clients;
  }

  // Get client by session ID
  getClient(sessionId) {
    return this.clients.get(sessionId);
  }

  // Clear session data
  clearSessionData(sessionId) {
    try {
      const authDir = path.join(this.dataDir, sessionId);
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`🗑️ Cleared session data for: ${sessionId}`);
      }
      this.clients.delete(sessionId);
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
      
      // Check if client already exists
      if (this.clients.has(sessionId)) {
        const existingClient = this.clients.get(sessionId);
        if (existingClient.status === 'connected') {
          console.log(`✅ Using existing connected client for session: ${sessionId}`);
          return existingClient.socket;
        }
      }

      const authDir = path.join(this.dataDir, sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      let qrGenerated = false;
      let qrCode = null;

      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 180000, // 3 minutes timeout for Render
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
          return {
            conversation: 'Hello from Baileys!'
          };
        },
        browser: ['WhatsApp123', 'Chrome', '1.0.0'],
        qr: {
          store: 'file',
          options: {
            delay: 0
          }
        }
      });

      // QR Code generation
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          console.log(`📱 QR Code generated for session: ${sessionId}`);
          qrGenerated = true;
          qrCode = qr;
          
          // Store QR in client map
          this.clients.set(sessionId, {
            socket: socket,
            qr: qr,
            status: 'qr_ready',
            lastUpdate: Date.now()
          });

          // Update database
          await this.updateDatabaseStatus(sessionId, 'qr_ready');
        }

        if (connection === 'close') {
          const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            console.log(`🔄 Reconnecting session: ${sessionId} in 30 seconds...`);
            // Longer delay for Render deployment - prevent aggressive reconnections
            setTimeout(() => {
              this.createClient(sessionId);
            }, 30000); // 30 seconds for Render - reduce server load
          } else {
            console.log(`❌ Session logged out: ${sessionId}`);
            this.clients.delete(sessionId);
            await this.updateDatabaseStatus(sessionId, 'disconnected');
          }
        } else if (connection === 'open') {
          console.log(`✅ Connected successfully for session: ${sessionId}`);
          
          // Get phone number
          const phoneNumber = socket.user?.id?.split(':')[0];
          console.log(`📱 Connected phone number: ${phoneNumber}`);
          
          // Store client
          this.clients.set(sessionId, {
            socket: socket,
            qr: null,
            status: 'connected',
            lastUpdate: Date.now(),
            phoneNumber: phoneNumber
          });

          // Update database
          await this.updateDatabaseStatus(sessionId, 'ready', phoneNumber);
        }
      });

      // Save credentials
      socket.ev.on('creds.update', saveCreds);

      // Listen for messages
      socket.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
          await this.handleIncomingMessage(sessionId, msg);
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
          mimetype: 'audio/ogg; codecs=opus'
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
      const clientData = this.clients.get(sessionId);
      if (clientData && clientData.socket) {
        await clientData.socket.logout();
        this.clients.delete(sessionId);
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
        console.error(`❌ Failed to forward message to GHL webhook`);
      }
    } catch (error) {
      console.error(`❌ Error processing incoming message:`, error);
    }
  }

  // Update database status
  async updateDatabaseStatus(sessionId, status, phoneNumber = null) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  // Health monitor
  startHealthMonitor() {
    setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, sessionId) => {
        if (now - client.lastUpdate > 300000) { // 5 minutes
          console.log(`⚠️ Client ${sessionId} seems stale, cleaning up...`);
          this.clients.delete(sessionId);
        }
      });
    }, 60000); // Check every minute
  }
}

module.exports = BaileysWhatsAppManager;

const venom = require('venom-bot');
const fs = require('fs');
const path = require('path');

class VenomWhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
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
      const tokenPath = path.join(this.dataDir, 'tokens', sessionId);
      if (fs.existsSync(tokenPath)) {
        fs.rmSync(tokenPath, { recursive: true, force: true });
        console.log(`🗑️ Cleared session data for: ${sessionId}`);
      }
      this.clients.delete(sessionId);
    } catch (error) {
      console.error(`❌ Error clearing session data for ${sessionId}:`, error);
    }
  }

  hasExistingCredentials(sessionId) {
    const tokenPath = path.join(this.dataDir, 'tokens', sessionId);
    return fs.existsSync(tokenPath);
  }

  async createClient(sessionId) {
    try {
      console.log(`🚀 Creating Venom client for session: ${sessionId}`);
      
      // Check if client already exists
      if (this.clients.has(sessionId)) {
        const existingClient = this.clients.get(sessionId);
        if (existingClient.status === 'connected') {
          console.log(`✅ Using existing connected client for session: ${sessionId}`);
          return existingClient.client;
        }
      }

      return new Promise((resolve, reject) => {
        let qrGenerated = false;
        let qrCode = null;

        venom
          .create(
            sessionId,
            (base64Qr, asciiQR, attempts, urlCode) => {
              // QR Code callback
              console.log(`📱 QR Code generated for session: ${sessionId} (Attempt ${attempts})`);
              qrGenerated = true;
              qrCode = base64Qr;
              
              // Store QR in client map
              this.clients.set(sessionId, {
                client: null,
                qr: base64Qr,
                status: 'qr_ready',
                lastUpdate: Date.now()
              });
            },
            (statusSession, session) => {
              // Status callback
              console.log(`🔄 Status for ${session}: ${statusSession}`);
              
              if (this.clients.has(sessionId)) {
                const client = this.clients.get(sessionId);
                client.statusSession = statusSession;
                client.lastUpdate = Date.now();
              }
            },
            {
              folderNameToken: path.join(this.dataDir, 'tokens'),
              headless: true,
              useChrome: true,
              debug: false,
              logQR: false,
              browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions'
              ],
              // Use system Chrome if available
              executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
                             process.env.CHROME_BIN || 
                             undefined,
              disableSpins: true,
              disableWelcome: true,
              updatesLog: false
            },
            undefined,
            (browser, page) => {
              // Browser session started
              console.log(`🌐 Browser session started for: ${sessionId}`);
            }
          )
          .then((client) => {
            console.log(`✅ Venom client created for session: ${sessionId}`);
            
            // Get phone number
            client.getHostDevice().then((phone) => {
              const phoneNumber = phone.id.user;
              console.log(`📱 Connected phone number: ${phoneNumber}`);
              
              // Store client
              this.clients.set(sessionId, {
                client: client,
                qr: qrCode,
                status: 'connected',
                lastUpdate: Date.now(),
                phoneNumber: phoneNumber
              });

              // Update database
              this.updateDatabaseStatus(sessionId, 'ready', phoneNumber);
            }).catch(err => {
              console.error('❌ Error getting phone number:', err);
            });

            // Listen for messages
            client.onMessage((message) => {
              this.handleIncomingMessage(sessionId, message);
            });

            resolve(client);
          })
          .catch((error) => {
            console.error(`❌ Error creating Venom client for ${sessionId}:`, error);
            reject(error);
          });
      });

    } catch (error) {
      console.error(`❌ Error in createClient for session ${sessionId}:`, error);
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
      
      if (!clientData || !clientData.client) {
        throw new Error(`Client not ready for session: ${sessionId}`);
      }

      const client = clientData.client;
      const formattedNumber = phoneNumber.replace(/\D/g, '') + '@c.us';

      console.log(`📤 Sending ${messageType} to ${formattedNumber}: ${message}`);

      let result;

      if (messageType === 'image' && mediaUrl) {
        result = await client.sendImage(formattedNumber, mediaUrl, 'image', message || '');
      } else if (messageType === 'video' && mediaUrl) {
        result = await client.sendVideoAsGif(formattedNumber, mediaUrl, 'video.mp4', message || '');
      } else if (messageType === 'voice' && mediaUrl) {
        result = await client.sendVoice(formattedNumber, mediaUrl);
      } else if (messageType === 'document' && mediaUrl) {
        result = await client.sendFile(formattedNumber, mediaUrl, 'document', message || '');
      } else {
        result = await client.sendText(formattedNumber, message);
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
      if (clientData && clientData.client) {
        await clientData.client.close();
        this.clients.delete(sessionId);
        console.log(`🔌 Disconnected client for session: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Error disconnecting client for session ${sessionId}:`, error);
    }
  }

  async handleIncomingMessage(sessionId, message) {
    try {
      // Skip if message is from self or group
      if (message.isGroupMsg || message.fromMe) {
        return;
      }

      const from = message.from;
      const messageText = message.body || message.caption || '';
      const messageType = message.type || 'chat';

      console.log(`📨 Received message from ${from}: ${messageText}`);

      // Forward to GHL webhook
      const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/whatsapp/webhook`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: from.replace('@c.us', ''),
          message: messageText,
          messageType: messageType,
          timestamp: message.timestamp,
          sessionId: sessionId,
          whatsappMsgId: message.id
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
      const { createClient } = require('@supabase/supabase-js');
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
}

module.exports = VenomWhatsAppManager;


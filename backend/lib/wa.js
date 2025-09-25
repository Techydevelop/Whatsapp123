/**
 * WhatsApp client management utilities
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');

class WhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = process.env.WA_DATA_DIR || path.join(__dirname, '../.wwebjs_auth');
  }

  /**
   * Create WhatsApp client for a session
   */
  createClient(sessionId, onQR, onReady, onDisconnected, onMessage) {
    // Clean sessionId to ensure valid clientId format
    const cleanSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    console.log(`Creating WhatsApp client with sessionId: ${sessionId} -> cleanSessionId: ${cleanSessionId}`);
    
    const client = new Client({
      authStrategy: new LocalAuth({ 
        clientId: `client_${cleanSessionId}`,
        dataPath: this.dataDir
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    // Event handlers
    client.on('qr', (qr) => {
      console.log(`QR generated for session ${sessionId}`);
      onQR(qr);
    });

    client.on('ready', () => {
      console.log(`WhatsApp client ready for session ${sessionId}`);
      onReady(client.info);
    });

    client.on('disconnected', (reason) => {
      console.log(`WhatsApp client disconnected for session ${sessionId}:`, reason);
      onDisconnected(reason);
    });

    client.on('auth_failure', (msg) => {
      console.error(`WhatsApp auth failure for session ${sessionId}:`, msg);
    });

    client.on('message', async (message) => {
      console.log(`Message received in session ${sessionId}:`, message.body);
      onMessage(message);
    });

    this.clients.set(sessionId, client);
    return client;
  }

  /**
   * Get client by session ID
   */
  getClient(sessionId) {
    return this.clients.get(sessionId);
  }

  /**
   * Remove client
   */
  removeClient(sessionId) {
    const client = this.clients.get(sessionId);
    if (client) {
      client.destroy();
      this.clients.delete(sessionId);
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage(sessionId, to, body) {
    const client = this.getClient(sessionId);
    if (!client) {
      throw new Error('WhatsApp client not found');
    }

    const jid = to.includes('@c.us') ? to : `${to}@c.us`;
    return await client.sendMessage(jid, body);
  }

  /**
   * Send media message
   */
  async sendMediaMessage(sessionId, to, mediaUrl, caption = '') {
    const client = this.getClient(sessionId);
    if (!client) {
      throw new Error('WhatsApp client not found');
    }

    try {
      // Fetch media from URL
      const media = await MessageMedia.fromUrl(mediaUrl);
      if (caption) {
        media.caption = caption;
      }

      const jid = to.includes('@c.us') ? to : `${to}@c.us`;
      return await client.sendMessage(jid, media);
    } catch (error) {
      console.error('Error sending media message:', error);
      throw error;
    }
  }

  /**
   * Get all active clients
   */
  getAllClients() {
    return Array.from(this.clients.entries());
  }

  /**
   * Shutdown all clients
   */
  async shutdown() {
    const promises = Array.from(this.clients.values()).map(client => 
      client.destroy().catch(err => console.error('Error destroying client:', err))
    );
    await Promise.all(promises);
    this.clients.clear();
  }
}

module.exports = WhatsAppManager;

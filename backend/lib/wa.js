/**
 * WhatsApp client management utilities
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const GHLClient = require('./ghl');

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

class WhatsAppManager {
  constructor() {
    this.clients = new Map();
    this.dataDir = process.env.WA_DATA_DIR || path.join(__dirname, '../.wwebjs_auth');
    
    // Restore clients on startup
    this.restoreClients();
  }

  /**
   * Restore clients from database on startup
   */
  async restoreClients() {
    try {
      console.log('🔄 Restoring WhatsApp clients from database...');
      
      const { data: sessions } = await supabaseAdmin
        .from('sessions')
        .select('*')
        .eq('status', 'ready')
        .order('created_at', { ascending: false });
      
      if (sessions && sessions.length > 0) {
        console.log(`📱 Found ${sessions.length} ready sessions to restore`);
        
        for (const session of sessions) {
          try {
            // Recreate client for this session
            const sessionName = `location_${session.subaccount_id}_${session.id}`;
            console.log(`🔄 Restoring client for session: ${sessionName}`);
            
            const client = new Client({
              authStrategy: new LocalAuth({
                clientId: `client_${sessionName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
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
                  '--disable-gpu',
                  '--disable-background-timer-throttling',
                  '--disable-backgrounding-occluded-windows',
                  '--disable-renderer-backgrounding'
                ],
                webVersionCache: {
                  type: 'remote',
                  remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
                }
              },
              restartOnAuthFail: true,
              takeoverOnConflict: true,
              takeoverTimeoutMs: 0
            });

            // Add event handlers
            client.on('ready', () => {
              console.log(`✅ WhatsApp client restored and ready: ${sessionName}`);
            });

            client.on('disconnected', (reason) => {
              console.log(`❌ Restored client disconnected: ${sessionName}`, reason);
              this.clients.delete(sessionName);
            });

            // Store client
            this.clients.set(sessionName, client);
            console.log(`✅ Client restored: ${sessionName}`);
            
            // Initialize client
            client.initialize().catch(error => {
              console.error(`❌ Failed to initialize restored client ${sessionName}:`, error);
              this.clients.delete(sessionName);
            });
            
          } catch (error) {
            console.error(`❌ Failed to restore client for session ${session.id}:`, error);
          }
        }
        
        console.log(`🎉 Restored ${this.clients.size} WhatsApp clients`);
      } else {
        console.log('📱 No ready sessions found to restore');
      }
    } catch (error) {
      console.error('❌ Error restoring clients:', error);
    }
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
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
      },
      restartOnAuthFail: true,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0
    });

    // Event handlers
    client.on('qr', (qr) => {
      console.log(`QR generated for session ${sessionId}`);
      console.log(`QR code: ${qr.substring(0, 50)}...`);
      onQR(qr);
    });

    client.on('ready', () => {
      console.log(`WhatsApp client ready for session ${sessionId}`);
      console.log(`Client info:`, client.info);
      onReady(client.info);
    });

    client.on('disconnected', (reason) => {
      console.log(`WhatsApp client disconnected for session ${sessionId}:`, reason);
      onDisconnected(reason);
    });

    client.on('auth_failure', (msg) => {
      console.error(`WhatsApp auth failure for session ${sessionId}:`, msg);
    });

    client.on('change_state', (state) => {
      console.log(`WhatsApp state changed for session ${sessionId}:`, state);
    });

    // Handle incoming messages
    client.on('message', async (message) => {
      try {
        console.log(`Incoming WhatsApp message for session ${sessionId}:`, {
          from: message.from,
          body: message.body,
          timestamp: message.timestamp
        });
        
        // Forward to GHL
        await this.forwardMessageToGHL(sessionId, message);
      } catch (error) {
        console.error(`Error handling incoming message for session ${sessionId}:`, error);
      }
    });

    // Legacy message handler (if needed)
    if (onMessage) {
      client.on('message', onMessage);
    }

    this.clients.set(sessionId, client);
    console.log(`✅ WhatsApp client stored with key: ${sessionId}`);
    console.log(`📊 Total clients now: ${this.clients.size}`);
    return client;
  }

  /**
   * Get client by session ID
   */
  getClient(sessionId) {
    console.log(`Getting client for sessionId: ${sessionId}`);
    console.log(`Available clients:`, Array.from(this.clients.keys()));
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
   * Forward WhatsApp message to GHL
   */
  async forwardMessageToGHL(sessionId, message) {
    try {
      // Extract phone number from message.from (format: 1234567890@c.us)
      const phoneNumber = message.from.replace('@c.us', '');
      
      console.log(`Forwarding WhatsApp message to GHL: ${phoneNumber} - ${message.body}`);
      
      // Find session details
      const { data: session } = await supabaseAdmin
        .from('sessions')
        .select(`
          *,
          ghl_accounts!inner(*)
        `)
        .eq('id', sessionId)
        .single();
      
      if (!session) {
        console.log(`Session not found for ID: ${sessionId}`);
        return;
      }
      
      // Find contact in GHL by phone number
      const ghlClient = new GHLClient(session.ghl_accounts.access_token);
      const contacts = await ghlClient.searchContacts(phoneNumber);
      
      if (!contacts || contacts.length === 0) {
        console.log(`Contact not found in GHL for phone: ${phoneNumber}`);
        return;
      }
      
      const contact = contacts[0];
      
      // Send message to GHL conversation
      await ghlClient.sendMessage({
        contactId: contact.id,
        message: message.body,
        type: 'SMS'
      });
      
      console.log(`Message forwarded to GHL conversation for contact: ${contact.id}`);
      
    } catch (error) {
      console.error('Error forwarding message to GHL:', error);
    }
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

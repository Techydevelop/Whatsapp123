const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

class WhatsAppWebJSManager {
  constructor() {
    this.clients = new Map();
    this.qrCodes = new Map();
    this.connectionStatus = new Map();
    this.reconnectAttempts = new Map();
    this.startTimes = new Map();
    this.maxReconnectAttempts = 5;
    
    console.log('🚀 WhatsApp Web.js Manager initialized');
  }

  async createClient(sessionName) {
    try {
      console.log(`🚀 Creating WhatsApp Web.js client for session: ${sessionName}`);
      
      // Clear existing client if any
      if (this.clients.has(sessionName)) {
        await this.disconnectClient(sessionName);
      }

      // WhatsApp Web.js options - Optimized for Render
      const options = {
        authStrategy: new LocalAuth({
          clientId: sessionName,
          dataPath: './data'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-default-browser-check',
            '--no-pings',
            '--use-mock-keychain',
            '--memory-pressure-off',
            '--max_old_space_size=4096'
          ],
          timeout: 60000, // 60 seconds timeout
          protocolTimeout: 60000
        },
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },
        restartOnAuthFail: true,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 30000
      };

      // Create client
      const client = new Client(options);
      
      // Store client
      this.clients.set(sessionName, client);
      this.startTimes.set(sessionName, Date.now());
      this.updateConnectionStatus(sessionName, 'initializing');
      this.reconnectAttempts.set(sessionName, 0);

      // QR Code handler with timeout
      client.on('qr', async (qr) => {
        console.log(`📱 QR Code generated for session: ${sessionName}`);
        this.qrCodes.set(sessionName, qr);
        this.updateConnectionStatus(sessionName, 'qr');
        
        // Set QR timeout (5 minutes)
        setTimeout(() => {
          if (this.connectionStatus.get(sessionName) === 'qr') {
            console.log(`⏰ QR timeout reached for session: ${sessionName}`);
            this.updateConnectionStatus(sessionName, 'qr_expired');
          }
        }, 300000);
      });

      // Ready handler
      client.on('ready', () => {
        console.log(`✅ WhatsApp Web.js client ready for session: ${sessionName}`);
        this.updateConnectionStatus(sessionName, 'ready');
        this.qrCodes.delete(sessionName);
        this.reconnectAttempts.set(sessionName, 0);
      });

      // Authenticated handler
      client.on('authenticated', () => {
        console.log(`🔐 Client authenticated for session: ${sessionName}`);
        this.updateConnectionStatus(sessionName, 'authenticated');
      });

      // Message handler
      client.on('message', async (message) => {
        try {
          console.log(`📨 Message received in session: ${sessionName}`);
          await this.processIncomingMessage(sessionName, message);
        } catch (error) {
          console.error(`❌ Error processing message:`, error);
        }
      });

      // Disconnected handler
      client.on('disconnected', (reason) => {
        console.log(`🔌 Client disconnected for session: ${sessionName}, reason: ${reason}`);
        this.updateConnectionStatus(sessionName, 'disconnected');
        
        // Only reconnect for certain reasons
        if (reason !== 'LOGOUT' && reason !== 'NAVIGATION') {
          this.handleReconnect(sessionName);
        }
      });

      // Loading screen handler
      client.on('loading_screen', (percent, message) => {
        console.log(`🔄 Loading ${percent}%: ${message} for session: ${sessionName}`);
        this.updateConnectionStatus(sessionName, `loading_${percent}`);
      });

      // Change state handler
      client.on('change_state', (state) => {
        console.log(`🔄 State changed to: ${state} for session: ${sessionName}`);
        this.updateConnectionStatus(sessionName, state);
      });

      // Initialize client
      await client.initialize();

      console.log(`✅ WhatsApp Web.js client created successfully for session: ${sessionName}`);
      return client;

    } catch (error) {
      console.error(`❌ Error creating WhatsApp Web.js client for session ${sessionName}:`, error);
      this.updateConnectionStatus(sessionName, 'error');
      throw error;
    }
  }

  async getQRCode(sessionName) {
    return this.qrCodes.get(sessionName) || null;
  }

  getClientStatus(sessionName) {
    return {
      status: this.connectionStatus.get(sessionName) || 'disconnected',
      hasQR: this.qrCodes.has(sessionName),
      isConnected: this.clients.has(sessionName) && this.connectionStatus.get(sessionName) === 'ready',
      reconnectAttempts: this.reconnectAttempts.get(sessionName) || 0
    };
  }

  async disconnectClient(sessionName) {
    try {
      console.log(`🔌 Disconnecting client for session: ${sessionName}`);
      
      const client = this.clients.get(sessionName);
      if (client) {
        await client.destroy();
        this.clients.delete(sessionName);
      }
      
      this.qrCodes.delete(sessionName);
      this.connectionStatus.delete(sessionName);
      this.reconnectAttempts.delete(sessionName);
      
      console.log(`✅ Client disconnected for session: ${sessionName}`);
    } catch (error) {
      console.error(`❌ Error disconnecting client:`, error);
    }
  }

  async sendMessage(sessionName, to, message) {
    try {
      const client = this.clients.get(sessionName);
      if (!client) {
        throw new Error('Client not found');
      }

      console.log(`📤 Sending message to ${to} from session: ${sessionName}`);
      const result = await client.sendMessage(to, message);
      
      console.log(`✅ Message sent successfully:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Error sending message:`, error);
      throw error;
    }
  }

  async sendMedia(sessionName, to, mediaPath, caption = '') {
    try {
      const client = this.clients.get(sessionName);
      if (!client) {
        throw new Error('Client not found');
      }

      console.log(`📤 Sending media to ${to} from session: ${sessionName}`);
      const media = MessageMedia.fromFilePath(mediaPath);
      const result = await client.sendMessage(to, media, { caption });
      
      console.log(`✅ Media sent successfully:`, result);
      return result;
    } catch (error) {
      console.error(`❌ Error sending media:`, error);
      throw error;
    }
  }

  updateConnectionStatus(sessionName, status) {
    this.connectionStatus.set(sessionName, status);
    console.log(`📊 Connection status updated for ${sessionName}: ${status}`);
    
    // Log performance metrics
    if (status === 'ready') {
      const startTime = this.startTimes?.get(sessionName);
      if (startTime) {
        const duration = Date.now() - startTime;
        console.log(`⚡ Session ${sessionName} ready in ${duration}ms`);
      }
    }
  }

  // Performance monitoring
  getPerformanceMetrics(sessionName) {
    const status = this.connectionStatus.get(sessionName);
    const attempts = this.reconnectAttempts.get(sessionName) || 0;
    const hasQR = this.qrCodes.has(sessionName);
    
    return {
      status,
      reconnectAttempts: attempts,
      hasQRCode: hasQR,
      isHealthy: status === 'ready' && attempts === 0
    };
  }

  async handleReconnect(sessionName) {
    const attempts = this.reconnectAttempts.get(sessionName) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.log(`❌ Max reconnect attempts reached for session: ${sessionName}`);
      this.updateConnectionStatus(sessionName, 'failed');
      return;
    }

    console.log(`🔄 Attempting to reconnect session: ${sessionName} (attempt ${attempts + 1})`);
    this.reconnectAttempts.set(sessionName, attempts + 1);
    
    // Progressive backoff: 5s, 10s, 20s, 30s, 60s
    const delay = Math.min(5000 * Math.pow(2, attempts), 60000);
    console.log(`⏳ Waiting ${delay/1000}s before reconnect...`);
    
    setTimeout(async () => {
      try {
        await this.createClient(sessionName);
      } catch (error) {
        console.error(`❌ Reconnect failed for session ${sessionName}:`, error);
      }
    }, delay);
  }

  async processIncomingMessage(sessionName, message) {
    try {
      // Log message details
      console.log(`📨 Processing message from ${message.from} in session: ${sessionName}`);
      
      // Here you can add your message processing logic
      // For example, forward to GHL, save to database, etc.
      
    } catch (error) {
      console.error(`❌ Error processing incoming message:`, error);
    }
  }

  // Health check
  getActiveClients() {
    return Array.from(this.clients.keys());
  }

  // Cleanup method
  async cleanup() {
    console.log('🧹 Cleaning up WhatsApp Web.js manager...');
    
    for (const [sessionName, client] of this.clients) {
      try {
        await client.destroy();
      } catch (error) {
        console.error(`❌ Error closing client ${sessionName}:`, error);
      }
    }
    
    this.clients.clear();
    this.qrCodes.clear();
    this.connectionStatus.clear();
    this.reconnectAttempts.clear();
    
    console.log('✅ WhatsApp Web.js manager cleanup completed');
  }
}

module.exports = WhatsAppWebJSManager;

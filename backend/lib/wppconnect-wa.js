const { create, SocketState } = require('@wppconnect-team/wppconnect');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

class WPPConnectManager {
  constructor() {
    this.clients = new Map();
    this.qrCodes = new Map();
    this.connectionStatus = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    
    console.log('🚀 WPPConnect Manager initialized');
  }

  async createClient(sessionName) {
    try {
      console.log(`🚀 Creating WPPConnect client for session: ${sessionName}`);
      
      // Clear existing client if any
      if (this.clients.has(sessionName)) {
        await this.disconnectClient(sessionName);
      }

      // Set up data directory
      const dataDir = path.join(process.cwd(), 'data', sessionName);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // WPPConnect options
      const options = {
        session: sessionName,
        dataPath: dataDir,
        puppeteerOptions: {
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ],
          headless: true,
          timeout: 60000
        },
        catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
          console.log(`📱 QR Code generated for session: ${sessionName}`);
          this.qrCodes.set(sessionName, base64Qr);
          this.updateConnectionStatus(sessionName, 'qr');
        },
        statusFind: (statusSession, session) => {
          console.log(`📊 Status session: ${statusSession} for session: ${session}`);
          if (statusSession === 'isLogged') {
            this.updateConnectionStatus(sessionName, 'connected');
            this.qrCodes.delete(sessionName);
          }
        },
        onLoadingScreen: (percent, message) => {
          console.log(`⏳ Loading: ${percent}% - ${message} for session: ${sessionName}`);
        },
        autoClose: 60000,
        disableWelcome: true
      };

      // Create client
      const client = await create(options);
      
      // Store client
      this.clients.set(sessionName, client);
      this.updateConnectionStatus(sessionName, 'initializing');
      this.reconnectAttempts.set(sessionName, 0);

      // Set up event listeners
      client.onStateChange((state) => {
        console.log(`📊 State changed to: ${state} for session: ${sessionName}`);
        
        switch (state) {
          case SocketState.CONNECTED:
            this.updateConnectionStatus(sessionName, 'connected');
            break;
          case SocketState.CONNECTING:
            this.updateConnectionStatus(sessionName, 'connecting');
            break;
          case SocketState.OPENING:
            this.updateConnectionStatus(sessionName, 'opening');
            break;
          case SocketState.PAIRING:
            this.updateConnectionStatus(sessionName, 'pairing');
            break;
          case SocketState.UNPAIRED:
            this.updateConnectionStatus(sessionName, 'unpaired');
            break;
          case SocketState.UNPAIRED_IDLE:
            this.updateConnectionStatus(sessionName, 'unpaired_idle');
            break;
          case SocketState.BLOCKED:
            this.updateConnectionStatus(sessionName, 'blocked');
            break;
          case SocketState.TIMEOUT:
            this.updateConnectionStatus(sessionName, 'timeout');
            this.handleReconnect(sessionName);
            break;
          default:
            this.updateConnectionStatus(sessionName, 'unknown');
        }
      });

      // Message handler
      client.onMessage(async (message) => {
        try {
          console.log(`📨 Message received in session: ${sessionName}`);
          
          // Process incoming message
          await this.processIncomingMessage(sessionName, message);
        } catch (error) {
          console.error(`❌ Error processing message:`, error);
        }
      });

      console.log(`✅ WPPConnect client created successfully for session: ${sessionName}`);
      return client;

    } catch (error) {
      console.error(`❌ Error creating WPPConnect client for session ${sessionName}:`, error);
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
      isConnected: this.clients.has(sessionName) && this.connectionStatus.get(sessionName) === 'connected',
      reconnectAttempts: this.reconnectAttempts.get(sessionName) || 0
    };
  }

  async disconnectClient(sessionName) {
    try {
      console.log(`🔌 Disconnecting client for session: ${sessionName}`);
      
      const client = this.clients.get(sessionName);
      if (client) {
        await client.close();
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
      const result = await client.sendText(to, message);
      
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
      const result = await client.sendImage(to, mediaPath, 'image', caption);
      
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

    // Wait before reconnecting
    setTimeout(async () => {
      try {
        await this.createClient(sessionName);
      } catch (error) {
        console.error(`❌ Reconnect failed for session: ${sessionName}`, error);
      }
    }, 30000); // 30 seconds delay
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
    console.log('🧹 Cleaning up WPPConnect manager...');
    
    for (const [sessionName, client] of this.clients) {
      try {
        await client.close();
      } catch (error) {
        console.error(`❌ Error closing client ${sessionName}:`, error);
      }
    }
    
    this.clients.clear();
    this.qrCodes.clear();
    this.connectionStatus.clear();
    this.reconnectAttempts.clear();
    
    console.log('✅ WPPConnect manager cleanup completed');
  }
}

module.exports = WPPConnectManager;

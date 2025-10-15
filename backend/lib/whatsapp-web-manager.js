const puppeteer = require('puppeteer-core');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

class WhatsAppWebManager {
  constructor() {
    this.clients = new Map();
    this.qrCodes = new Map();
    this.sessionData = new Map();
    this.reconnectAttempts = new Map();
  }

  async createClient(sessionId) {
    try {
      console.log(`🚀 Creating WhatsApp Web client for session: ${sessionId}`);
      
      // Check if client already exists
      if (this.clients.has(sessionId)) {
        console.log(`⚠️ Client already exists for session: ${sessionId}`);
        return this.clients.get(sessionId);
      }

      // Launch browser
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to WhatsApp Web
      await page.goto('https://web.whatsapp.com', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for QR code to appear
      console.log(`⏳ Waiting for QR code to appear...`);
      
      try {
        await page.waitForSelector('canvas', { timeout: 10000 });
        console.log(`✅ QR code canvas found`);
        
        // Get QR code data
        const qrData = await page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          if (canvas) {
            return canvas.toDataURL();
          }
          return null;
        });

        if (qrData) {
          console.log(`📱 QR code generated successfully`);
          this.qrCodes.set(sessionId, qrData);
          
          // Store client info
          this.clients.set(sessionId, {
            browser,
            page,
            status: 'qr',
            qrData,
            createdAt: Date.now()
          });

          return {
            sessionId,
            status: 'qr',
            qrCode: qrData
          };
        }
      } catch (error) {
        console.log(`⚠️ QR code not found, checking if already connected...`);
        
        // Check if already connected
        const isConnected = await page.evaluate(() => {
          return document.querySelector('[data-testid="chat-list"]') !== null;
        });

        if (isConnected) {
          console.log(`✅ Already connected to WhatsApp Web`);
          this.clients.set(sessionId, {
            browser,
            page,
            status: 'connected',
            createdAt: Date.now()
          });

          return {
            sessionId,
            status: 'connected'
          };
        }
      }

      // If no QR code and not connected, wait a bit more
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try to get QR code again
      const qrData = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          return canvas.toDataURL();
        }
        return null;
      });

      if (qrData) {
        console.log(`📱 QR code generated on retry`);
        this.qrCodes.set(sessionId, qrData);
        
        this.clients.set(sessionId, {
          browser,
          page,
          status: 'qr',
          qrData,
          createdAt: Date.now()
        });

        return {
          sessionId,
          status: 'qr',
          qrCode: qrData
        };
      }

      throw new Error('Failed to generate QR code');

    } catch (error) {
      console.error(`❌ Error creating WhatsApp Web client:`, error);
      throw error;
    }
  }

  async getQRCode(sessionId) {
    const client = this.clients.get(sessionId);
    if (!client) {
      return null;
    }

    if (client.status === 'qr' && client.qrData) {
      return client.qrData;
    }

    // Try to get fresh QR code
    try {
      const qrData = await client.page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          return canvas.toDataURL();
        }
        return null;
      });

      if (qrData) {
        this.qrCodes.set(sessionId, qrData);
        client.qrData = qrData;
        return qrData;
      }
    } catch (error) {
      console.error(`❌ Error getting QR code:`, error);
    }

    return null;
  }

  async getClientStatus(sessionId) {
    const client = this.clients.get(sessionId);
    if (!client) {
      return { status: 'not_found' };
    }

    try {
      // Check if still connected
      const isConnected = await client.page.evaluate(() => {
        return document.querySelector('[data-testid="chat-list"]') !== null;
      });

      if (isConnected && client.status !== 'connected') {
        client.status = 'connected';
        console.log(`✅ Session ${sessionId} connected successfully`);
      }

      return {
        status: client.status,
        hasQR: !!client.qrData,
        createdAt: client.createdAt,
        isConnected
      };
    } catch (error) {
      console.error(`❌ Error checking client status:`, error);
      return { status: 'error', error: error.message };
    }
  }

  async sendMessage(sessionId, to, message) {
    const client = this.clients.get(sessionId);
    if (!client || client.status !== 'connected') {
      throw new Error('Client not connected');
    }

    try {
      console.log(`📤 Sending message to ${to}: ${message}`);
      
      // Find chat
      await client.page.evaluate((phoneNumber) => {
        // Click on search
        const searchBox = document.querySelector('[data-testid="chat-list-search"]');
        if (searchBox) {
          searchBox.click();
          searchBox.value = phoneNumber;
          searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, to);

      // Wait and click on chat
      await client.page.waitForTimeout(2000);
      
      await client.page.evaluate(() => {
        const chat = document.querySelector('[data-testid="cell-frame-container"]');
        if (chat) {
          chat.click();
        }
      });

      // Type message
      await client.page.waitForTimeout(1000);
      
      await client.page.evaluate((msg) => {
        const messageBox = document.querySelector('[data-testid="conversation-compose-box-input"]');
        if (messageBox) {
          messageBox.value = msg;
          messageBox.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, message);

      // Send message
      await client.page.waitForTimeout(500);
      
      await client.page.evaluate(() => {
        const sendButton = document.querySelector('[data-testid="send"]');
        if (sendButton) {
          sendButton.click();
        }
      });

      console.log(`✅ Message sent successfully`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Error sending message:`, error);
      throw error;
    }
  }

  async disconnectClient(sessionId) {
    const client = this.clients.get(sessionId);
    if (!client) {
      return;
    }

    try {
      console.log(`🔌 Disconnecting client: ${sessionId}`);
      
      if (client.browser) {
        await client.browser.close();
      }
      
      this.clients.delete(sessionId);
      this.qrCodes.delete(sessionId);
      this.sessionData.delete(sessionId);
      
      console.log(`✅ Client disconnected: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Error disconnecting client:`, error);
    }
  }

  async clearSessionData(sessionId) {
    console.log(`🗑️ Clearing session data: ${sessionId}`);
    await this.disconnectClient(sessionId);
  }

  getActiveClients() {
    return Array.from(this.clients.keys());
  }

  async startHealthMonitor() {
    console.log(`🏥 Starting health monitor for WhatsApp Web clients`);
    
    setInterval(async () => {
      const activeClients = this.getActiveClients();
      console.log(`📊 Active WhatsApp Web clients: ${activeClients.length}`);
      
      for (const sessionId of activeClients) {
        try {
          const status = await this.getClientStatus(sessionId);
          console.log(`📊 Client ${sessionId}: ${status.status}`);
        } catch (error) {
          console.error(`❌ Health check failed for ${sessionId}:`, error);
        }
      }
    }, 30000); // Check every 30 seconds
  }
}

module.exports = WhatsAppWebManager;

// Venom WhatsApp Manager - Stable and Reliable
const VenomWhatsAppManager = require('./venom-wa');

/**
 * Simple factory that returns Venom manager
 * Venom-bot is the most stable option for cloud hosting (Render/Railway)
 */
class WhatsAppManagerFactory {
  static create() {
    console.log(`📱 WhatsApp Provider: VENOM-BOT`);
    console.log('✅ Using Venom-bot (Most stable for cloud hosting)');
    return new VenomWhatsAppManager();
  }
  
  static getProviderName() {
    return 'VENOM';
  }
}

module.exports = WhatsAppManagerFactory;


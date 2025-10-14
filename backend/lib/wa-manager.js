// WhatsApp Manager - Baileys Only (Boss Choice)
const BaileysWhatsAppManager = require('./baileys-wa');

/**
 * Simple factory that returns Baileys manager
 * Baileys 6.7.16 - Stable version for WhatsApp integration
 */
class WhatsAppManagerFactory {
  static create() {
    console.log(`📱 WhatsApp Provider: BAILEYS`);
    console.log('✅ Using Baileys (Boss approved - stable version 6.7.16)');
    return new BaileysWhatsAppManager();
  }
  
  static getProviderName() {
    return 'BAILEYS';
  }
}

module.exports = WhatsAppManagerFactory;


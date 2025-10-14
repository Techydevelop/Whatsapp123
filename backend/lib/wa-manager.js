// WhatsApp Manager - Baileys (Boss Choice) + Venom Backup
const BaileysWhatsAppManager = require('./baileys-wa');
const VenomWhatsAppManager = require('./venom-wa');

/**
 * Factory that returns Baileys by default (Boss choice)
 * Falls back to Venom if Baileys fails
 */
class WhatsAppManagerFactory {
  static create() {
    const provider = (process.env.WA_PROVIDER || 'baileys').toLowerCase();
    
    console.log(`📱 WhatsApp Provider: ${provider.toUpperCase()}`);
    
    switch (provider) {
      case 'venom':
        console.log('✅ Using Venom-bot (Backup option)');
        return new VenomWhatsAppManager();
      
      case 'baileys':
      default:
        console.log('✅ Using Baileys (Boss approved - stable version 6.7.16)');
        return new BaileysWhatsAppManager();
    }
  }
  
  static getProviderName() {
    return (process.env.WA_PROVIDER || 'baileys').toUpperCase();
  }
}

module.exports = WhatsAppManagerFactory;


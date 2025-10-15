// WhatsApp Manager - WhatsApp Web (Direct Browser Automation)
const WhatsAppWebManager = require('./whatsapp-web-manager');

class WhatsAppManagerFactory {
  static create() {
    console.log(`📱 WhatsApp Provider: WHATSAPP WEB`);
    console.log('✅ Using WhatsApp Web (Direct browser automation)');
    return new WhatsAppWebManager();
  }
  
  static getProviderName() {
    return 'WHATSAPP_WEB';
  }
}

module.exports = WhatsAppManagerFactory;

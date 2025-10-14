const { getBaileysClient } = require('../lib/baileys-wa');

/**
 * Send WhatsApp OTP to customer
 * @param {string} phone - Customer phone number
 * @param {string} otp - OTP code
 * @returns {Promise<boolean>} Success status
 */
const sendWhatsAppOTP = async (phone, otp) => {
    try {
        // Get admin WhatsApp client for sending OTPs
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `🔐 Your WhatsApp-GHL Platform verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nDo not share this code with anyone.`;
        
        // Send message
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ WhatsApp OTP sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending WhatsApp OTP to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send connection lost alert via WhatsApp
 * @param {string} phone - Customer phone number
 * @param {string} reconnectUrl - Reconnect URL
 * @param {string} businessName - Business name
 * @param {string} reason - Disconnection reason
 * @returns {Promise<boolean>} Success status
 */
const sendConnectionLostWhatsApp = async (phone, reconnectUrl, businessName, reason) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `⚠️ WhatsApp Connection Lost

Hi ${businessName},

Your WhatsApp connection has been disconnected.

Reason: ${reason || 'Unknown'}

Please reconnect immediately:
${reconnectUrl}

Need help? Contact support.`;
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Connection lost alert sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending connection lost alert to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send trial expiring alert (3 days) via WhatsApp
 * @param {string} phone - Customer phone number
 * @param {string} businessName - Business name
 * @param {string} trialEndsAt - Trial end date
 * @param {string} upgradeUrl - Upgrade URL
 * @returns {Promise<boolean>} Success status
 */
const sendTrialExpiringWhatsApp = async (phone, businessName, trialEndsAt, upgradeUrl) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `⏰ Trial Expiring Soon

Hi ${businessName},

Your 7-day trial expires in 3 days (${trialEndsAt}).

Upgrade now to continue:
${upgradeUrl}

Questions? Reply to this message.`;
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Trial expiring alert sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending trial expiring alert to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send trial expiring alert (1 day) via WhatsApp
 * @param {string} phone - Customer phone number
 * @param {string} businessName - Business name
 * @param {string} upgradeUrl - Upgrade URL
 * @returns {Promise<boolean>} Success status
 */
const sendTrialExpiring1DayWhatsApp = async (phone, businessName, upgradeUrl) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `🚨 Last Day of Trial!

Hi ${businessName},

Your trial ends tomorrow!

Upgrade now to avoid losing access:
${upgradeUrl}

Need help? Contact us.`;
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Trial expiring 1-day alert sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending trial expiring 1-day alert to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send trial expired alert via WhatsApp
 * @param {string} phone - Customer phone number
 * @param {string} businessName - Business name
 * @param {string} upgradeUrl - Upgrade URL
 * @returns {Promise<boolean>} Success status
 */
const sendTrialExpiredWhatsApp = async (phone, businessName, upgradeUrl) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `Trial Ended

Hi ${businessName},

Your trial has ended. Your account is now suspended.

Upgrade to restore access:
${upgradeUrl}

Contact us for assistance.`;
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Trial expired alert sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending trial expired alert to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send subscription expiring alert via WhatsApp
 * @param {string} phone - Customer phone number
 * @param {string} businessName - Business name
 * @param {string} plan - Current plan
 * @param {number} daysLeft - Days remaining
 * @param {string} renewUrl - Renewal URL
 * @returns {Promise<boolean>} Success status
 */
const sendSubscriptionExpiringWhatsApp = async (phone, businessName, plan, daysLeft, renewUrl) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        const message = `Subscription Renewal Reminder

Hi ${businessName},

Your ${plan} subscription expires in ${daysLeft} days.

Renew now:
${renewUrl}

Questions? Reply here.`;
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Subscription expiring alert sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending subscription expiring alert to ${phone}:`, error);
        throw error;
    }
};

/**
 * Send custom WhatsApp message
 * @param {string} phone - Customer phone number
 * @param {string} message - Message content
 * @returns {Promise<boolean>} Success status
 */
const sendCustomWhatsAppMessage = async (phone, message) => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        await baileysClient.sendMessage(phone, { text: message });
        
        console.log(`✅ Custom WhatsApp message sent to ${phone}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending custom WhatsApp message to ${phone}:`, error);
        throw error;
    }
};

/**
 * Test WhatsApp configuration
 * @returns {Promise<boolean>} Success status
 */
const testWhatsAppConfiguration = async () => {
    try {
        const adminSessionId = process.env.ADMIN_WHATSAPP_SESSION_ID || 'admin_otp_sender';
        const baileysClient = await getBaileysClient(adminSessionId);
        
        if (!baileysClient) {
            throw new Error('Admin WhatsApp client not available');
        }
        
        // Check if client is connected
        const isConnected = baileysClient.isConnected();
        
        if (isConnected) {
            console.log('✅ WhatsApp configuration is valid');
            return true;
        } else {
            throw new Error('WhatsApp client not connected');
        }
        
    } catch (error) {
        console.error('❌ WhatsApp configuration error:', error);
        return false;
    }
};

module.exports = {
    sendWhatsAppOTP,
    sendConnectionLostWhatsApp,
    sendTrialExpiringWhatsApp,
    sendTrialExpiring1DayWhatsApp,
    sendTrialExpiredWhatsApp,
    sendSubscriptionExpiringWhatsApp,
    sendCustomWhatsAppMessage,
    testWhatsAppConfiguration
};

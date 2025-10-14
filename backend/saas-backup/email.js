const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;

// Create email transporter
const createTransporter = () => {
    return nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

/**
 * Load email template from file
 * @param {string} templateName - Template name (without extension)
 * @returns {Promise<string>} Template HTML content
 */
const loadEmailTemplate = async (templateName) => {
    try {
        const templatePath = path.join(__dirname, '../templates/email', `${templateName}.html`);
        return await fs.readFile(templatePath, 'utf8');
    } catch (error) {
        console.error(`❌ Error loading email template ${templateName}:`, error);
        throw error;
    }
};

/**
 * Replace template variables
 * @param {string} template - Template content
 * @param {object} variables - Variables to replace
 * @returns {string} Rendered template
 */
const renderTemplate = (template, variables) => {
    let rendered = template;
    
    // Replace {{variable}} placeholders
    Object.keys(variables).forEach(key => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        rendered = rendered.replace(placeholder, variables[key] || '');
    });
    
    return rendered;
};

/**
 * Send email using template
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} templateName - Template name
 * @param {object} variables - Template variables
 * @returns {Promise<boolean>} Success status
 */
const sendTemplateEmail = async (to, subject, templateName, variables) => {
    try {
        const transporter = createTransporter();
        const template = await loadEmailTemplate(templateName);
        const html = renderTemplate(template, variables);
        
        const mailOptions = {
            from: `"${process.env.FROM_NAME || 'WhatsApp-GHL Platform'}" <${process.env.FROM_EMAIL}>`,
            to: to,
            subject: subject,
            html: html
        };
        
        const result = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${to}: ${result.messageId}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Error sending email to ${to}:`, error);
        throw error;
    }
};

/**
 * Send welcome email with credentials
 * @param {string} email - Customer email
 * @param {string} password - Generated password
 * @param {string} dashboardUrl - Dashboard URL
 * @param {string} businessName - Business name
 * @param {string} trialEndsAt - Trial end date
 */
const sendWelcomeEmail = async (email, password, dashboardUrl, businessName, trialEndsAt) => {
    const variables = {
        business_name: businessName,
        email: email,
        password: password,
        dashboard_url: dashboardUrl,
        trial_ends_at: trialEndsAt
    };
    
    return await sendTemplateEmail(
        email,
        'Welcome to WhatsApp-GHL Platform - Your Account is Ready!',
        'welcome',
        variables
    );
};

/**
 * Send OTP email
 * @param {string} email - Customer email
 * @param {string} otp - OTP code
 */
const sendOTPEmail = async (email, otp) => {
    const variables = {
        email: email,
        otp: otp
    };
    
    return await sendTemplateEmail(
        email,
        'Your Verification Code - WhatsApp-GHL Platform',
        'otp',
        variables
    );
};

/**
 * Send connection lost alert
 * @param {string} email - Customer email
 * @param {string} reconnectUrl - Reconnect URL
 * @param {string} businessName - Business name
 * @param {string} phoneNumber - Phone number
 * @param {string} reason - Disconnection reason
 */
const sendConnectionLostEmail = async (email, reconnectUrl, businessName, phoneNumber, reason) => {
    const variables = {
        business_name: businessName,
        phone_number: phoneNumber,
        reconnect_url: reconnectUrl,
        reason: reason || 'Unknown'
    };
    
    return await sendTemplateEmail(
        email,
        '⚠️ WhatsApp Connection Lost - Action Required',
        'connection-lost',
        variables
    );
};

/**
 * Send trial expiring email (3 days)
 * @param {string} email - Customer email
 * @param {string} businessName - Business name
 * @param {string} trialEndsAt - Trial end date
 * @param {string} upgradeUrl - Upgrade URL
 */
const sendTrialExpiringEmail = async (email, businessName, trialEndsAt, upgradeUrl) => {
    const variables = {
        business_name: businessName,
        trial_ends_at: trialEndsAt,
        upgrade_url: upgradeUrl
    };
    
    return await sendTemplateEmail(
        email,
        'Your Trial Expires in 3 Days - Upgrade Now',
        'trial-expiring-3days',
        variables
    );
};

/**
 * Send trial expiring email (1 day)
 * @param {string} email - Customer email
 * @param {string} businessName - Business name
 * @param {string} trialEndsAt - Trial end date
 * @param {string} upgradeUrl - Upgrade URL
 */
const sendTrialExpiring1DayEmail = async (email, businessName, trialEndsAt, upgradeUrl) => {
    const variables = {
        business_name: businessName,
        trial_ends_at: trialEndsAt,
        upgrade_url: upgradeUrl
    };
    
    return await sendTemplateEmail(
        email,
        '⏰ Last Day of Your Trial - Don\'t Lose Access!',
        'trial-expiring-1day',
        variables
    );
};

/**
 * Send trial expired email
 * @param {string} email - Customer email
 * @param {string} businessName - Business name
 * @param {string} upgradeUrl - Upgrade URL
 */
const sendTrialExpiredEmail = async (email, businessName, upgradeUrl) => {
    const variables = {
        business_name: businessName,
        upgrade_url: upgradeUrl
    };
    
    return await sendTemplateEmail(
        email,
        'Your Trial Has Ended - Upgrade to Continue',
        'trial-expired',
        variables
    );
};

/**
 * Send subscription expiring email
 * @param {string} email - Customer email
 * @param {string} businessName - Business name
 * @param {string} plan - Current plan
 * @param {string} subscriptionEndsAt - Subscription end date
 * @param {number} daysLeft - Days remaining
 * @param {string} renewUrl - Renewal URL
 */
const sendSubscriptionExpiringEmail = async (email, businessName, plan, subscriptionEndsAt, daysLeft, renewUrl) => {
    const variables = {
        business_name: businessName,
        plan: plan,
        subscription_ends_at: subscriptionEndsAt,
        days_left: daysLeft,
        renew_url: renewUrl
    };
    
    return await sendTemplateEmail(
        email,
        `Your ${plan} Subscription Expires in ${daysLeft} Days`,
        'subscription-expiring',
        variables
    );
};

/**
 * Send upgrade success email
 * @param {string} email - Customer email
 * @param {string} businessName - Business name
 * @param {string} plan - New plan
 * @param {number} amount - Amount paid
 * @param {string} subscriptionEndsAt - Subscription end date
 */
const sendUpgradeSuccessEmail = async (email, businessName, plan, amount, subscriptionEndsAt) => {
    const variables = {
        business_name: businessName,
        plan: plan,
        amount: amount,
        subscription_ends_at: subscriptionEndsAt
    };
    
    return await sendTemplateEmail(
        email,
        `🎉 Upgrade Successful - Welcome to ${plan} Plan`,
        'upgrade-success',
        variables
    );
};

/**
 * Test email configuration
 * @returns {Promise<boolean>} Success status
 */
const testEmailConfiguration = async () => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        console.log('✅ Email configuration is valid');
        return true;
    } catch (error) {
        console.error('❌ Email configuration error:', error);
        return false;
    }
};

module.exports = {
    sendWelcomeEmail,
    sendOTPEmail,
    sendConnectionLostEmail,
    sendTrialExpiringEmail,
    sendTrialExpiring1DayEmail,
    sendTrialExpiredEmail,
    sendSubscriptionExpiringEmail,
    sendUpgradeSuccessEmail,
    testEmailConfiguration,
    sendTemplateEmail
};

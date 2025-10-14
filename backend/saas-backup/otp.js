const { query } = require('../config/customerDb');
const { generateOTP } = require('./password');

/**
 * Store OTP for email and WhatsApp verification
 * @param {string} email - Customer email
 * @param {string} phone - Customer phone number
 * @returns {Promise<object>} Object containing email_otp and whatsapp_otp
 */
const storeOTP = async (email, phone) => {
    try {
        // Generate 6-digit OTPs
        const emailOTP = generateOTP(6);
        const whatsappOTP = generateOTP(6);
        
        // Set expiry time (10 minutes from now)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        
        // Delete any existing OTP for this email/phone
        await query(
            'DELETE FROM otp_verifications WHERE email = $1 OR phone = $2',
            [email, phone]
        );
        
        // Insert new OTP record
        await query(
            `INSERT INTO otp_verifications (email, phone, email_otp, whatsapp_otp, expires_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [email, phone, emailOTP, whatsappOTP, expiresAt]
        );
        
        console.log(`✅ OTP stored for ${email} and ${phone}`);
        
        return {
            email_otp: emailOTP,
            whatsapp_otp: whatsappOTP,
            expires_at: expiresAt
        };
        
    } catch (error) {
        console.error('❌ Error storing OTP:', error);
        throw error;
    }
};

/**
 * Verify both email and WhatsApp OTPs
 * @param {string} email - Customer email
 * @param {string} emailOTP - Email OTP code
 * @param {string} whatsappOTP - WhatsApp OTP code
 * @returns {Promise<boolean>} True if both OTPs are valid and not expired
 */
const verifyOTP = async (email, emailOTP, whatsappOTP) => {
    try {
        // Query OTP record
        const result = await query(
            `SELECT email_otp, whatsapp_otp, expires_at, email_verified, whatsapp_verified
             FROM otp_verifications 
             WHERE email = $1 AND expires_at > NOW()`,
            [email]
        );
        
        if (result.rows.length === 0) {
            console.log(`❌ No valid OTP found for ${email}`);
            return false;
        }
        
        const otpRecord = result.rows[0];
        
        // Check if OTPs match
        const emailOTPMatch = otpRecord.email_otp === emailOTP;
        const whatsappOTPMatch = otpRecord.whatsapp_otp === whatsappOTP;
        
        if (!emailOTPMatch || !whatsappOTPMatch) {
            console.log(`❌ OTP mismatch for ${email}`);
            return false;
        }
        
        // Update verification status
        await query(
            `UPDATE otp_verifications 
             SET email_verified = $1, whatsapp_verified = $2
             WHERE email = $3`,
            [emailOTPMatch, whatsappOTPMatch, email]
        );
        
        console.log(`✅ OTPs verified successfully for ${email}`);
        return true;
        
    } catch (error) {
        console.error('❌ Error verifying OTP:', error);
        throw error;
    }
};

/**
 * Check if OTP is verified for both channels
 * @param {string} email - Customer email
 * @returns {Promise<boolean>} True if both OTPs are verified
 */
const isOTPVerified = async (email) => {
    try {
        const result = await query(
            `SELECT email_verified, whatsapp_verified
             FROM otp_verifications 
             WHERE email = $1 AND expires_at > NOW()`,
            [email]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        const otpRecord = result.rows[0];
        return otpRecord.email_verified && otpRecord.whatsapp_verified;
        
    } catch (error) {
        console.error('❌ Error checking OTP verification:', error);
        throw error;
    }
};

/**
 * Delete OTP record after successful verification
 * @param {string} email - Customer email
 */
const deleteOTP = async (email) => {
    try {
        await query(
            'DELETE FROM otp_verifications WHERE email = $1',
            [email]
        );
        console.log(`✅ OTP record deleted for ${email}`);
    } catch (error) {
        console.error('❌ Error deleting OTP:', error);
        throw error;
    }
};

/**
 * Clean up expired OTP records (background job)
 */
const cleanupExpiredOTPs = async () => {
    try {
        const result = await query(
            'DELETE FROM otp_verifications WHERE expires_at < NOW()'
        );
        
        if (result.rowCount > 0) {
            console.log(`🧹 Cleaned up ${result.rowCount} expired OTP records`);
        }
        
        return result.rowCount;
        
    } catch (error) {
        console.error('❌ Error cleaning up expired OTPs:', error);
        throw error;
    }
};

/**
 * Get OTP record for debugging
 * @param {string} email - Customer email
 * @returns {Promise<object|null>} OTP record or null
 */
const getOTPRecord = async (email) => {
    try {
        const result = await query(
            `SELECT email, phone, email_otp, whatsapp_otp, email_verified, whatsapp_verified, expires_at, created_at
             FROM otp_verifications 
             WHERE email = $1`,
            [email]
        );
        
        return result.rows.length > 0 ? result.rows[0] : null;
        
    } catch (error) {
        console.error('❌ Error getting OTP record:', error);
        throw error;
    }
};

module.exports = {
    storeOTP,
    verifyOTP,
    isOTPVerified,
    deleteOTP,
    cleanupExpiredOTPs,
    getOTPRecord
};

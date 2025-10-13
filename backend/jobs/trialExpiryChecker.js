const { query } = require('../config/customerDb');
const { sendTrialExpiringEmail, sendTrialExpiring1DayEmail, sendTrialExpiredEmail } = require('../utils/email');
const { sendTrialExpiringWhatsApp, sendTrialExpiring1DayWhatsApp, sendTrialExpiredWhatsApp } = require('../utils/whatsapp-notification');

/**
 * Check and notify customers about trial expiry
 * Runs daily at 9 AM
 */
const checkTrialExpiry = async () => {
    try {
        console.log('🔍 Checking trial expiry...');

        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

        // Check customers with trials expiring in 3 days
        await checkTrialExpiringIn3Days(threeDaysFromNow);

        // Check customers with trials expiring in 1 day
        await checkTrialExpiringIn1Day(oneDayFromNow);

        // Check customers with expired trials
        await checkExpiredTrials(now);

        console.log('✅ Trial expiry check completed');

    } catch (error) {
        console.error('❌ Error checking trial expiry:', error);
    }
};

/**
 * Check customers with trials expiring in 3 days
 */
const checkTrialExpiringIn3Days = async (threeDaysFromNow) => {
    try {
        console.log('🔍 Checking trials expiring in 3 days...');

        const customersResult = await query(
            `SELECT id, email, phone, business_name, trial_ends_at
             FROM customers 
             WHERE plan = 'trial' 
             AND status = 'active'
             AND trial_ends_at BETWEEN NOW() AND $1
             AND trial_ends_at IS NOT NULL`,
            [threeDaysFromNow]
        );

        console.log(`📊 Found ${customersResult.rows.length} customers with trials expiring in 3 days`);

        for (const customer of customersResult.rows) {
            // Check if notification already sent
            const existingNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'trial_expiring_3days' 
                 AND created_at > DATE(trial_ends_at) - INTERVAL '3 days'`,
                [customer.id]
            );

            if (existingNotification.rows.length === 0) {
                await sendTrialExpiringNotification(customer, '3days');
            }
        }

    } catch (error) {
        console.error('❌ Error checking 3-day trial expiry:', error);
    }
};

/**
 * Check customers with trials expiring in 1 day
 */
const checkTrialExpiringIn1Day = async (oneDayFromNow) => {
    try {
        console.log('🔍 Checking trials expiring in 1 day...');

        const customersResult = await query(
            `SELECT id, email, phone, business_name, trial_ends_at
             FROM customers 
             WHERE plan = 'trial' 
             AND status = 'active'
             AND trial_ends_at BETWEEN NOW() AND $1
             AND trial_ends_at IS NOT NULL`,
            [oneDayFromNow]
        );

        console.log(`📊 Found ${customersResult.rows.length} customers with trials expiring in 1 day`);

        for (const customer of customersResult.rows) {
            // Check if notification already sent
            const existingNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'trial_expiring_1day' 
                 AND created_at > DATE(trial_ends_at) - INTERVAL '1 day'`,
                [customer.id]
            );

            if (existingNotification.rows.length === 0) {
                await sendTrialExpiringNotification(customer, '1day');
            }
        }

    } catch (error) {
        console.error('❌ Error checking 1-day trial expiry:', error);
    }
};

/**
 * Check customers with expired trials
 */
const checkExpiredTrials = async (now) => {
    try {
        console.log('🔍 Checking expired trials...');

        const customersResult = await query(
            `SELECT id, email, phone, business_name, trial_ends_at
             FROM customers 
             WHERE plan = 'trial' 
             AND status = 'active'
             AND trial_ends_at < $1
             AND trial_ends_at IS NOT NULL`,
            [now]
        );

        console.log(`📊 Found ${customersResult.rows.length} customers with expired trials`);

        for (const customer of customersResult.rows) {
            // Check if notification already sent
            const existingNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'trial_expired' 
                 AND created_at > trial_ends_at`,
                [customer.id]
            );

            if (existingNotification.rows.length === 0) {
                await sendTrialExpiredNotification(customer);
            }

            // Update customer status to expired
            await query(
                'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2',
                ['expired', customer.id]
            );

            console.log(`✅ Customer status updated to expired: ${customer.email}`);
        }

    } catch (error) {
        console.error('❌ Error checking expired trials:', error);
    }
};

/**
 * Send trial expiring notification
 */
const sendTrialExpiringNotification = async (customer, type) => {
    try {
        const upgradeUrl = `${process.env.WEBSITE_URL}/upgrade`;
        const trialEndsAt = customer.trial_ends_at.toISOString().split('T')[0];

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, $2, 'both', 'pending')
             RETURNING id`,
            [customer.id, `trial_expiring_${type}`]
        );

        const notificationId = notificationResult.rows[0].id;

        try {
            if (type === '3days') {
                // Send 3-day expiry notifications
                await sendTrialExpiringEmail(
                    customer.email,
                    customer.business_name,
                    trialEndsAt,
                    upgradeUrl
                );

                await sendTrialExpiringWhatsApp(
                    customer.phone,
                    customer.business_name,
                    trialEndsAt,
                    upgradeUrl
                );
            } else if (type === '1day') {
                // Send 1-day expiry notifications
                await sendTrialExpiring1DayEmail(
                    customer.email,
                    customer.business_name,
                    trialEndsAt,
                    upgradeUrl
                );

                await sendTrialExpiring1DayWhatsApp(
                    customer.phone,
                    upgradeUrl
                );
            }

            // Update notification status
            await query(
                'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
                ['sent', notificationId]
            );

            console.log(`✅ Trial expiring notification sent to: ${customer.email} (${type})`);

        } catch (notificationError) {
            console.error(`❌ Error sending trial expiring notification to ${customer.email}:`, notificationError);
            
            // Update notification status to failed
            await query(
                'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
                ['failed', notificationError.message, notificationId]
            );
        }

    } catch (error) {
        console.error('❌ Error in sendTrialExpiringNotification:', error);
    }
};

/**
 * Send trial expired notification
 */
const sendTrialExpiredNotification = async (customer) => {
    try {
        const upgradeUrl = `${process.env.WEBSITE_URL}/upgrade`;

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, 'trial_expired', 'both', 'pending')
             RETURNING id`,
            [customer.id]
        );

        const notificationId = notificationResult.rows[0].id;

        try {
            // Send trial expired notifications
            await sendTrialExpiredEmail(
                customer.email,
                customer.business_name,
                upgradeUrl
            );

            await sendTrialExpiredWhatsApp(
                customer.phone,
                customer.business_name,
                upgradeUrl
            );

            // Update notification status
            await query(
                'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
                ['sent', notificationId]
            );

            console.log(`✅ Trial expired notification sent to: ${customer.email}`);

        } catch (notificationError) {
            console.error(`❌ Error sending trial expired notification to ${customer.email}:`, notificationError);
            
            // Update notification status to failed
            await query(
                'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
                ['failed', notificationError.message, notificationId]
            );
        }

    } catch (error) {
        console.error('❌ Error in sendTrialExpiredNotification:', error);
    }
};

/**
 * Get trial statistics
 */
const getTrialStats = async () => {
    try {
        // Get total trial customers
        const totalTrialsResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan = 'trial'");
        const totalTrials = parseInt(totalTrialsResult.rows[0].count);

        // Get active trial customers
        const activeTrialsResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan = 'trial' AND status = 'active'");
        const activeTrials = parseInt(activeTrialsResult.rows[0].count);

        // Get expired trial customers
        const expiredTrialsResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan = 'trial' AND status = 'expired'");
        const expiredTrials = parseInt(expiredTrialsResult.rows[0].count);

        // Get trials expiring in 3 days
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const expiring3DaysResult = await query(
            `SELECT COUNT(*) as count FROM customers 
             WHERE plan = 'trial' AND status = 'active' 
             AND trial_ends_at BETWEEN NOW() AND $1`,
            [threeDaysFromNow]
        );
        const expiring3Days = parseInt(expiring3DaysResult.rows[0].count);

        // Get trials expiring in 1 day
        const oneDayFromNow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
        const expiring1DayResult = await query(
            `SELECT COUNT(*) as count FROM customers 
             WHERE plan = 'trial' AND status = 'active' 
             AND trial_ends_at BETWEEN NOW() AND $1`,
            [oneDayFromNow]
        );
        const expiring1Day = parseInt(expiring1DayResult.rows[0].count);

        const stats = {
            total_trials: totalTrials,
            active_trials: activeTrials,
            expired_trials: expiredTrials,
            expiring_in_3_days: expiring3Days,
            expiring_in_1_day: expiring1Day
        };

        console.log('📊 Trial Statistics:', stats);
        return stats;

    } catch (error) {
        console.error('❌ Error getting trial stats:', error);
        return null;
    }
};

module.exports = {
    checkTrialExpiry,
    checkTrialExpiringIn3Days,
    checkTrialExpiringIn1Day,
    checkExpiredTrials,
    getTrialStats
};

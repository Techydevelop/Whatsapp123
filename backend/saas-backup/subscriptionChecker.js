const { query } = require('../config/customerDb');
const { sendSubscriptionExpiringEmail } = require('../utils/email');
const { sendSubscriptionExpiringWhatsApp } = require('../utils/whatsapp-notification');

/**
 * Check and notify customers about subscription expiry
 * Runs daily at 9 AM
 */
const checkSubscriptionExpiry = async () => {
    try {
        console.log('🔍 Checking subscription expiry...');

        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Check customers with subscriptions expiring in 7 days
        await checkSubscriptionExpiringIn7Days(sevenDaysFromNow);

        // Check customers with expired subscriptions
        await checkExpiredSubscriptions(now);

        console.log('✅ Subscription expiry check completed');

    } catch (error) {
        console.error('❌ Error checking subscription expiry:', error);
    }
};

/**
 * Check customers with subscriptions expiring in 7 days
 */
const checkSubscriptionExpiringIn7Days = async (sevenDaysFromNow) => {
    try {
        console.log('🔍 Checking subscriptions expiring in 7 days...');

        const customersResult = await query(
            `SELECT c.id, c.email, c.phone, c.business_name, c.plan, c.subscription_ends_at
             FROM customers c
             WHERE c.plan IN ('basic', 'pro', 'enterprise')
             AND c.status = 'active'
             AND c.subscription_ends_at BETWEEN NOW() AND $1
             AND c.subscription_ends_at IS NOT NULL`,
            [sevenDaysFromNow]
        );

        console.log(`📊 Found ${customersResult.rows.length} customers with subscriptions expiring in 7 days`);

        for (const customer of customersResult.rows) {
            // Check if notification already sent
            const existingNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'subscription_expiring' 
                 AND created_at > DATE(subscription_ends_at) - INTERVAL '7 days'`,
                [customer.id]
            );

            if (existingNotification.rows.length === 0) {
                await sendSubscriptionExpiringNotification(customer);
            }
        }

    } catch (error) {
        console.error('❌ Error checking 7-day subscription expiry:', error);
    }
};

/**
 * Check customers with expired subscriptions
 */
const checkExpiredSubscriptions = async (now) => {
    try {
        console.log('🔍 Checking expired subscriptions...');

        const customersResult = await query(
            `SELECT c.id, c.email, c.phone, c.business_name, c.plan, c.subscription_ends_at
             FROM customers c
             WHERE c.plan IN ('basic', 'pro', 'enterprise')
             AND c.status = 'active'
             AND c.subscription_ends_at < $1
             AND c.subscription_ends_at IS NOT NULL`,
            [now]
        );

        console.log(`📊 Found ${customersResult.rows.length} customers with expired subscriptions`);

        for (const customer of customersResult.rows) {
            // Check if notification already sent
            const existingNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'subscription_expired' 
                 AND created_at > subscription_ends_at`,
                [customer.id]
            );

            if (existingNotification.rows.length === 0) {
                await sendSubscriptionExpiredNotification(customer);
            }

            // Update customer status to expired
            await query(
                'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2',
                ['expired', customer.id]
            );

            // Update subscription status to expired
            await query(
                `UPDATE subscriptions 
                 SET status = 'expired', updated_at = NOW() 
                 WHERE customer_id = $1 AND status = 'active'`,
                [customer.id]
            );

            console.log(`✅ Customer status updated to expired: ${customer.email}`);
        }

    } catch (error) {
        console.error('❌ Error checking expired subscriptions:', error);
    }
};

/**
 * Send subscription expiring notification
 */
const sendSubscriptionExpiringNotification = async (customer) => {
    try {
        const renewUrl = `${process.env.WEBSITE_URL}/upgrade`;
        const subscriptionEndsAt = customer.subscription_ends_at.toISOString().split('T')[0];
        
        // Calculate days remaining
        const now = new Date();
        const endDate = new Date(customer.subscription_ends_at);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, 'subscription_expiring', 'both', 'pending')
             RETURNING id`,
            [customer.id]
        );

        const notificationId = notificationResult.rows[0].id;

        try {
            // Send subscription expiring notifications
            await sendSubscriptionExpiringEmail(
                customer.email,
                customer.business_name,
                customer.plan,
                subscriptionEndsAt,
                daysLeft,
                renewUrl
            );

            await sendSubscriptionExpiringWhatsApp(
                customer.phone,
                customer.business_name,
                customer.plan,
                daysLeft,
                renewUrl
            );

            // Update notification status
            await query(
                'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
                ['sent', notificationId]
            );

            console.log(`✅ Subscription expiring notification sent to: ${customer.email} (${daysLeft} days left)`);

        } catch (notificationError) {
            console.error(`❌ Error sending subscription expiring notification to ${customer.email}:`, notificationError);
            
            // Update notification status to failed
            await query(
                'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
                ['failed', notificationError.message, notificationId]
            );
        }

    } catch (error) {
        console.error('❌ Error in sendSubscriptionExpiringNotification:', error);
    }
};

/**
 * Send subscription expired notification
 */
const sendSubscriptionExpiredNotification = async (customer) => {
    try {
        const renewUrl = `${process.env.WEBSITE_URL}/upgrade`;

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, 'subscription_expired', 'both', 'pending')
             RETURNING id`,
            [customer.id]
        );

        const notificationId = notificationResult.rows[0].id;

        try {
            // Send subscription expired notifications
            await sendSubscriptionExpiredEmail(
                customer.email,
                customer.business_name,
                customer.plan,
                renewUrl
            );

            await sendSubscriptionExpiredWhatsApp(
                customer.phone,
                customer.business_name,
                customer.plan,
                renewUrl
            );

            // Update notification status
            await query(
                'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
                ['sent', notificationId]
            );

            console.log(`✅ Subscription expired notification sent to: ${customer.email}`);

        } catch (notificationError) {
            console.error(`❌ Error sending subscription expired notification to ${customer.email}:`, notificationError);
            
            // Update notification status to failed
            await query(
                'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
                ['failed', notificationError.message, notificationId]
            );
        }

    } catch (error) {
        console.error('❌ Error in sendSubscriptionExpiredNotification:', error);
    }
};

/**
 * Get subscription statistics
 */
const getSubscriptionStats = async () => {
    try {
        // Get total paid customers
        const totalPaidResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan IN ('basic', 'pro', 'enterprise')");
        const totalPaid = parseInt(totalPaidResult.rows[0].count);

        // Get active paid customers
        const activePaidResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan IN ('basic', 'pro', 'enterprise') AND status = 'active'");
        const activePaid = parseInt(activePaidResult.rows[0].count);

        // Get expired paid customers
        const expiredPaidResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan IN ('basic', 'pro', 'enterprise') AND status = 'expired'");
        const expiredPaid = parseInt(expiredPaidResult.rows[0].count);

        // Get subscriptions expiring in 7 days
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const expiring7DaysResult = await query(
            `SELECT COUNT(*) as count FROM customers 
             WHERE plan IN ('basic', 'pro', 'enterprise') AND status = 'active' 
             AND subscription_ends_at BETWEEN NOW() AND $1`,
            [sevenDaysFromNow]
        );
        const expiring7Days = parseInt(expiring7DaysResult.rows[0].count);

        // Get plan distribution
        const planDistributionResult = await query(
            `SELECT plan, COUNT(*) as count 
             FROM customers 
             WHERE plan IN ('basic', 'pro', 'enterprise') 
             GROUP BY plan`
        );

        const planDistribution = {};
        planDistributionResult.rows.forEach(row => {
            planDistribution[row.plan] = parseInt(row.count);
        });

        // Get monthly recurring revenue
        const mrrResult = await query(
            `SELECT SUM(amount) as total 
             FROM subscriptions 
             WHERE status = 'active'`
        );
        const mrr = parseFloat(mrrResult.rows[0].total) || 0;

        const stats = {
            total_paid_customers: totalPaid,
            active_paid_customers: activePaid,
            expired_paid_customers: expiredPaid,
            expiring_in_7_days: expiring7Days,
            plan_distribution: planDistribution,
            monthly_recurring_revenue: mrr
        };

        console.log('📊 Subscription Statistics:', stats);
        return stats;

    } catch (error) {
        console.error('❌ Error getting subscription stats:', error);
        return null;
    }
};

/**
 * Get revenue analytics
 */
const getRevenueAnalytics = async () => {
    try {
        // Get total revenue
        const totalRevenueResult = await query("SELECT SUM(amount) as total FROM subscriptions");
        const totalRevenue = parseFloat(totalRevenueResult.rows[0].total) || 0;

        // Get active subscription revenue
        const activeRevenueResult = await query("SELECT SUM(amount) as total FROM subscriptions WHERE status = 'active'");
        const activeRevenue = parseFloat(activeRevenueResult.rows[0].total) || 0;

        // Get revenue by plan
        const revenueByPlanResult = await query(
            `SELECT plan, SUM(amount) as total, COUNT(*) as count
             FROM subscriptions 
             WHERE status = 'active'
             GROUP BY plan`
        );

        const revenueByPlan = {};
        revenueByPlanResult.rows.forEach(row => {
            revenueByPlan[row.plan] = {
                revenue: parseFloat(row.total),
                customers: parseInt(row.count)
            };
        });

        // Get revenue this month
        const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const thisMonthRevenueResult = await query(
            `SELECT SUM(amount) as total 
             FROM subscriptions 
             WHERE status = 'active' AND start_date >= $1`,
            [thisMonthStart]
        );
        const thisMonthRevenue = parseFloat(thisMonthRevenueResult.rows[0].total) || 0;

        const analytics = {
            total_revenue: totalRevenue,
            active_revenue: activeRevenue,
            this_month_revenue: thisMonthRevenue,
            revenue_by_plan: revenueByPlan
        };

        console.log('📊 Revenue Analytics:', analytics);
        return analytics;

    } catch (error) {
        console.error('❌ Error getting revenue analytics:', error);
        return null;
    }
};

module.exports = {
    checkSubscriptionExpiry,
    checkSubscriptionExpiringIn7Days,
    checkExpiredSubscriptions,
    getSubscriptionStats,
    getRevenueAnalytics
};

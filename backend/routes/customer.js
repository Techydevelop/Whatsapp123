const express = require('express');
const { query } = require('../config/customerDb');
const { authenticateCustomer, checkSubscription } = require('../middleware/auth');
const { getSubscriptionInfo } = require('../middleware/checkSubscription');

const router = express.Router();

// All routes require customer authentication
router.use(authenticateCustomer);

/**
 * GET /api/customer/profile
 * Get customer profile
 */
router.get('/profile', getSubscriptionInfo, (req, res) => {
    try {
        const customer = req.customer;
        const subscriptionInfo = req.subscriptionInfo;
        
        res.json({
            success: true,
            customer: {
                id: customer.id,
                email: customer.email,
                phone: customer.phone,
                business_name: customer.business_name,
                plan: customer.plan,
                status: customer.status,
                trial_ends_at: customer.trial_ends_at,
                subscription_ends_at: customer.subscription_ends_at,
                last_login_at: customer.last_login_at,
                created_at: customer.created_at
            },
            subscription: subscriptionInfo
        });

    } catch (error) {
        console.error('❌ Get customer profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * PUT /api/customer/profile
 * Update customer profile
 */
router.put('/profile', async (req, res) => {
    try {
        const { business_name, phone } = req.body;
        const customerId = req.customer.id;

        // Validate input
        if (!business_name && !phone) {
            return res.status(400).json({
                success: false,
                message: 'At least one field (business_name or phone) is required'
            });
        }

        // Validate phone format if provided
        if (phone) {
            const phoneRegex = /^\+[1-9]\d{1,14}$/;
            if (!phoneRegex.test(phone)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid phone format. Use international format (+1234567890)'
                });
            }

            // Check if phone is already taken by another customer
            const existingPhone = await query(
                'SELECT id FROM customers WHERE phone = $1 AND id != $2',
                [phone, customerId]
            );

            if (existingPhone.rows.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Phone number already in use'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (business_name) {
            updates.push(`business_name = $${paramCount}`);
            values.push(business_name);
            paramCount++;
        }

        if (phone) {
            updates.push(`phone = $${paramCount}`);
            values.push(phone);
            paramCount++;
        }

        values.push(customerId);

        const updateQuery = `
            UPDATE customers 
            SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${paramCount}
            RETURNING id, email, phone, business_name, plan, status, trial_ends_at, subscription_ends_at, updated_at
        `;

        const result = await query(updateQuery, values);
        const updatedCustomer = result.rows[0];

        console.log(`✅ Customer profile updated: ${updatedCustomer.email}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            customer: updatedCustomer
        });

    } catch (error) {
        console.error('❌ Update customer profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/sessions
 * Get customer's WhatsApp sessions
 */
router.get('/sessions', async (req, res) => {
    try {
        const customerId = req.customer.id;

        // Get sessions from existing sessions table
        const sessionsResult = await query(
            `SELECT id, phone, status, created_at, updated_at
             FROM sessions 
             WHERE customer_id = $1
             ORDER BY created_at DESC`,
            [customerId]
        );

        const sessions = sessionsResult.rows.map(session => ({
            id: session.id,
            phone: session.phone,
            status: session.status,
            created_at: session.created_at,
            updated_at: session.updated_at
        }));

        res.json({
            success: true,
            sessions: sessions,
            count: sessions.length
        });

    } catch (error) {
        console.error('❌ Get customer sessions error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/ghl-accounts
 * Get customer's GHL accounts
 */
router.get('/ghl-accounts', async (req, res) => {
    try {
        const customerId = req.customer.id;

        // Get GHL accounts from existing ghl_accounts table
        const ghlResult = await query(
            `SELECT id, company_id, location_id, company_name, location_name, status, created_at, updated_at
             FROM ghl_accounts 
             WHERE customer_id = $1
             ORDER BY created_at DESC`,
            [customerId]
        );

        const ghlAccounts = ghlResult.rows.map(account => ({
            id: account.id,
            company_id: account.company_id,
            location_id: account.location_id,
            company_name: account.company_name,
            location_name: account.location_name,
            status: account.status,
            created_at: account.created_at,
            updated_at: account.updated_at
        }));

        res.json({
            success: true,
            ghl_accounts: ghlAccounts,
            count: ghlAccounts.length
        });

    } catch (error) {
        console.error('❌ Get customer GHL accounts error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/subscription
 * Get customer's subscription details
 */
router.get('/subscription', async (req, res) => {
    try {
        const customerId = req.customer.id;

        // Get current active subscription
        const subscriptionResult = await query(
            `SELECT id, plan, amount, currency, start_date, end_date, status, payment_method, payment_reference, created_at
             FROM subscriptions 
             WHERE customer_id = $1 AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [customerId]
        );

        // Get subscription history
        const historyResult = await query(
            `SELECT id, plan, amount, currency, start_date, end_date, status, payment_method, payment_reference, created_at
             FROM subscriptions 
             WHERE customer_id = $1
             ORDER BY created_at DESC`,
            [customerId]
        );

        const currentSubscription = subscriptionResult.rows.length > 0 ? subscriptionResult.rows[0] : null;
        const subscriptionHistory = historyResult.rows;

        res.json({
            success: true,
            current_subscription: currentSubscription,
            subscription_history: subscriptionHistory,
            has_active_subscription: !!currentSubscription
        });

    } catch (error) {
        console.error('❌ Get customer subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/customer/upgrade-request
 * Request plan upgrade
 */
router.post('/upgrade-request', async (req, res) => {
    try {
        const { requestedPlan, message } = req.body;
        const customerId = req.customer.id;

        // Validate input
        if (!requestedPlan) {
            return res.status(400).json({
                success: false,
                message: 'Requested plan is required'
            });
        }

        const validPlans = ['basic', 'pro', 'enterprise'];
        if (!validPlans.includes(requestedPlan)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan. Valid plans: basic, pro, enterprise'
            });
        }

        // Create upgrade request notification
        await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, 'upgrade_request', 'email', 'pending')`,
            [customerId]
        );

        console.log(`✅ Upgrade request from customer ${customerId}: ${requestedPlan}`);

        res.json({
            success: true,
            message: 'Upgrade request submitted successfully. Admin will contact you soon.',
            requested_plan: requestedPlan
        });

    } catch (error) {
        console.error('❌ Upgrade request error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/connection-logs
 * Get customer's connection logs
 */
router.get('/connection-logs', async (req, res) => {
    try {
        const customerId = req.customer.id;
        const { limit = 50, offset = 0 } = req.query;

        const logsResult = await query(
            `SELECT id, session_id, event_type, metadata, created_at
             FROM connection_logs 
             WHERE customer_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [customerId, parseInt(limit), parseInt(offset)]
        );

        const logs = logsResult.rows.map(log => ({
            id: log.id,
            session_id: log.session_id,
            event_type: log.event_type,
            metadata: log.metadata,
            created_at: log.created_at
        }));

        res.json({
            success: true,
            logs: logs,
            count: logs.length
        });

    } catch (error) {
        console.error('❌ Get connection logs error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/notifications
 * Get customer's notifications
 */
router.get('/notifications', async (req, res) => {
    try {
        const customerId = req.customer.id;
        const { limit = 50, offset = 0 } = req.query;

        const notificationsResult = await query(
            `SELECT id, type, channel, status, error_message, sent_at, created_at
             FROM notifications 
             WHERE customer_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [customerId, parseInt(limit), parseInt(offset)]
        );

        const notifications = notificationsResult.rows.map(notification => ({
            id: notification.id,
            type: notification.type,
            channel: notification.channel,
            status: notification.status,
            error_message: notification.error_message,
            sent_at: notification.sent_at,
            created_at: notification.created_at
        }));

        res.json({
            success: true,
            notifications: notifications,
            count: notifications.length
        });

    } catch (error) {
        console.error('❌ Get notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/customer/stats
 * Get customer's usage statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const customerId = req.customer.id;

        // Get session count
        const sessionCountResult = await query(
            'SELECT COUNT(*) as count FROM sessions WHERE customer_id = $1',
            [customerId]
        );

        // Get GHL account count
        const ghlCountResult = await query(
            'SELECT COUNT(*) as count FROM ghl_accounts WHERE customer_id = $1',
            [customerId]
        );

        // Get message count (from existing messages table)
        const messageCountResult = await query(
            'SELECT COUNT(*) as count FROM messages WHERE customer_id = $1',
            [customerId]
        );

        // Get connection logs count
        const logsCountResult = await query(
            'SELECT COUNT(*) as count FROM connection_logs WHERE customer_id = $1',
            [customerId]
        );

        const stats = {
            sessions_count: parseInt(sessionCountResult.rows[0].count),
            ghl_accounts_count: parseInt(ghlCountResult.rows[0].count),
            messages_count: parseInt(messageCountResult.rows[0].count),
            connection_logs_count: parseInt(logsCountResult.rows[0].count)
        };

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Get customer stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

const express = require('express');
const { query } = require('../config/customerDb');
const { authenticateAdmin, requireAdminRole } = require('../middleware/auth');
const { generateSecurePassword, hashPassword } = require('../utils/password');
const { sendWelcomeEmail, sendUpgradeSuccessEmail } = require('../utils/email');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

/**
 * GET /api/admin/customers
 * Get all customers with filters and pagination
 */
router.get('/customers', async (req, res) => {
    try {
        const {
            status = 'all',
            plan = 'all',
            page = 1,
            limit = 50,
            search = ''
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 1;

        if (status !== 'all') {
            whereConditions.push(`status = $${paramCount}`);
            queryParams.push(status);
            paramCount++;
        }

        if (plan !== 'all') {
            whereConditions.push(`plan = $${paramCount}`);
            queryParams.push(plan);
            paramCount++;
        }

        if (search) {
            whereConditions.push(`(email ILIKE $${paramCount} OR business_name ILIKE $${paramCount} OR phone ILIKE $${paramCount})`);
            queryParams.push(`%${search}%`);
            paramCount++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get customers
        const customersQuery = `
            SELECT id, email, phone, business_name, plan, status, trial_ends_at, subscription_ends_at, last_login_at, created_at
            FROM customers 
            ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;

        queryParams.push(parseInt(limit), offset);

        const customersResult = await query(customersQuery, queryParams);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM customers 
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);

        const customers = customersResult.rows.map(customer => ({
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
        }));

        res.json({
            success: true,
            customers: customers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('❌ Get customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/admin/customers/:id
 * Get customer details with related data
 */
router.get('/customers/:id', async (req, res) => {
    try {
        const customerId = req.params.id;

        // Get customer
        const customerResult = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customerId]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customer = customerResult.rows[0];

        // Get sessions
        const sessionsResult = await query(
            'SELECT * FROM sessions WHERE customer_id = $1 ORDER BY created_at DESC',
            [customerId]
        );

        // Get GHL accounts
        const ghlResult = await query(
            'SELECT * FROM ghl_accounts WHERE customer_id = $1 ORDER BY created_at DESC',
            [customerId]
        );

        // Get subscriptions
        const subscriptionsResult = await query(
            'SELECT * FROM subscriptions WHERE customer_id = $1 ORDER BY created_at DESC',
            [customerId]
        );

        // Get recent connection logs
        const logsResult = await query(
            'SELECT * FROM connection_logs WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
            [customerId]
        );

        // Get recent notifications
        const notificationsResult = await query(
            'SELECT * FROM notifications WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50',
            [customerId]
        );

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
                created_at: customer.created_at,
                updated_at: customer.updated_at
            },
            sessions: sessionsResult.rows,
            ghl_accounts: ghlResult.rows,
            subscriptions: subscriptionsResult.rows,
            connection_logs: logsResult.rows,
            notifications: notificationsResult.rows
        });

    } catch (error) {
        console.error('❌ Get customer details error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/customers/create
 * Create new customer manually
 */
router.post('/customers/create', requireAdminRole('admin'), async (req, res) => {
    try {
        const { email, phone, business_name, plan = 'trial' } = req.body;

        // Validate input
        if (!email || !phone || !business_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, phone, and business name are required'
            });
        }

        // Check if email or phone already exists
        const existingCustomer = await query(
            'SELECT id FROM customers WHERE email = $1 OR phone = $2',
            [email, phone]
        );

        if (existingCustomer.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Email or phone number already registered'
            });
        }

        // Generate secure password
        const password = generateSecurePassword();
        const passwordHash = await hashPassword(password);

        // Calculate trial end date if plan is trial
        let trialEndsAt = null;
        if (plan === 'trial') {
            const trialDays = parseInt(process.env.DEFAULT_TRIAL_DAYS) || 7;
            trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
        }

        // Create customer
        const customerResult = await query(
            `INSERT INTO customers (email, phone, business_name, password_hash, plan, status, trial_ends_at)
             VALUES ($1, $2, $3, $4, $5, 'active', $6)
             RETURNING id, email, phone, business_name, plan, status, trial_ends_at, created_at`,
            [email, phone, business_name, passwordHash, plan, trialEndsAt]
        );

        const customer = customerResult.rows[0];

        // Send welcome email
        const dashboardUrl = `${process.env.DASHBOARD_URL}/login`;
        await sendWelcomeEmail(
            email,
            password,
            dashboardUrl,
            business_name,
            trialEndsAt ? trialEndsAt.toISOString().split('T')[0] : null
        );

        console.log(`✅ Customer created by admin: ${email}`);

        res.json({
            success: true,
            message: 'Customer created successfully',
            customer: customer,
            password: password // Only returned to admin
        });

    } catch (error) {
        console.error('❌ Create customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/customers/:id/upgrade
 * Upgrade customer plan
 */
router.post('/customers/:id/upgrade', requireAdminRole('admin'), async (req, res) => {
    try {
        const customerId = req.params.id;
        const { plan, amount, duration_months = 1, payment_method = 'manual', payment_reference } = req.body;

        // Validate input
        if (!plan || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Plan and amount are required'
            });
        }

        const validPlans = ['basic', 'pro', 'enterprise'];
        if (!validPlans.includes(plan)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid plan. Valid plans: basic, pro, enterprise'
            });
        }

        // Get customer
        const customerResult = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customerId]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customer = customerResult.rows[0];

        // Calculate subscription dates
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + duration_months);

        // Create subscription record
        const subscriptionResult = await query(
            `INSERT INTO subscriptions (customer_id, plan, amount, currency, start_date, end_date, status, payment_method, payment_reference)
             VALUES ($1, $2, $3, 'USD', $4, $5, 'active', $6, $7)
             RETURNING *`,
            [customerId, plan, amount, startDate, endDate, payment_method, payment_reference]
        );

        // Update customer plan and subscription end date
        await query(
            'UPDATE customers SET plan = $1, subscription_ends_at = $2, updated_at = NOW() WHERE id = $3',
            [plan, endDate, customerId]
        );

        // Send upgrade success email
        await sendUpgradeSuccessEmail(
            customer.email,
            customer.business_name,
            plan,
            amount,
            endDate.toISOString().split('T')[0]
        );

        console.log(`✅ Customer upgraded: ${customer.email} to ${plan}`);

        res.json({
            success: true,
            message: 'Customer upgraded successfully',
            subscription: subscriptionResult.rows[0]
        });

    } catch (error) {
        console.error('❌ Upgrade customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/customers/:id/extend-trial
 * Extend customer trial
 */
router.post('/customers/:id/extend-trial', requireAdminRole('admin'), async (req, res) => {
    try {
        const customerId = req.params.id;
        const { days } = req.body;

        if (!days || days <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid number of days is required'
            });
        }

        // Get customer
        const customerResult = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customerId]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customer = customerResult.rows[0];

        // Extend trial
        const currentTrialEnd = customer.trial_ends_at ? new Date(customer.trial_ends_at) : new Date();
        const newTrialEnd = new Date(currentTrialEnd.getTime() + days * 24 * 60 * 60 * 1000);

        await query(
            'UPDATE customers SET trial_ends_at = $1, updated_at = NOW() WHERE id = $2',
            [newTrialEnd, customerId]
        );

        console.log(`✅ Trial extended for customer ${customer.email}: +${days} days`);

        res.json({
            success: true,
            message: `Trial extended by ${days} days`,
            new_trial_ends_at: newTrialEnd
        });

    } catch (error) {
        console.error('❌ Extend trial error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/customers/:id/suspend
 * Suspend customer account
 */
router.post('/customers/:id/suspend', requireAdminRole('admin'), async (req, res) => {
    try {
        const customerId = req.params.id;

        // Get customer
        const customerResult = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customerId]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customer = customerResult.rows[0];

        if (customer.status === 'suspended') {
            return res.status(400).json({
                success: false,
                message: 'Customer is already suspended'
            });
        }

        // Suspend customer
        await query(
            'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2',
            ['suspended', customerId]
        );

        console.log(`✅ Customer suspended: ${customer.email}`);

        res.json({
            success: true,
            message: 'Customer suspended successfully'
        });

    } catch (error) {
        console.error('❌ Suspend customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/customers/:id/activate
 * Activate customer account
 */
router.post('/customers/:id/activate', requireAdminRole('admin'), async (req, res) => {
    try {
        const customerId = req.params.id;

        // Get customer
        const customerResult = await query(
            'SELECT * FROM customers WHERE id = $1',
            [customerId]
        );

        if (customerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }

        const customer = customerResult.rows[0];

        if (customer.status === 'active') {
            return res.status(400).json({
                success: false,
                message: 'Customer is already active'
            });
        }

        // Activate customer
        await query(
            'UPDATE customers SET status = $1, updated_at = NOW() WHERE id = $2',
            ['active', customerId]
        );

        console.log(`✅ Customer activated: ${customer.email}`);

        res.json({
            success: true,
            message: 'Customer activated successfully'
        });

    } catch (error) {
        console.error('❌ Activate customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/admin/analytics
 * Get platform analytics
 */
router.get('/analytics', async (req, res) => {
    try {
        // Get customer counts
        const totalCustomersResult = await query('SELECT COUNT(*) as count FROM customers');
        const activeCustomersResult = await query("SELECT COUNT(*) as count FROM customers WHERE status = 'active'");
        const trialCustomersResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan = 'trial'");
        const paidCustomersResult = await query("SELECT COUNT(*) as count FROM customers WHERE plan IN ('basic', 'pro', 'enterprise')");

        // Get revenue
        const revenueResult = await query("SELECT SUM(amount) as total FROM subscriptions WHERE status = 'active'");

        // Get session counts
        const totalSessionsResult = await query('SELECT COUNT(*) as count FROM sessions');
        const activeSessionsResult = await query("SELECT COUNT(*) as count FROM sessions WHERE status = 'connected'");

        // Get message counts
        const messagesResult = await query('SELECT COUNT(*) as count FROM messages');

        const analytics = {
            customers: {
                total: parseInt(totalCustomersResult.rows[0].count),
                active: parseInt(activeCustomersResult.rows[0].count),
                trial: parseInt(trialCustomersResult.rows[0].count),
                paid: parseInt(paidCustomersResult.rows[0].count)
            },
            revenue: {
                total: parseFloat(revenueResult.rows[0].total) || 0
            },
            sessions: {
                total: parseInt(totalSessionsResult.rows[0].count),
                active: parseInt(activeSessionsResult.rows[0].count)
            },
            messages: {
                total: parseInt(messagesResult.rows[0].count)
            }
        };

        res.json({
            success: true,
            analytics: analytics
        });

    } catch (error) {
        console.error('❌ Get analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/admin/notifications
 * Get notification logs
 */
router.get('/notifications', async (req, res) => {
    try {
        const {
            type = 'all',
            status = 'all',
            page = 1,
            limit = 50
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];
        let paramCount = 1;

        if (type !== 'all') {
            whereConditions.push(`type = $${paramCount}`);
            queryParams.push(type);
            paramCount++;
        }

        if (status !== 'all') {
            whereConditions.push(`status = $${paramCount}`);
            queryParams.push(status);
            paramCount++;
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get notifications
        const notificationsQuery = `
            SELECT n.*, c.email, c.business_name
            FROM notifications n
            JOIN customers c ON n.customer_id = c.id
            ${whereClause}
            ORDER BY n.created_at DESC
            LIMIT $${paramCount} OFFSET $${paramCount + 1}
        `;

        queryParams.push(parseInt(limit), offset);

        const notificationsResult = await query(notificationsQuery, queryParams);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total
            FROM notifications n
            JOIN customers c ON n.customer_id = c.id
            ${whereClause}
        `;

        const countResult = await query(countQuery, queryParams.slice(0, -2));
        const total = parseInt(countResult.rows[0].total);

        res.json({
            success: true,
            notifications: notificationsResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
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
 * POST /api/admin/send-notification
 * Send manual notification to customer
 */
router.post('/send-notification', requireAdminRole('admin'), async (req, res) => {
    try {
        const { customer_id, type, channel, message } = req.body;

        // Validate input
        if (!customer_id || !type || !channel) {
            return res.status(400).json({
                success: false,
                message: 'Customer ID, type, and channel are required'
            });
        }

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, $2, $3, 'pending')
             RETURNING *`,
            [customer_id, type, channel]
        );

        console.log(`✅ Manual notification created for customer ${customer_id}`);

        res.json({
            success: true,
            message: 'Notification queued successfully',
            notification: notificationResult.rows[0]
        });

    } catch (error) {
        console.error('❌ Send notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

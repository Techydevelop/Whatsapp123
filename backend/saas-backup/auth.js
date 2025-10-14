const express = require('express');
const { query } = require('../config/customerDb');
const { generateSecurePassword, hashPassword, comparePassword } = require('../utils/password');
const { generateCustomerToken, generatePasswordResetToken, verifyPasswordResetToken } = require('../utils/jwt');
const { storeOTP, verifyOTP, deleteOTP } = require('../utils/otp');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/email');
const { sendWhatsAppOTP } = require('../utils/whatsapp-notification');
const { authRateLimit } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register new customer and send OTPs
 */
router.post('/register', authRateLimit, async (req, res) => {
    try {
        const { email, phone, business_name } = req.body;

        // Validate input
        if (!email || !phone || !business_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, phone, and business name are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate phone format (international)
        const phoneRegex = /^\+[1-9]\d{1,14}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid phone format. Use international format (+1234567890)'
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

        // Generate and store OTPs
        const otpData = await storeOTP(email, phone);

        // Send email OTP
        await sendOTPEmail(email, otpData.email_otp);

        // Send WhatsApp OTP
        await sendWhatsAppOTP(phone, otpData.whatsapp_otp);

        console.log(`✅ Registration OTPs sent to ${email} and ${phone}`);

        res.json({
            success: true,
            message: 'Verification codes sent to your email and WhatsApp',
            expires_at: otpData.expires_at
        });

    } catch (error) {
        console.error('❌ Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTPs and create customer account
 */
router.post('/verify-otp', authRateLimit, async (req, res) => {
    try {
        const { email, emailOTP, whatsappOTP, business_name } = req.body;

        // Validate input
        if (!email || !emailOTP || !whatsappOTP || !business_name) {
            return res.status(400).json({
                success: false,
                message: 'Email, both OTPs, and business name are required'
            });
        }

        // Verify OTPs
        const isValidOTP = await verifyOTP(email, emailOTP, whatsappOTP);
        if (!isValidOTP) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification codes'
            });
        }

        // Get phone from OTP record
        const otpRecord = await query(
            'SELECT phone FROM otp_verifications WHERE email = $1',
            [email]
        );

        if (otpRecord.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'OTP verification expired'
            });
        }

        const phone = otpRecord.rows[0].phone;

        // Generate secure password
        const password = generateSecurePassword();
        const passwordHash = await hashPassword(password);

        // Calculate trial end date
        const trialDays = parseInt(process.env.DEFAULT_TRIAL_DAYS) || 7;
        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

        // Create customer account
        const customerResult = await query(
            `INSERT INTO customers (email, phone, business_name, password_hash, plan, status, trial_ends_at)
             VALUES ($1, $2, $3, $4, 'trial', 'active', $5)
             RETURNING id, email, phone, business_name, plan, status, trial_ends_at, created_at`,
            [email, phone, business_name, passwordHash, trialEndsAt]
        );

        const customer = customerResult.rows[0];

        // Delete OTP record
        await deleteOTP(email);

        // Send welcome email with credentials
        const dashboardUrl = `${process.env.DASHBOARD_URL}/login`;
        await sendWelcomeEmail(
            email,
            password,
            dashboardUrl,
            business_name,
            trialEndsAt.toISOString().split('T')[0]
        );

        console.log(`✅ Customer account created: ${email}`);

        res.json({
            success: true,
            message: 'Account created successfully! Check your email for login credentials.',
            customer: {
                id: customer.id,
                email: customer.email,
                business_name: customer.business_name,
                plan: customer.plan,
                trial_ends_at: customer.trial_ends_at
            }
        });

    } catch (error) {
        console.error('❌ OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/auth/login
 * Customer login
 */
router.post('/login', authRateLimit, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Get customer from database
        const customerResult = await query(
            'SELECT id, email, phone, business_name, password_hash, plan, status, trial_ends_at, subscription_ends_at FROM customers WHERE email = $1',
            [email]
        );

        if (customerResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const customer = customerResult.rows[0];

        // Verify password
        const isValidPassword = await comparePassword(password, customer.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check customer status
        if (customer.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: `Account is ${customer.status}`,
                status: customer.status
            });
        }

        // Generate JWT token
        const token = generateCustomerToken(customer.id, customer.email);

        // Update last login
        await query(
            'UPDATE customers SET last_login_at = NOW() WHERE id = $1',
            [customer.id]
        );

        console.log(`✅ Customer login: ${email}`);

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            customer: {
                id: customer.id,
                email: customer.email,
                phone: customer.phone,
                business_name: customer.business_name,
                plan: customer.plan,
                status: customer.status,
                trial_ends_at: customer.trial_ends_at,
                subscription_ends_at: customer.subscription_ends_at
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const token = authHeader.substring(7);
        
        // Verify current token
        const { verifyCustomerToken } = require('../utils/jwt');
        const decoded = verifyCustomerToken(token);
        
        // Generate new token
        const newToken = generateCustomerToken(decoded.id, decoded.email);
        
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken
        });

    } catch (error) {
        console.error('❌ Token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

/**
 * POST /api/auth/forgot-password
 * Send password reset email
 */
router.post('/forgot-password', authRateLimit, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Get customer from database
        const customerResult = await query(
            'SELECT id, email FROM customers WHERE email = $1',
            [email]
        );

        // Always return success for security (don't reveal if email exists)
        if (customerResult.rows.length === 0) {
            return res.json({
                success: true,
                message: 'If the email exists, a reset link has been sent'
            });
        }

        const customer = customerResult.rows[0];

        // Generate password reset token
        const resetToken = generatePasswordResetToken(customer.id, customer.email);

        // Send reset email (implement this function)
        const resetUrl = `${process.env.WEBSITE_URL}/reset-password?token=${resetToken}`;
        
        // TODO: Implement sendPasswordResetEmail function
        console.log(`Password reset link for ${email}: ${resetUrl}`);

        res.json({
            success: true,
            message: 'If the email exists, a reset link has been sent'
        });

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
router.post('/reset-password', authRateLimit, async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required'
            });
        }

        // Verify reset token
        const decoded = verifyPasswordResetToken(token);

        // Validate password strength
        const { validatePasswordStrength } = require('../utils/password');
        const validation = validatePasswordStrength(newPassword);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Password does not meet requirements',
                errors: validation.errors
            });
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        // Update password
        await query(
            'UPDATE customers SET password_hash = $1 WHERE id = $2',
            [passwordHash, decoded.id]
        );

        console.log(`✅ Password reset for customer: ${decoded.id}`);

        res.json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(400).json({
            success: false,
            message: 'Invalid or expired reset token'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current customer info (requires authentication)
 */
router.get('/me', require('../middleware/auth').authenticateCustomer, (req, res) => {
    try {
        const customer = req.customer;
        
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
                last_login_at: customer.last_login_at
            }
        });

    } catch (error) {
        console.error('❌ Get customer info error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

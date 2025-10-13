const express = require('express');
const { query } = require('../config/customerDb');
const { comparePassword } = require('../utils/password');
const { generateAdminToken } = require('../utils/jwt');
const { authRateLimit } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/admin/auth/login
 * Admin login
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

        // Get admin from database
        const adminResult = await query(
            'SELECT id, email, password_hash, role, last_login_at FROM admin_users WHERE email = $1',
            [email]
        );

        if (adminResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const admin = adminResult.rows[0];

        // Verify password
        const isValidPassword = await comparePassword(password, admin.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate JWT token
        const token = generateAdminToken(admin.id, admin.email, admin.role);

        // Update last login
        await query(
            'UPDATE admin_users SET last_login_at = NOW() WHERE id = $1',
            [admin.id]
        );

        console.log(`✅ Admin login: ${email} (${admin.role})`);

        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
                last_login_at: admin.last_login_at
            }
        });

    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/auth/refresh
 * Refresh admin JWT token
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
        const { verifyAdminToken } = require('../utils/jwt');
        const decoded = verifyAdminToken(token);
        
        // Generate new token
        const newToken = generateAdminToken(decoded.id, decoded.email, decoded.role);
        
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            token: newToken
        });

    } catch (error) {
        console.error('❌ Admin token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
});

/**
 * GET /api/admin/auth/me
 * Get current admin info (requires authentication)
 */
router.get('/me', require('../middleware/auth').authenticateAdmin, (req, res) => {
    try {
        const admin = req.admin;
        
        res.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                role: admin.role,
                last_login_at: admin.last_login_at
            }
        });

    } catch (error) {
        console.error('❌ Get admin info error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * POST /api/admin/auth/change-password
 * Change admin password (requires authentication)
 */
router.post('/change-password', require('../middleware/auth').authenticateAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const admin = req.admin;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        // Get current password hash
        const adminResult = await query(
            'SELECT password_hash FROM admin_users WHERE id = $1',
            [admin.id]
        );

        if (adminResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Verify current password
        const isValidPassword = await comparePassword(currentPassword, adminResult.rows[0].password_hash);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Validate new password strength
        const { validatePasswordStrength, hashPassword } = require('../utils/password');
        const validation = validatePasswordStrength(newPassword);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'New password does not meet requirements',
                errors: validation.errors
            });
        }

        // Hash new password
        const passwordHash = await hashPassword(newPassword);

        // Update password
        await query(
            'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
            [passwordHash, admin.id]
        );

        console.log(`✅ Admin password changed: ${admin.email}`);

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('❌ Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * GET /api/admin/auth/logout
 * Admin logout (client-side token removal)
 */
router.post('/logout', require('../middleware/auth').authenticateAdmin, (req, res) => {
    try {
        // In JWT-based auth, logout is handled client-side by removing the token
        // Server-side logout would require token blacklisting (not implemented here)
        
        console.log(`✅ Admin logout: ${req.admin.email}`);
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('❌ Admin logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;

const { verifyCustomerToken, verifyAdminToken } = require('../utils/jwt');
const { query } = require('../config/customerDb');

/**
 * Authenticate customer middleware
 * Verifies JWT token and attaches customer to request
 */
const authenticateCustomer = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        // Verify token
        const decoded = verifyCustomerToken(token);
        
        // Get customer from database
        const result = await query(
            'SELECT id, email, phone, business_name, plan, status, trial_ends_at, subscription_ends_at, last_login_at FROM customers WHERE id = $1',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Customer not found'
            });
        }
        
        const customer = result.rows[0];
        
        // Check if customer is active
        if (customer.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: `Account is ${customer.status}`,
                status: customer.status
            });
        }
        
        // Attach customer to request
        req.customer = customer;
        next();
        
    } catch (error) {
        console.error('❌ Authentication error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

/**
 * Authenticate admin middleware
 * Verifies admin JWT token and attaches admin to request
 */
const authenticateAdmin = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        // Verify token
        const decoded = verifyAdminToken(token);
        
        // Get admin from database
        const result = await query(
            'SELECT id, email, role, last_login_at FROM admin_users WHERE id = $1',
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Admin not found'
            });
        }
        
        const admin = result.rows[0];
        
        // Attach admin to request
        req.admin = admin;
        next();
        
    } catch (error) {
        console.error('❌ Admin authentication error:', error);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

/**
 * Optional customer authentication middleware
 * Similar to authenticateCustomer but doesn't fail if no token
 * Used for public endpoints that can work with or without auth
 */
const optionalAuthenticateCustomer = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without authentication
            req.customer = null;
            return next();
        }
        
        const token = authHeader.substring(7);
        const decoded = verifyCustomerToken(token);
        
        const result = await query(
            'SELECT id, email, phone, business_name, plan, status, trial_ends_at, subscription_ends_at FROM customers WHERE id = $1',
            [decoded.id]
        );
        
        if (result.rows.length > 0) {
            req.customer = result.rows[0];
        } else {
            req.customer = null;
        }
        
        next();
        
    } catch (error) {
        // Token invalid, continue without authentication
        req.customer = null;
        next();
    }
};

/**
 * Check if admin has required role
 * @param {string} requiredRole - Required role (super_admin, admin, support)
 */
const requireAdminRole = (requiredRole) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }
        
        const roleHierarchy = {
            'support': 1,
            'admin': 2,
            'super_admin': 3
        };
        
        const adminRoleLevel = roleHierarchy[req.admin.role] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
        
        if (adminRoleLevel < requiredRoleLevel) {
            return res.status(403).json({
                success: false,
                message: `Insufficient permissions. Required role: ${requiredRole}`
            });
        }
        
        next();
    };
};

/**
 * Rate limiting middleware for authentication endpoints
 * Prevents brute force attacks
 */
const authRateLimit = (req, res, next) => {
    // Simple in-memory rate limiting (in production, use Redis)
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxAttempts = 5;
    
    // Initialize rate limit store if not exists
    if (!global.rateLimitStore) {
        global.rateLimitStore = new Map();
    }
    
    const key = `auth_${clientIp}`;
    const attempts = global.rateLimitStore.get(key) || { count: 0, resetTime: now + windowMs };
    
    // Reset if window expired
    if (now > attempts.resetTime) {
        attempts.count = 0;
        attempts.resetTime = now + windowMs;
    }
    
    // Check if limit exceeded
    if (attempts.count >= maxAttempts) {
        return res.status(429).json({
            success: false,
            message: 'Too many authentication attempts. Please try again later.',
            retryAfter: Math.ceil((attempts.resetTime - now) / 1000)
        });
    }
    
    // Increment attempt count
    attempts.count++;
    global.rateLimitStore.set(key, attempts);
    
    next();
};

module.exports = {
    authenticateCustomer,
    authenticateAdmin,
    optionalAuthenticateCustomer,
    requireAdminRole,
    authRateLimit
};

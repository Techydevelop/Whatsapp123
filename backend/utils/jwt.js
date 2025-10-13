const jwt = require('jsonwebtoken');

/**
 * Generate JWT token for customer
 * @param {string} customerId - Customer UUID
 * @param {string} email - Customer email
 * @returns {string} JWT token
 */
const generateCustomerToken = (customerId, email) => {
    const payload = {
        id: customerId,
        email: email,
        type: 'customer'
    };
    
    const options = {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'whatsapp-ghl-saas',
        audience: 'customer'
    };
    
    return jwt.sign(payload, process.env.CUSTOMER_JWT_SECRET, options);
};

/**
 * Generate JWT token for admin
 * @param {string} adminId - Admin UUID
 * @param {string} email - Admin email
 * @param {string} role - Admin role
 * @returns {string} JWT token
 */
const generateAdminToken = (adminId, email, role) => {
    const payload = {
        id: adminId,
        email: email,
        role: role,
        type: 'admin'
    };
    
    const options = {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        issuer: 'whatsapp-ghl-saas',
        audience: 'admin'
    };
    
    return jwt.sign(payload, process.env.ADMIN_JWT_SECRET, options);
};

/**
 * Verify customer JWT token
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const verifyCustomerToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET, {
            issuer: 'whatsapp-ghl-saas',
            audience: 'customer'
        });
        
        if (decoded.type !== 'customer') {
            throw new Error('Invalid token type');
        }
        
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};

/**
 * Verify admin JWT token
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const verifyAdminToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET, {
            issuer: 'whatsapp-ghl-saas',
            audience: 'admin'
        });
        
        if (decoded.type !== 'admin') {
            throw new Error('Invalid token type');
        }
        
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};

/**
 * Generate password reset token
 * @param {string} customerId - Customer UUID
 * @param {string} email - Customer email
 * @returns {string} JWT token with 1 hour expiry
 */
const generatePasswordResetToken = (customerId, email) => {
    const payload = {
        id: customerId,
        email: email,
        type: 'password_reset'
    };
    
    const options = {
        expiresIn: '1h',
        issuer: 'whatsapp-ghl-saas',
        audience: 'password_reset'
    };
    
    return jwt.sign(payload, process.env.CUSTOMER_JWT_SECRET, options);
};

/**
 * Verify password reset token
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const verifyPasswordResetToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET, {
            issuer: 'whatsapp-ghl-saas',
            audience: 'password_reset'
        });
        
        if (decoded.type !== 'password_reset') {
            throw new Error('Invalid token type');
        }
        
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired reset token');
    }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {string} token - JWT token
 * @returns {object} Decoded token payload
 */
const decodeToken = (token) => {
    return jwt.decode(token);
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired
 */
const isTokenExpired = (token) => {
    try {
        const decoded = jwt.decode(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch (error) {
        return true;
    }
};

module.exports = {
    generateCustomerToken,
    generateAdminToken,
    verifyCustomerToken,
    verifyAdminToken,
    generatePasswordResetToken,
    verifyPasswordResetToken,
    decodeToken,
    isTokenExpired
};

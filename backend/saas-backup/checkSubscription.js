/**
 * Check customer subscription status middleware
 * Runs after authenticateCustomer middleware
 * Blocks access if trial/subscription expired
 */
const checkSubscription = async (req, res, next) => {
    try {
        const customer = req.customer;
        
        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer authentication required'
            });
        }
        
        const now = new Date();
        
        // Check trial status
        if (customer.plan === 'trial') {
            if (customer.trial_ends_at && new Date(customer.trial_ends_at) < now) {
                return res.status(403).json({
                    success: false,
                    message: 'Your trial has expired. Please upgrade to continue.',
                    code: 'TRIAL_EXPIRED',
                    upgradeUrl: `${process.env.WEBSITE_URL}/upgrade`
                });
            }
            
            // Trial is active, allow access
            return next();
        }
        
        // Check paid subscription status
        if (['basic', 'pro', 'enterprise'].includes(customer.plan)) {
            if (customer.subscription_ends_at && new Date(customer.subscription_ends_at) < now) {
                return res.status(403).json({
                    success: false,
                    message: 'Your subscription has expired. Please renew to continue.',
                    code: 'SUBSCRIPTION_EXPIRED',
                    renewUrl: `${process.env.WEBSITE_URL}/upgrade`
                });
            }
            
            // Subscription is active, allow access
            return next();
        }
        
        // Unknown plan, block access
        return res.status(403).json({
            success: false,
            message: 'Invalid subscription plan. Please contact support.',
            code: 'INVALID_PLAN'
        });
        
    } catch (error) {
        console.error('❌ Subscription check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Check if customer has specific plan or higher
 * @param {string} requiredPlan - Required plan (trial, basic, pro, enterprise)
 */
const requirePlan = (requiredPlan) => {
    const planHierarchy = {
        'trial': 1,
        'basic': 2,
        'pro': 3,
        'enterprise': 4
    };
    
    return (req, res, next) => {
        try {
            const customer = req.customer;
            
            if (!customer) {
                return res.status(401).json({
                    success: false,
                    message: 'Customer authentication required'
                });
            }
            
            const customerPlanLevel = planHierarchy[customer.plan] || 0;
            const requiredPlanLevel = planHierarchy[requiredPlan] || 0;
            
            if (customerPlanLevel < requiredPlanLevel) {
                return res.status(403).json({
                    success: false,
                    message: `This feature requires ${requiredPlan} plan or higher. Please upgrade.`,
                    code: 'PLAN_UPGRADE_REQUIRED',
                    currentPlan: customer.plan,
                    requiredPlan: requiredPlan,
                    upgradeUrl: `${process.env.WEBSITE_URL}/upgrade`
                });
            }
            
            next();
            
        } catch (error) {
            console.error('❌ Plan check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
};

/**
 * Check if customer has active trial (not expired)
 */
const requireActiveTrial = (req, res, next) => {
    try {
        const customer = req.customer;
        
        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer authentication required'
            });
        }
        
        if (customer.plan !== 'trial') {
            return res.status(403).json({
                success: false,
                message: 'This feature is only available during trial period',
                code: 'TRIAL_ONLY_FEATURE'
            });
        }
        
        const now = new Date();
        if (customer.trial_ends_at && new Date(customer.trial_ends_at) < now) {
            return res.status(403).json({
                success: false,
                message: 'Your trial has expired. Please upgrade to continue.',
                code: 'TRIAL_EXPIRED',
                upgradeUrl: `${process.env.WEBSITE_URL}/upgrade`
            });
        }
        
        next();
        
    } catch (error) {
        console.error('❌ Active trial check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Check if customer has paid subscription (not trial)
 */
const requirePaidSubscription = (req, res, next) => {
    try {
        const customer = req.customer;
        
        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer authentication required'
            });
        }
        
        if (customer.plan === 'trial') {
            return res.status(403).json({
                success: false,
                message: 'This feature requires a paid subscription. Please upgrade.',
                code: 'PAID_SUBSCRIPTION_REQUIRED',
                upgradeUrl: `${process.env.WEBSITE_URL}/upgrade`
            });
        }
        
        if (!['basic', 'pro', 'enterprise'].includes(customer.plan)) {
            return res.status(403).json({
                success: false,
                message: 'Invalid subscription plan. Please contact support.',
                code: 'INVALID_PLAN'
            });
        }
        
        const now = new Date();
        if (customer.subscription_ends_at && new Date(customer.subscription_ends_at) < now) {
            return res.status(403).json({
                success: false,
                message: 'Your subscription has expired. Please renew to continue.',
                code: 'SUBSCRIPTION_EXPIRED',
                renewUrl: `${process.env.WEBSITE_URL}/upgrade`
            });
        }
        
        next();
        
    } catch (error) {
        console.error('❌ Paid subscription check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get customer subscription info for frontend
 * Attaches subscription info to request
 */
const getSubscriptionInfo = (req, res, next) => {
    try {
        const customer = req.customer;
        
        if (!customer) {
            return res.status(401).json({
                success: false,
                message: 'Customer authentication required'
            });
        }
        
        const now = new Date();
        let subscriptionInfo = {
            plan: customer.plan,
            status: customer.status,
            isActive: true,
            daysRemaining: null,
            expiresAt: null,
            isExpired: false
        };
        
        if (customer.plan === 'trial') {
            subscriptionInfo.expiresAt = customer.trial_ends_at;
            if (customer.trial_ends_at) {
                const trialEnd = new Date(customer.trial_ends_at);
                subscriptionInfo.daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
                subscriptionInfo.isExpired = trialEnd < now;
                subscriptionInfo.isActive = !subscriptionInfo.isExpired;
            }
        } else if (['basic', 'pro', 'enterprise'].includes(customer.plan)) {
            subscriptionInfo.expiresAt = customer.subscription_ends_at;
            if (customer.subscription_ends_at) {
                const subEnd = new Date(customer.subscription_ends_at);
                subscriptionInfo.daysRemaining = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
                subscriptionInfo.isExpired = subEnd < now;
                subscriptionInfo.isActive = !subscriptionInfo.isExpired;
            }
        }
        
        req.subscriptionInfo = subscriptionInfo;
        next();
        
    } catch (error) {
        console.error('❌ Subscription info error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    checkSubscription,
    requirePlan,
    requireActiveTrial,
    requirePaidSubscription,
    getSubscriptionInfo
};

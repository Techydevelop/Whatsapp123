const cron = require('node-cron');
const { cleanupExpiredOTPs } = require('../utils/otp');
const { checkDisconnectedSessions, getConnectionStats } = require('./connectionMonitor');
const { checkTrialExpiry, getTrialStats } = require('./trialExpiryChecker');
const { checkSubscriptionExpiry, getSubscriptionStats, getRevenueAnalytics } = require('./subscriptionChecker');

/**
 * Initialize and start all background jobs
 */
const startScheduler = () => {
    try {
        console.log('🚀 Starting background job scheduler...');

        // Schedule connection monitor (every 5 minutes)
        cron.schedule('*/5 * * * *', async () => {
            console.log('⏰ Running connection monitor job...');
            try {
                await checkDisconnectedSessions();
                const stats = await getConnectionStats();
                if (stats) {
                    console.log('📊 Connection Stats:', {
                        total: stats.total_sessions,
                        connected: stats.connected_sessions,
                        disconnected: stats.disconnected_sessions,
                        connection_rate: `${stats.connection_rate}%`
                    });
                }
            } catch (error) {
                console.error('❌ Connection monitor job failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        // Schedule trial expiry checker (daily at 9 AM UTC)
        cron.schedule('0 9 * * *', async () => {
            console.log('⏰ Running trial expiry checker job...');
            try {
                await checkTrialExpiry();
                const stats = await getTrialStats();
                if (stats) {
                    console.log('📊 Trial Stats:', {
                        total: stats.total_trials,
                        active: stats.active_trials,
                        expired: stats.expired_trials,
                        expiring_3_days: stats.expiring_in_3_days,
                        expiring_1_day: stats.expiring_in_1_day
                    });
                }
            } catch (error) {
                console.error('❌ Trial expiry checker job failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        // Schedule subscription checker (daily at 9 AM UTC)
        cron.schedule('0 9 * * *', async () => {
            console.log('⏰ Running subscription checker job...');
            try {
                await checkSubscriptionExpiry();
                const stats = await getSubscriptionStats();
                if (stats) {
                    console.log('📊 Subscription Stats:', {
                        total_paid: stats.total_paid_customers,
                        active_paid: stats.active_paid_customers,
                        expired_paid: stats.expired_paid_customers,
                        expiring_7_days: stats.expiring_in_7_days,
                        mrr: `$${stats.monthly_recurring_revenue}`
                    });
                }
            } catch (error) {
                console.error('❌ Subscription checker job failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        // Schedule OTP cleanup (hourly)
        cron.schedule('0 * * * *', async () => {
            console.log('⏰ Running OTP cleanup job...');
            try {
                const cleanedCount = await cleanupExpiredOTPs();
                if (cleanedCount > 0) {
                    console.log(`🧹 Cleaned up ${cleanedCount} expired OTP records`);
                }
            } catch (error) {
                console.error('❌ OTP cleanup job failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        // Schedule daily analytics report (daily at 10 AM UTC)
        cron.schedule('0 10 * * *', async () => {
            console.log('⏰ Running daily analytics report...');
            try {
                const connectionStats = await getConnectionStats();
                const trialStats = await getTrialStats();
                const subscriptionStats = await getSubscriptionStats();
                const revenueAnalytics = await getRevenueAnalytics();

                console.log('📊 Daily Analytics Report:', {
                    connections: connectionStats ? {
                        total: connectionStats.total_sessions,
                        connected: connectionStats.connected_sessions,
                        rate: `${connectionStats.connection_rate}%`
                    } : null,
                    trials: trialStats ? {
                        total: trialStats.total_trials,
                        active: trialStats.active_trials,
                        expired: trialStats.expired_trials
                    } : null,
                    subscriptions: subscriptionStats ? {
                        total_paid: subscriptionStats.total_paid_customers,
                        active_paid: subscriptionStats.active_paid_customers,
                        mrr: subscriptionStats.monthly_recurring_revenue
                    } : null,
                    revenue: revenueAnalytics ? {
                        total: revenueAnalytics.total_revenue,
                        active: revenueAnalytics.active_revenue,
                        this_month: revenueAnalytics.this_month_revenue
                    } : null
                });
            } catch (error) {
                console.error('❌ Daily analytics report failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });

        console.log('✅ Background job scheduler started successfully');
        console.log('📅 Scheduled Jobs:');
        console.log('   - Connection Monitor: Every 5 minutes');
        console.log('   - Trial Expiry Checker: Daily at 9:00 AM UTC');
        console.log('   - Subscription Checker: Daily at 9:00 AM UTC');
        console.log('   - OTP Cleanup: Hourly');
        console.log('   - Daily Analytics: Daily at 10:00 AM UTC');

    } catch (error) {
        console.error('❌ Failed to start background job scheduler:', error);
        throw error;
    }
};

/**
 * Stop all scheduled jobs
 */
const stopScheduler = () => {
    try {
        console.log('🛑 Stopping background job scheduler...');
        
        // Get all scheduled tasks and destroy them
        const tasks = cron.getTasks();
        Object.keys(tasks).forEach(taskName => {
            tasks[taskName].destroy();
        });

        console.log('✅ Background job scheduler stopped successfully');
    } catch (error) {
        console.error('❌ Failed to stop background job scheduler:', error);
    }
};

/**
 * Get scheduler status
 */
const getSchedulerStatus = () => {
    try {
        const tasks = cron.getTasks();
        const taskNames = Object.keys(tasks);
        
        return {
            running: taskNames.length > 0,
            active_tasks: taskNames,
            task_count: taskNames.length
        };
    } catch (error) {
        console.error('❌ Failed to get scheduler status:', error);
        return {
            running: false,
            active_tasks: [],
            task_count: 0
        };
    }
};

/**
 * Run a specific job manually (for testing)
 */
const runJobManually = async (jobName) => {
    try {
        console.log(`🔧 Running job manually: ${jobName}`);

        switch (jobName) {
            case 'connection-monitor':
                await checkDisconnectedSessions();
                const connectionStats = await getConnectionStats();
                return { success: true, stats: connectionStats };

            case 'trial-expiry':
                await checkTrialExpiry();
                const trialStats = await getTrialStats();
                return { success: true, stats: trialStats };

            case 'subscription-expiry':
                await checkSubscriptionExpiry();
                const subscriptionStats = await getSubscriptionStats();
                return { success: true, stats: subscriptionStats };

            case 'otp-cleanup':
                const cleanedCount = await cleanupExpiredOTPs();
                return { success: true, cleaned_count: cleanedCount };

            case 'analytics':
                const connectionStats2 = await getConnectionStats();
                const trialStats2 = await getTrialStats();
                const subscriptionStats2 = await getSubscriptionStats();
                const revenueAnalytics = await getRevenueAnalytics();
                return {
                    success: true,
                    stats: {
                        connections: connectionStats2,
                        trials: trialStats2,
                        subscriptions: subscriptionStats2,
                        revenue: revenueAnalytics
                    }
                };

            default:
                return { success: false, error: 'Unknown job name' };
        }
    } catch (error) {
        console.error(`❌ Manual job execution failed: ${jobName}`, error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    startScheduler,
    stopScheduler,
    getSchedulerStatus,
    runJobManually
};

const { query } = require('../config/customerDb');
const { sendConnectionLostEmail } = require('../utils/email');
const { sendConnectionLostWhatsApp } = require('../utils/whatsapp-notification');

/**
 * Notify customer when WhatsApp connection is lost
 * @param {string} sessionId - Session ID
 * @param {object} metadata - Connection metadata
 */
// Global variable to track database health
let isDatabaseHealthy = true;
let lastHealthCheck = Date.now();
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

const notifyCustomerConnectionLost = async (sessionId, metadata = {}) => {
    try {
        console.log(`🔍 Checking connection loss for session: ${sessionId}`);

        // Skip database operations if DATABASE_URL is not set
        if (!process.env.DATABASE_URL) {
            console.log('⚠️ Skipping database operations - DATABASE_URL not configured');
            return;
        }

        // Check database health before attempting query
        const now = Date.now();
        if (!isDatabaseHealthy && (now - lastHealthCheck) < HEALTH_CHECK_INTERVAL) {
            console.log(`⚠️ Database unreachable, skipping notification for: ${sessionId}`);
            return;
        }

        // Get session details with short timeout
        const sessionResult = await Promise.race([
            query('SELECT id, phone, customer_id FROM sessions WHERE id = $1', [sessionId]),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query timeout')), 3000)
            )
        ]).catch(error => {
            // Mark database as unhealthy on network errors
            if (['ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'XX000'].includes(error.code) || 
                error.message === 'Query timeout') {
                isDatabaseHealthy = false;
                lastHealthCheck = now;
                console.log(`⚠️ Database health check failed, disabling notifications for 5 minutes`);
            }
            throw error;
        });
        
        // If query succeeded, mark database as healthy
        isDatabaseHealthy = true;

        if (sessionResult.rows.length === 0) {
            console.log(`❌ Session not found: ${sessionId}`);
            return;
        }

        const session = sessionResult.rows[0];

        // If no customer_id, it's an orphaned session (old data)
        if (!session.customer_id) {
            console.log(`⚠️ Orphaned session (no customer_id): ${sessionId}`);
            return;
        }

        // Get customer details
        const customerResult = await query(
            'SELECT id, email, phone, business_name FROM customers WHERE id = $1',
            [session.customer_id]
        );

        if (customerResult.rows.length === 0) {
            console.log(`❌ Customer not found for session: ${sessionId}`);
            return;
        }

        const customer = customerResult.rows[0];

        // Check if notification already sent in last 1 hour (avoid spam)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentNotification = await query(
            `SELECT id FROM notifications 
             WHERE customer_id = $1 AND type = 'connection_lost' 
             AND created_at > $2 AND status = 'sent'`,
            [customer.id, oneHourAgo]
        );

        if (recentNotification.rows.length > 0) {
            console.log(`⚠️ Connection lost notification already sent recently for customer: ${customer.email}`);
            return;
        }

        // Create connection log
        await query(
            `INSERT INTO connection_logs (customer_id, session_id, event_type, metadata)
             VALUES ($1, $2, 'disconnected', $3)`,
            [customer.id, sessionId, JSON.stringify(metadata)]
        );

        // Create notification record
        const notificationResult = await query(
            `INSERT INTO notifications (customer_id, type, channel, status)
             VALUES ($1, 'connection_lost', 'both', 'pending')
             RETURNING id`,
            [customer.id]
        );

        const notificationId = notificationResult.rows[0].id;

        // Prepare URLs
        const reconnectUrl = `${process.env.DASHBOARD_URL}/dashboard`;
        const reason = metadata.reason || 'Connection lost';

        try {
            // Send email notification
            await sendConnectionLostEmail(
                customer.email,
                reconnectUrl,
                customer.business_name,
                session.phone,
                reason
            );

            // Send WhatsApp notification
            await sendConnectionLostWhatsApp(
                customer.phone,
                reconnectUrl,
                customer.business_name,
                reason
            );

            // Update notification status
            await query(
                'UPDATE notifications SET status = $1, sent_at = NOW() WHERE id = $2',
                ['sent', notificationId]
            );

            console.log(`✅ Connection lost notifications sent to customer: ${customer.email}`);

        } catch (notificationError) {
            console.error(`❌ Error sending notifications to ${customer.email}:`, notificationError);
            
            // Update notification status to failed
            await query(
                'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
                ['failed', notificationError.message, notificationId]
            );
        }

    } catch (error) {
        // Mark database as unhealthy on connection errors
        if (['ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'XX000'].includes(error.code)) {
            isDatabaseHealthy = false;
            lastHealthCheck = Date.now();
            // Only log once when database becomes unhealthy
            if (isDatabaseHealthy !== false) {
                console.error('❌ Database connection failed, notifications disabled temporarily:', error.message);
            }
        } else {
            // Log other errors normally (but not network errors repeatedly)
            console.error('❌ Error in notifyCustomerConnectionLost:', error.message);
        }
        // Don't throw - this is a background notification, shouldn't crash the app
    }
};

/**
 * Check for disconnected sessions and send notifications
 * Runs every 5 minutes
 */
const checkDisconnectedSessions = async () => {
    try {
        // Skip if database is marked as unhealthy
        if (!isDatabaseHealthy) {
            console.log('⚠️ Skipping disconnected sessions check - database unhealthy');
            return;
        }

        console.log('🔍 Checking for disconnected sessions...');

        // Get all disconnected sessions with customer_id
        const disconnectedSessions = await query(
            `SELECT s.id, s.phone, s.customer_id, c.email, c.business_name
             FROM sessions s
             JOIN customers c ON s.customer_id = c.id
             WHERE s.status = 'disconnected' AND s.customer_id IS NOT NULL`,
            []
        );

        console.log(`📊 Found ${disconnectedSessions.rows.length} disconnected sessions`);

        for (const session of disconnectedSessions.rows) {
            // Check if notification already sent in last 1 hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentNotification = await query(
                `SELECT id FROM notifications 
                 WHERE customer_id = $1 AND type = 'connection_lost' 
                 AND created_at > $2 AND status = 'sent'`,
                [session.customer_id, oneHourAgo]
            );

            if (recentNotification.rows.length === 0) {
                await notifyCustomerConnectionLost(session.id, {
                    reason: 'Scheduled check detected disconnection',
                    timestamp: new Date().toISOString()
                });
            }
        }

        console.log('✅ Disconnected sessions check completed');

    } catch (error) {
        // Mark database as unhealthy on connection errors
        if (['ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'XX000'].includes(error.code)) {
            isDatabaseHealthy = false;
            lastHealthCheck = Date.now();
            console.log('⚠️ Database connection failed during session check, marking as unhealthy');
        } else {
            console.error('❌ Error checking disconnected sessions:', error.message);
        }
    }
};

/**
 * Get connection statistics
 */
const getConnectionStats = async () => {
    try {
        // Skip if database is marked as unhealthy
        if (!isDatabaseHealthy) {
            console.log('⚠️ Skipping connection stats - database unhealthy');
            return null;
        }
        
        // Get total sessions
        const totalSessionsResult = await query('SELECT COUNT(*) as count FROM sessions');
        const totalSessions = parseInt(totalSessionsResult.rows[0].count);

        // Get connected sessions
        const connectedSessionsResult = await query("SELECT COUNT(*) as count FROM sessions WHERE status = 'connected'");
        const connectedSessions = parseInt(connectedSessionsResult.rows[0].count);

        // Get disconnected sessions
        const disconnectedSessionsResult = await query("SELECT COUNT(*) as count FROM sessions WHERE status = 'disconnected'");
        const disconnectedSessions = parseInt(disconnectedSessionsResult.rows[0].count);

        // Get sessions with customer_id (new system)
        const customerSessionsResult = await query('SELECT COUNT(*) as count FROM sessions WHERE customer_id IS NOT NULL');
        const customerSessions = parseInt(customerSessionsResult.rows[0].count);

        // Get orphaned sessions (old system)
        const orphanedSessionsResult = await query('SELECT COUNT(*) as count FROM sessions WHERE customer_id IS NULL');
        const orphanedSessions = parseInt(orphanedSessionsResult.rows[0].count);

        const stats = {
            total_sessions: totalSessions,
            connected_sessions: connectedSessions,
            disconnected_sessions: disconnectedSessions,
            customer_sessions: customerSessions,
            orphaned_sessions: orphanedSessions,
            connection_rate: totalSessions > 0 ? (connectedSessions / totalSessions * 100).toFixed(2) : 0
        };

        console.log('📊 Connection Statistics:', stats);
        return stats;

    } catch (error) {
        // Mark database as unhealthy on connection errors
        if (['ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'XX000'].includes(error.code)) {
            isDatabaseHealthy = false;
            lastHealthCheck = Date.now();
        }
        console.error('❌ Error getting connection stats:', error.message);
        return null;
    }
};

module.exports = {
    notifyCustomerConnectionLost,
    checkDisconnectedSessions,
    getConnectionStats
};

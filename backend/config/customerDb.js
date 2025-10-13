const { Pool } = require('pg');
const dns = require('dns');

// Force IPv4 DNS resolution globally
dns.setDefaultResultOrder('ipv4first');

// PostgreSQL connection pool for customer database (same Supabase instance)
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 SUPABASE_DB_HOST:', process.env.SUPABASE_DB_HOST || 'NOT SET');
console.log('🔍 SUPABASE_DB_PASSWORD:', process.env.SUPABASE_DB_PASSWORD ? 'SET' : 'NOT SET');

// Synchronously resolve hostname to IPv4
function resolveHostToIPv4Sync(hostname) {
    return new Promise((resolve) => {
        dns.resolve4(hostname, (err, addresses) => {
            if (err || !addresses || addresses.length === 0) {
                console.warn(`⚠️ Could not resolve ${hostname} to IPv4, using hostname:`, err?.message);
                resolve(hostname);
            } else {
                const ipv4 = addresses[0];
                console.log(`✅ Resolved ${hostname} to IPv4: ${ipv4}`);
                resolve(ipv4);
            }
        });
    });
}

// Parse DATABASE_URL and create config forcing IPv4
let customerDbPool;

async function initializeDbPool() {
    let poolConfig;

    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            
            // Resolve hostname to IPv4 address
            const ipv4Host = await resolveHostToIPv4Sync(url.hostname);
            
            // Extract connection details and use IPv4 address
            poolConfig = {
                user: url.username,
                password: decodeURIComponent(url.password),
                host: ipv4Host, // Use resolved IPv4 address instead of hostname
                port: parseInt(url.port) || 5432,
                database: url.pathname.slice(1), // Remove leading '/'
                ssl: { rejectUnauthorized: false },
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                keepAlive: true,
                keepAliveInitialDelayMillis: 10000,
            };
            
            console.log(`📊 Database config: ${url.username}@${ipv4Host}:${url.port}/${url.pathname.slice(1)}`);
        } catch (error) {
            console.error('❌ Error parsing DATABASE_URL:', error);
            // Fallback to connection string
            poolConfig = {
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            };
        }
    } else {
        console.warn('⚠️ DATABASE_URL not set, using default configuration');
        poolConfig = {
            host: process.env.SUPABASE_DB_HOST || 'localhost',
            port: 5432,
            database: 'postgres',
            user: 'postgres',
            password: process.env.SUPABASE_DB_PASSWORD || '',
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
        };
    }

    // Create the pool with resolved IPv4 address
    const pool = new Pool(poolConfig);

    // Test database connection
    pool.on('connect', (client) => {
        console.log('✅ Customer database connected successfully');
    });

    pool.on('error', (err) => {
        console.error('❌ Customer database connection error:', err);
    });

    return pool;
}

// Initialize pool synchronously at module load
(async () => {
    try {
        customerDbPool = await initializeDbPool();
        console.log('✅ Database pool initialized with IPv4');
    } catch (error) {
        console.error('❌ Failed to initialize database pool:', error);
        // Create a basic pool as fallback
        customerDbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
        });
    }
})();

// Helper function to execute queries with retry logic
const query = async (text, params) => {
    // Wait for pool to be initialized if not ready yet
    let retries = 0;
    while (!customerDbPool && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!customerDbPool) {
        throw new Error('Database pool not initialized');
    }

    const start = Date.now();
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await customerDbPool.query(text, params);
            const duration = Date.now() - start;
            console.log('📊 Customer DB Query executed:', { text: text.substring(0, 100), duration, rows: res.rowCount });
            return res;
        } catch (error) {
            lastError = error;
            console.error(`❌ Customer DB Query error (attempt ${attempt}/${maxRetries}):`, error.message);
            
            // If it's a network error, wait and retry
            if (attempt < maxRetries && (error.code === 'ENETUNREACH' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT')) {
                const waitTime = attempt * 1000; // Exponential backoff
                console.log(`⏳ Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // For other errors or last attempt, throw immediately
            throw error;
        }
    }
    
    throw lastError;
};

// Helper function to get a client from the pool
const getClient = async () => {
    if (!customerDbPool) {
        throw new Error('Database pool not initialized');
    }
    return await customerDbPool.connect();
};

// Helper function to begin a transaction
const beginTransaction = async () => {
    const client = await getClient();
    await client.query('BEGIN');
    return client;
};

// Helper function to commit a transaction
const commitTransaction = async (client) => {
    await client.query('COMMIT');
    client.release();
};

// Helper function to rollback a transaction
const rollbackTransaction = async (client) => {
    await client.query('ROLLBACK');
    client.release();
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📊 SIGTERM received, closing database pool...');
    if (customerDbPool) {
        await customerDbPool.end();
        console.log('✅ Database pool closed');
    }
});

module.exports = {
    get pool() { return customerDbPool; },
    query,
    getClient,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};

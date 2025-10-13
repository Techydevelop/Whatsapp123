const { Pool } = require('pg');
const { promisify } = require('util');
const dns = require('dns');

// Promisify dns.lookup for better control
const dnsLookup = promisify(dns.lookup);

// PostgreSQL connection pool for customer database (same Supabase instance)
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 SUPABASE_DB_HOST:', process.env.SUPABASE_DB_HOST || 'NOT SET');
console.log('🔍 SUPABASE_DB_PASSWORD:', process.env.SUPABASE_DB_PASSWORD ? 'SET' : 'NOT SET');

// Function to resolve hostname to IPv4 address
async function getIPv4Address(hostname) {
    try {
        console.log(`🔍 Resolving ${hostname} to IPv4...`);
        // Use dns.lookup with family: 4 to force IPv4
        const result = await dnsLookup(hostname, { family: 4, all: false });
        console.log(`✅ Resolved ${hostname} to IPv4: ${result.address}`);
        return result.address;
    } catch (error) {
        console.error(`❌ Failed to resolve ${hostname} to IPv4:`, error.message);
        console.log(`⚠️ Using hostname directly with IPv4-only setting: ${hostname}`);
        // Return original hostname as fallback - Pool will handle it with family setting
        return hostname;
    }
}

// Initialize database pool
let customerDbPool = null;
let poolInitialized = false;

async function initializeDbPool() {
    if (poolInitialized) {
        return customerDbPool;
    }

    let poolConfig;

    if (process.env.DATABASE_URL) {
        try {
            const url = new URL(process.env.DATABASE_URL);
            
            // Resolve hostname to IPv4 address BEFORE creating pool
            const ipv4Address = await getIPv4Address(url.hostname);
            
            // Build connection string with explicit SSL mode
            // Note: We use connection string format to ensure proper SSL handling
            const password = encodeURIComponent(decodeURIComponent(url.password));
            const connectionString = `postgresql://${url.username}:${password}@${ipv4Address}:${url.port || 5432}/${url.pathname.slice(1)}?sslmode=require`;
            
            poolConfig = {
                connectionString: connectionString,
                ssl: { rejectUnauthorized: false },
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                keepAlive: true,
                keepAliveInitialDelayMillis: 10000,
            };
            
            console.log(`📊 Database config: ${url.username}@${ipv4Address}:${url.port}/${url.pathname.slice(1)}`);
        } catch (error) {
            console.error('❌ Error parsing DATABASE_URL:', error);
            throw error;
        }
    } else {
        console.warn('⚠️ DATABASE_URL not set');
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

    // Create the pool
    customerDbPool = new Pool(poolConfig);

    // Test connection
    customerDbPool.on('connect', () => {
        console.log('✅ Customer database connected successfully');
    });

    customerDbPool.on('error', (err) => {
        console.error('❌ Customer database connection error:', err.message);
    });

    // Test initial connection
    try {
        const client = await customerDbPool.connect();
        console.log('✅ Database pool initialized and tested successfully');
        client.release();
    } catch (error) {
        console.error('❌ Failed to test database connection:', error.message);
    }

    poolInitialized = true;
    return customerDbPool;
}

// Initialize pool immediately and wait for it
const poolPromise = initializeDbPool();

// Helper function to ensure pool is ready
async function ensurePoolReady() {
    if (!poolInitialized || !customerDbPool) {
        console.log('⏳ Waiting for database pool initialization...');
        await poolPromise;
    }
    return customerDbPool;
}

// Helper function to execute queries
const query = async (text, params) => {
    // Ensure pool is ready
    await ensurePoolReady();
    
    const start = Date.now();
    const maxRetries = 2; // Reduced retries since connection should work
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await customerDbPool.query(text, params);
            const duration = Date.now() - start;
            console.log('📊 Customer DB Query executed:', { 
                text: text.substring(0, 80) + '...', 
                duration, 
                rows: res.rowCount 
            });
            return res;
        } catch (error) {
            lastError = error;
            console.error(`❌ Customer DB Query error (attempt ${attempt}/${maxRetries}):`, error.message);
            
            // If it's a network error, wait and retry
            if (attempt < maxRetries && (error.code === 'ENETUNREACH' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT')) {
                const waitTime = 1000;
                console.log(`⏳ Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            throw error;
        }
    }
    
    throw lastError;
};

// Helper function to get a client from the pool
const getClient = async () => {
    await ensurePoolReady();
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

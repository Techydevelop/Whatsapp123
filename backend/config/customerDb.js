const { Pool } = require('pg');

// PostgreSQL connection pool for customer database (same Supabase instance)
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 SUPABASE_DB_HOST:', process.env.SUPABASE_DB_HOST || 'NOT SET');
console.log('🔍 SUPABASE_DB_PASSWORD:', process.env.SUPABASE_DB_PASSWORD ? 'SET' : 'NOT SET');

// Parse DATABASE_URL and create config forcing IPv4
let poolConfig;

if (process.env.DATABASE_URL) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        
        // Extract connection details
        poolConfig = {
            user: url.username,
            password: decodeURIComponent(url.password),
            host: url.hostname,
            port: parseInt(url.port) || 5432,
            database: url.pathname.slice(1), // Remove leading '/'
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            // Force IPv4 - this is critical for Render
            family: 4,
        };
        
        console.log(`📊 Using parsed DATABASE_URL: ${url.username}@${url.hostname}:${url.port}/${url.pathname.slice(1)}`);
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
        family: 4,
    };
}

// Create the pool with IPv4-only configuration
const customerDbPool = new Pool(poolConfig);

// Test database connection
customerDbPool.on('connect', (client) => {
    console.log('✅ Customer database connected successfully');
});

customerDbPool.on('error', (err) => {
    console.error('❌ Customer database connection error:', err);
    // Don't exit process, let the application handle it
});

// Helper function to execute queries with retry logic
const query = async (text, params) => {
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
    await customerDbPool.end();
    console.log('✅ Database pool closed');
});

module.exports = {
    pool: customerDbPool,
    query,
    getClient,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};

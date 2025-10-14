const { Pool } = require('pg');

// PostgreSQL connection pool for customer database (same Supabase instance)
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

// Simple and direct approach - let pg library handle everything
let poolConfig;

if (process.env.DATABASE_URL) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        
        // Determine if we should use Supabase Pooler
        // Pooler provides better IPv4 support for platforms like Render
        let host = url.hostname;
        let port = parseInt(url.port) || 5432;
        
        // Check if this is a Supabase database
        let user = url.username;
        
        // Check if we should use Supabase Pooler via environment variable
        const usePooler = process.env.USE_SUPABASE_POOLER === 'true';
        
        if (usePooler && host.includes('supabase.co') && !host.includes('pooler')) {
            // Extract project reference from hostname like: db.flvbcxokjmyffggdkxqy.supabase.co
            const projectRef = host.split('.')[1];
            
            // Use environment variable for region or try to detect from hostname
            const region = process.env.SUPABASE_REGION || 'eu-west-2'; // Default to eu-west-2
            
            // Construct pooler hostname
            // Format: aws-0-[region].pooler.supabase.com
            host = `aws-0-${region}.pooler.supabase.com`;
            port = 6543; // Pooler uses port 6543 for transaction mode
            
            // Important: Supabase pooler requires username in format: postgres.[project_ref]
            if (!user.includes('.')) {
                user = `${user}.${projectRef}`;
                console.log(`✅ Using Supabase Pooler with user: ${user}`);
            }
            
            console.log(`✅ Pooler connection: ${host}:${port} (Region: ${region})`);
        } else {
            console.log(`📊 Direct database connection: ${host}:${port}`);
            console.log(`💡 To enable pooler, set USE_SUPABASE_POOLER=true`);
        }
        
        // Use individual config parameters instead of connection string
        // This gives pg library more control over connection
        poolConfig = {
            user: user,
            password: decodeURIComponent(url.password),
            host: host,
            port: port,
            database: url.pathname.slice(1),
            ssl: { rejectUnauthorized: false },
            
            // Connection pool settings
            max: 20,
            min: 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000,
            
            // Keep alive settings
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
            
            // Statement timeout (30 seconds)
            statement_timeout: 30000,
            
            // Query timeout (30 seconds)
            query_timeout: 30000,
        };
        
    } catch (error) {
        console.error('❌ Error parsing DATABASE_URL:', error);
        // Fallback to connection string
        poolConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            connectionTimeoutMillis: 15000,
        };
    }
} else {
    console.warn('⚠️ DATABASE_URL not set');
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
    };
}

// Create the pool
const customerDbPool = new Pool(poolConfig);

// Connection event handlers
customerDbPool.on('connect', () => {
    console.log('✅ Customer database connected successfully');
});

customerDbPool.on('error', (err) => {
    console.error('❌ Customer database pool error:', err.message);
    // Don't crash the app on connection errors
});

customerDbPool.on('remove', () => {
    console.log('📊 Database client removed from pool');
});

// Test initial connection with retry
let connectionTested = false;
async function testConnection(retryCount = 0) {
    if (connectionTested) return;
    
    try {
        console.log(`🔄 Testing database connection (attempt ${retryCount + 1}/3)...`);
        const client = await customerDbPool.connect();
        await client.query('SELECT NOW()');
        client.release();
        connectionTested = true;
        console.log('✅ Database pool initialized and tested successfully');
    } catch (error) {
        console.error(`❌ Database connection test failed (attempt ${retryCount + 1}/3):`, error.message);
        
        if (retryCount < 2) {
            // Retry after delay
            const delay = (retryCount + 1) * 2000;
            console.log(`⏳ Retrying in ${delay}ms...`);
            setTimeout(() => testConnection(retryCount + 1), delay);
        } else {
            console.error('❌ Database connection test failed after 3 attempts');
            console.log('⚠️ Application will continue but database operations may fail');
        }
    }
}

// Test connection on startup
testConnection();

// Helper function to execute queries with automatic retry
const query = async (text, params) => {
    const start = Date.now();
    const maxRetries = 2;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const res = await customerDbPool.query(text, params);
            const duration = Date.now() - start;
            
            // Only log first 80 chars of query to avoid log spam
            const queryPreview = text.substring(0, 80).replace(/\s+/g, ' ');
            console.log(`📊 Query OK: ${queryPreview}... (${duration}ms, ${res.rowCount} rows)`);
            
            return res;
        } catch (error) {
            lastError = error;
            
            // Check if it's a transient network error
            const isNetworkError = ['ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);
            
            if (attempt < maxRetries && isNetworkError) {
                const waitTime = attempt * 1000;
                console.log(`⚠️ Query failed (${error.code}), retrying in ${waitTime}ms... (${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }
            
            // For non-network errors or last attempt, log and throw
            console.error(`❌ Query error (attempt ${attempt}/${maxRetries}):`, {
                code: error.code,
                message: error.message,
                query: text.substring(0, 80)
            });
            
            throw error;
        }
    }
    
    throw lastError;
};

// Helper function to get a client from the pool
const getClient = async () => {
    try {
        return await customerDbPool.connect();
    } catch (error) {
        console.error('❌ Failed to get database client:', error.message);
        throw error;
    }
};

// Helper function to begin a transaction
const beginTransaction = async () => {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        return client;
    } catch (error) {
        client.release();
        throw error;
    }
};

// Helper function to commit a transaction
const commitTransaction = async (client) => {
    try {
        await client.query('COMMIT');
    } finally {
        client.release();
    }
};

// Helper function to rollback a transaction
const rollbackTransaction = async (client) => {
    try {
        await client.query('ROLLBACK');
    } finally {
        client.release();
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📊 SIGTERM received, closing database pool...');
    try {
        await customerDbPool.end();
        console.log('✅ Database pool closed');
    } catch (error) {
        console.error('❌ Error closing database pool:', error.message);
    }
});

process.on('SIGINT', async () => {
    console.log('📊 SIGINT received, closing database pool...');
    try {
        await customerDbPool.end();
        console.log('✅ Database pool closed');
    } catch (error) {
        console.error('❌ Error closing database pool:', error.message);
    }
    process.exit(0);
});

module.exports = {
    pool: customerDbPool,
    query,
    getClient,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};

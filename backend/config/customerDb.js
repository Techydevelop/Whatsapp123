const { Pool } = require('pg');

// PostgreSQL connection pool for customer database (same Supabase instance)
console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('🔍 DATABASE_URL value:', process.env.DATABASE_URL);
console.log('🔍 SUPABASE_DB_HOST:', process.env.SUPABASE_DB_HOST || 'NOT SET');
console.log('🔍 SUPABASE_DB_PASSWORD:', process.env.SUPABASE_DB_PASSWORD ? 'SET' : 'NOT SET');

const customerDbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    family: 4, // Force IPv4 connection
});

// Test database connection
customerDbPool.on('connect', () => {
    console.log('✅ Customer database connected successfully');
});

customerDbPool.on('error', (err) => {
    console.error('❌ Customer database connection error:', err);
});

// Helper function to execute queries
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await customerDbPool.query(text, params);
        const duration = Date.now() - start;
        console.log('📊 Customer DB Query executed:', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('❌ Customer DB Query error:', error);
        throw error;
    }
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

module.exports = {
    pool: customerDbPool,
    query,
    getClient,
    beginTransaction,
    commitTransaction,
    rollbackTransaction
};

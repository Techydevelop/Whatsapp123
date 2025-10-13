const { Pool } = require('pg');

// PostgreSQL connection pool for customer database (same Supabase instance)
const customerDbPool = new Pool({
    host: process.env.SUPABASE_DB_HOST || process.env.CUSTOMER_DB_HOST || 'localhost',
    port: process.env.SUPABASE_DB_PORT || process.env.CUSTOMER_DB_PORT || 5432,
    database: process.env.SUPABASE_DB_NAME || process.env.CUSTOMER_DB_NAME || 'postgres',
    user: process.env.SUPABASE_DB_USER || process.env.CUSTOMER_DB_USER || 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD || process.env.CUSTOMER_DB_PASSWORD || '',
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

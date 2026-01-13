// db.js
require('dotenv').config({ path: '/var/www/.env' });
const mysql = require('mysql2/promise');

// Create the pool (this doesn't connect yet, it just prepares the config)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Create a helper function to TEST the connection safely
async function checkDbConnection() {
    try {
        console.log('🔌 Testing database connection...');
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully!');
        connection.release(); // Important: Release it back to the pool
        return true;
    } catch (error) {
        console.error('❌ DATABASE CONNECTION ERROR:');
        console.error(`   Message: ${error.message}`);
        console.error(`   Code:    ${error.code}`);
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   👉 HINT: Check your DB_USER and DB_PASSWORD in .env');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('   👉 HINT: Is your MySQL server running? Check DB_HOST.');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('   👉 HINT: The database name in .env does not exist.');
        }
        return false;
    }
}

// Export the pool AND the checker
module.exports = { pool, checkDbConnection };
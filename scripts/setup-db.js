const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  let connection;
  try {
    console.log('🔌 Connecting to MySQL server...');

    // Connect without database selected first
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      multipleStatements: true // Enable multiple statements for the script
    });

    console.log('✅ Connected to MySQL server.');

    // Read init.sql
    const sqlPath = path.join(__dirname, '..', 'init.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`init.sql not found at ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log(`📄 Read init.sql (${sql.length} bytes).`);

    console.log('🚀 Executing initialization script...');
    // Enable multiple statements in connection config for this to work if not already
    await connection.query('DROP TABLE IF EXISTS agents');
    await connection.query(sql);

    console.log('✅ Database initialized successfully!');

  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

setupDatabase();

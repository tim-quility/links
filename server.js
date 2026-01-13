const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool, checkDbConnection } = require('./db');
require('dotenv').config({ path: '/var/www/.env' });

const app = express();
// Auto-fix port 3306 to 3005 if needed
const PORT = (process.env.PORT == 3306) ? 3005 : (process.env.PORT || 3005);

// --- 1. Load Template ---
const templatePath = path.join(__dirname, 'templates', 'compliance.html');
let complianceTemplate = '';

try {
    complianceTemplate = fs.readFileSync(templatePath, 'utf8');
    console.log('✅ Template loaded successfully.');
} catch (err) {
    console.error('❌ TEMPLATE ERROR: Could not find templates/compliance.html');
    process.exit(1); 
}

// --- 2. THE NEW AUTO-SEEDING LOGIC ---
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
        
        console.log('🛠️  Checking Database Schema...');

        // A. Create Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                subdomain VARCHAR(50) NOT NULL UNIQUE,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                brand_name VARCHAR(100) NOT NULL,
                phone_number VARCHAR(20) NOT NULL,
                email VARCHAR(100) NOT NULL,
                privacy_policy_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // B. Check if Seed Data exists
        const [rows] = await connection.query('SELECT count(*) as count FROM agents');
        
        if (rows[0].count === 0) {
            console.log('🌱 Table empty. Seeding test data...');
            await connection.query(`
                INSERT INTO agents (subdomain, first_name, last_name, brand_name, phone_number, email, privacy_policy_url)
                VALUES 
                ('jay-bloom', 'Jay', 'Bloom', 'Links Insure', '(555) 123-4567', 'jay@links-insure.com', 'https://links-insure.com/privacy'),
                ('gavin-morel', 'Gavin', 'Morel', 'Links Insure', '(555) 987-6543', 'gavin@links-insure.com', 'https://links-insure.com/privacy')
            `);
            console.log('✅ Test data seeded!');
        } else {
            console.log('👍 Database already initialized.');
        }

        connection.release();
        return true;
    } catch (error) {
        console.error('❌ INIT ERROR:', error.message);
        return false;
    }
}

// --- 3. The Route ---
app.get('/sms-compliance', async (req, res) => {
    try {
        const host = req.get('host');
        let subdomain = host.split('.')[0];
        if (req.query.agent) subdomain = req.query.agent;

        console.log(`🔍 Lookup request for agent: ${subdomain}`);

        const [rows] = await pool.query(
            'SELECT * FROM agents WHERE subdomain = ? LIMIT 1',
            [subdomain]
        );

        // DEBUG 1: Did we find the agent?
        if (rows.length === 0) {
            console.log('❌ Agent not found in DB!');
            return res.status(404).send('Agent not found');
        }
        
        // DEBUG 2: What data did we get?
        const agent = rows[0];
        console.log('✅ Found Agent:', agent.first_name, agent.last_name);

        const fullName = `${agent.first_name} ${agent.last_name}`;

        // DEBUG 3: Is the template empty?
        if (!complianceTemplate) {
             console.error('❌ CRITICAL: Compliance Template string is empty!');
             return res.status(500).send('Template Error');
        }

        let finalHtml = complianceTemplate
            .replace(/{{BRAND_NAME}}/g, agent.brand_name)
            .replace(/{{AGENT_NAME}}/g, fullName)
            .replace(/{{PHONE}}/g, agent.phone_number)
            .replace(/{{PRIVACY_URL}}/g, agent.privacy_policy_url || '#');
        
        // DEBUG 4: Did the replacement work?
        if (finalHtml.includes('{{BRAND_NAME}}')) {
             console.warn('⚠️ WARNING: Placeholders were NOT replaced. Check HTML syntax.');
        }

        res.setHeader('Content-Type', 'text/html');
        res.send(finalHtml);
        

    } catch (error) {
        console.error('🔥 RUNTIME ERROR:', error.message);
        res.status(500).send('Internal Server Error');
    }
});

// --- 4. Start Server ---
async function startServer() {
    // Check connection first
    const isDbConnected = await checkDbConnection();
    if (!isDbConnected) {
        console.error('💀 Fatal Error: DB Connection Failed.');
        process.exit(1);
    }

    // Run the Auto-Seeder
    await initializeDatabase();

    app.listen(PORT, () => {
        console.log(`🚀 Compliance Engine running on http://localhost:${PORT}`);
        console.log(`👉 Test URL: http://localhost:${PORT}/sms-compliance?agent=jay-bloom`);
    });
}

startServer();
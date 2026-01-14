const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool, checkDbConnection } = require('./db');
require('dotenv').config({
  path: require('fs').existsSync('.env')
    ? '.env'
    : '/var/www/.env'
});
const helmet = require('helmet');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], 
        
        // Allow scripts from your site AND common CDNs (if you use them)
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        
        // Allow styles from your site AND Google Fonts
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
        
        // Allow loading fonts from Google
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        
        // Allow images from ANYWHERE (Since agent logos might come from different URLs)
        imgSrc: ["'self'", "data:", "https:"], 
        
        // specific to preventing clickjacking
        frameAncestors: ["'none'"], 
      },
    },
    // If you don't use HTTPS on localhost, this avoids browser errors during dev
    strictTransportSecurity: process.env.NODE_ENV === 'production', 
  })
);
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

app.post('/submit', async (req, res) => {
    try {
        const { 
            agent_handle, first_name, last_name, 
            email,
            phone, interest, 
            sms_marketing, sms_transactional 
        } = req.body;

        // 1. Validation: Phone AND Email now required
        if ( !agent_handle ) {
            return res.status(400).send('Missing required fields.');
        }

        // 2. Consent Logic
        const marketingVal = sms_marketing === 'on' ? 1 : 0;
        const transactionalVal = sms_transactional === 'on' ? 1 : 0;
        const generalConsentVal = (marketingVal === 1 || transactionalVal === 1) ? 1 : 0;

        // 3. Insert with Email
        const query = `
            INSERT INTO leads 
            (agent_handle, first_name, last_name, email, phone, interest, marketing_consent, transactional_consent, consent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await pool.query(query, [
            agent_handle, first_name, last_name, 
            email,              // <--- Inserted here
            phone, interest,
            marketingVal, transactionalVal, generalConsentVal
        ]);

        res.redirect(`/thank-you/${agent_handle}`);

    } catch (error) {
        console.error('🔥 SUBMISSION ERROR:', error);
        res.status(500).send('Error processing request.');
    }
});

app.get('/privacy-policy', (req, res) => {
    res.sendFile(__dirname + '/templates/privacy.html');
});
app.get('/terms-conditions', (req, res) => {
    res.sendFile(__dirname + '/templates/terms.html');
});
// --- 3. The Route ---
app.get('/meet/:agentName', async (req, res) => {
    function escapeHtml(text) {
        if (!text) return text;
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    try {

        const subdomain = req.params.agentName;
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

        // SANITIZE EVERYTHING before putting it in HTML
        let finalHtml = complianceTemplate
            .replace(/{{BRAND_NAME}}/g, escapeHtml(agent.brand_name))
            .replace(/{{AGENT_NAME}}/g, escapeHtml(fullName))
            .replace(/{{PHONE}}/g, escapeHtml(agent.phone_number))
            .replace(/{{PRIVACY_URL}}/g, agent.privacy_policy_url || '#')
            .replace(/{{AGENT_HANDLE}}/g, subdomain);
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
app.get(['/thank-you', '/thank-you/:agentName'], (req, res) => {
    res.sendFile(__dirname + '/templates/thank-you.html');
});
startServer();
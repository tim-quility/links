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

// --- 1. Load Templates ---
const templatePath = path.join(__dirname, 'templates', 'compliance.html');
const directoryPath = path.join(__dirname, 'templates', 'directory.html');
let complianceTemplate = '';
let directoryTemplate = '';

try {
    complianceTemplate = fs.readFileSync(templatePath, 'utf8');
    directoryTemplate = fs.readFileSync(directoryPath, 'utf8');
    console.log('✅ Templates loaded successfully.');
} catch (err) {
    console.error('❌ TEMPLATE ERROR: Could not find templates.');
    process.exit(1);
}

// --- 2. THE NEW AUTO-SEEDING LOGIC ---
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();

        console.log('🛠️  Checking Database Schema...');

        // RE-INIT: Drop table to ensure new schema is applied
        await connection.query('DROP TABLE IF EXISTS agents');

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
                about_me TEXT,
                city VARCHAR(100),
                state VARCHAR(50),
                zip_code VARCHAR(20),
                avatar_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // B. Seed Data always since we dropped it
        console.log('🌱 Seeding test data...');
        await connection.query(`
            INSERT INTO agents (subdomain, first_name, last_name, brand_name, phone_number, email, privacy_policy_url, about_me, city, state, zip_code, avatar_url)
            VALUES 
            ('jay-bloom', 'Jay', 'Bloom', 'Quility Switchboard Funnel', '(555) 123-4567', 'jay@links-insure.com', 'https://links-insure.com/privacy', 'Jay Bloom is a dedicated insurance professional with over 15 years of experience helping families secure their financial future. Specializing in life insurance and mortgage protection, Jay is committed to providing personalized service and finding the best coverage options for his clients.', 'Austin', 'TX', '78701', 'https://randomuser.me/api/portraits/men/32.jpg'),
            ('gavin-morel', 'Gavin', 'Morel', 'Quility Switchboard Funnel', '(555) 987-6543', 'gavin@links-insure.com', 'https://links-insure.com/privacy', 'Gavin Morel is passionate about making insurance simple and accessible. With a focus on education and transparency, he guides his clients through the complexities of insurance policies to ensure they have the protection they need.', 'Dallas', 'TX', '75201', 'https://randomuser.me/api/portraits/men/45.jpg')
        `);
        console.log('✅ Database & Seeds initialized!');

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
        if (!agent_handle) {
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

// --- 3. Directory Route ---
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.q || '';
        let query = 'SELECT * FROM agents';
        let params = [];

        if (searchQuery) {
            query += ' WHERE first_name LIKE ? OR last_name LIKE ? OR city LIKE ? OR zip_code LIKE ?';
            const term = `%${searchQuery}%`;
            params = [term, term, term, term];
        }

        const [agents] = await pool.query(query, params);

        // Build Agent Cards HTML
        let cardsHtml = '';
        if (agents.length > 0) {
            cardsHtml = agents.map(agent => `
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                    <div class="p-6">
                        <div class="flex items-center gap-4 mb-4">
                            <img src="${agent.avatar_url || 'https://via.placeholder.com/150'}" alt="${agent.first_name}" class="w-16 h-16 rounded-full object-cover">
                            <div>
                                <h3 class="font-bold text-lg text-slate-900">${agent.first_name} ${agent.last_name}</h3>
                                <p class="text-xs text-slate-500 uppercase tracking-wide">${agent.brand_name}</p>
                            </div>
                        </div>
                        <div class="text-sm text-slate-600 mb-4 space-y-1">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-location-dot text-slate-400 w-4"></i>
                                <span>${agent.city}, ${agent.state} ${agent.zip_code}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-phone text-slate-400 w-4"></i>
                                <span>${agent.phone_number}</span>
                            </div>
                        </div>
                        <a href="/meet/${agent.subdomain}" class="block w-full text-center bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-black transition-colors">
                            View Profile
                        </a>
                    </div>
                </div>
            `).join('');
        }

        let noResultsHtml = '';
        if (agents.length === 0) {
            noResultsHtml = `
                <div class="text-center py-12">
                    <div class="text-gray-300 text-5xl mb-4"><i class="fa-solid fa-magnifying-glass"></i></div>
                    <h3 class="text-xl font-medium text-slate-700">No agents found.</h3>
                    <p class="text-slate-500">Try adjusting your search terms.</p>
                </div>
            `;
        }

        // Render Template
        let html = directoryTemplate
            .replace(/{{SEARCH_QUERY}}/g, searchQuery)
            .replace(/{{RESULTS_HEADER}}/g, searchQuery ? `Search Results for "${searchQuery}"` : 'All Agents')
            .replace(/{{AGENT_CARDS}}/g, cardsHtml)
            .replace(/{{NO_RESULTS}}/g, noResultsHtml);

        res.send(html);

    } catch (error) {
        console.error('🔥 DIRECTORY ERROR:', error);
        res.status(500).send('Error loading directory');
    }
});

// --- 4. Profile Route ---
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
        // if (req.query.agent) subdomain = req.query.agent; // Deprecated support for query param if desired

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
            .replace(/{{AGENT_HANDLE}}/g, subdomain)
            // NEW FIELDS
            .replace(/{{ABOUT_ME}}/g, escapeHtml(agent.about_me) || "Contact me for more information.")
            .replace(/{{CITY}}/g, escapeHtml(agent.city))
            .replace(/{{STATE}}/g, escapeHtml(agent.state))
            .replace(/{{AVATAR_URL}}/g, agent.avatar_url || 'https://via.placeholder.com/150');

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

    // Serve the Agent Login Page
    app.get('/login', (req, res) => {
        res.sendFile(path.join(__dirname, 'templates', 'login.html'));
    });

    // Start Server
    app.listen(PORT, () => {
        console.log(`
🚀 Server running at http://localhost:${PORT}
👉 Directory: http://localhost:${PORT}/
👉 Test Agent: http://localhost:${PORT}/meet/jay-bloom
👉 Login:      http://localhost:${PORT}/login
        `);
    });

    app.get(['/thank-you', '/thank-you/:agentName'], (req, res) => {
        res.sendFile(__dirname + '/templates/thank-you.html');
    });
}
startServer();
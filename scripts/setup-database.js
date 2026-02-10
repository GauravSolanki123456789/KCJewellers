// Database Setup Script - Single Tenant
// Run: npm run setup-db
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function setup() {
    console.log('');
    console.log('================================================');
    console.log('  Jewelry Estimation - Database Setup');
    console.log('  Single-Tenant Architecture');
    console.log('================================================');
    console.log('');

    // Create database connection
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
        port: process.env.DATABASE_URL ? undefined : (process.env.DB_PORT || 5432),
        database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME || 'jewelry_db'),
        user: process.env.DATABASE_URL ? undefined : (process.env.DB_USER || 'postgres'),
        password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'postgres'),
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });

    try {
        // Test connection
        console.log('📡 Connecting to database...');
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful!');
        console.log('');

        // Read and execute SQL file
        const sqlFilePath = path.join(__dirname, '..', 'setup_single_tenant.sql');
        
        if (fs.existsSync(sqlFilePath)) {
            console.log('📜 Running setup_single_tenant.sql...');
            const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
            
            // Split by semicolons and execute each statement
            const statements = sqlContent
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('DO $$'));
            
            for (const statement of statements) {
                if (statement.length > 10) {
                    try {
                        await pool.query(statement);
                    } catch (err) {
                        // Ignore "already exists" errors
                        if (!err.message.includes('already exists') && 
                            !err.message.includes('duplicate key')) {
                            console.warn(`⚠️ Warning: ${err.message.substring(0, 100)}`);
                        }
                    }
                }
            }
            console.log('✅ SQL schema executed successfully!');
        } else {
            console.log('📜 SQL file not found, initializing schema manually...');
            await initializeSchema(pool);
        }

        // Verify tables exist
        console.log('');
        console.log('🔍 Verifying tables...');
        const tableCheck = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        `);
        
        const tables = tableCheck.rows.map(r => r.table_name);
        const requiredTables = ['products', 'customers', 'bills', 'quotations', 'rates', 'users'];
        const missingTables = requiredTables.filter(t => !tables.includes(t));
        
        if (missingTables.length > 0) {
            console.log(`⚠️ Missing tables: ${missingTables.join(', ')}`);
            console.log('📜 Creating missing tables...');
            await initializeSchema(pool);
        }
        
        console.log(`✅ Found ${tables.length} tables: ${tables.join(', ')}`);

        // Insert dummy data if tables are empty
        console.log('');
        console.log('📦 Checking for seed data...');
        await insertSeedData(pool);

        console.log('');
        console.log('================================================');
        console.log('  ✅ Single Tenant Database Ready!');
        console.log('================================================');
        console.log('');
        console.log('🚀 Next steps:');
        console.log('   1. Start the server: npm start');
        console.log('   2. Open: http://localhost:3000');
        console.log('   3. Login with Google (jaigaurav56789@gmail.com)');
        console.log('      or set admin password: npm run change-master-password');
        console.log('');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('❌ Setup failed:', error.message);
        console.error('');
        console.error('💡 Troubleshooting:');
        console.error('   - Check DATABASE_URL or DB_* environment variables');
        console.error('   - Ensure PostgreSQL is running');
        console.error('   - Verify database exists and user has permissions');
        console.error('');
        await pool.end();
        process.exit(1);
    }
}

async function initializeSchema(pool) {
    const bcrypt = require('bcrypt');
    
    // Create tables
    const createTables = `
        -- Admin Users
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            is_super_admin BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Users (Google OAuth / Local)
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            google_id VARCHAR(255) UNIQUE,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100),
            password VARCHAR(255),
            name VARCHAR(255),
            role VARCHAR(50) DEFAULT 'employee',
            account_status VARCHAR(50) DEFAULT 'pending',
            phone_number VARCHAR(20),
            dob DATE,
            company_name VARCHAR(255),
            allowed_tabs TEXT[],
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Customers
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            mobile VARCHAR(20),
            address1 VARCHAR(255),
            address2 VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(100),
            pincode VARCHAR(20),
            gstin VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Products
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(100) UNIQUE,
            sku VARCHAR(100),
            style_code VARCHAR(100),
            short_name VARCHAR(255),
            item_name VARCHAR(255),
            metal_type VARCHAR(50),
            size VARCHAR(50),
            weight DECIMAL(10,3),
            purity DECIMAL(5,2),
            rate DECIMAL(10,2),
            mc_rate DECIMAL(10,2),
            mc_type VARCHAR(50),
            pcs INTEGER DEFAULT 1,
            box_charges DECIMAL(10,2) DEFAULT 0,
            stone_charges DECIMAL(10,2) DEFAULT 0,
            floor VARCHAR(100),
            avg_wt DECIMAL(10,3),
            split_from VARCHAR(100),
            split_date TIMESTAMP,
            is_sold BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Rates
        CREATE TABLE IF NOT EXISTS rates (
            id SERIAL PRIMARY KEY,
            gold DECIMAL(10,2) DEFAULT 7500,
            silver DECIMAL(10,2) DEFAULT 156,
            platinum DECIMAL(10,2) DEFAULT 3500,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Quotations
        CREATE TABLE IF NOT EXISTS quotations (
            id SERIAL PRIMARY KEY,
            quotation_no VARCHAR(50) UNIQUE NOT NULL,
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            discount DECIMAL(10,2) DEFAULT 0,
            advance DECIMAL(10,2) DEFAULT 0,
            final_amount DECIMAL(10,2),
            payment_status VARCHAR(50),
            remarks VARCHAR(255),
            is_billed BOOLEAN DEFAULT false,
            bill_no VARCHAR(50),
            bill_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Bills
        CREATE TABLE IF NOT EXISTS bills (
            id SERIAL PRIMARY KEY,
            bill_no VARCHAR(50) UNIQUE NOT NULL,
            quotation_id INTEGER REFERENCES quotations(id),
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            cgst DECIMAL(10,2),
            sgst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            payment_method VARCHAR(50),
            cash_type VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Ledger Transactions
        CREATE TABLE IF NOT EXISTS ledger_transactions (
            id SERIAL PRIMARY KEY,
            customer_id INTEGER REFERENCES customers(id),
            transaction_type VARCHAR(50),
            amount DECIMAL(10,2),
            description TEXT,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            cash_type VARCHAR(20),
            is_restricted BOOLEAN DEFAULT false,
            payment_method VARCHAR(50),
            reference VARCHAR(100),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            bill_no VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Purchase Vouchers
        CREATE TABLE IF NOT EXISTS purchase_vouchers (
            id SERIAL PRIMARY KEY,
            pv_no VARCHAR(50) UNIQUE NOT NULL,
            supplier_name VARCHAR(255),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- ROL Data
        CREATE TABLE IF NOT EXISTS rol_data (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(100) UNIQUE,
            rol INTEGER DEFAULT 0,
            available INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Sales Returns
        CREATE TABLE IF NOT EXISTS sales_returns (
            id SERIAL PRIMARY KEY,
            ssr_no VARCHAR(50) UNIQUE NOT NULL,
            bill_id INTEGER REFERENCES bills(id),
            bill_no VARCHAR(50) NOT NULL,
            quotation_id INTEGER REFERENCES quotations(id),
            customer_id INTEGER REFERENCES customers(id),
            customer_name VARCHAR(255),
            customer_mobile VARCHAR(20),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            gst DECIMAL(10,2),
            cgst DECIMAL(10,2),
            sgst DECIMAL(10,2),
            net_total DECIMAL(10,2),
            reason TEXT,
            remarks VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Tally Config
        CREATE TABLE IF NOT EXISTS tally_config (
            id SERIAL PRIMARY KEY,
            tally_url VARCHAR(255) DEFAULT 'http://localhost:9000',
            company_name VARCHAR(255),
            api_key_encrypted TEXT,
            api_secret_encrypted TEXT,
            connection_type VARCHAR(50) DEFAULT 'gateway',
            enabled BOOLEAN DEFAULT false,
            sync_mode VARCHAR(50) DEFAULT 'manual',
            auto_sync_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Tally Sync Log
        CREATE TABLE IF NOT EXISTS tally_sync_log (
            id SERIAL PRIMARY KEY,
            transaction_type VARCHAR(50) NOT NULL,
            transaction_id INTEGER NOT NULL,
            transaction_ref VARCHAR(100),
            sync_status VARCHAR(50) DEFAULT 'pending',
            sync_attempts INTEGER DEFAULT 0,
            last_sync_at TIMESTAMP,
            last_error TEXT,
            tally_response TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // Execute table creation
    const tableStatements = createTables.split(';').filter(s => s.trim().length > 10);
    for (const stmt of tableStatements) {
        try {
            await pool.query(stmt);
        } catch (err) {
            if (!err.message.includes('already exists')) {
                console.warn(`⚠️ ${err.message.substring(0, 80)}`);
            }
        }
    }

    // Create indexes
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
        'CREATE INDEX IF NOT EXISTS idx_products_style_code ON products(style_code)',
        'CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile)',
        'CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date)',
        'CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)'
    ];

    for (const idx of indexes) {
        try {
            await pool.query(idx);
        } catch (err) {
            // Ignore index errors
        }
    }

    console.log('✅ Schema initialized!');
}

async function insertSeedData(pool) {
    const bcrypt = require('bcrypt');

    // Check and insert admin user
    const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users');
    if (parseInt(adminCheck.rows[0].count) === 0) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await pool.query(
            'INSERT INTO admin_users (username, password_hash, is_super_admin) VALUES ($1, $2, $3)',
            ['Gaurav', hashedPassword, true]
        );
        console.log('✅ Admin user created (username: Gaurav, password: admin123)');
        console.log('⚠️  IMPORTANT: Change password immediately with: npm run change-master-password');
    }

    // Check and insert super admin Google user
    const userCheck = await pool.query("SELECT COUNT(*) FROM users WHERE email = 'jaigaurav56789@gmail.com'");
    if (parseInt(userCheck.rows[0].count) === 0) {
        await pool.query(
            `INSERT INTO users (email, name, role, account_status, allowed_tabs) 
             VALUES ($1, $2, $3, $4, $5)`,
            ['jaigaurav56789@gmail.com', 'Gaurav (Super Admin)', 'admin', 'active', ['all']]
        );
        console.log('✅ Super admin user created (jaigaurav56789@gmail.com)');
    }

    // Check and insert default rates
    const ratesCheck = await pool.query('SELECT COUNT(*) FROM rates');
    if (parseInt(ratesCheck.rows[0].count) === 0) {
        await pool.query('INSERT INTO rates (gold, silver, platinum) VALUES (7500, 156, 3500)');
        console.log('✅ Default rates inserted (Gold: ₹7500, Silver: ₹156, Platinum: ₹3500)');
    }

    // Check and insert dummy customer
    const customerCheck = await pool.query('SELECT COUNT(*) FROM customers');
    if (parseInt(customerCheck.rows[0].count) === 0) {
        await pool.query(
            `INSERT INTO customers (name, mobile, address1, city, state, pincode) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['Walk-in Customer', '9999999999', '123 Main Street', 'Mumbai', 'Maharashtra', '400001']
        );
        console.log('✅ Dummy customer created (Walk-in Customer)');
    }

    // Check and insert dummy product
    const productCheck = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(productCheck.rows[0].count) === 0) {
        await pool.query(
            `INSERT INTO products (barcode, sku, style_code, short_name, item_name, metal_type, size, weight, purity, rate, mc_rate, mc_type, pcs, floor, avg_wt) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            ['SAMPLE001', 'GR-001', 'RING-001', 'Gold Ring', 'Gold Ring 22K', 'gold', '16', 5.500, 91.6, 7500, 250, 'MC/GM', 1, 'Main Floor', 5.500]
        );
        await pool.query(
            `INSERT INTO products (barcode, sku, style_code, short_name, item_name, metal_type, size, weight, purity, rate, mc_rate, mc_type, pcs, floor, avg_wt) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            ['SAMPLE002', 'SC-001', 'CHAIN-001', 'Silver Chain', 'Silver Chain 925', 'silver', '20 inch', 25.000, 92.5, 156, 15, 'MC/GM', 1, 'Main Floor', 25.000]
        );
        console.log('✅ Dummy products created (Gold Ring, Silver Chain)');
    }

    // Check and insert tally config
    const tallyCheck = await pool.query('SELECT COUNT(*) FROM tally_config');
    if (parseInt(tallyCheck.rows[0].count) === 0) {
        await pool.query(
            `INSERT INTO tally_config (tally_url, company_name, enabled, sync_mode, auto_sync_enabled) 
             VALUES ($1, $2, $3, $4, $5)`,
            ['http://localhost:9000', 'Default Company', false, 'manual', false]
        );
        console.log('✅ Default Tally config inserted');
    }
}

setup();

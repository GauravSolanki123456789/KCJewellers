// Database Configuration for Single-Tenant Architecture
// Each client gets their own VPS with one database
require('dotenv').config();
const { Pool } = require('pg');

// Single database connection using DATABASE_URL or individual env vars
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
    port: process.env.DATABASE_URL ? undefined : (process.env.DB_PORT || 5432),
    database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME || 'jewelry_db'),
    user: process.env.DATABASE_URL ? undefined : (process.env.DB_USER || 'postgres'),
    password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'postgres'),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize database with retry logic
async function initDatabase(retries = 3, delay = 2000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Test connection first
            await pool.query('SELECT 1');
            
            // Create users table for admin management
            await pool.query(`
                CREATE TABLE IF NOT EXISTS admin_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    is_super_admin BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            const bcrypt = require('bcrypt');
            
            // Check if default super admin exists
            const adminCheck = await pool.query('SELECT * FROM admin_users WHERE username = $1', ['Gaurav']);
            if (adminCheck.rows.length === 0) {
                // Create default super admin with temporary password
                const tempPassword = await bcrypt.hash('CHANGE_ME_' + Date.now(), 10);
                await pool.query(
                    'INSERT INTO admin_users (username, password_hash, is_super_admin) VALUES ($1, $2, $3)',
                    ['Gaurav', tempPassword, true]
                );
                console.log('⚠️ Default admin user created. Run "npm run change-master-password" to set secure password.');
            }
            
            console.log('✅ Database connected');
            
            // Initialize full application schema
            await initSchema();
            console.log('✅ Database schema initialized');

            return true;
        } catch (error) {
            if (attempt === retries) {
                console.error('❌ Database initialization failed after', retries, 'attempts:', error.message);
                console.error('💡 Check your DATABASE_URL or DB_* environment variables');
                return false;
            }
            console.warn(`⚠️ Database connection attempt ${attempt}/${retries} failed. Retrying in ${delay/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}

// Initialize database schema
async function initSchema() {
    const queries = [
        // Products table
        `CREATE TABLE IF NOT EXISTS products (
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
            status VARCHAR(50) DEFAULT 'available',
            sold_bill_no VARCHAR(50),
            sold_customer_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Customers table
        `CREATE TABLE IF NOT EXISTS customers (
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
        )`,
        
        // Quotations table
        `CREATE TABLE IF NOT EXISTS quotations (
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
            is_deleted BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Bills table
        `CREATE TABLE IF NOT EXISTS bills (
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
        )`,
        
        // Rates table
        `CREATE TABLE IF NOT EXISTS rates (
            id SERIAL PRIMARY KEY,
            gold DECIMAL(10,2) DEFAULT 7500,
            silver DECIMAL(10,2) DEFAULT 156,
            platinum DECIMAL(10,2) DEFAULT 3500,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Users table (Google OAuth / Local Auth)
        `CREATE TABLE IF NOT EXISTS users (
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
        )`,
        
        // Ledger transactions
        `CREATE TABLE IF NOT EXISTS ledger_transactions (
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
        )`,
        
        // Purchase vouchers
        `CREATE TABLE IF NOT EXISTS purchase_vouchers (
            id SERIAL PRIMARY KEY,
            pv_no VARCHAR(50) UNIQUE NOT NULL,
            supplier_name VARCHAR(255),
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            items JSONB,
            total DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // ROL data
        `CREATE TABLE IF NOT EXISTS rol_data (
            id SERIAL PRIMARY KEY,
            barcode VARCHAR(100) UNIQUE REFERENCES products(barcode),
            rol INTEGER DEFAULT 0,
            available INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Tally sync configuration
        `CREATE TABLE IF NOT EXISTS tally_config (
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
        )`,
        
        // Sales Returns table
        `CREATE TABLE IF NOT EXISTS sales_returns (
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
        )`,
        
        // Tally sync log
        `CREATE TABLE IF NOT EXISTS tally_sync_log (
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
        )`,
        
        // Styles table (Product Hierarchy)
        `CREATE TABLE IF NOT EXISTS styles (
            id SERIAL PRIMARY KEY,
            style_code VARCHAR(100) NOT NULL,
            sku_code VARCHAR(100) NOT NULL,
            item_name VARCHAR(255),
            category VARCHAR(100),
            metal_type VARCHAR(50),
            purity VARCHAR(50),
            mc_type VARCHAR(50),
            mc_value NUMERIC(10,2),
            hsn_code VARCHAR(50),
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(style_code, sku_code)
        )`,
        
        // Create indexes
        `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
        `CREATE INDEX IF NOT EXISTS idx_products_style_code ON products(style_code)`,
        `CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile)`,
        `CREATE INDEX IF NOT EXISTS idx_quotations_date ON quotations(date)`,
        `CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date)`,
        `CREATE INDEX IF NOT EXISTS idx_tally_sync_log_transaction ON tally_sync_log(transaction_type, transaction_id)`,
        `CREATE INDEX IF NOT EXISTS idx_tally_sync_log_status ON tally_sync_log(sync_status)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_returns_bill_no ON sales_returns(bill_no)`,
        `CREATE INDEX IF NOT EXISTS idx_sales_returns_ssr_no ON sales_returns(ssr_no)`,
        `CREATE INDEX IF NOT EXISTS idx_quotations_is_billed ON quotations(is_billed)`,
        `CREATE INDEX IF NOT EXISTS idx_styles_style_code ON styles(style_code)`,
        `CREATE INDEX IF NOT EXISTS idx_styles_sku_code ON styles(sku_code)`,
        
        `CREATE TABLE IF NOT EXISTS booking_locks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            metal_type VARCHAR(50) NOT NULL,
            quantity_kg NUMERIC(10,3) DEFAULT 0,
            lock_rate NUMERIC(12,2) NOT NULL,
            total_amount NUMERIC(12,2) NOT NULL,
            status VARCHAR(20) DEFAULT 'LOCKED',
            razorpay_order_id VARCHAR(100),
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_booking_razorpay ON booking_locks(razorpay_order_id)`,
        `CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_locks(status)`,
        
        `DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'quotation_seq'
            ) THEN
                CREATE SEQUENCE quotation_seq START 1000;
            END IF;
        END $$;`,
        
        `CREATE TABLE IF NOT EXISTS bullion_inventory (
            id SERIAL PRIMARY KEY,
            metal_type VARCHAR(50) UNIQUE NOT NULL,
            available_kg NUMERIC(12,3) DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS sip_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            amount NUMERIC(12,2) NOT NULL,
            frequency VARCHAR(20) NOT NULL, -- DAILY or MONTHLY
            razorpay_subscription_id VARCHAR(100),
            status VARCHAR(20) DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_sip_subs_razorpay ON sip_subscriptions(razorpay_subscription_id)`,
        
        `DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'wallet_gold_balance'
            ) THEN
                ALTER TABLE users ADD COLUMN wallet_gold_balance NUMERIC(12,6) DEFAULT 0;
            END IF;
        END $$;`,
        
        `CREATE TABLE IF NOT EXISTS sip_payout_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            grams NUMERIC(12,6) NOT NULL,
            amount NUMERIC(12,2) NOT NULL,
            status VARCHAR(30) DEFAULT 'PENDING_ADMIN_APPROVAL',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS gold_lot_movements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            direction VARCHAR(10) NOT NULL,
            grams NUMERIC(12,6) NOT NULL,
            reference VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_gold_lot_movements_user ON gold_lot_movements(user_id)`
    ];
    
    for (const query of queries) {
        await pool.query(query);
    }
    
    // Add status, sold_bill_no, sold_customer_name, and is_deleted columns migration (if not exists)
    try {
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='products' AND column_name='status') THEN
                    ALTER TABLE products ADD COLUMN status VARCHAR(50) DEFAULT 'available';
                    UPDATE products SET status = 'available' WHERE status IS NULL;
                    UPDATE products SET status = 'sold' WHERE is_sold = true;
                END IF;
            END $$;
        `);
        
        // Add sold_bill_no and sold_customer_name columns if not exists
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='products' AND column_name='sold_bill_no') THEN
                    ALTER TABLE products ADD COLUMN sold_bill_no VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='products' AND column_name='sold_customer_name') THEN
                    ALTER TABLE products ADD COLUMN sold_customer_name VARCHAR(255);
                END IF;
            END $$;
        `);
        
        // Add is_deleted column if not exists
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='products' AND column_name='is_deleted') THEN
                    ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE products SET is_deleted = false WHERE is_deleted IS NULL;
                END IF;
            END $$;
        `);
    } catch (error) {
        console.warn('Migration warning (may be expected):', error.message);
    }
    
    // Nested Categories and Jewelry Attributes (idempotent)
    try {
        // Create categories table if missing
        await pool.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(120) NOT NULL,
                slug VARCHAR(160) UNIQUE NOT NULL,
                parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);`);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug_lower ON categories(LOWER(slug));`);
        
        // Add category_id and jewelry columns to products safely
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='category_id') THEN
                    ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='gross_weight') THEN
                    ALTER TABLE products ADD COLUMN gross_weight NUMERIC(12,3);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='net_weight') THEN
                    ALTER TABLE products ADD COLUMN net_weight NUMERIC(12,3);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='making_charges') THEN
                    ALTER TABLE products ADD COLUMN making_charges NUMERIC(12,2);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='making_charges_type') THEN
                    ALTER TABLE products ADD COLUMN making_charges_type VARCHAR(20);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='gst_percentage') THEN
                    ALTER TABLE products ADD COLUMN gst_percentage NUMERIC(5,2);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_redeemable') THEN
                    ALTER TABLE products ADD COLUMN is_redeemable BOOLEAN DEFAULT false;
                    UPDATE products SET is_redeemable = false WHERE is_redeemable IS NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='redeem_grams') THEN
                    ALTER TABLE products ADD COLUMN redeem_grams NUMERIC(12,3);
                END IF;
            END $$;
        `);
        
        // Create wallet and SIP tables if not present
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_gold_wallet (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                balance_grams NUMERIC(14,6) NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sip_plans (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type VARCHAR(20) NOT NULL,
                min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                duration_months INTEGER NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sip_plans_name ON sip_plans(name);`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sip_transactions (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                plan_id INTEGER REFERENCES sip_plans(id) ON DELETE SET NULL,
                amount NUMERIC(12,2) NOT NULL,
                gold_rate_at_time NUMERIC(12,2),
                gold_credited NUMERIC(12,4),
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sip_tx_user ON sip_transactions(user_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sip_tx_plan ON sip_transactions(plan_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sip_tx_status ON sip_transactions(status);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_sip_tx_date ON sip_transactions(transaction_date);`);
    } catch (error) {
        console.warn('Migration warning (categories/sip):', error.message);
    }
    
    // Insert default rates if not exists
    const ratesCheck = await pool.query('SELECT COUNT(*) FROM rates');
    if (parseInt(ratesCheck.rows[0].count) === 0) {
        await pool.query('INSERT INTO rates (gold, silver, platinum) VALUES (7500, 156, 3500)');
    }
    
    // Insert default Tally config if not exists
    const tallyConfigCheck = await pool.query('SELECT COUNT(*) FROM tally_config');
    if (parseInt(tallyConfigCheck.rows[0].count) === 0) {
        await pool.query(`INSERT INTO tally_config (tally_url, company_name, enabled, sync_mode, auto_sync_enabled) 
            VALUES ('http://localhost:9000', 'Default Company', false, 'manual', false)`);
    }
}

// Query helper function
async function query(text, params = []) {
    try {
        const result = await pool.query(text, params);
        return result.rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// For backward compatibility with existing code that uses queryTenant
async function queryTenant(tenantCode, text, params = []) {
    // Ignore tenantCode in single-tenant mode
    return query(text, params);
}

// Get pool (for transactions)
function getPool() {
    return pool;
}

// Alias for backward compatibility
const masterPool = pool;
function getTenantPool() {
    return pool;
}

module.exports = {
    pool,
    masterPool,
    getPool,
    getTenantPool,
    initDatabase,
    initSchema,
    query,
    queryTenant,
    // Alias for backward compatibility
    initMasterDatabase: initDatabase
};

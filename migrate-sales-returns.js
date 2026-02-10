// Migration script to add sales_returns table to existing tenant databases
require('dotenv').config();
const { Pool } = require('pg');

const masterPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jewelry_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function migrateSalesReturnsTable() {
    try {
        // Get all tenants
        const tenantsResult = await masterPool.query('SELECT tenant_code, database_name FROM tenants WHERE is_active = true');
        const tenants = tenantsResult.rows;
        
        console.log(`Found ${tenants.length} active tenant(s)`);
        
        for (const tenant of tenants) {
            const tenantCode = tenant.tenant_code;
            const dbName = tenant.database_name;
            
            console.log(`\nMigrating tenant: ${tenantCode} (${dbName})...`);
            
            // Connect to tenant database
            const tenantPool = new Pool({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: dbName,
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
            });
            
            try {
                // Check if table already exists
                const tableCheck = await tenantPool.query(`
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'sales_returns'
                    )
                `);
                
                if (tableCheck.rows[0].exists) {
                    console.log(`  ✓ sales_returns table already exists for ${tenantCode}`);
                    await tenantPool.end();
                    continue;
                }
                
                // Create the sales_returns table
                await tenantPool.query(`
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
                    )
                `);
                
                // Create indexes
                await tenantPool.query(`
                    CREATE INDEX IF NOT EXISTS idx_sales_returns_bill_no ON sales_returns(bill_no)
                `);
                
                await tenantPool.query(`
                    CREATE INDEX IF NOT EXISTS idx_sales_returns_ssr_no ON sales_returns(ssr_no)
                `);
                
                console.log(`  ✅ sales_returns table created successfully for ${tenantCode}`);
                
                await tenantPool.end();
            } catch (error) {
                console.error(`  ❌ Error migrating ${tenantCode}:`, error.message);
                await tenantPool.end();
            }
        }
        
        console.log('\n✅ Migration completed!');
        await masterPool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await masterPool.end();
        process.exit(1);
    }
}

// Run migration
migrateSalesReturnsTable();


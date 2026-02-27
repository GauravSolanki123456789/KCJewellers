#!/usr/bin/env node
/**
 * Run Quantity Migration (007)
 * This script runs only the quantity/status migration
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runQuantityMigration() {
    console.log('');
    console.log('================================================');
    console.log('🚀 Running Quantity/Status Migration (007)');
    console.log('================================================');

    const client = await pool.connect();
    
    try {
        const migrationFile = path.join(__dirname, '..', 'migrations', '007_add_quantity_to_web_products.sql');
        
        if (!fs.existsSync(migrationFile)) {
            console.error(`❌ Migration file not found: ${migrationFile}`);
            process.exit(1);
        }

        const sql = fs.readFileSync(migrationFile, 'utf8');

        console.log('▶️  Running migration...');
        
        await client.query('BEGIN');
        
        try {
            await client.query(sql);
            await client.query('COMMIT');
            
            console.log('✅ Migration completed successfully!');
            console.log('');
            console.log('Added columns to web_products:');
            console.log('  - quantity (Integer, Default 1)');
            console.log('  - status (String, Default "active")');
            console.log('');
            console.log('Added indexes:');
            console.log('  - idx_web_products_status');
            console.log('  - idx_web_products_quantity');
            console.log('');

        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Migration failed: ${error.message}`);
            throw error;
        }

    } catch (error) {
        console.error('');
        console.error('❌ MIGRATION FAILED:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runQuantityMigration();

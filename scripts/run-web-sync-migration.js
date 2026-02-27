#!/usr/bin/env node
/**
 * Run Web Sync Tables Migration (006)
 * This script runs only the web sync migration
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runWebSyncMigration() {
    console.log('');
    console.log('================================================');
    console.log('🚀 Running Web Sync Tables Migration (006)');
    console.log('================================================');

    const client = await pool.connect();
    
    try {
        const migrationFile = path.join(__dirname, '..', 'migrations', '006_web_sync_tables.sql');
        
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
            console.log('Created tables:');
            console.log('  - web_categories');
            console.log('  - web_subcategories');
            console.log('  - web_products');
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

runWebSyncMigration();

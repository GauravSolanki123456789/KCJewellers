// Database Synchronization Script
// Syncs data between multiple servers
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SYNC_MODE = process.env.SYNC_MODE || 'manual'; // 'manual' or 'api'

// Source server configuration (server to sync FROM)
const SOURCE_CONFIG = {
    host: process.env.SOURCE_DB_HOST || 'localhost',
    port: parseInt(process.env.SOURCE_DB_PORT) || 5432,
    user: process.env.SOURCE_DB_USER || 'postgres',
    password: process.env.SOURCE_DB_PASSWORD || '',
    database: process.env.SOURCE_DB_NAME || 'jewelry_master'
};

// Destination server configuration (server to sync TO)
const DEST_CONFIG = {
    host: process.env.DEST_DB_HOST || 'localhost',
    port: parseInt(process.env.DEST_DB_PORT) || 5432,
    user: process.env.DEST_DB_USER || 'postgres',
    password: process.env.DEST_DB_PASSWORD || '',
    database: process.env.DEST_DB_NAME || 'jewelry_master'
};

const TENANT_CODE = process.env.TENANT_CODE || 'jpjewellery';

async function syncDatabase() {
    console.log('🔄 Starting database synchronization...\n');
    console.log(`Source: ${SOURCE_CONFIG.host}:${SOURCE_CONFIG.port}/${SOURCE_CONFIG.database}`);
    console.log(`Destination: ${DEST_CONFIG.host}:${DEST_CONFIG.port}/${DEST_CONFIG.database}`);
    console.log(`Tenant: ${TENANT_CODE}\n`);

    const sourcePool = new Pool(SOURCE_CONFIG);
    const destPool = new Pool(DEST_CONFIG);

    try {
        // Test connections
        await sourcePool.query('SELECT NOW()');
        console.log('✅ Connected to source server');
        
        await destPool.query('SELECT NOW()');
        console.log('✅ Connected to destination server\n');

        // Get list of tenant databases
        const tenantDb = `jewelry_${TENANT_CODE}`;
        
        // Check if tenant database exists on both servers
        const sourceTenantPool = new Pool({
            ...SOURCE_CONFIG,
            database: tenantDb
        });
        
        const destTenantPool = new Pool({
            ...DEST_CONFIG,
            database: tenantDb
        });

        try {
            await sourceTenantPool.query('SELECT 1');
            console.log(`✅ Source tenant database exists: ${tenantDb}`);
        } catch (e) {
            console.error(`❌ Source tenant database not found: ${tenantDb}`);
            process.exit(1);
        }

        try {
            await destTenantPool.query('SELECT 1');
            console.log(`✅ Destination tenant database exists: ${tenantDb}\n`);
        } catch (e) {
            console.error(`❌ Destination tenant database not found: ${tenantDb}`);
            console.log('Creating destination tenant database...');
            // Create database if doesn't exist
            const postgresPool = new Pool({
                ...DEST_CONFIG,
                database: 'postgres'
            });
            await postgresPool.query(`CREATE DATABASE ${tenantDb}`);
            await postgresPool.end();
            console.log(`✅ Created destination tenant database: ${tenantDb}\n`);
        }

        // Sync tables
        const tables = [
            'products',
            'customers',
            'quotations',
            'bills',
            'rates',
            'ledger_transactions',
            'purchase_vouchers',
            'rol_data',
            'users',
            'tally_config',
            'tally_sync_log'
        ];

        for (const table of tables) {
            console.log(`📦 Syncing table: ${table}...`);
            await syncTable(sourceTenantPool, destTenantPool, table);
        }

        console.log('\n✅ Database synchronization complete!');
        
        sourcePool.end();
        destPool.end();
        sourceTenantPool.end();
        destTenantPool.end();
        
    } catch (error) {
        console.error('❌ Sync error:', error);
        process.exit(1);
    }
}

async function syncTable(sourcePool, destPool, tableName) {
    try {
        // Get all data from source
        const sourceData = await sourcePool.query(`SELECT * FROM ${tableName}`);
        
        if (sourceData.rows.length === 0) {
            console.log(`   ⚠️  No data in source table: ${tableName}`);
            return;
        }

        // Get existing data from destination
        const destData = await destPool.query(`SELECT * FROM ${tableName}`);
        const destIds = new Set(destData.rows.map(r => r.id));

        let inserted = 0;
        let updated = 0;
        let skipped = 0;

        for (const row of sourceData.rows) {
            const { id, ...data } = row;
            
            if (destIds.has(id)) {
                // Update existing record
                const columns = Object.keys(data);
                const values = Object.values(data);
                const setClause = columns.map((col, idx) => `${col} = $${idx + 1}`).join(', ');
                const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1}`;
                await destPool.query(query, [...values, id]);
                updated++;
            } else {
                // Insert new record
                const columns = Object.keys(row);
                const values = Object.values(row);
                const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
                const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
                await destPool.query(query, values);
                inserted++;
            }
        }

        console.log(`   ✅ ${tableName}: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
    } catch (error) {
        if (error.message.includes('does not exist')) {
            console.log(`   ⚠️  Table ${tableName} does not exist, skipping...`);
        } else {
            console.error(`   ❌ Error syncing ${tableName}:`, error.message);
        }
    }
}

// Run sync
if (require.main === module) {
    syncDatabase().catch(console.error);
}

module.exports = { syncDatabase };


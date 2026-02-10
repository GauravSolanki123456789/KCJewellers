// Database Restore Script
// Restores database from backup file
require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jewelry_master'
};

const TENANT_CODE = process.env.TENANT_CODE || 'jpjewellery';

async function restoreDatabase(backupFile) {
    if (!backupFile) {
        console.error('❌ Please provide backup file path');
        console.log('Usage: node scripts/restore-database.js <backup-file.sql>');
        process.exit(1);
    }

    if (!fs.existsSync(backupFile)) {
        console.error(`❌ Backup file not found: ${backupFile}`);
        process.exit(1);
    }

    console.log('📥 Restoring database from backup...\n');
    console.log(`Backup file: ${backupFile}`);
    console.log(`Target: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}\n`);

    try {
        // Determine which database to restore
        const isTenantBackup = backupFile.includes(`jewelry_${TENANT_CODE}`);
        const targetDb = isTenantBackup ? `jewelry_${TENANT_CODE}` : DB_CONFIG.database;

        console.log(`Restoring to: ${targetDb}...`);

        // Check if database exists
        const postgresPool = require('pg').Pool;
        const checkPool = new postgresPool({
            ...DB_CONFIG,
            database: 'postgres'
        });

        const dbCheck = await checkPool.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            [targetDb]
        );

        if (dbCheck.rows.length === 0) {
            console.log(`Creating database: ${targetDb}...`);
            await checkPool.query(`CREATE DATABASE ${targetDb}`);
        }
        await checkPool.end();

        // Restore database
        const restoreCmd = `psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${targetDb} < "${backupFile}"`;
        process.env.PGPASSWORD = DB_CONFIG.password;
        
        console.log('Restoring... (this may take a few minutes)');
        await execPromise(restoreCmd);
        
        console.log(`\n✅ Database restored successfully: ${targetDb}`);

    } catch (error) {
        console.error('❌ Restore error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    const backupFile = process.argv[2];
    restoreDatabase(backupFile).catch(console.error);
}

module.exports = { restoreDatabase };


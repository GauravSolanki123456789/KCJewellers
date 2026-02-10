// Database Backup Script
// Creates a backup of the database for manual sync
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
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

async function backupDatabase() {
    console.log('💾 Creating database backup...\n');

    // Create backup directory
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupFile = path.join(BACKUP_DIR, `jewelry_master_${timestamp}.sql`);
    const tenantBackupFile = path.join(BACKUP_DIR, `jewelry_${TENANT_CODE}_${timestamp}.sql`);

    try {
        // Backup master database
        console.log('📦 Backing up master database...');
        const masterCmd = `pg_dump -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${DB_CONFIG.database} -F p > "${backupFile}"`;
        process.env.PGPASSWORD = DB_CONFIG.password;
        await execPromise(masterCmd);
        console.log(`✅ Master database backed up: ${backupFile}`);

        // Backup tenant database
        console.log(`📦 Backing up tenant database: jewelry_${TENANT_CODE}...`);
        const tenantCmd = `pg_dump -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d jewelry_${TENANT_CODE} -F p > "${tenantBackupFile}"`;
        await execPromise(tenantCmd);
        console.log(`✅ Tenant database backed up: ${tenantBackupFile}`);

        console.log('\n✅ Backup complete!');
        console.log(`\nBackup files:`);
        console.log(`  - ${backupFile}`);
        console.log(`  - ${tenantBackupFile}`);
        console.log(`\nTo restore, use:`);
        console.log(`  psql -h DEST_HOST -U postgres -d jewelry_master < "${backupFile}"`);
        console.log(`  psql -h DEST_HOST -U postgres -d jewelry_${TENANT_CODE} < "${tenantBackupFile}"`);

    } catch (error) {
        console.error('❌ Backup error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    backupDatabase().catch(console.error);
}

module.exports = { backupDatabase };


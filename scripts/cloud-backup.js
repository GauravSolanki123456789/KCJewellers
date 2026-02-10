// Cloud Database Backup Script
// Automatically backs up database and uploads to cloud storage
require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const https = require('https');
const http = require('http');

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
const CLOUD_STORAGE = process.env.CLOUD_STORAGE || 'local'; // 'local', 's3', 'spaces', 'dropbox'

// Create backup directory
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupDatabase() {
    console.log('💾 Starting cloud database backup...\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const backupFile = path.join(BACKUP_DIR, `jewelry_master_${timestamp}_${time}.sql`);
    const tenantBackupFile = path.join(BACKUP_DIR, `jewelry_${TENANT_CODE}_${timestamp}_${time}.sql`);

    try {
        // Backup master database
        console.log('📦 Backing up master database...');
        const masterCmd = `PGPASSWORD="${DB_CONFIG.password}" pg_dump -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${DB_CONFIG.database} -F p > "${backupFile}"`;
        await execPromise(masterCmd);
        console.log(`✅ Master database backed up: ${backupFile}`);

        // Backup tenant database
        console.log(`📦 Backing up tenant database: jewelry_${TENANT_CODE}...`);
        const tenantCmd = `PGPASSWORD="${DB_CONFIG.password}" pg_dump -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d jewelry_${TENANT_CODE} -F p > "${tenantBackupFile}"`;
        await execPromise(tenantCmd);
        console.log(`✅ Tenant database backed up: ${tenantBackupFile}`);

        // Upload to cloud storage
        if (CLOUD_STORAGE !== 'local') {
            console.log(`☁️ Uploading to cloud storage: ${CLOUD_STORAGE}...`);
            await uploadToCloud(backupFile, tenantBackupFile);
        }

        // Clean old backups (keep last 7 days)
        await cleanOldBackups();

        console.log('\n✅ Backup complete!');
        console.log(`\nBackup files:`);
        console.log(`  - ${backupFile}`);
        console.log(`  - ${tenantBackupFile}`);

    } catch (error) {
        console.error('❌ Backup error:', error.message);
        process.exit(1);
    }
}

async function uploadToCloud(masterFile, tenantFile) {
    switch (CLOUD_STORAGE) {
        case 's3':
            await uploadToS3(masterFile, tenantFile);
            break;
        case 'spaces':
            await uploadToSpaces(masterFile, tenantFile);
            break;
        case 'dropbox':
            await uploadToDropbox(masterFile, tenantFile);
            break;
        default:
            console.log('⚠️ Cloud storage not configured, keeping local backups only');
    }
}

async function uploadToS3(masterFile, tenantFile) {
    // AWS S3 upload using AWS CLI
    const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
    const AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
    const S3_BUCKET = process.env.S3_BUCKET_NAME;
    const S3_REGION = process.env.S3_REGION || 'us-east-1';

    if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY || !S3_BUCKET) {
        console.log('⚠️ AWS S3 credentials not configured');
        return;
    }

    try {
        const masterFileName = path.basename(masterFile);
        const tenantFileName = path.basename(tenantFile);

        // Upload master backup
        const masterCmd = `aws s3 cp "${masterFile}" s3://${S3_BUCKET}/backups/${masterFileName} --region ${S3_REGION}`;
        await execPromise(masterCmd);
        console.log(`✅ Uploaded to S3: ${masterFileName}`);

        // Upload tenant backup
        const tenantCmd = `aws s3 cp "${tenantFile}" s3://${S3_BUCKET}/backups/${tenantFileName} --region ${S3_REGION}`;
        await execPromise(tenantCmd);
        console.log(`✅ Uploaded to S3: ${tenantFileName}`);

    } catch (error) {
        console.error('❌ S3 upload error:', error.message);
    }
}

async function uploadToSpaces(masterFile, tenantFile) {
    // DigitalOcean Spaces upload using s3cmd or AWS CLI
    const SPACES_KEY = process.env.SPACES_ACCESS_KEY;
    const SPACES_SECRET = process.env.SPACES_SECRET_KEY;
    const SPACES_BUCKET = process.env.SPACES_BUCKET_NAME;
    const SPACES_REGION = process.env.SPACES_REGION || 'nyc3';
    const SPACES_ENDPOINT = `https://${SPACES_REGION}.digitaloceanspaces.com`;

    if (!SPACES_KEY || !SPACES_SECRET || !SPACES_BUCKET) {
        console.log('⚠️ DigitalOcean Spaces credentials not configured');
        return;
    }

    try {
        const masterFileName = path.basename(masterFile);
        const tenantFileName = path.basename(tenantFile);

        // Upload using AWS CLI with Spaces endpoint
        const masterCmd = `AWS_ACCESS_KEY_ID="${SPACES_KEY}" AWS_SECRET_ACCESS_KEY="${SPACES_SECRET}" aws s3 cp "${masterFile}" s3://${SPACES_BUCKET}/backups/${masterFileName} --endpoint-url ${SPACES_ENDPOINT}`;
        await execPromise(masterCmd);
        console.log(`✅ Uploaded to Spaces: ${masterFileName}`);

        const tenantCmd = `AWS_ACCESS_KEY_ID="${SPACES_KEY}" AWS_SECRET_ACCESS_KEY="${SPACES_SECRET}" aws s3 cp "${tenantFile}" s3://${SPACES_BUCKET}/backups/${tenantFileName} --endpoint-url ${SPACES_ENDPOINT}`;
        await execPromise(tenantCmd);
        console.log(`✅ Uploaded to Spaces: ${tenantFileName}`);

    } catch (error) {
        console.error('❌ Spaces upload error:', error.message);
    }
}

async function uploadToDropbox(masterFile, tenantFile) {
    // Dropbox upload using Dropbox API
    const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

    if (!DROPBOX_TOKEN) {
        console.log('⚠️ Dropbox token not configured');
        return;
    }

    // Note: This requires dropbox npm package
    // npm install dropbox
    try {
        const dropbox = require('dropbox');
        const dbx = new dropbox.Dropbox({ accessToken: DROPBOX_TOKEN });

        const masterFileName = path.basename(masterFile);
        const tenantFileName = path.basename(tenantFile);

        // Read files
        const masterData = fs.readFileSync(masterFile);
        const tenantData = fs.readFileSync(tenantFile);

        // Upload master
        await dbx.filesUpload({
            path: `/backups/${masterFileName}`,
            contents: masterData
        });
        console.log(`✅ Uploaded to Dropbox: ${masterFileName}`);

        // Upload tenant
        await dbx.filesUpload({
            path: `/backups/${tenantFileName}`,
            contents: tenantData
        });
        console.log(`✅ Uploaded to Dropbox: ${tenantFileName}`);

    } catch (error) {
        console.error('❌ Dropbox upload error:', error.message);
    }
}

async function cleanOldBackups() {
    const KEEP_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '7');
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const maxAge = KEEP_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds

    let deletedCount = 0;

    for (const file of files) {
        if (file.endsWith('.sql')) {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtimeMs;

            if (age > maxAge) {
                fs.unlinkSync(filePath);
                deletedCount++;
                console.log(`🗑️ Deleted old backup: ${file}`);
            }
        }
    }

    if (deletedCount > 0) {
        console.log(`\n🧹 Cleaned up ${deletedCount} old backup(s) (older than ${KEEP_DAYS} days)`);
    }
}

// Run backup
if (require.main === module) {
    backupDatabase().catch(console.error);
}

module.exports = { backupDatabase };


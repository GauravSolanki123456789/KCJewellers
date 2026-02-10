// Script to change master admin password securely
require('dotenv').config();
const bcrypt = require('bcrypt');
const readline = require('readline');
const { Pool } = require('pg');

const masterPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jewelry_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function changeMasterPassword() {
    try {
        console.log('\n🔐 Change Master Admin Password\n');
        console.log('⚠️  IMPORTANT: Choose a strong, unique password that:');
        console.log('   - Is at least 16 characters long');
        console.log('   - Contains uppercase, lowercase, numbers, and special characters');
        console.log('   - Has NOT been used anywhere else');
        console.log('   - Is NOT found in any data breach database\n');
        
        const username = await question('Enter master admin username [Gaurav]: ');
        const finalUsername = username.trim() || 'Gaurav';
        
        // Check if user exists
        const checkResult = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            [finalUsername]
        );
        
        if (checkResult.rows.length === 0) {
            console.error(`❌ User "${finalUsername}" not found in master_admins table.`);
            process.exit(1);
        }
        
        // Get current password for verification
        const currentPassword = await question('Enter current password: ');
        
        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, checkResult.rows[0].password_hash);
        if (!isValid) {
            console.error('❌ Current password is incorrect!');
            process.exit(1);
        }
        
        // Get new password
        const newPassword = await question('Enter new password: ');
        if (newPassword.length < 12) {
            console.error('❌ Password must be at least 12 characters long!');
            process.exit(1);
        }
        
        const confirmPassword = await question('Confirm new password: ');
        if (newPassword !== confirmPassword) {
            console.error('❌ Passwords do not match!');
            process.exit(1);
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await masterPool.query(
            'UPDATE master_admins SET password_hash = $1 WHERE username = $2',
            [hashedPassword, finalUsername]
        );
        
        console.log('\n✅ Password updated successfully!');
        console.log(`✅ User "${finalUsername}" can now login with the new password.`);
        console.log('\n⚠️  Remember to:');
        console.log('   1. Store this password securely (password manager)');
        console.log('   2. Never share it with anyone');
        console.log('   3. Use it only for this application\n');
        
        // Verify the new password works
        const verifyResult = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            [finalUsername]
        );
        
        if (verifyResult.rows.length > 0) {
            const isValidNew = await bcrypt.compare(newPassword, verifyResult.rows[0].password_hash);
            if (isValidNew) {
                console.log('✅ Password verification successful!');
            } else {
                console.error('❌ Password verification failed!');
            }
        }
        
        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error changing password:', error);
        rl.close();
        process.exit(1);
    }
}

changeMasterPassword();


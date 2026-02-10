// Script to fix Gaurav's password in master_admins table
require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const masterPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jewelry_master',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function fixGauravPassword() {
    try {
        const gauravPassword = '@GauravSolanki56789__';
        const hashedPassword = await bcrypt.hash(gauravPassword, 10);
        
        // Check if Gaurav exists
        const checkResult = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            ['Gaurav']
        );
        
        if (checkResult.rows.length > 0) {
            // Update existing password
            await masterPool.query(
                'UPDATE master_admins SET password_hash = $1, is_super_admin = $2 WHERE username = $3',
                [hashedPassword, true, 'Gaurav']
            );
            console.log('✅ Gaurav password updated successfully!');
        } else {
            // Create new master admin
            await masterPool.query(
                'INSERT INTO master_admins (username, password_hash, is_super_admin) VALUES ($1, $2, $3)',
                ['Gaurav', hashedPassword, true]
            );
            console.log('✅ Gaurav master admin created successfully!');
        }
        
        // Verify the password works
        const verifyResult = await masterPool.query(
            'SELECT * FROM master_admins WHERE username = $1',
            ['Gaurav']
        );
        
        if (verifyResult.rows.length > 0) {
            const isValid = await bcrypt.compare(gauravPassword, verifyResult.rows[0].password_hash);
            if (isValid) {
                console.log('✅ Password verification successful!');
            } else {
                console.error('❌ Password verification failed!');
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing Gaurav password:', error);
        process.exit(1);
    }
}

fixGauravPassword();


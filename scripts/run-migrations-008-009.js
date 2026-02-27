#!/usr/bin/env node
/**
 * Run only migrations 008 and 009 (fresh start, users, bookings)
 * Use when 001-007 were applied via other means
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const TO_RUN = ['008_fresh_start.sql', '009_users_bookings.sql'];

async function run() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS _migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const { rows } = await client.query('SELECT filename FROM _migrations');
        const executed = new Set(rows.map(r => r.filename));

        for (const filename of TO_RUN) {
            if (executed.has(filename)) {
                console.log(`⏭️  Skip: ${filename} (already executed)`);
                continue;
            }
            const filePath = path.join(MIGRATIONS_DIR, filename);
            const sql = fs.readFileSync(filePath, 'utf8');
            console.log(`▶️  Running: ${filename}`);
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
                await client.query('COMMIT');
                console.log(`✅ Done: ${filename}`);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`❌ Failed: ${err.message}`);
                throw err;
            }
        }
        console.log('\n✅ Migrations 008 & 009 complete.');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

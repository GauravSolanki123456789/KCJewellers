#!/usr/bin/env node
/**
 * One-time ops recovery: reset Jainav unlock sequence for a reseller (DB only, no HTTP API).
 * Usage: node scripts/reset-reseller-jainav-sequence.js --email nikhilsinghvi21354@gmail.com
 *        node scripts/reset-reseller-jainav-sequence.js --user-id 338
 * Requires DATABASE_URL in .env (same as production app).
 */
require('dotenv').config();
const { Pool } = require('pg');
const {
    DEFAULT_SHADOW_SEQUENCE,
    normalizeShadowSecretSequence,
    validateShadowSecretSequence,
} = require('../services/erpShadowSequence');

function arg(name) {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
    const email = arg('--email');
    const userId = arg('--user-id');
    const newSeq = normalizeShadowSecretSequence(arg('--sequence') || DEFAULT_SHADOW_SEQUENCE);
    const err = validateShadowSecretSequence(newSeq);
    if (err) {
        console.error(`Invalid --sequence: ${err}`);
        process.exit(1);
    }
    if (!email && !userId) {
        console.error('Provide --email or --user-id');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    try {
        let uid = userId ? Number(userId) : null;
        if (!uid) {
            const u = await pool.query(`SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`, [
                email.trim(),
            ]);
            if (!u.rows.length) {
                console.error('User not found');
                process.exit(1);
            }
            uid = u.rows[0].id;
            console.log(`Reseller user id ${uid} (${u.rows[0].email})`);
        }

        const rows = await pool.query(
            `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
            [uid],
        );
        let settings = rows[0]?.settings ?? {};
        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
            } catch {
                settings = {};
            }
        }
        if (!settings.shadow || typeof settings.shadow !== 'object') settings.shadow = {};
        settings.shadow.secretSequence = newSeq;

        await pool.query(
            `INSERT INTO reseller_erp_settings (reseller_user_id, settings, updated_at)
             VALUES ($1, $2::jsonb, NOW())
             ON CONFLICT (reseller_user_id) DO UPDATE SET settings = $2::jsonb, updated_at = NOW()`,
            [uid, JSON.stringify(settings)],
        );

        console.log('Jainav unlock sequence reset. Tell the shop admin to use the new sequence + Enter on ERP (not in a text field).');
        console.log('Do not share the sequence over chat; set a new one inside Jainav mode after unlock.');
    } finally {
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

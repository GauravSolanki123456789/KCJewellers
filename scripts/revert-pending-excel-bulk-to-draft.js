#!/usr/bin/env node
/**
 * One-time helper: preview or apply revert of legacy pending Excel bulk uploads → draft.
 *
 * Usage:
 *   node scripts/revert-pending-excel-bulk-to-draft.js           # dry-run (default)
 *   node scripts/revert-pending-excel-bulk-to-draft.js --apply   # run UPDATE
 *
 * Same logic as migrations/043_revert_pending_excel_bulk_to_draft.sql
 */

require('dotenv').config();
const { Pool } = require('pg');

const apply = process.argv.includes('--apply');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const PREVIEW_SQL = `
    SELECT rps.id,
           rps.batch_id,
           rps.batch_label,
           rps.barcode,
           rps.product_name,
           rps.style_code,
           rps.sku,
           rps.submission_status,
           rps.image_url IS NOT NULL AND TRIM(rps.image_url) <> '' AS has_primary_image,
           u.business_name AS submitter
    FROM reseller_product_submissions rps
    LEFT JOIN users u ON u.id = rps.submitted_by_user_id
    WHERE rps.submission_status = 'pending'
      AND rps.batch_id IS NOT NULL
    ORDER BY rps.batch_id, rps.id
`;

const UPDATE_SQL = `
    UPDATE reseller_product_submissions
    SET
        submission_status = 'draft',
        batch_submitted_at = NULL,
        updated_at = CURRENT_TIMESTAMP,
        batch_label = COALESCE(
            NULLIF(TRIM(batch_label), ''),
            'Excel import (legacy — add photos)'
        )
    WHERE submission_status = 'pending'
      AND batch_id IS NOT NULL
    RETURNING id, batch_id, barcode, product_name
`;

async function main() {
    const client = await pool.connect();
    try {
        const preview = await client.query(PREVIEW_SQL);
        const rows = preview.rows;

        console.log('');
        console.log('================================================');
        console.log(apply ? '▶️  APPLY: pending Excel bulk → draft' : '🔍 DRY-RUN: pending Excel bulk → draft');
        console.log('================================================');
        console.log(`Found ${rows.length} row(s) to revert.\n`);

        if (!rows.length) {
            console.log('Nothing to do — no pending submissions with batch_id.');
            return;
        }

        const byBatch = new Map();
        for (const r of rows) {
            const key = String(r.batch_id);
            if (!byBatch.has(key)) byBatch.set(key, []);
            byBatch.get(key).push(r);
        }

        for (const [batchId, batchRows] of byBatch) {
            console.log(`Batch ${batchId} (${batchRows.length} products)`);
            console.log(`  Label: ${batchRows[0].batch_label || '(none)'}`);
            console.log(`  Reseller: ${batchRows[0].submitter || '—'}`);
            for (const r of batchRows.slice(0, 8)) {
                const img = r.has_primary_image ? 'has photo' : 'no photo';
                console.log(`    · [${r.id}] ${r.product_name || r.barcode} — ${img}`);
            }
            if (batchRows.length > 8) console.log(`    … and ${batchRows.length - 8} more`);
            console.log('');
        }

        if (!apply) {
            console.log('Dry-run only. To apply: node scripts/revert-pending-excel-bulk-to-draft.js --apply');
            console.log('Or run: npm run migrate (migration 043)\n');
            return;
        }

        await client.query('BEGIN');
        const result = await client.query(UPDATE_SQL);
        await client.query('COMMIT');
        console.log(`✅ Updated ${result.rowCount} row(s) to draft.\n`);
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch (_) {}
        console.error('❌ Failed:', e.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();

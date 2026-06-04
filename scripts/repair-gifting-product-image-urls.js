/**
 * Fix gifting rows whose image_url used a shared design_group stem (e.g. mecca.webp)
 * while catalog sku is unique (e.g. lstand-mecca-4.5x3.5). Run once on production after deploy.
 *
 *   node scripts/repair-gifting-product-image-urls.js
 *   node scripts/repair-gifting-product-image-urls.js --dry-run
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { slugPart } = require('../services/productVariantIdentity');
const {
    productImageFileExists,
    defaultProductImageUrl,
    imageUrlBasename,
} = require('../services/productImagePaths');
const { isLegacySharedDesignGroupImageUrl } = require('../services/upsertWebProductFromSyncItem');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'web_products');
const dryRun = process.argv.includes('--dry-run');

function apiBaseFromEnv() {
    const base =
        process.env.PUBLIC_API_BASE_URL ||
        process.env.API_PUBLIC_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:3000';
    return String(base).replace(/\/$/, '');
}

/** @returns {string|undefined|'clear'} */
function resolveFixedPrimaryUrl(row, apiBase) {
    const sku = String(row.sku || row.web_product_sku || '').trim();
    const dg = String(row.design_group || '').trim();
    const current = String(row.image_url || '').trim();
    if (!sku || !dg || !current) return undefined;
    if (!isLegacySharedDesignGroupImageUrl(current, dg, sku)) return undefined;

    if (productImageFileExists(uploadsDir, sku)) {
        return defaultProductImageUrl(apiBase, sku);
    }
    return 'clear';
}

function resolveFixedSecondaryUrl(row, apiBase) {
    const sku = String(row.sku || '').trim();
    const dg = String(row.design_group || '').trim();
    const current = String(row.secondary_image_url || '').trim();
    if (!sku || !dg || !current) return undefined;
    const base = imageUrlBasename(current).replace(/_secondary\.(webp|jpe?g|png)$/i, '');
    const dgStem = slugPart(dg);
    const skuStem = slugPart(sku);
    if (!dgStem || dgStem === skuStem || base !== dgStem) return undefined;

    const secPath = path.join(uploadsDir, `${sku}_secondary.webp`);
    if (fs.existsSync(secPath)) {
        return `${apiBase}/uploads/web_products/${sku}_secondary.webp`;
    }
    return null;
}

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const apiBase = apiBaseFromEnv();
    const client = await pool.connect();
    let fixed = 0;
    let cleared = 0;

    try {
        const { rows } = await client.query(`
            SELECT id, sku, design_group, image_url, secondary_image_url
            FROM web_products
            WHERE LOWER(COALESCE(metal_type, '')) LIKE 'gifting%'
              AND TRIM(COALESCE(design_group, '')) <> ''
              AND (image_url IS NOT NULL OR secondary_image_url IS NOT NULL)
        `);

        for (const row of rows) {
            const nextPrimary = resolveFixedPrimaryUrl(row, apiBase);
            const nextSecondary = resolveFixedSecondaryUrl(row, apiBase);
            if (nextPrimary === undefined && nextSecondary === undefined) continue;

            if (dryRun) {
                console.log(
                    `[dry-run] sku=${row.sku} primary=${nextPrimary === undefined ? '—' : nextPrimary} secondary=${nextSecondary === undefined ? '—' : nextSecondary || 'clear'}`,
                );
            } else {
                if (nextPrimary === 'clear') {
                    await client.query(
                        'UPDATE web_products SET image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                        [row.id],
                    );
                    cleared++;
                } else if (typeof nextPrimary === 'string') {
                    await client.query('UPDATE web_products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                        nextPrimary,
                        row.id,
                    ]);
                    fixed++;
                }
                if (nextSecondary !== undefined) {
                    await client.query(
                        'UPDATE web_products SET secondary_image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [nextSecondary, row.id],
                    );
                }
            }
        }

        const subResult = await client.query(`
            SELECT id, web_product_sku, design_group, image_url, secondary_image_url
            FROM reseller_product_submissions
            WHERE TRIM(COALESCE(web_product_sku, '')) <> ''
              AND TRIM(COALESCE(design_group, '')) <> ''
              AND image_url IS NOT NULL AND TRIM(image_url) <> ''
        `);
        for (const row of subResult.rows) {
            const next = resolveFixedPrimaryUrl(row, apiBase);
            if (next === undefined) continue;
            if (dryRun) {
                console.log(`[dry-run] submission id=${row.id} primary=${next}`);
            } else if (next === 'clear') {
                await client.query(
                    'UPDATE reseller_product_submissions SET image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                    [row.id],
                );
                cleared++;
            } else {
                await client.query(
                    'UPDATE reseller_product_submissions SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [next, row.id],
                );
                fixed++;
            }
        }

        console.log(
            dryRun
                ? `Dry run complete (${rows.length} web_products scanned).`
                : `Done. ${fixed} image_url(s) pointed at sku files; ${cleared} legacy shared-stem URL(s) cleared.`,
        );
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

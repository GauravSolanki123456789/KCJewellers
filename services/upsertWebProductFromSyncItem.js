/**
 * Shared web_products upsert — same field mapping as POST /api/sync/receive (server.js).
 * Used by ERP sync, reseller submission approval, and admin edits.
 */

function styleSlugFromCode(styleCode) {
    const s = String(styleCode || 'Uncategorized').trim();
    return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'uncategorized';
}

function skuSlugFromStyleAndSku(styleSlug, skuCode) {
    const sku = String(skuCode || 'N/A').trim();
    return `${styleSlug}-${sku.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'na'}`;
}

function normalizeSyncItem(item) {
    const prodSku = String(item.barcode || item.sku || item.Barcode || item.SKU || '').trim();
    return {
        styleCode: String(item.styleCode || item.style_code || item.StyleCode || 'Uncategorized').trim(),
        skuCode: String(item.sku || item.SKU || item.barcode || item.Barcode || 'N/A').trim(),
        prodSku,
        name: String(
            item.name || item.product_name || item.ProductName || item.item_name || item.short_name || prodSku,
        ).trim(),
        netWeight:
            item.netWeight != null
                ? Number(item.netWeight)
                : item.net_weight != null
                  ? Number(item.net_weight)
                  : item.AvgWeight != null
                    ? Number(item.AvgWeight)
                    : null,
        grossWeight:
            item.grossWeight != null
                ? Number(item.grossWeight)
                : item.gross_weight != null
                  ? Number(item.gross_weight)
                  : null,
        purity: item.purity || item.Purity ? String(item.purity || item.Purity) : null,
        mcRate:
            item.mcRate != null
                ? Number(item.mcRate)
                : item.mc_rate != null
                  ? Number(item.mc_rate)
                  : item.MCRate != null
                    ? Number(item.MCRate)
                    : null,
        metalType: String(item.metalType || item.metal_type || item.MetalType || 'silver')
            .toLowerCase()
            .trim(),
        fixedPrice:
            item.fixedPrice != null
                ? Number(item.fixedPrice)
                : item.fixed_price != null
                  ? Number(item.fixed_price)
                  : item.FixedPrice != null
                    ? Number(item.FixedPrice)
                    : null,
        stoneCharges:
            item.stoneCharges != null
                ? Number(item.stoneCharges)
                : item.stone_charges != null
                  ? Number(item.stone_charges)
                  : item.StoneCharges != null
                    ? Number(item.StoneCharges)
                    : 0,
        designGroup:
            item.itemCode != null
                ? String(item.itemCode).trim() || null
                : item.ItemCode != null
                  ? String(item.ItemCode).trim() || null
                  : null,
        barcode: String(item.barcode || item.Barcode || '').trim() || null,
        size:
            item.size != null
                ? String(item.size).trim() || null
                : item.Size != null
                  ? String(item.Size).trim() || null
                  : null,
        rawPrimary:
            item.imageUrl != null
                ? String(item.imageUrl)
                : item.image_url != null
                  ? String(item.image_url)
                  : item.ImageUrl != null
                    ? String(item.ImageUrl)
                    : '',
        rawSecondary:
            item.secondaryImageUrl != null
                ? String(item.secondaryImageUrl)
                : item.secondary_image_url != null
                  ? String(item.secondary_image_url)
                  : item.ImageUrlSecondary != null
                    ? String(item.ImageUrlSecondary)
                    : '',
        hasSecFalse: item.hasSecondaryImage === false || item.has_secondary_image === false,
        hasSecTrue: item.hasSecondaryImage === true || item.has_secondary_image === true,
    };
}

/**
 * @param {object} deps
 * @param {Function} deps.query
 * @param {object} deps.pool
 * @param {Function} deps.getPublicApiBaseUrl
 * @param {Function} deps.lookUpSecondaryDisk
 * @param {Function} deps.resolveSecondaryUrlFromPayload
 * @param {object} item - ERP / reseller payload row
 * @param {object} [opts]
 * @param {Map} [opts.catIdCache]
 * @param {Map} [opts.subIdCache]
 * @param {object} [opts.secondaryUploadMap]
 * @param {number|null} [opts.submittedByUserId]
 * @param {number|null} [opts.resellerSubmissionId]
 * @param {boolean} [opts.publishCategory] - set web_categories.is_published = true
 */
async function upsertWebProductFromSyncItem(deps, item, opts = {}) {
    const { query, pool, getPublicApiBaseUrl, lookUpSecondaryDisk, resolveSecondaryUrlFromPayload } = deps;
    const catIdCache = opts.catIdCache || new Map();
    const subIdCache = opts.subIdCache || new Map();
    const secondaryUploadMap = opts.secondaryUploadMap || Object.create(null);
    const submittedByUserId = opts.submittedByUserId ?? null;
    const resellerSubmissionId = opts.resellerSubmissionId ?? null;
    const publishCategory = !!opts.publishCategory;

    const norm = normalizeSyncItem(item);
    if (!norm.prodSku) {
        throw new Error('missing barcode/sku');
    }

    const styleSlug = styleSlugFromCode(norm.styleCode);
    if (!catIdCache.has(styleSlug)) {
        await query(
            `
            INSERT INTO web_categories (name, slug, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO UPDATE SET name = $1, updated_at = CURRENT_TIMESTAMP
        `,
            [norm.styleCode, styleSlug],
        );
        if (publishCategory) {
            await query(
                `UPDATE web_categories SET is_published = true, updated_at = CURRENT_TIMESTAMP WHERE slug = $1`,
                [styleSlug],
            );
        }
        const catRows = await query('SELECT id FROM web_categories WHERE slug = $1', [styleSlug]);
        catIdCache.set(styleSlug, catRows[0]?.id);
    } else if (publishCategory) {
        await query(
            `UPDATE web_categories SET is_published = true, updated_at = CURRENT_TIMESTAMP WHERE slug = $1`,
            [styleSlug],
        );
    }

    const catId = catIdCache.get(styleSlug);
    if (!catId) throw new Error(`could not resolve category for style "${norm.styleCode}"`);

    const skuSlug = skuSlugFromStyleAndSku(styleSlug, norm.skuCode);
    const skuCacheKey = `${styleSlug}::${skuSlug}`;
    if (!subIdCache.has(skuCacheKey)) {
        await query(
            `
            INSERT INTO web_subcategories (category_id, name, slug, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO UPDATE SET name = $2, category_id = $1, updated_at = CURRENT_TIMESTAMP
        `,
            [catId, norm.skuCode, skuSlug],
        );
        const subRows = await query('SELECT id FROM web_subcategories WHERE slug = $1', [skuSlug]);
        subIdCache.set(skuCacheKey, subRows[0]?.id);
    }

    const subId = subIdCache.get(skuCacheKey);
    if (!subId) throw new Error(`could not resolve subcategory for SKU "${norm.skuCode}"`);

    const apiBase = getPublicApiBaseUrl();
    let imageUrl;
    if (norm.rawPrimary.trim() !== '') {
        imageUrl = resolveSecondaryUrlFromPayload(norm.rawPrimary.trim(), apiBase);
    } else {
        imageUrl = `${apiBase}/uploads/web_products/${norm.prodSku}.webp`;
    }

    const uploadedSecondaryDisk = lookUpSecondaryDisk(secondaryUploadMap, norm.prodSku);
    let secondaryTouch = false;
    let secondaryVal = null;
    if (norm.hasSecFalse) {
        secondaryTouch = true;
        secondaryVal = null;
    } else if (uploadedSecondaryDisk) {
        secondaryTouch = true;
        secondaryVal = `${apiBase}/uploads/web_products/${uploadedSecondaryDisk}`;
    } else if (norm.rawSecondary.trim() !== '') {
        secondaryTouch = true;
        secondaryVal = resolveSecondaryUrlFromPayload(norm.rawSecondary.trim(), apiBase);
    } else if (norm.hasSecTrue) {
        const fileStemCompact = norm.prodSku.trim().toLowerCase().replace(/\s+/g, '');
        secondaryTouch = true;
        secondaryVal = `${apiBase}/uploads/web_products/${fileStemCompact}_secondary.webp`;
    }

    const upsertSql = `
        INSERT INTO web_products
            (subcategory_id, sku, barcode, name, size, gross_weight, net_weight, purity, mc_rate, metal_type,
             fixed_price, stone_charges, design_group, image_url, secondary_image_url,
             submitted_by_user_id, reseller_submission_id, is_active, last_synced_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                CASE WHEN $15::boolean THEN $16::text ELSE NULL END,
                $17, $18, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (sku) DO UPDATE SET
            subcategory_id  = EXCLUDED.subcategory_id,
            barcode         = COALESCE(EXCLUDED.barcode, web_products.barcode),
            name            = EXCLUDED.name,
            size            = COALESCE(NULLIF(TRIM(EXCLUDED.size), ''), web_products.size),
            gross_weight    = EXCLUDED.gross_weight,
            net_weight      = EXCLUDED.net_weight,
            purity          = EXCLUDED.purity,
            mc_rate         = COALESCE(EXCLUDED.mc_rate, web_products.mc_rate),
            metal_type      = COALESCE(EXCLUDED.metal_type, web_products.metal_type),
            fixed_price     = COALESCE(EXCLUDED.fixed_price, web_products.fixed_price),
            stone_charges   = COALESCE(EXCLUDED.stone_charges, web_products.stone_charges),
            design_group    = EXCLUDED.design_group,
            image_url       = COALESCE(EXCLUDED.image_url, web_products.image_url),
            secondary_image_url = CASE WHEN $15::boolean THEN EXCLUDED.secondary_image_url ELSE web_products.secondary_image_url END,
            submitted_by_user_id = COALESCE(EXCLUDED.submitted_by_user_id, web_products.submitted_by_user_id),
            reseller_submission_id = COALESCE(EXCLUDED.reseller_submission_id, web_products.reseller_submission_id),
            is_active       = true,
            last_synced_at  = CURRENT_TIMESTAMP,
            updated_at      = CURRENT_TIMESTAMP
    `;
    const upsertParams = [
        subId,
        norm.prodSku,
        norm.barcode,
        norm.name,
        norm.size,
        norm.grossWeight,
        norm.netWeight,
        norm.purity,
        norm.mcRate,
        norm.metalType,
        norm.fixedPrice ?? 0,
        norm.stoneCharges ?? 0,
        norm.designGroup,
        imageUrl,
        secondaryTouch,
        secondaryVal,
        submittedByUserId,
        resellerSubmissionId,
    ];

    try {
        await query(upsertSql, upsertParams);
    } catch (upsertErr) {
        const msg = upsertErr.message || '';
        if (
            msg.includes('submitted_by_user_id') ||
            msg.includes('reseller_submission_id') ||
            msg.includes('"size"')
        ) {
            if (msg.includes('submitted_by_user_id') || msg.includes('reseller_submission_id')) {
                await pool.query(
                    'ALTER TABLE web_products ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
                );
                await pool.query(
                    'ALTER TABLE web_products ADD COLUMN IF NOT EXISTS reseller_submission_id INTEGER',
                );
            }
            if (msg.includes('"size"')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS size VARCHAR(64)');
            }
            await query(upsertSql, upsertParams);
        } else {
            throw upsertErr;
        }
    }

    return { prodSku: norm.prodSku, styleCode: norm.styleCode, catId };
}

module.exports = {
    upsertWebProductFromSyncItem,
    normalizeSyncItem,
    styleSlugFromCode,
};

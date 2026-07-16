/**
 * Shared web_products upsert — same field mapping as POST /api/sync/receive (server.js).
 * Used by ERP sync, reseller submission approval, and admin edits.
 */

const { resolveVariantIdentity, slugPart } = require('./productVariantIdentity');
const {
    productImageFileExists,
    productMediaFileExists,
    defaultProductImageUrl,
    defaultSecondaryImageUrl,
    defaultBoxImageUrl,
    defaultVideoUrl,
    imageUrlBasename,
} = require('./productImagePaths');
const { defaultMcTypeWhenRatePresent, parseMcRateAndType } = require('./mcTypeUtils');

function styleSlugFromCode(styleCode) {
    const s = String(styleCode || 'Uncategorized').trim();
    return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'uncategorized';
}

function skuSlugFromStyleAndSku(styleSlug, skuCode) {
    const sku = String(skuCode || 'N/A').trim();
    return `${styleSlug}-${sku.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'na'}`;
}

function trimField(value) {
    if (value == null) return '';
    return String(value).trim();
}

/** Excel / ERP wastage column — percentage added to net weight for billable metal weight. */
function parseWastagePercent(item) {
    if (!item || typeof item !== 'object') return null;
    const raw =
        item.wastage ??
        item.Wastage ??
        item['Wastage(%)'] ??
        item.wastage_pct ??
        item.wastagePct ??
        item.wastage_percent;
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).replace(/%/g, '').trim());
    return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Gross (billable) weight from explicit gross or net + wastage %. */
function resolveGrossWeight(netWeight, grossWeight, wastagePct) {
    const gross =
        grossWeight != null && Number.isFinite(Number(grossWeight)) && Number(grossWeight) > 0
            ? Number(grossWeight)
            : null;
    if (gross != null) return gross;
    const net =
        netWeight != null && Number.isFinite(Number(netWeight)) && Number(netWeight) > 0
            ? Number(netWeight)
            : null;
    if (net == null || wastagePct == null || wastagePct <= 0) return null;
    return net * (1 + wastagePct / 100);
}

function normalizeSyncItem(item) {
    const prodSku = trimField(item.barcode || item.sku || item.Barcode || item.SKU);
    return {
        styleCode: trimField(item.styleCode || item.style_code || item.StyleCode) || 'Uncategorized',
        skuCode: trimField(item.sku || item.SKU || item.barcode || item.Barcode) || 'N/A',
        prodSku,
        name:
            trimField(
                item.name || item.product_name || item.ProductName || item.item_name || item.short_name || prodSku,
            ) || prodSku,
        netWeight:
            item.netWeight != null
                ? Number(item.netWeight)
                : item.net_weight != null
                  ? Number(item.net_weight)
                  : item.AvgWeight != null
                    ? Number(item.AvgWeight)
                    : null,
        wastagePct: parseWastagePercent(item),
        grossWeight: resolveGrossWeight(
            item.netWeight != null
                ? Number(item.netWeight)
                : item.net_weight != null
                  ? Number(item.net_weight)
                  : item.AvgWeight != null
                    ? Number(item.AvgWeight)
                    : null,
            item.grossWeight != null
                ? Number(item.grossWeight)
                : item.gross_weight != null
                  ? Number(item.gross_weight)
                  : null,
            parseWastagePercent(item),
        ),
        purity: item.purity || item.Purity ? String(item.purity || item.Purity) : null,
        ...(() => {
            const rawMc =
                item.mcRate != null
                    ? item.mcRate
                    : item.mc_rate != null
                      ? item.mc_rate
                      : item.MCRate != null
                        ? item.MCRate
                        : null;
            const parsedMc = parseMcRateAndType(rawMc);
            const mcRateNum =
                parsedMc.mcRate != null
                    ? parsedMc.mcRate
                    : rawMc != null && Number.isFinite(Number(rawMc))
                      ? Number(rawMc)
                      : null;
            const mcTypeHint =
                item.mcType ??
                item.mc_type ??
                item.MCType ??
                parsedMc.mcType ??
                null;
            const metalType = String(item.metalType || item.metal_type || item.MetalType || 'silver')
                .toLowerCase()
                .trim();
            return {
                mcRate: mcRateNum,
                mcType: defaultMcTypeWhenRatePresent(mcRateNum, mcTypeHint, metalType),
                metalType,
            };
        })(),
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
        boxCharges:
            item.boxCharges != null
                ? Number(item.boxCharges)
                : item.box_charges != null
                  ? Number(item.box_charges)
                  : item.BoxCharges != null
                    ? Number(item.BoxCharges)
                    : 0,
        designGroup:
            trimField(item.itemCode ?? item.ItemCode ?? item.item_code) || null,
        barcode: trimField(item.barcode || item.Barcode) || null,
        size: trimField(item.size ?? item.Size) || null,
        weightDisplay:
            trimField(item.weightDisplay ?? item.weight_display ?? item.weightDisplayLabel) || null,
        chainWeight:
            item.chainWeight != null
                ? Number(item.chainWeight)
                : item.chain_weight != null
                  ? Number(item.chain_weight)
                  : item.ChainWtOnly != null
                    ? Number(item.ChainWtOnly)
                    : null,
        pendantWeight:
            item.pendantWeight != null
                ? Number(item.pendantWeight)
                : item.pendant_weight != null
                  ? Number(item.pendant_weight)
                  : item.PendantWtOnly != null
                    ? Number(item.PendantWtOnly)
                    : null,
        earringWeight:
            item.earringWeight != null
                ? Number(item.earringWeight)
                : item.earring_weight != null
                  ? Number(item.earring_weight)
                  : item.EarringWtOnly != null
                    ? Number(item.EarringWtOnly)
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
        rawBoxImage:
            item.boxImageUrl != null
                ? String(item.boxImageUrl)
                : item.box_image_url != null
                  ? String(item.box_image_url)
                  : '',
        rawVideo:
            item.videoUrl != null
                ? String(item.videoUrl)
                : item.video_url != null
                  ? String(item.video_url)
                  : '',
    };
}

/**
 * @param {object} deps
 * @param {Function} deps.query
 * @param {object} deps.pool
 * @param {Function} deps.getPublicApiBaseUrl
 * @param {Function} deps.lookUpSecondaryDisk
 * @param {Function} deps.resolveSecondaryUrlFromPayload
 * @param {string} [deps.uploadsWebProductsDir] - disk check before assigning default image_url
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
    const { query, pool, getPublicApiBaseUrl, lookUpSecondaryDisk, resolveSecondaryUrlFromPayload, uploadsWebProductsDir } =
        deps;
    const catIdCache = opts.catIdCache || new Map();
    const subIdCache = opts.subIdCache || new Map();
    const secondaryUploadMap = opts.secondaryUploadMap || Object.create(null);
    const submittedByUserId = opts.submittedByUserId ?? null;
    const resellerSubmissionId = opts.resellerSubmissionId ?? null;
    const publishCategory = !!opts.publishCategory;

    const norm = normalizeSyncItem(item);
    const variantId = resolveVariantIdentity(norm);
    norm.prodSku = variantId.prodSku;
    norm.barcode = variantId.barcode;
    norm.name = variantId.displayName || norm.name;
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
    let imageUrl = null;
    let touchPrimaryImage = false;
    if (norm.rawPrimary.trim() !== '') {
        imageUrl = resolveSecondaryUrlFromPayload(norm.rawPrimary.trim(), apiBase);
        touchPrimaryImage = true;
    } else if (uploadsWebProductsDir && productImageFileExists(uploadsWebProductsDir, norm.prodSku)) {
        imageUrl = defaultProductImageUrl(apiBase, norm.prodSku);
        touchPrimaryImage = true;
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
        secondaryTouch = true;
        secondaryVal = defaultSecondaryImageUrl(apiBase, norm.prodSku);
    }

    let boxImageUrl = null;
    let touchBoxImage = false;
    if (norm.rawBoxImage.trim() !== '') {
        boxImageUrl = resolveSecondaryUrlFromPayload(norm.rawBoxImage.trim(), apiBase);
        touchBoxImage = true;
    } else if (uploadsWebProductsDir && productMediaFileExists(uploadsWebProductsDir, norm.prodSku, '_box')) {
        boxImageUrl = defaultBoxImageUrl(apiBase, norm.prodSku);
        touchBoxImage = true;
    }

    let videoUrl = null;
    let touchVideo = false;
    if (norm.rawVideo.trim() !== '') {
        videoUrl = resolveSecondaryUrlFromPayload(norm.rawVideo.trim(), apiBase);
        touchVideo = true;
    } else if (uploadsWebProductsDir && productMediaFileExists(uploadsWebProductsDir, norm.prodSku, '_video')) {
        videoUrl = defaultVideoUrl(apiBase, norm.prodSku);
        touchVideo = true;
    }

    const upsertSql = `
        INSERT INTO web_products
            (subcategory_id, sku, barcode, name, size, gross_weight, net_weight, weight_display,
             wastage_pct, chain_weight, pendant_weight, earring_weight,
             purity, mc_rate, mc_type, metal_type,
             fixed_price, stone_charges, box_charges, design_group, image_url, secondary_image_url,
             box_image_url, video_url,
             submitted_by_user_id, reseller_submission_id, is_active, last_synced_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                CASE WHEN $22::boolean THEN $23::text ELSE NULL END,
                CASE WHEN $24::boolean THEN $25::text ELSE NULL END,
                CASE WHEN $26::boolean THEN $27::text ELSE NULL END,
                $28, $29, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (sku) DO UPDATE SET
            subcategory_id  = EXCLUDED.subcategory_id,
            barcode         = COALESCE(EXCLUDED.barcode, web_products.barcode),
            name            = EXCLUDED.name,
            size            = COALESCE(NULLIF(TRIM(EXCLUDED.size), ''), web_products.size),
            gross_weight    = EXCLUDED.gross_weight,
            net_weight      = EXCLUDED.net_weight,
            weight_display  = COALESCE(NULLIF(TRIM(EXCLUDED.weight_display), ''), web_products.weight_display),
            wastage_pct     = COALESCE(EXCLUDED.wastage_pct, web_products.wastage_pct),
            chain_weight    = COALESCE(EXCLUDED.chain_weight, web_products.chain_weight),
            pendant_weight  = COALESCE(EXCLUDED.pendant_weight, web_products.pendant_weight),
            earring_weight  = COALESCE(EXCLUDED.earring_weight, web_products.earring_weight),
            purity          = EXCLUDED.purity,
            mc_rate         = COALESCE(EXCLUDED.mc_rate, web_products.mc_rate),
            mc_type         = COALESCE(EXCLUDED.mc_type, web_products.mc_type),
            metal_type      = COALESCE(EXCLUDED.metal_type, web_products.metal_type),
            fixed_price     = COALESCE(EXCLUDED.fixed_price, web_products.fixed_price),
            stone_charges   = COALESCE(EXCLUDED.stone_charges, web_products.stone_charges),
            box_charges     = COALESCE(EXCLUDED.box_charges, web_products.box_charges),
            design_group    = EXCLUDED.design_group,
            image_url       = CASE WHEN $30::boolean THEN EXCLUDED.image_url ELSE web_products.image_url END,
            secondary_image_url = CASE WHEN $22::boolean THEN EXCLUDED.secondary_image_url ELSE web_products.secondary_image_url END,
            box_image_url   = CASE WHEN $24::boolean THEN EXCLUDED.box_image_url ELSE web_products.box_image_url END,
            video_url       = CASE WHEN $26::boolean THEN EXCLUDED.video_url ELSE web_products.video_url END,
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
        norm.weightDisplay || null,
        norm.wastagePct,
        Number.isFinite(norm.chainWeight) ? norm.chainWeight : null,
        Number.isFinite(norm.pendantWeight) ? norm.pendantWeight : null,
        Number.isFinite(norm.earringWeight) ? norm.earringWeight : null,
        norm.purity,
        norm.mcRate,
        norm.mcType,
        norm.metalType,
        norm.fixedPrice ?? 0,
        norm.stoneCharges ?? 0,
        norm.boxCharges ?? 0,
        norm.designGroup,
        imageUrl,
        secondaryTouch,
        secondaryVal,
        touchBoxImage,
        boxImageUrl,
        touchVideo,
        videoUrl,
        submittedByUserId,
        resellerSubmissionId,
        touchPrimaryImage,
    ];

    try {
        await query(upsertSql, upsertParams);
    } catch (upsertErr) {
        const msg = upsertErr.message || '';
        if (
            msg.includes('submitted_by_user_id') ||
            msg.includes('reseller_submission_id') ||
            msg.includes('"size"') ||
            msg.includes('box_charges') ||
            msg.includes('box_image_url') ||
            msg.includes('video_url') ||
            msg.includes('weight_display') ||
            msg.includes('mc_type')
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
            if (msg.includes('box_charges')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS box_charges NUMERIC(12,2) DEFAULT 0');
            }
            if (msg.includes('box_image_url')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS box_image_url TEXT');
            }
            if (msg.includes('video_url')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS video_url TEXT');
            }
            if (msg.includes('weight_display')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS weight_display VARCHAR(64)');
            }
            if (msg.includes('mc_type')) {
                await pool.query('ALTER TABLE web_products ADD COLUMN IF NOT EXISTS mc_type VARCHAR(32)');
            }
            await query(upsertSql, upsertParams);
        } else {
            throw upsertErr;
        }
    }

    await deactivateStaleGiftVariantRows(query, norm, subId);

    return { prodSku: norm.prodSku, styleCode: norm.styleCode, catId };
}

/**
 * When the same gift design_group + size is re-published under a new SKU/subcategory,
 * retire older live rows (e.g. Mecca left in GOLD NOTE after re-import to L_STAND).
 */
async function deactivateStaleGiftVariantRows(query, norm, subcategoryId) {
    const dg = trimField(norm.designGroup);
    if (!dg) return;
    const mt = String(norm.metalType || '').toLowerCase();
    if (!mt.startsWith('gifting')) return;
    const sizeKey = trimField(norm.size);
    const prodSku = trimField(norm.prodSku);
    if (!prodSku || subcategoryId == null) return;
    await query(
        `UPDATE web_products
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE subcategory_id = $4
           AND TRIM(COALESCE(design_group, '')) = $1
           AND TRIM(COALESCE(size, '')) = $2
           AND TRIM(COALESCE(sku, '')) <> $3
           AND LOWER(COALESCE(metal_type, '')) LIKE 'gifting%'
           AND (is_active IS NULL OR is_active = true)`,
        [dg, sizeKey, prodSku, subcategoryId],
    );
}

/**
 * True when image_url points at a shared design_group file (e.g. mecca.webp) while sku is unique.
 */
function isLegacySharedDesignGroupImageUrl(imageUrl, designGroup, prodSku) {
    const dgStem = slugPart(designGroup);
    const skuStem = slugPart(prodSku);
    if (!dgStem || !skuStem || dgStem === skuStem) return false;
    const base = imageUrlBasename(imageUrl).replace(/\.(webp|jpe?g|png)$/i, '');
    return base === dgStem;
}

/** Same sku/barcode resolution as catalog upsert — use for uploads, not raw Excel Barcode alone. */
function resolveNormalizedVariant(item) {
    const norm = normalizeSyncItem(item);
    const variantId = resolveVariantIdentity(norm);
    return {
        ...norm,
        prodSku: variantId.prodSku,
        barcode: variantId.barcode,
        imageStem: variantId.imageStem,
        name: variantId.displayName || norm.name,
    };
}

module.exports = {
    upsertWebProductFromSyncItem,
    normalizeSyncItem,
    resolveNormalizedVariant,
    parseWastagePercent,
    resolveGrossWeight,
    styleSlugFromCode,
    resolveVariantIdentity,
    isLegacySharedDesignGroupImageUrl,
};

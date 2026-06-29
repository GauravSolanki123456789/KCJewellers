/**
 * Reseller product upload queue — same ERP/sync fields as POST /api/sync/receive.
 */
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const {
    upsertWebProductFromSyncItem,
    normalizeSyncItem,
    resolveNormalizedVariant,
    parseWastagePercent,
    resolveGrossWeight,
    styleSlugFromCode,
} = require('./upsertWebProductFromSyncItem');
const { defaultMcTypeWhenRatePresent } = require('./mcTypeUtils');

const SUBMISSION_STATUSES = new Set(['draft', 'pending', 'approved', 'rejected', 'withdrawn']);

function submissionRowToSyncItem(row) {
    if (!row) return null;
    const payload = row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {};
    return {
        styleCode: row.style_code || payload.styleCode,
        sku: row.sku || payload.sku,
        barcode: row.barcode || payload.barcode,
        name: row.product_name || payload.name,
        netWeight: row.net_weight ?? payload.netWeight,
        weightDisplay: row.weight_display ?? payload.weightDisplay,
        grossWeight: row.gross_weight ?? payload.grossWeight,
        wastage: payload.wastage ?? payload['Wastage(%)'] ?? payload.wastage_pct ?? row.wastage_pct,
        chainWeight: row.chain_weight ?? payload.chainWeight ?? payload.ChainWtOnly,
        pendantWeight: row.pendant_weight ?? payload.pendantWeight ?? payload.PendantWtOnly,
        earringWeight: row.earring_weight ?? payload.earringWeight ?? payload.EarringWtOnly,
        purity: row.purity ?? payload.purity,
        mcRate: row.mc_rate ?? payload.mcRate,
        mcType: row.mc_type ?? payload.mcType ?? payload.mc_type ?? payload.MCType,
        metalType: row.metal_type ?? payload.metalType,
        fixedPrice: row.fixed_price ?? payload.fixedPrice,
        stoneCharges: row.stone_charges ?? payload.stoneCharges,
        boxCharges: row.box_charges ?? payload.boxCharges,
        itemCode: row.design_group ?? payload.itemCode,
        size: row.size ?? payload.size ?? payload.Size,
        secondaryImageUrl: row.secondary_image_url ?? payload.secondaryImageUrl,
        imageUrl: row.image_url ?? payload.imageUrl,
        boxCharges: row.box_charges ?? payload.boxCharges,
        boxImageUrl: row.box_image_url ?? payload.boxImageUrl,
        videoUrl: row.video_url ?? payload.videoUrl,
        ...payload,
    };
}

function trimExcelCell(value) {
    if (value == null) return undefined;
    const s = String(value).trim();
    return s === '' ? undefined : s;
}

/** Count imported rows per StyleCode — helps multi-style Excel files (e.g. Necklace + Chain Pendant). */
function summarizeImportByStyle(rows, styleKey = 'style_code') {
    const summary = Object.create(null);
    for (const row of rows || []) {
        const style = String(row?.[styleKey] || row?.styleCode || row?.StyleCode || 'Uncategorized').trim() || 'Uncategorized';
        summary[style] = (summary[style] || 0) + 1;
    }
    return summary;
}

function summarizeRawExcelByStyle(rawRows) {
    const summary = Object.create(null);
    for (const raw of rawRows || []) {
        const style = String(raw?.StyleCode || raw?.styleCode || raw?.style_code || 'Uncategorized').trim() || 'Uncategorized';
        summary[style] = (summary[style] || 0) + 1;
    }
    return summary;
}

function excelRowToSyncItem(row) {
    if (!row || typeof row !== 'object') return null;
    const get = (...keys) => {
        for (const k of keys) {
            if (row[k] != null && String(row[k]).trim() !== '') return trimExcelCell(row[k]);
        }
        return undefined;
    };
    return {
        styleCode: get('StyleCode', 'styleCode', 'style_code'),
        sku: get('SKU', 'sku'),
        barcode: get('Barcode', 'barcode'),
        name: get('ProductName', 'product_name', 'name'),
        size: get('Size', 'size', 'Size (inches)', 'Size (inc)', 'Size (in)', 'size_inches', 'SizeInches', 'SIZE'),
        netWeight: get('AvgWeight', 'netWeight', 'net_weight'),
        grossWeight: get('grossWeight', 'gross_weight'),
        wastage: get('Wastage(%)', 'Wastage', 'wastage', 'wastage_pct'),
        purity: get('Purity', 'purity'),
        mcRate: get('MCRate', 'mcRate', 'mc_rate'),
        mcType: get('MCType', 'mc_type'),
        metalType: get('MetalType', 'metal_type', 'metalType'),
        fixedPrice: get('FixedPrice', 'fixedPrice', 'fixed_price'),
        stoneCharges: get('StoneCharges', 'stoneCharges', 'stone_charges'),
        boxCharges: get('BoxCharges', 'boxCharges', 'box_charges'),
        quantity: get('PCS', 'quantity', 'pcs'),
        itemCode: get('ItemCode', 'itemCode', 'item_code'),
        imageUrl: get('ImageUrl', 'imageUrl', 'image_url'),
        attrColor: get('Attr:Color', 'attr_color', 'AttrColor'),
        attrStone: get('Attr:Stone', 'attr_stone', 'AttrStone'),
        chainWeight: get('ChainWtOnly', 'chain_wt_only', 'chain_weight', 'ChainWeight'),
        pendantWeight: get('PendantWtOnly', 'pendant_wt_only', 'pendant_weight', 'PendantWeight'),
        earringWeight: get('EarringWtOnly', 'earring_wt_only', 'earring_weight', 'EarringWeight'),
    };
}

function enrichSubmissionRow(row) {
    if (!row) return row;
    const sync = submissionRowToSyncItem(row);
    const resolved = resolveNormalizedVariant(sync);
    return {
        ...row,
        barcode: resolved.barcode || row.barcode,
        web_product_sku: resolved.prodSku || row.web_product_sku,
        product_name: resolved.name || row.product_name,
    };
}

function parseExcelWeight(val) {
    if (val == null || String(val).trim() === '') return null;
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const m = String(val).trim().match(/^(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
}

/** Keep Excel range text (e.g. "145-155") for storefront display. */
function parseExcelWeightDisplay(val) {
    if (val == null || String(val).trim() === '') return null;
    const s = String(val).trim();
    if (/\d\s*-\s*\d/.test(s)) return s.replace(/\s+/g, '');
    return null;
}

function buildSubmissionFieldsFromItem(item, submittedByUserId, batchId) {
    const resolved = resolveNormalizedVariant(item);
    const payload = { ...item };
    const rawWeight = item.netWeight ?? item.AvgWeight ?? item.net_weight;
    const netWeight =
        resolved.netWeight != null && Number.isFinite(Number(resolved.netWeight))
            ? resolved.netWeight
            : parseExcelWeight(rawWeight);
    const weightDisplay = parseExcelWeightDisplay(rawWeight);
    const wastagePct = parseWastagePercent(item);
    const grossWeight = resolveGrossWeight(
        netWeight,
        resolved.grossWeight != null && Number.isFinite(Number(resolved.grossWeight))
            ? Number(resolved.grossWeight)
            : null,
        wastagePct,
    );
    const mcRateNum =
        resolved.mcRate != null && Number.isFinite(Number(resolved.mcRate)) ? Number(resolved.mcRate) : null;
    const mcTypeRaw =
        item.mcType != null
            ? String(item.mcType)
            : item.MCType != null
              ? String(item.MCType)
              : item.mc_type != null
                ? String(item.mc_type)
                : null;
    const mcType = defaultMcTypeWhenRatePresent(mcRateNum, mcTypeRaw);
    if (wastagePct != null) payload.wastage_pct = wastagePct;
    if (payload.wastage == null && wastagePct != null) payload.wastage = wastagePct;
    const chainWeight = parseExcelWeight(item.chainWeight ?? item.ChainWtOnly ?? item.chain_weight);
    const pendantWeight = parseExcelWeight(item.pendantWeight ?? item.PendantWtOnly ?? item.pendant_weight);
    const earringWeight = parseExcelWeight(item.earringWeight ?? item.EarringWtOnly ?? item.earring_weight);
    return {
        submitted_by_user_id: submittedByUserId,
        batch_id: batchId || null,
        style_code: resolved.styleCode,
        sku: resolved.skuCode,
        barcode: resolved.barcode,
        product_name: resolved.name,
        size: item.size != null ? String(item.size) : item.Size != null ? String(item.Size) : null,
        net_weight: netWeight,
        weight_display: weightDisplay,
        gross_weight: grossWeight,
        wastage_pct: wastagePct,
        chain_weight: chainWeight,
        pendant_weight: pendantWeight,
        earring_weight: earringWeight,
        purity: resolved.purity,
        mc_rate: resolved.mcRate,
        mc_type: mcType,
        metal_type: resolved.metalType,
        fixed_price: resolved.fixedPrice ?? 0,
        stone_charges: resolved.stoneCharges ?? 0,
        box_charges:
            item.boxCharges != null
                ? Number(item.boxCharges)
                : item.BoxCharges != null
                  ? Number(item.BoxCharges)
                  : 0,
        quantity:
            item.quantity != null
                ? parseInt(String(item.quantity), 10) || 1
                : item.PCS != null
                  ? parseInt(String(item.PCS), 10) || 1
                  : 1,
        design_group: resolved.designGroup,
        attr_color:
            item['Attr:Color'] != null
                ? String(item['Attr:Color'])
                : item.attr_color != null
                  ? String(item.attr_color)
                  : null,
        attr_stone:
            item['Attr:Stone'] != null
                ? String(item['Attr:Stone'])
                : item.attr_stone != null
                  ? String(item.attr_stone)
                  : null,
        image_url: item.imageUrl || item.ImageUrl ? String(item.imageUrl || item.ImageUrl) : null,
        secondary_image_url:
            item.secondaryImageUrl || item.secondary_image_url
                ? String(item.secondaryImageUrl || item.secondary_image_url)
                : null,
        box_image_url:
            item.boxImageUrl || item.box_image_url ? String(item.boxImageUrl || item.box_image_url) : null,
        video_url: item.videoUrl || item.video_url ? String(item.videoUrl || item.video_url) : null,
        payload_json: payload,
        web_product_sku: resolved.prodSku || null,
    };
}

async function loadResellerUploadUser(query, userId) {
    const rows = await query(
        `SELECT id, customer_tier, account_status, allowed_category_ids, reseller_product_uploads_enabled, business_name
         FROM users WHERE id = $1`,
        [userId],
    );
    return rows[0] || null;
}

async function assertResellerCanUpload(query, userId) {
    const u = await loadResellerUploadUser(query, userId);
    if (!u) {
        const er = new Error('User not found');
        er.status = 404;
        throw er;
    }
    if (String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
        const er = new Error('RESELLER tier required');
        er.status = 403;
        throw er;
    }
    if (String(u.account_status || '').toLowerCase() === 'suspended') {
        const er = new Error('Account suspended');
        er.status = 403;
        throw er;
    }
    if (!u.reseller_product_uploads_enabled) {
        const er = new Error('Product uploads are not enabled for your account. Contact KC admin.');
        er.status = 403;
        throw er;
    }
    return u;
}

async function resolveCategoryIdForStyle(query, styleCode) {
    const slug = styleSlugFromCode(styleCode);
    const rows = await query('SELECT id FROM web_categories WHERE slug = $1', [slug]);
    return rows[0]?.id ?? null;
}

/** gold / silver / diamond / gifting — used for multi-style Excel (e.g. Necklace + Chain Pendant). */
function normalizeMetalFamily(metalType) {
    const mt = String(metalType || '').trim().toLowerCase();
    if (!mt) return null;
    if (mt.startsWith('gold')) return 'gold';
    if (mt.startsWith('silver')) return 'silver';
    if (mt.startsWith('diamond')) return 'diamond';
    if (mt.startsWith('gift') || mt === 'gifting') return 'gifting';
    return mt;
}

async function resellerAllowedMetalFamilies(query, allowedCategoryIds) {
    if (!allowedCategoryIds?.length) return null;
    const rows = await query(
        `SELECT DISTINCT LOWER(TRIM(COALESCE(wp.metal_type, ''))) AS mt
         FROM web_products wp
         INNER JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         WHERE ws.category_id = ANY($1::int[])
           AND (wp.is_active IS NULL OR wp.is_active = true)`,
        [allowedCategoryIds],
    );
    const families = new Set();
    for (const row of rows) {
        const family = normalizeMetalFamily(row.mt);
        if (family) families.add(family);
    }
    return families;
}

async function assertResellerStyleAllowed(query, userId, styleCode, opts = {}) {
    const u = await loadResellerUploadUser(query, userId);
    const allowed = u?.allowed_category_ids;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return;
    const catId = await resolveCategoryIdForStyle(query, styleCode);
    // New StyleCode rows are allowed in draft; category is created when KC approves.
    if (catId == null) return;
    if (allowed.includes(catId)) return;

    const metalFamily = normalizeMetalFamily(opts.metalType);
    if (metalFamily) {
        const families = await resellerAllowedMetalFamilies(query, allowed);
        if (families?.has(metalFamily)) return;
    }

    const er = new Error(`Style "${styleCode}" is outside your allowed catalogue categories`);
    er.status = 403;
    er.code = 'RESELLER_CATEGORY_DENIED';
    throw er;
}

/** After KC approves a batch, add new StyleCode categories to a restricted reseller allow-list. */
async function expandResellerAllowedCategoriesForBatch(query, submitterUserId, batchId) {
    const u = await loadResellerUploadUser(query, submitterUserId);
    const allowed = u?.allowed_category_ids;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return;
    const styleRows = await query(
        `SELECT DISTINCT TRIM(style_code) AS style_code
         FROM reseller_product_submissions
         WHERE batch_id = $1::uuid AND submission_status = 'approved'`,
        [batchId],
    );
    const toAdd = [];
    for (const row of styleRows) {
        const styleCode = String(row.style_code || '').trim();
        if (!styleCode) continue;
        const catId = await resolveCategoryIdForStyle(query, styleCode);
        if (catId != null && !allowed.includes(catId)) toAdd.push(catId);
    }
    if (!toAdd.length) return;
    const merged = [...new Set([...allowed, ...toAdd])].sort((a, b) => a - b);
    await query(`UPDATE users SET allowed_category_ids = $1 WHERE id = $2`, [merged, submitterUserId]);
}

/** Enforce allowed catalogue scope when a batch is submitted (not during draft Excel import). */
async function assertResellerBatchStylesAllowed(query, userId, batchId) {
    const rows = await query(
        `SELECT TRIM(style_code) AS style_code,
                MAX(TRIM(COALESCE(metal_type, ''))) AS metal_type
         FROM reseller_product_submissions
         WHERE batch_id = $1::uuid AND submitted_by_user_id = $2 AND submission_status = 'draft'
         GROUP BY TRIM(style_code)`,
        [batchId, userId],
    );
    for (const row of rows) {
        const styleCode = String(row.style_code || '').trim();
        if (!styleCode) continue;
        await assertResellerStyleAllowed(query, userId, styleCode, {
            metalType: row.metal_type,
        });
    }
}

async function insertSubmission(query, fields) {
    const cols = Object.keys(fields);
    const vals = Object.values(fields);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await query(
        `INSERT INTO reseller_product_submissions (${cols.join(', ')}, updated_at)
         VALUES (${placeholders}, CURRENT_TIMESTAMP)
         RETURNING *`,
        vals,
    );
    return rows[0];
}

async function approveSubmissionToCatalog(deps, submissionRow, reviewerUserId) {
    const { query, pool, getPublicApiBaseUrl, lookUpSecondaryDisk, resolveSecondaryUrlFromPayload } = deps;
    const syncItem = submissionRowToSyncItem(submissionRow);
    const result = await upsertWebProductFromSyncItem(deps, syncItem, {
        submittedByUserId: submissionRow.submitted_by_user_id,
        resellerSubmissionId: submissionRow.id,
        publishCategory: true,
        secondaryUploadMap: Object.create(null),
    });
    await query(
        `UPDATE reseller_product_submissions SET
            submission_status = 'approved',
            web_product_sku = $2,
            reviewed_at = CURRENT_TIMESTAMP,
            reviewed_by_user_id = $3,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [submissionRow.id, result.prodSku, reviewerUserId],
    );
    return result;
}

function normalizeBulkPhotoStem(stem) {
    let s = String(stem || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/\s+/g, '-');
    return s;
}

function registerBulkPhotoStemKey(map, stem, entry) {
    const s = normalizeBulkPhotoStem(stem);
    if (!s || !entry) return;
    map[s] = entry;
    const compact = s.replace(/-/g, '');
    if (compact && compact !== s) map[compact] = entry;
}

function buildBatchPhotoLookup(rows) {
    const map = Object.create(null);
    for (const row of rows || []) {
        const enriched = enrichSubmissionRow(row);
        const prodSku = String(enriched.web_product_sku || '').trim();
        if (!prodSku) continue;
        const entry = { id: row.id, prodSku };
        registerBulkPhotoStemKey(map, prodSku, entry);
        const barcode = String(enriched.barcode || row.barcode || '').trim();
        if (barcode && barcode.toLowerCase() !== prodSku.toLowerCase()) {
            registerBulkPhotoStemKey(map, barcode, entry);
        }
    }
    return map;
}

function lookUpBatchPhotoEntry(map, stem) {
    const s = normalizeBulkPhotoStem(stem);
    if (!s) return null;
    const compact = s.replace(/-/g, '');
    return map[s] || map[compact] || null;
}

function parseBulkUploadStemFromFilename(filename, photoType) {
    const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
    let stem = normalizeBulkPhotoStem(base);
    if (photoType === 'back') {
        stem = stem.replace(/(_secondary|-secondary|-back|_back)$/, '');
    } else if (photoType === 'box') {
        stem = stem.replace(/(_box|-box)$/, '');
    } else if (photoType === 'front') {
        stem = stem.replace(/(-front|_front)$/, '');
    }
    return stem;
}

function createResellerProductUploadMulter(uploadsDir) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const raw = path.basename(String(file.originalname || '').trim()) || `upload-${Date.now()}.webp`;
                cb(null, raw);
            },
        }),
    }).fields([
        { name: 'primaryImage', maxCount: 1 },
        { name: 'secondaryImage', maxCount: 1 },
        { name: 'boxImage', maxCount: 1 },
        { name: 'productVideo', maxCount: 1 },
        { name: 'images', maxCount: 150 },
        { name: 'secondaryImages', maxCount: 150 },
        { name: 'secondary_images', maxCount: 150 },
        { name: 'boxImages', maxCount: 150 },
        { name: 'productVideos', maxCount: 150 },
    ]);
}

function registerResellerProductRoutes(app, deps) {
    const {
        query,
        pool,
        getPublicApiBaseUrl,
        lookUpSecondaryDisk,
        resolveSecondaryUrlFromPayload,
        indexSyncedWebProductSecondaryUploads,
        isAdminStrict,
        uploadsWebProductsDir,
    } = deps;

    const upsertDeps = {
        query,
        pool,
        getPublicApiBaseUrl,
        lookUpSecondaryDisk,
        resolveSecondaryUrlFromPayload,
        uploadsWebProductsDir,
    };

    const RESELLER_PRODUCT_UPLOAD = createResellerProductUploadMulter(uploadsWebProductsDir);

    async function requireResellerUpload(req, res, next) {
        try {
            if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
            req.resellerUploadUser = await assertResellerCanUpload(query, req.user.id);
            next();
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    }

    // ---- Reseller: list own submissions ----
    app.get('/api/reseller/product-submissions', requireResellerUpload, async (req, res) => {
        try {
            const status = String(req.query.submission_status || '').trim().toLowerCase();
            const batchId = String(req.query.batch_id || '').trim();
            const params = [req.user.id];
            let sql = `
                SELECT rps.*, u.business_name AS submitter_business_name
                FROM reseller_product_submissions rps
                LEFT JOIN users u ON u.id = rps.submitted_by_user_id
                WHERE rps.submitted_by_user_id = $1`;
            if (status && SUBMISSION_STATUSES.has(status)) {
                params.push(status);
                sql += ` AND rps.submission_status = $2`;
            }
            if (batchId) {
                params.push(batchId);
                sql += ` AND rps.batch_id = $${params.length}::uuid`;
            }
            sql += ' ORDER BY rps.created_at DESC LIMIT 500';
            const rows = await query(sql, params);
            res.json(rows.map(enrichSubmissionRow));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Reseller: single submit with optional front/back images ----
    app.post('/api/reseller/product-submissions', RESELLER_PRODUCT_UPLOAD, requireResellerUpload, async (req, res) => {
        try {
            let item;
            if (req.body?.payload) {
                item = JSON.parse(req.body.payload);
            } else if (req.body?.product) {
                item = typeof req.body.product === 'string' ? JSON.parse(req.body.product) : req.body.product;
            } else {
                item = req.body;
            }
            const styleCode = String(item.styleCode || item.style_code || item.StyleCode || '').trim();
            if (!styleCode) return res.status(400).json({ error: 'styleCode (StyleCode) is required' });
            await assertResellerStyleAllowed(query, req.user.id, styleCode);

            const resolved = resolveNormalizedVariant(item);
            if (!resolved.prodSku) return res.status(400).json({ error: 'barcode or sku is required' });

            const files = req.files || {};
            const primary = (files.primaryImage && files.primaryImage[0]) || (files.images && files.images[0]);
            const secondary =
                (files.secondaryImage && files.secondaryImage[0]) ||
                (files.secondaryImages && files.secondaryImages[0]) ||
                (files.secondary_images && files.secondary_images[0]);

            if (primary) {
                const ext = path.extname(primary.filename) || '.webp';
                const target = `${resolved.prodSku}${ext}`;
                if (primary.filename !== target) {
                    fs.renameSync(path.join(uploadsWebProductsDir, primary.filename), path.join(uploadsWebProductsDir, target));
                }
            }
            if (secondary) {
                const ext = path.extname(secondary.filename) || '.webp';
                const target = `${resolved.prodSku}_secondary${ext}`;
                if (secondary.filename !== target) {
                    fs.renameSync(
                        path.join(uploadsWebProductsDir, secondary.filename),
                        path.join(uploadsWebProductsDir, target),
                    );
                }
                item.secondaryImageUrl = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
                item.hasSecondaryImage = true;
            }

            const fields = buildSubmissionFieldsFromItem(item, req.user.id, null);
            fields.submission_status = 'pending';
            const row = await insertSubmission(query, fields);
            res.status(201).json({ success: true, submission: row });
        } catch (e) {
            console.error('reseller product submit:', e);
            res.status(e.status || 500).json({ error: e.message, code: e.code });
        }
    });

    // ---- Reseller: bulk JSON (from Excel parse on client) ----
    app.post('/api/reseller/product-submissions/bulk', requireResellerUpload, async (req, res) => {
        try {
            const products = Array.isArray(req.body?.products) ? req.body.products : [];
            if (!products.length) return res.status(400).json({ error: 'products array is required' });
            const batchId = randomUUID();
            const created = [];
            const errors = [];
            for (let i = 0; i < products.length; i++) {
                try {
                    const raw = products[i];
                    const item = excelRowToSyncItem(raw) || raw;
                    const styleCode = String(item.styleCode || '').trim();
                    if (!styleCode) throw new Error('StyleCode required');
                    const resolved = resolveNormalizedVariant(item);
                    if (!resolved.prodSku) throw new Error('Barcode/SKU required');
                    const fields = buildSubmissionFieldsFromItem(item, req.user.id, batchId);
                    fields.submission_status = 'draft';
                    fields.batch_label =
                        req.body.batch_label != null
                            ? String(req.body.batch_label).slice(0, 255)
                            : `Excel ${new Date().toLocaleDateString('en-IN')}`;
                    const row = await insertSubmission(query, fields);
                    created.push(row);
                } catch (rowErr) {
                    const raw = products[i];
                    const styleCode = String(
                        raw?.StyleCode || raw?.styleCode || raw?.style_code || '',
                    ).trim();
                    const barcode = String(raw?.Barcode || raw?.barcode || raw?.sku || '').trim();
                    errors.push({
                        row: i,
                        styleCode: styleCode || undefined,
                        barcode: barcode || undefined,
                        error: rowErr.message,
                    });
                }
            }
            res.status(201).json({
                success: created.length > 0,
                batch_id: batchId,
                created_count: created.length,
                expected_count: products.length,
                style_summary: summarizeImportByStyle(created),
                submissions: created,
                errors,
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Reseller: bulk with images (multipart payload + images) ----
    app.post(
        '/api/reseller/product-submissions/bulk-with-images',
        deps.SYNC_RECEIVE_UPLOAD || RESELLER_PRODUCT_UPLOAD,
        requireResellerUpload,
        async (req, res) => {
            try {
                if (!req.body?.payload) return res.status(400).json({ error: 'Missing payload JSON' });
                const parsed = JSON.parse(req.body.payload);
                const products = Array.isArray(parsed?.products) ? parsed.products : Array.isArray(parsed) ? parsed : [];
                if (!products.length) return res.status(400).json({ error: 'No products in payload' });
                const batchId = randomUUID();
                const secondaryUploadMap = indexSyncedWebProductSecondaryUploads(req.files);
                const created = [];
                const errors = [];
                for (let i = 0; i < products.length; i++) {
                    try {
                        const item = excelRowToSyncItem(products[i]) || products[i];
                        const styleCode = String(item.styleCode || '').trim();
                        if (!styleCode) throw new Error('StyleCode required');
                        const resolved = resolveNormalizedVariant(item);
                        if (!resolved.prodSku) throw new Error('Barcode/SKU required');
                        const secDisk = lookUpSecondaryDisk(secondaryUploadMap, resolved.prodSku);
                        if (secDisk) {
                            item.secondaryImageUrl = `${getPublicApiBaseUrl()}/uploads/web_products/${secDisk}`;
                            item.hasSecondaryImage = true;
                        }
                        const fields = buildSubmissionFieldsFromItem(item, req.user.id, batchId);
                        fields.submission_status = 'draft';
                        fields.batch_label =
                            req.body?.batch_label != null
                                ? String(req.body.batch_label).slice(0, 255)
                                : `Excel ${new Date().toLocaleDateString('en-IN')}`;
                        const row = await insertSubmission(query, fields);
                        created.push(row);
                    } catch (rowErr) {
                        errors.push({ row: i, error: rowErr.message });
                    }
                }
                res.status(created.length ? 201 : 400).json({
                    success: created.length > 0,
                    batch_id: batchId,
                    created_count: created.length,
                    expected_count: products.length,
                    style_summary: summarizeImportByStyle(created),
                    submissions: created,
                    errors,
                });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        },
    );

    // ---- Reseller: edit pending submission ----
    app.put('/api/reseller/product-submissions/:id', RESELLER_PRODUCT_UPLOAD, requireResellerUpload, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const existing = await query(
                `SELECT * FROM reseller_product_submissions WHERE id = $1 AND submitted_by_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Submission not found' });
            const st = existing[0].submission_status;
            if (st !== 'pending' && st !== 'draft') {
                return res.status(400).json({ error: 'Only draft or pending submissions can be edited' });
            }
            let item = req.body?.product || req.body;
            if (typeof item === 'string') item = JSON.parse(item);
            if (req.body?.payload) item = JSON.parse(req.body.payload);
            const styleCode = String(item.styleCode || item.style_code || existing[0].style_code || '').trim();
            const metalType =
                item.metalType ||
                item.metal_type ||
                existing[0].metal_type ||
                submissionRowToSyncItem(existing[0]).metalType;
            // Draft batches: add/replace photos without blocking on sibling StyleCodes (e.g. Chain Pendant).
            if (styleCode && st !== 'draft') {
                await assertResellerStyleAllowed(query, req.user.id, styleCode, { metalType });
            }
            const mergedItem = { ...submissionRowToSyncItem(existing[0]), ...item };
            const resolved = resolveNormalizedVariant(mergedItem);
            const fields = buildSubmissionFieldsFromItem(mergedItem, req.user.id, existing[0].batch_id);
            const files = req.files || {};
            const primary = (files.primaryImage && files.primaryImage[0]) || (files.images && files.images[0]);
            const secondary =
                (files.secondaryImage && files.secondaryImage[0]) ||
                (files.secondaryImages && files.secondaryImages[0]);
            if (primary && resolved.prodSku) {
                const ext = path.extname(primary.filename) || '.webp';
                const target = `${resolved.prodSku}${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, primary.filename), path.join(uploadsWebProductsDir, target));
                fields.image_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            if (secondary && resolved.prodSku) {
                const ext = path.extname(secondary.filename) || '.webp';
                const target = `${resolved.prodSku}_secondary${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, secondary.filename), path.join(uploadsWebProductsDir, target));
                fields.secondary_image_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            const boxImg =
                (files.boxImage && files.boxImage[0]) || (files.boxImages && files.boxImages[0]);
            const video =
                (files.productVideo && files.productVideo[0]) ||
                (files.productVideos && files.productVideos[0]);
            if (boxImg && resolved.prodSku) {
                const ext = path.extname(boxImg.filename) || '.webp';
                const target = `${resolved.prodSku}_box${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, boxImg.filename), path.join(uploadsWebProductsDir, target));
                fields.box_image_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            if (video && resolved.prodSku) {
                const ext = path.extname(video.filename) || '.mp4';
                const target = `${resolved.prodSku}_video${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, video.filename), path.join(uploadsWebProductsDir, target));
                fields.video_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            const sets = [];
            const params = [id];
            let idx = 2;
            for (const [k, v] of Object.entries(fields)) {
                if (k === 'submitted_by_user_id') continue;
                sets.push(`${k} = $${idx++}`);
                params.push(v);
            }
            sets.push('updated_at = CURRENT_TIMESTAMP');
            const rows = await query(
                `UPDATE reseller_product_submissions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
                params,
            );
            res.json({ success: true, submission: enrichSubmissionRow(rows[0]) });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message });
        }
    });

    // ---- Reseller: withdraw pending / delete draft ----
    app.delete('/api/reseller/product-submissions/:id', requireResellerUpload, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const existing = await query(
                `SELECT id, submission_status FROM reseller_product_submissions WHERE id = $1 AND submitted_by_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Submission not found' });
            const st = existing[0].submission_status;
            if (st === 'draft') {
                await query('DELETE FROM reseller_product_submissions WHERE id = $1', [id]);
                return res.json({ success: true, deleted: true });
            }
            if (st === 'pending') {
                const rows = await query(
                    `UPDATE reseller_product_submissions SET submission_status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 RETURNING id`,
                    [id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Submission not found' });
                return res.json({ success: true });
            }
            return res.status(400).json({ error: 'Cannot remove this submission' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Reseller: list Excel batches (draft + pending review) ----
    app.get('/api/reseller/product-batches', requireResellerUpload, async (req, res) => {
        try {
            const rows = await query(
                `SELECT batch_id,
                        MAX(batch_label) AS batch_label,
                        MIN(created_at) AS created_at,
                        MAX(batch_submitted_at) AS batch_submitted_at,
                        COUNT(*)::int AS product_count,
                        COUNT(*) FILTER (WHERE submission_status = 'draft')::int AS draft_count,
                        COUNT(*) FILTER (WHERE submission_status = 'pending')::int AS pending_count,
                        COUNT(*) FILTER (WHERE submission_status = 'approved')::int AS approved_count,
                        COUNT(*) FILTER (WHERE image_url IS NOT NULL AND TRIM(image_url) <> '')::int AS with_primary_image,
                        COUNT(*) FILTER (WHERE secondary_image_url IS NOT NULL AND TRIM(secondary_image_url) <> '')::int AS with_secondary_image,
                        COALESCE(
                            array_agg(DISTINCT NULLIF(TRIM(style_code), ''))
                                FILTER (WHERE NULLIF(TRIM(style_code), '') IS NOT NULL),
                            ARRAY[]::text[]
                        ) AS style_codes
                 FROM reseller_product_submissions
                 WHERE submitted_by_user_id = $1 AND batch_id IS NOT NULL
                 GROUP BY batch_id
                 ORDER BY MIN(created_at) DESC
                 LIMIT 100`,
                [req.user.id],
            );
            res.json(rows);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Reseller: bulk photo upload for an Excel batch (match filename stem to web_product_sku) ----
    app.post(
        '/api/reseller/product-batches/:batchId/bulk-photos',
        RESELLER_PRODUCT_UPLOAD,
        requireResellerUpload,
        async (req, res) => {
            try {
                const batchId = String(req.params.batchId || '').trim();
                if (!batchId) return res.status(400).json({ error: 'batchId required' });
                const photoType = String(req.body?.photoType || req.query?.photoType || 'front')
                    .trim()
                    .toLowerCase();
                if (!['front', 'back', 'box'].includes(photoType)) {
                    return res.status(400).json({ error: 'photoType must be front, back, or box' });
                }
                const draftRows = await query(
                    `SELECT * FROM reseller_product_submissions
                     WHERE batch_id = $1::uuid AND submitted_by_user_id = $2 AND submission_status = 'draft'`,
                    [batchId, req.user.id],
                );
                if (!draftRows.length) {
                    return res.status(404).json({ error: 'No draft products in this batch' });
                }
                const lookup = buildBatchPhotoLookup(draftRows);
                const files = req.files || {};
                const uploads = [
                    ...(files.images || []),
                    ...(files.primaryImage || []),
                    ...(files.secondaryImage || []),
                    ...(files.secondaryImages || []),
                    ...(files.secondary_images || []),
                    ...(files.boxImage || []),
                    ...(files.boxImages || []),
                ];
                if (!uploads.length) {
                    return res.status(400).json({ error: 'No image files received' });
                }
                const apiBase = getPublicApiBaseUrl();
                const matched = [];
                const unmatched = [];
                const errors = [];
                const updatedIds = new Set();
                for (const file of uploads) {
                    const originalName = String(file.originalname || file.filename || '').trim();
                    try {
                        const stem = parseBulkUploadStemFromFilename(originalName, photoType);
                        const entry = lookUpBatchPhotoEntry(lookup, stem);
                        if (!entry) {
                            unmatched.push(originalName || file.filename);
                            continue;
                        }
                        const ext = path.extname(file.filename) || '.webp';
                        let target;
                        let urlField;
                        if (photoType === 'front') {
                            target = `${entry.prodSku}${ext}`;
                            urlField = 'image_url';
                        } else if (photoType === 'back') {
                            target = `${entry.prodSku}_secondary${ext}`;
                            urlField = 'secondary_image_url';
                        } else {
                            target = `${entry.prodSku}_box${ext}`;
                            urlField = 'box_image_url';
                        }
                        const srcPath = path.join(uploadsWebProductsDir, file.filename);
                        const destPath = path.join(uploadsWebProductsDir, target);
                        if (file.filename !== target) {
                            if (fs.existsSync(destPath)) {
                                try {
                                    fs.unlinkSync(destPath);
                                } catch (_) {
                                    /* ignore */
                                }
                            }
                            fs.renameSync(srcPath, destPath);
                        }
                        const url = `${apiBase}/uploads/web_products/${target}`;
                        await query(
                            `UPDATE reseller_product_submissions SET ${urlField} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                            [url, entry.id],
                        );
                        matched.push(originalName || target);
                        updatedIds.add(entry.id);
                    } catch (fileErr) {
                        errors.push({
                            file: originalName || file.filename,
                            error: fileErr.message,
                        });
                    }
                }
                res.json({
                    matched: matched.length,
                    skipped: unmatched.length + errors.length,
                    unmatched,
                    updated_ids: [...updatedIds],
                    errors,
                });
            } catch (e) {
                console.error('reseller batch bulk photos:', e);
                res.status(500).json({ error: e.message });
            }
        },
    );

    // ---- Reseller: submit Excel batch for KC admin review ----
    app.post('/api/reseller/product-batches/:batchId/submit-for-review', requireResellerUpload, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            if (!batchId) return res.status(400).json({ error: 'batchId required' });
            const draftRows = await query(
                `SELECT id FROM reseller_product_submissions
                 WHERE batch_id = $1::uuid AND submitted_by_user_id = $2 AND submission_status = 'draft'`,
                [batchId, req.user.id],
            );
            if (!draftRows.length) {
                return res.status(400).json({ error: 'No draft products in this batch to submit' });
            }
            try {
                await assertResellerBatchStylesAllowed(query, req.user.id, batchId);
            } catch (ve) {
                if (ve.code === 'RESELLER_CATEGORY_DENIED') {
                    return res.status(403).json({ error: ve.message });
                }
                throw ve;
            }
            const updated = await query(
                `UPDATE reseller_product_submissions SET
                    submission_status = 'pending',
                    batch_submitted_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE batch_id = $1::uuid AND submitted_by_user_id = $2 AND submission_status = 'draft'
                 RETURNING id`,
                [batchId, req.user.id],
            );
            res.json({ success: true, submitted_count: updated.length, batch_id: batchId });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: approve entire batch ----
    app.post('/api/admin/reseller-product-submissions/batch/:batchId/approve', isAdminStrict, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            if (!batchId) return res.status(400).json({ error: 'batchId required' });
            const rows = await query(
                `SELECT * FROM reseller_product_submissions
                 WHERE batch_id = $1::uuid AND submission_status = 'pending'`,
                [batchId],
            );
            const approved = [];
            const errors = [];
            for (const row of rows) {
                try {
                    const result = await approveSubmissionToCatalog(upsertDeps, row, req.user.id);
                    approved.push({ id: row.id, product_sku: result.prodSku });
                } catch (e) {
                    errors.push({ id: row.id, error: e.message });
                }
            }
            if (approved.length > 0 && rows[0]?.submitted_by_user_id) {
                await expandResellerAllowedCategoriesForBatch(query, rows[0].submitted_by_user_id, batchId);
            }
            res.json({ success: approved.length > 0, approved, errors });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: re-publish approved batch (retire duplicate gift rows in wrong SKU) ----
    app.post(
        '/api/admin/reseller-product-submissions/batch/:batchId/republish',
        isAdminStrict,
        async (req, res) => {
            try {
                const batchId = String(req.params.batchId || '').trim();
                if (!batchId) return res.status(400).json({ error: 'batchId required' });
                const rows = await query(
                    `SELECT * FROM reseller_product_submissions
                     WHERE batch_id = $1::uuid AND submission_status = 'approved'`,
                    [batchId],
                );
                const republished = [];
                const errors = [];
                for (const row of rows) {
                    try {
                        const result = await upsertWebProductFromSyncItem(
                            upsertDeps,
                            submissionRowToSyncItem(row),
                            {
                                submittedByUserId: row.submitted_by_user_id,
                                resellerSubmissionId: row.id,
                                publishCategory: true,
                            },
                        );
                        republished.push({ id: row.id, product_sku: result.prodSku });
                    } catch (e) {
                        errors.push({ id: row.id, error: e.message });
                    }
                }
                res.json({ success: republished.length > 0, republished, errors });
            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        },
    );

    // ---- Admin: list all submissions ----
    app.get('/api/admin/reseller-product-submissions', isAdminStrict, async (req, res) => {
        try {
            const status = String(req.query.submission_status || '').trim().toLowerCase();
            const submitterId = parseInt(String(req.query.submitted_by_user_id || ''), 10);
            const batchId = String(req.query.batch_id || '').trim();
            const params = [];
            let sql = `
                SELECT rps.*,
                       u.business_name AS submitter_business_name,
                       u.email AS submitter_email,
                       rev.name AS reviewer_name
                FROM reseller_product_submissions rps
                LEFT JOIN users u ON u.id = rps.submitted_by_user_id
                LEFT JOIN users rev ON rev.id = rps.reviewed_by_user_id
                WHERE 1=1`;
            if (status && SUBMISSION_STATUSES.has(status)) {
                params.push(status);
                sql += ` AND rps.submission_status = $${params.length}`;
            }
            if (!Number.isNaN(submitterId) && submitterId > 0) {
                params.push(submitterId);
                sql += ` AND rps.submitted_by_user_id = $${params.length}`;
            }
            if (batchId) {
                params.push(batchId);
                sql += ` AND rps.batch_id = $${params.length}::uuid`;
            }
            sql += ' ORDER BY rps.created_at DESC LIMIT 1000';
            const rows = await query(sql, params);
            res.json(rows);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: get one ----
    app.get('/api/admin/reseller-product-submissions/:id', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const rows = await query(
                `SELECT rps.*, u.business_name AS submitter_business_name, u.email AS submitter_email
                 FROM reseller_product_submissions rps
                 LEFT JOIN users u ON u.id = rps.submitted_by_user_id
                 WHERE rps.id = $1`,
                [id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            res.json(rows[0]);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: edit submission (any status) ----
    app.put('/api/admin/reseller-product-submissions/:id', isAdminStrict, RESELLER_PRODUCT_UPLOAD, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const existing = await query('SELECT * FROM reseller_product_submissions WHERE id = $1', [id]);
            if (!existing.length) return res.status(404).json({ error: 'Not found' });
            let item = req.body?.product || req.body;
            if (typeof item === 'string') item = JSON.parse(item);
            const merged = { ...submissionRowToSyncItem(existing[0]), ...item };
            const resolved = resolveNormalizedVariant(merged);
            const fields = buildSubmissionFieldsFromItem(merged, existing[0].submitted_by_user_id, existing[0].batch_id);
            const files = req.files || {};
            const primary = (files.primaryImage && files.primaryImage[0]) || (files.images && files.images[0]);
            const secondary = (files.secondaryImage && files.secondaryImage[0]) || (files.secondaryImages && files.secondaryImages[0]);
            if (primary && resolved.prodSku) {
                const ext = path.extname(primary.filename) || '.webp';
                const target = `${resolved.prodSku}${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, primary.filename), path.join(uploadsWebProductsDir, target));
                fields.image_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            if (secondary && resolved.prodSku) {
                const ext = path.extname(secondary.filename) || '.webp';
                const target = `${resolved.prodSku}_secondary${ext}`;
                fs.renameSync(path.join(uploadsWebProductsDir, secondary.filename), path.join(uploadsWebProductsDir, target));
                fields.secondary_image_url = `${getPublicApiBaseUrl()}/uploads/web_products/${target}`;
            }
            const sets = [];
            const params = [id];
            let idx = 2;
            for (const [k, v] of Object.entries(fields)) {
                if (k === 'submitted_by_user_id') continue;
                sets.push(`${k} = $${idx++}`);
                params.push(v);
            }
            if (req.body.review_notes !== undefined) {
                sets.push(`review_notes = $${idx++}`);
                params.push(String(req.body.review_notes || '').slice(0, 2000));
            }
            sets.push('updated_at = CURRENT_TIMESTAMP');
            const rows = await query(
                `UPDATE reseller_product_submissions SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
                params,
            );
            if (existing[0].submission_status === 'approved' && rows[0]?.web_product_sku) {
                await upsertWebProductFromSyncItem(upsertDeps, submissionRowToSyncItem(rows[0]), {
                    submittedByUserId: rows[0].submitted_by_user_id,
                    resellerSubmissionId: rows[0].id,
                    publishCategory: true,
                });
            }
            res.json({ success: true, submission: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: approve → live on web_products + publish category ----
    app.post('/api/admin/reseller-product-submissions/:id/approve', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const rows = await query(`SELECT * FROM reseller_product_submissions WHERE id = $1`, [id]);
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            if (rows[0].submission_status !== 'pending') {
                return res.status(400).json({ error: 'Only pending submissions can be approved' });
            }
            const result = await approveSubmissionToCatalog(upsertDeps, rows[0], req.user.id);
            const updated = await query('SELECT * FROM reseller_product_submissions WHERE id = $1', [id]);
            res.json({ success: true, product_sku: result.prodSku, submission: updated[0] });
        } catch (e) {
            console.error('approve reseller product:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: bulk approve ----
    app.post('/api/admin/reseller-product-submissions/bulk-approve', isAdminStrict, async (req, res) => {
        try {
            const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(String(x), 10)).filter((n) => n > 0) : [];
            if (!ids.length) return res.status(400).json({ error: 'ids array required' });
            const approved = [];
            const errors = [];
            for (const id of ids) {
                try {
                    const rows = await query(
                        `SELECT * FROM reseller_product_submissions WHERE id = $1 AND submission_status = 'pending'`,
                        [id],
                    );
                    if (!rows.length) throw new Error('Not pending');
                    const result = await approveSubmissionToCatalog(upsertDeps, rows[0], req.user.id);
                    approved.push({ id, product_sku: result.prodSku });
                } catch (e) {
                    errors.push({ id, error: e.message });
                }
            }
            res.json({ success: approved.length > 0, approved, errors });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: reject ----
    app.post('/api/admin/reseller-product-submissions/:id/reject', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const notes = req.body?.review_notes != null ? String(req.body.review_notes).slice(0, 2000) : null;
            const rows = await query(
                `UPDATE reseller_product_submissions SET
                    submission_status = 'rejected',
                    review_notes = COALESCE($2, review_notes),
                    reviewed_at = CURRENT_TIMESTAMP,
                    reviewed_by_user_id = $3,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND submission_status = 'pending'
                 RETURNING *`,
                [id, notes, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Pending submission not found' });
            res.json({ success: true, submission: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: delete submission (+ optional live product) ----
    app.delete('/api/admin/reseller-product-submissions/:id', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const deleteLive = req.query.delete_live_product === '1' || req.query.delete_live_product === 'true';
            const rows = await query('SELECT * FROM reseller_product_submissions WHERE id = $1', [id]);
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            const sku = rows[0].web_product_sku;
            await query('DELETE FROM reseller_product_submissions WHERE id = $1', [id]);
            if (deleteLive && sku) {
                await query('UPDATE web_products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE sku = $1', [sku]);
            }
            res.json({ success: true, deleted_id: id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: bulk delete by batch ----
    app.delete('/api/admin/reseller-product-submissions/batch/:batchId', isAdminStrict, async (req, res) => {
        try {
            const batchId = String(req.params.batchId || '').trim();
            if (!batchId) return res.status(400).json({ error: 'batchId required' });
            const deleteLive = req.query.delete_live_product === '1' || req.query.delete_live_product === 'true';
            const rows = await query(
                'SELECT id, web_product_sku FROM reseller_product_submissions WHERE batch_id = $1::uuid',
                [batchId],
            );
            await query('DELETE FROM reseller_product_submissions WHERE batch_id = $1::uuid', [batchId]);
            if (deleteLive) {
                for (const r of rows) {
                    if (r.web_product_sku) {
                        await query('UPDATE web_products SET is_active = false WHERE sku = $1', [r.web_product_sku]);
                    }
                }
            }
            res.json({ success: true, deleted_count: rows.length });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ---- Admin: deactivate live reseller-uploaded product ----
    app.delete('/api/admin/reseller-products/:sku', isAdminStrict, async (req, res) => {
        try {
            const sku = String(req.params.sku || '').trim();
            if (!sku) return res.status(400).json({ error: 'sku required' });
            await query('UPDATE web_products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE sku = $1', [sku]);
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
}

module.exports = {
    registerResellerProductRoutes,
    submissionRowToSyncItem,
    excelRowToSyncItem,
    buildSubmissionFieldsFromItem,
    summarizeImportByStyle,
    summarizeRawExcelByStyle,
    normalizeMetalFamily,
    assertResellerStyleAllowed,
};

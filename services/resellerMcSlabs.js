/**
 * Reseller-uploaded MC slab rows (from Excel) — weight-range MC rates per style + SKU.
 */

const UPLOADED_MC_SLAB_KEYS = [
    { key: 'slab_c', labels: ['SLAB C'] },
    { key: 'slab_c1', labels: ['SLAB C1'] },
    { key: 'slab_1', labels: ['SLAB 1'] },
    { key: 'slab_2', labels: ['SLAB 2'] },
    { key: 'slab_3', labels: ['SLAB 3'] },
    { key: 'slab_r1', labels: ['SLAB R1'] },
    { key: 'slab_r', labels: ['SLAB R'] },
    { key: 'r_quote', labels: ['R QUOTE', 'R_QUOTE'] },
];

function normKey(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 /_-]/g, '');
}

function normHeader(raw) {
    return normKey(raw).replace(/\s+/g, ' ');
}

function parseNum(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
}

function headerIndexMap(headers) {
    const map = new Map();
    headers.forEach((h, i) => {
        const k = normHeader(h);
        if (k) map.set(k, i);
    });
    return map;
}

function colIdx(map, ...names) {
    for (const name of names) {
        const idx = map.get(normHeader(name));
        if (idx != null) return idx;
    }
    return -1;
}

function slabKeyFromHeader(header) {
    const h = normHeader(header);
    for (const def of UPLOADED_MC_SLAB_KEYS) {
        for (const label of def.labels) {
            if (h === normHeader(label)) return def.key;
        }
    }
    return null;
}

/** @returns {{ rows: object[], slabOptions: { key: string, label: string }[] }} */
function parseMcSlabRowsFromSheetRows(sheetRows) {
    if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
        throw new Error('Excel must have a header row and at least one data row');
    }
    const headerRow = sheetRows[0].map((c) => String(c ?? '').trim());
    const map = headerIndexMap(headerRow);

    const iSku = colIdx(map, 'SKU');
    const iStyle = colIdx(map, 'STYLECODE', 'STYLE CODE', 'STYLE_CODE');
    const iFrom = colIdx(map, 'WT_FROM', 'WT FROM', 'WEIGHT FROM');
    const iTo = colIdx(map, 'WT_TO', 'WT TO', 'WEIGHT TO');
    const iMcType = colIdx(map, 'MCTYPE', 'MC TYPE', 'MC_TYPE');
    const iMetal = colIdx(map, 'METALTYPE', 'METAL TYPE', 'METAL_TYPE');

    if (iSku < 0 || iStyle < 0 || iFrom < 0 || iTo < 0) {
        throw new Error('Missing required columns: SKU, StyleCode, WT_FROM, WT_TO');
    }

    const slabColByKey = new Map();
    headerRow.forEach((h, i) => {
        const key = slabKeyFromHeader(h);
        if (key) slabColByKey.set(key, i);
    });
    if (slabColByKey.size === 0) {
        throw new Error('No slab rate columns found (e.g. SLAB C, SLAB 2, SLAB R)');
    }

    const rows = [];
    for (let r = 1; r < sheetRows.length; r++) {
        const line = sheetRows[r];
        if (!line || !line.length) continue;
        const sku = String(line[iSku] ?? '').trim();
        const styleCode = String(line[iStyle] ?? '').trim();
        const wtFrom = parseNum(line[iFrom]);
        const wtTo = parseNum(line[iTo]);
        if (!sku || !styleCode || wtFrom == null || wtTo == null) continue;

        const rates = {};
        for (const [key, col] of slabColByKey.entries()) {
            const v = parseNum(line[col]);
            if (v != null) rates[key] = v;
        }
        if (Object.keys(rates).length === 0) continue;

        rows.push({
            sku,
            styleCode,
            wtFrom,
            wtTo,
            mcType: iMcType >= 0 ? String(line[iMcType] ?? '').trim() || 'MC/GM' : 'MC/GM',
            metalType: iMetal >= 0 ? String(line[iMetal] ?? '').trim() || null : null,
            rates,
        });
    }

    if (rows.length === 0) {
        throw new Error('No valid slab rows found — check SKU, StyleCode, and weight columns');
    }

    const slabOptions = UPLOADED_MC_SLAB_KEYS.filter((d) =>
        rows.some((row) => row.rates[d.key] != null),
    ).map((d) => ({ key: d.key, label: d.labels[0] }));

    return { rows, slabOptions };
}

async function ensureMcSlabColumns(pool) {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_upload_slabs_enabled BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_mc_slab_rows JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_mc_slab_uploaded_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_mc_slab_batches JSONB NOT NULL DEFAULT '[]'::jsonb;
        ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS uploaded_mc_slab_key VARCHAR(64);
        ALTER TABLE shared_catalogs ADD COLUMN IF NOT EXISTS uploaded_mc_slab_rows_snapshot JSONB;
    `);
}

function newBatchId() {
    return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripRowBatchId(row) {
    if (!row || typeof row !== 'object') return row;
    const { batchId, batch_id, ...rest } = row;
    return rest;
}

function sanitizeStoredRows(raw, batchId) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const row of raw.slice(0, 5000)) {
        if (!row || typeof row !== 'object') continue;
        const sku = String(row.sku || '').trim().slice(0, 120);
        const styleCode = String(row.styleCode || row.style_code || '').trim().slice(0, 120);
        const wtFrom = parseNum(row.wtFrom ?? row.wt_from);
        const wtTo = parseNum(row.wtTo ?? row.wt_to);
        if (!sku || !styleCode || wtFrom == null || wtTo == null) continue;
        const ratesIn = row.rates && typeof row.rates === 'object' ? row.rates : {};
        const rates = {};
        for (const def of UPLOADED_MC_SLAB_KEYS) {
            const v = parseNum(ratesIn[def.key]);
            if (v != null) rates[def.key] = v;
        }
        if (Object.keys(rates).length === 0) continue;
        const bid = String(row.batchId || row.batch_id || batchId || '').trim() || null;
        out.push({
            sku,
            styleCode,
            wtFrom,
            wtTo,
            mcType: String(row.mcType || row.mc_type || 'MC/GM').trim().slice(0, 32) || 'MC/GM',
            metalType: row.metalType != null ? String(row.metalType).trim().slice(0, 32) : null,
            rates,
            ...(bid ? { batchId: bid } : {}),
        });
    }
    return out;
}

function sanitizeBatch(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    if (!id) return null;
    const filename = String(raw.filename || raw.file_name || 'Upload').trim().slice(0, 200) || 'Upload';
    const uploadedAt = raw.uploadedAt || raw.uploaded_at || new Date().toISOString();
    const rows = sanitizeStoredRows(raw.rows, id);
    if (!rows.length) return null;
    return {
        id,
        filename,
        uploadedAt,
        rowCount: rows.length,
        rows,
    };
}

/** Migrate legacy flat row array → batch storage. */
function normalizeMcSlabBatches(storedRows, storedBatches) {
    if (Array.isArray(storedBatches) && storedBatches.length) {
        return storedBatches.map(sanitizeBatch).filter(Boolean);
    }
    const flat = sanitizeStoredRows(storedRows);
    if (!flat.length) return [];
    return [
        {
            id: 'legacy',
            filename: 'Previous upload',
            uploadedAt: new Date().toISOString(),
            rowCount: flat.length,
            rows: flat.map((row) => ({ ...row, batchId: 'legacy' })),
        },
    ];
}

function flattenBatchRows(batches) {
    const out = [];
    for (const batch of batches || []) {
        const bid = batch?.id;
        for (const row of batch.rows || []) {
            out.push({ ...row, batchId: row.batchId || bid });
        }
    }
    return out;
}

function batchSummaries(batches) {
    return (batches || []).map((b) => ({
        id: b.id,
        filename: b.filename,
        uploadedAt: b.uploadedAt,
        rowCount: Array.isArray(b.rows) ? b.rows.length : b.rowCount || 0,
    }));
}

async function saveMcSlabBatches(query, uid, batches) {
    const sanitized = (batches || []).map(sanitizeBatch).filter(Boolean);
    const flat = flattenBatchRows(sanitized);
    await query(
        `UPDATE users
         SET reseller_mc_slab_batches = $2::jsonb,
             reseller_mc_slab_rows = $3::jsonb,
             reseller_mc_slab_uploaded_at = CASE WHEN $4::int > 0 THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE id = $1`,
        [uid, JSON.stringify(sanitized), JSON.stringify(flat), flat.length],
    );
    return sanitized;
}

function productWeightGm(product) {
    const net = parseNum(product?.net_weight);
    if (net != null && net > 0) return net;
    const gross = parseNum(product?.gross_weight);
    if (gross != null && gross > 0) return gross;
    const wd = String(product?.weight_display || '').replace(/[^\d.]/g, '');
    const parsed = parseNum(wd);
    return parsed != null && parsed > 0 ? parsed : null;
}

function normCatalogKey(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9 /_]/g, '');
}

function isSkuWildcard(rowSku) {
    const t = normKey(rowSku);
    return !t || t === 'ALL' || t === '*' || t === 'ANY' || t === 'ALL SKUS' || t === 'ALL SKU';
}

function skuMatches(rowSku, product) {
    if (isSkuWildcard(rowSku)) return true;
    const target = normKey(rowSku);
    if (!target) return false;
    const candidates = [
        product?.subcategory_name,
        product?.subcategory_slug,
        product?.sku,
        product?.design_group,
        product?.barcode,
    ]
        .map((x) => normKey(x))
        .filter(Boolean);
    for (const c of candidates) {
        if (c === target) return true;
        if (c.includes(target) || target.includes(c)) return true;
    }
    return false;
}

function styleMatches(rowStyle, product) {
    const target = normCatalogKey(rowStyle);
    if (!target) return false;
    const styleSlug = String(rowStyle || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
    const subSlug = String(product?.subcategory_slug || '').trim().toLowerCase();
    if (styleSlug && subSlug && subSlug.includes(styleSlug)) return true;

    const candidates = [
        product?.style_name,
        product?.style_code,
        product?.subcategory_name,
        product?.subcategory_slug,
        product?.category_name,
        product?.design_group,
    ]
        .map((x) => normCatalogKey(x))
        .filter(Boolean);
    for (const c of candidates) {
        if (c === target) return true;
        if (c.includes(target) || target.includes(c)) return true;
    }
    return false;
}

function metalMatches(rowMetal, product) {
    if (!rowMetal) return true;
    const rm = normKey(rowMetal);
    const pm = normKey(product?.metal_type || 'silver');
    if (!rm) return true;
    if (rm === 'SILVER') return pm.includes('SILVER');
    if (rm === 'GOLD') return pm.includes('GOLD');
    return pm.includes(rm) || rm.includes(pm);
}

/** Lookup uploaded MC for a brochure product. */
function lookupUploadedMcRate(rows, product, slabKey) {
    const key = String(slabKey || '').trim().toLowerCase();
    if (!key || !Array.isArray(rows) || !rows.length) return null;
    const weight = productWeightGm(product);
    if (weight == null) return null;

    let best = null;
    let bestScore = -1;

    for (const row of rows) {
        if (!styleMatches(row.styleCode, product)) continue;
        if (!skuMatches(row.sku, product)) continue;
        if (!metalMatches(row.metalType, product)) continue;
        if (weight < row.wtFrom || weight > row.wtTo) continue;
        const mc = row.rates?.[key];
        if (mc == null) continue;

        let score = 0;
        if (!isSkuWildcard(row.sku)) score += 100;
        const span = Math.max(0.001, row.wtTo - row.wtFrom);
        score += Math.max(0, 50 - Math.min(span, 50));

        if (score > bestScore) {
            bestScore = score;
            best = {
                mc,
                mcType: row.mcType || 'MC/GM',
                slabKey: key,
            };
        }
    }
    return best;
}

function regroupFlatRowsToBatches(flatRows, existingBatches, newBatchMeta) {
    const meta = new Map((existingBatches || []).map((b) => [b.id, b]));
    const grouped = new Map();
    for (const row of sanitizeStoredRows(flatRows)) {
        const bid = row.batchId || 'legacy';
        if (!grouped.has(bid)) grouped.set(bid, []);
        grouped.get(bid).push({ ...row, batchId: bid });
    }
    const batches = [];
    for (const [id, batchRows] of grouped.entries()) {
        const prev = meta.get(id);
        const isNewUpload = newBatchMeta && String(newBatchMeta.id) === id;
        batches.push({
            id,
            filename: isNewUpload
                ? String(newBatchMeta.filename || 'Upload').trim().slice(0, 200) || 'Upload'
                : prev?.filename || 'Upload',
            uploadedAt: isNewUpload
                ? new Date().toISOString()
                : prev?.uploadedAt || new Date().toISOString(),
            rows: batchRows,
        });
    }
    return batches;
}

function slabOptionsFromRows(rows) {
    const sanitized = sanitizeStoredRows(rows);
    return UPLOADED_MC_SLAB_KEYS.filter((d) =>
        sanitized.some((row) => row.rates[d.key] != null),
    ).map((d) => ({ key: d.key, label: d.labels[0] }));
}

function parseUploadedMcSlabKey(raw) {
    const key = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    if (!key) return null;
    const allowed = new Set(UPLOADED_MC_SLAB_KEYS.map((d) => d.key));
    return allowed.has(key) ? key : null;
}

function registerResellerMcSlabRoutes(app, { query, requireSharedCatalogCreator, requireJson }) {
    async function requireUploadSlabsEnabled(req, res, next) {
        try {
            if (!req.isAuthenticated?.() && !req.isAuthenticated) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const uid = req.user?.id;
            const rows = await query(
                `SELECT COALESCE(reseller_upload_slabs_enabled, false) AS enabled
                 FROM users WHERE id = $1`,
                [uid],
            );
            if (!rows.length || !rows[0].enabled) {
                return res.status(403).json({ error: 'Upload slabs is not enabled for your account' });
            }
            next();
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to verify upload slabs access' });
        }
    }

    app.get('/api/reseller/mc-slabs', requireSharedCatalogCreator, async (req, res) => {
        try {
            const uid = req.user?.id;
            const rows = await query(
                `SELECT COALESCE(reseller_upload_slabs_enabled, false) AS enabled,
                        COALESCE(reseller_mc_slab_rows, '[]'::jsonb) AS rows,
                        COALESCE(reseller_mc_slab_batches, '[]'::jsonb) AS batches,
                        reseller_mc_slab_uploaded_at
                 FROM users WHERE id = $1`,
                [uid],
            );
            if (!rows.length) return res.status(404).json({ error: 'User not found' });
            const batches = normalizeMcSlabBatches(rows[0].rows, rows[0].batches);
            const sanitized = flattenBatchRows(batches);
            res.json({
                success: true,
                enabled: !!rows[0].enabled,
                rows: sanitized,
                batches: batchSummaries(batches),
                rowCount: sanitized.length,
                uploadedAt: rows[0].reseller_mc_slab_uploaded_at,
                slabOptions: slabOptionsFromRows(sanitized),
            });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to load MC slabs' });
        }
    });

    app.put('/api/reseller/mc-slabs', requireSharedCatalogCreator, requireUploadSlabsEnabled, requireJson, async (req, res) => {
        try {
            const uid = req.user?.id;
            const existingRows = await query(
                `SELECT COALESCE(reseller_mc_slab_batches, '[]'::jsonb) AS batches,
                        COALESCE(reseller_mc_slab_rows, '[]'::jsonb) AS rows
                 FROM users WHERE id = $1`,
                [uid],
            );
            const existingBatches = normalizeMcSlabBatches(
                existingRows[0]?.rows,
                existingRows[0]?.batches,
            );

            if (String(req.body?.action || '').toLowerCase() === 'append') {
                const filename = String(req.body.filename || req.body.fileName || 'Upload').trim().slice(0, 200) || 'Upload';
                const incoming = sanitizeStoredRows(req.body.rows);
                if (!incoming.length) {
                    return res.status(400).json({ error: 'No valid slab rows in upload' });
                }
                const batchId = newBatchId();
                const batchRows = incoming.map((row) => ({ ...row, batchId }));
                const nextBatches = [
                    ...existingBatches,
                    {
                        id: batchId,
                        filename,
                        uploadedAt: new Date().toISOString(),
                        rows: batchRows,
                    },
                ];
                const saved = await saveMcSlabBatches(query, uid, nextBatches);
                const flat = flattenBatchRows(saved);
                return res.json({
                    success: true,
                    rowCount: flat.length,
                    batches: batchSummaries(saved),
                    slabOptions: slabOptionsFromRows(flat),
                    uploadedAt: new Date().toISOString(),
                });
            }

            const regrouped = regroupFlatRowsToBatches(
                req.body?.rows ?? req.body,
                existingBatches,
                req.body?.newBatch,
            );
            if (!regrouped.length) {
                return res.status(400).json({ error: 'No valid slab rows to save' });
            }
            const saved = await saveMcSlabBatches(query, uid, regrouped);
            const flat = flattenBatchRows(saved);
            res.json({
                success: true,
                rowCount: flat.length,
                batches: batchSummaries(saved),
                slabOptions: slabOptionsFromRows(flat),
                uploadedAt: new Date().toISOString(),
            });
        } catch (error) {
            res.status(400).json({ error: error.message || 'Failed to save MC slabs' });
        }
    });

    app.delete('/api/reseller/mc-slabs', requireSharedCatalogCreator, requireUploadSlabsEnabled, async (req, res) => {
        try {
            const uid = req.user?.id;
            const batchId = String(req.query?.batchId || req.body?.batchId || '').trim();

            if (batchId) {
                const existingRows = await query(
                    `SELECT COALESCE(reseller_mc_slab_batches, '[]'::jsonb) AS batches,
                            COALESCE(reseller_mc_slab_rows, '[]'::jsonb) AS rows
                     FROM users WHERE id = $1`,
                    [uid],
                );
                const existingBatches = normalizeMcSlabBatches(
                    existingRows[0]?.rows,
                    existingRows[0]?.batches,
                );
                const nextBatches = existingBatches.filter((b) => b.id !== batchId);
                if (nextBatches.length === existingBatches.length) {
                    return res.status(404).json({ error: 'Upload batch not found' });
                }
                const saved = await saveMcSlabBatches(query, uid, nextBatches);
                const flat = flattenBatchRows(saved);
                return res.json({
                    success: true,
                    rowCount: flat.length,
                    rows: flat,
                    batches: batchSummaries(saved),
                    slabOptions: slabOptionsFromRows(flat),
                });
            }

            await query(
                `UPDATE users
                 SET reseller_mc_slab_rows = '[]'::jsonb,
                     reseller_mc_slab_batches = '[]'::jsonb,
                     reseller_mc_slab_uploaded_at = NULL
                 WHERE id = $1`,
                [uid],
            );
            res.json({ success: true, batches: [], rowCount: 0, slabOptions: [] });
        } catch (error) {
            res.status(500).json({ error: error.message || 'Failed to clear MC slabs' });
        }
    });
}

module.exports = {
    UPLOADED_MC_SLAB_KEYS,
    parseMcSlabRowsFromSheetRows,
    sanitizeStoredRows,
    lookupUploadedMcRate,
    slabOptionsFromRows,
    parseUploadedMcSlabKey,
    ensureMcSlabColumns,
    registerResellerMcSlabRoutes,
};

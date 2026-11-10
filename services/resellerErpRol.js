/**
 * ROL (reorder levels) by Design Master SKU + weight ranges.
 */

const STANDARD_WEIGHT_RANGES = [
    { target: 30, min: 26, max: 34 },
    { target: 40, min: 35, max: 44 },
    { target: 50, min: 45, max: 54 },
    { target: 60, min: 55, max: 64 },
    { target: 80, min: 70, max: 90 },
    { target: 100, min: 91, max: 114 },
    { target: 125, min: 115, max: 135 },
    { target: 150, min: 136, max: 165 },
    { target: 175, min: 166, max: 190 },
    { target: 200, min: 191, max: 220 },
    { target: 250, min: 221, max: 275 },
    { target: 300, min: 276, max: 325 },
    { target: 350, min: 326, max: 374 },
    { target: 400, min: 375, max: 424 },
    { target: 450, min: 425, max: 474 },
    { target: 500, min: 475, max: 525 },
];

async function ensureRolSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_rol_weight_ranges (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            design_sku_id INTEGER NOT NULL REFERENCES reseller_erp_design_skus(id) ON DELETE CASCADE,
            target_weight_g NUMERIC(12, 3) NOT NULL,
            min_weight_g NUMERIC(12, 3) NOT NULL,
            max_weight_g NUMERIC(12, 3) NOT NULL,
            rol_qty INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, design_sku_id, target_weight_g)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_rol_ranges_sku
            ON reseller_erp_rol_weight_ranges (reseller_user_id, design_sku_id, sort_order);
        CREATE TABLE IF NOT EXISTS reseller_erp_rol_size_targets (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            style_code VARCHAR(128) NOT NULL,
            sku VARCHAR(128) NOT NULL,
            product_name VARCHAR(255) NOT NULL DEFAULT '',
            size VARCHAR(64) NOT NULL DEFAULT '',
            rol_wt_g NUMERIC(14, 3) NOT NULL DEFAULT 0,
            rol_qty INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, style_code, sku, product_name, size)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_rol_size_targets_lookup
            ON reseller_erp_rol_size_targets (reseller_user_id, style_code, sku);
    `);
}

function normKey(v) {
    return String(v || '').trim().toUpperCase();
}

function normSize(v) {
    const t = String(v == null ? '' : v).trim();
    if (!t) return '';
    const n = Number(t);
    if (Number.isFinite(n) && t !== '') return String(n);
    return t;
}

function roundG(n) {
    const x = Number(n) || 0;
    return Math.round(x * 1000) / 1000;
}

function mapRangeRow(row, stockCount = 0) {
    const available = Number(stockCount) || 0;
    const rol = Number(row.rol_qty) || 0;
    return {
        id: row.id,
        design_sku_id: row.design_sku_id,
        target_weight_g: Number(row.target_weight_g),
        min_weight_g: Number(row.min_weight_g),
        max_weight_g: Number(row.max_weight_g),
        rol_qty: rol,
        sort_order: row.sort_order,
        available_qty: available,
        required_qty: Math.max(0, rol - available),
        label: `${row.target_weight_g} g (${row.min_weight_g}–${row.max_weight_g} g)`,
    };
}

async function countStockInRange(query, resellerUserId, styleCode, sku, minG, maxG) {
    const rows = await query(
        `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND status = 'in_stock'
           AND upper(trim(coalesce(style_code, ''))) = upper(trim($2))
           AND upper(trim(coalesce(sku, ''))) = upper(trim($3))
           AND avg_weight IS NOT NULL
           AND avg_weight >= $4 AND avg_weight <= $5`,
        [resellerUserId, styleCode, sku, minG, maxG],
    );
    return rows[0]?.n ?? 0;
}

async function loadSkuRangesWithStock(query, resellerUserId, skuRow) {
    const ranges = await query(
        `SELECT * FROM reseller_erp_rol_weight_ranges
         WHERE reseller_user_id = $1 AND design_sku_id = $2
         ORDER BY sort_order, target_weight_g`,
        [resellerUserId, skuRow.id],
    );
    const out = [];
    for (const r of ranges) {
        const n = await countStockInRange(
            query,
            resellerUserId,
            skuRow.style_code,
            skuRow.sku,
            Number(r.min_weight_g),
            Number(r.max_weight_g),
        );
        out.push(mapRangeRow(r, n));
    }
    return out;
}

async function loadStockAggForRol(query, resellerUserId) {
    const rows = await query(
        `SELECT
            upper(trim(coalesce(style_code, ''))) AS style_code,
            upper(trim(coalesce(sku, ''))) AS sku,
            trim(coalesce(product_name, '')) AS product_name,
            trim(coalesce(item_code, '')) AS item_code,
            trim(coalesce(size, '')) AS size,
            COALESCE(SUM(avg_weight), 0)::float AS wt,
            COUNT(*)::int AS n
         FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND status = 'in_stock'
         GROUP BY 1, 2, 3, 4, 5`,
        [resellerUserId],
    );
    return rows.map((r) => ({
        style_code: r.style_code,
        sku: r.sku,
        product_name: String(r.product_name || ''),
        item_code: String(r.item_code || ''),
        size: normSize(r.size),
        wt: Number(r.wt) || 0,
        n: Number(r.n) || 0,
    }));
}

function matchStockToSizeTarget(agg, style, sku, product, size) {
    const st = normKey(style);
    const sk = normKey(sku);
    const pn = String(product || '').trim().toUpperCase();
    const sz = normSize(size);
    let wt = 0;
    let n = 0;
    for (const r of agg) {
        if (r.style_code !== st || r.sku !== sk) continue;
        if (sz && r.size !== sz) continue;
        if (pn) {
            const hit =
                String(r.product_name || '').trim().toUpperCase() === pn ||
                String(r.item_code || '').trim().toUpperCase() === pn;
            if (!hit) continue;
        }
        wt += r.wt;
        n += r.n;
    }
    return { available_wt: roundG(wt), available_qty: n };
}

function mapSizeTargetRow(row, stock) {
    const rolWt = roundG(row.rol_wt_g);
    const rolQty = Number(row.rol_qty) || 0;
    const availableWt = stock.available_wt || 0;
    const availableQty = stock.available_qty || 0;
    return {
        id: row.id,
        style_code: row.style_code,
        sku: row.sku,
        product_name: row.product_name || '',
        size: row.size || '',
        rol_wt_g: rolWt,
        rol_qty: rolQty,
        available_wt: availableWt,
        available_qty: availableQty,
        required_wt: roundG(Math.max(0, rolWt - availableWt)),
        required_qty: Math.max(0, rolQty - availableQty),
        sort_order: row.sort_order,
    };
}

async function loadSizeTargetsWithStock(query, resellerUserId, filters = {}) {
    const params = [resellerUserId];
    let sql = `SELECT * FROM reseller_erp_rol_size_targets WHERE reseller_user_id = $1`;
    if (filters.style_code) {
        params.push(normKey(filters.style_code));
        sql += ` AND upper(trim(style_code)) = $${params.length}`;
    }
    if (Array.isArray(filters.style_codes) && filters.style_codes.length) {
        params.push(filters.style_codes.map(normKey));
        sql += ` AND upper(trim(style_code)) = ANY($${params.length}::text[])`;
    }
    if (filters.sku) {
        params.push(normKey(filters.sku));
        sql += ` AND upper(trim(sku)) = $${params.length}`;
    }
    if (Array.isArray(filters.sku_pairs) && filters.sku_pairs.length) {
        const pairs = filters.sku_pairs
            .map((p) => `${normKey(p.style)}::${normKey(p.sku)}`)
            .filter(Boolean);
        if (pairs.length) {
            params.push(pairs);
            sql += ` AND (upper(trim(style_code)) || '::' || upper(trim(sku))) = ANY($${params.length}::text[])`;
        }
    }
    if (Array.isArray(filters.sizes) && filters.sizes.length) {
        params.push(filters.sizes.map(normSize).filter(Boolean));
        sql += ` AND size = ANY($${params.length}::text[])`;
    }
    sql += ` ORDER BY style_code, sku, product_name, sort_order, size`;
    const rows = await query(sql, params);
    const agg = await loadStockAggForRol(query, resellerUserId);
    return rows.map((r) =>
        mapSizeTargetRow(r, matchStockToSizeTarget(agg, r.style_code, r.sku, r.product_name, r.size)),
    );
}

async function upsertSizeTargets(query, resellerUserId, sizeRows) {
    let upserted = 0;
    let order = 0;
    for (const r of sizeRows) {
        const style = normKey(r.style_code || r.style);
        const sku = normKey(r.sku);
        if (!style || !sku) continue;
        const product = String(r.product_name || r.product || '').trim().slice(0, 255);
        const size = normSize(r.size).slice(0, 64);
        const rolWt = roundG(r.rol_wt_g ?? r.rol_wt);
        const rolQty = parseInt(String(r.rol_qty ?? r.rol ?? 0), 10) || 0;
        await query(
            `INSERT INTO reseller_erp_rol_size_targets (
                reseller_user_id, style_code, sku, product_name, size, rol_wt_g, rol_qty, sort_order, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CURRENT_TIMESTAMP)
             ON CONFLICT (reseller_user_id, style_code, sku, product_name, size)
             DO UPDATE SET
                rol_wt_g = EXCLUDED.rol_wt_g,
                rol_qty = EXCLUDED.rol_qty,
                sort_order = EXCLUDED.sort_order,
                updated_at = CURRENT_TIMESTAMP`,
            [resellerUserId, style, sku, product, size, rolWt, rolQty, order++],
        );
        upserted++;
    }
    return upserted;
}

async function importWeightRows(query, resellerUserId, weightRows) {
    let imported = 0;
    let skipped = 0;
    const bySku = new Map();
    for (const r of weightRows) {
        const style = normKey(r.style_code || r.style);
        const sku = normKey(r.sku);
        if (!style || !sku) {
            skipped++;
            continue;
        }
        const key = `${style}::${sku}`;
        if (!bySku.has(key)) bySku.set(key, { style, sku, ranges: [] });
        const target = Number(r.target_weight_g);
        const minG = Number(r.min_weight_g);
        const maxG = Number(r.max_weight_g);
        const rol = parseInt(String(r.rol_qty ?? 0), 10) || 0;
        if (![target, minG, maxG].every(Number.isFinite)) {
            skipped++;
            continue;
        }
        bySku.get(key).ranges.push({ target, minG, maxG, rol });
    }
    for (const group of bySku.values()) {
        const skuRows = await query(
            `SELECT sk.id, sk.sku, ds.style_code
             FROM reseller_erp_design_skus sk
             JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
             WHERE sk.reseller_user_id = $1
               AND upper(trim(ds.style_code)) = $2
               AND upper(trim(sk.sku)) = $3`,
            [resellerUserId, group.style, group.sku],
        );
        if (!skuRows.length) {
            skipped += group.ranges.length;
            continue;
        }
        const skuId = skuRows[0].id;
        await query(
            `DELETE FROM reseller_erp_rol_weight_ranges
             WHERE reseller_user_id = $1 AND design_sku_id = $2`,
            [resellerUserId, skuId],
        );
        let order = 0;
        for (const r of group.ranges) {
            await query(
                `INSERT INTO reseller_erp_rol_weight_ranges (
                    reseller_user_id, design_sku_id, target_weight_g, min_weight_g, max_weight_g, rol_qty, sort_order
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [resellerUserId, skuId, r.target, r.minG, r.maxG, r.rol, order++],
            );
            imported++;
        }
    }
    return { imported, skipped };
}

function csvEscape(v) {
    return `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
}

function rolReportCsv(rows) {
    const header = ['Style', 'SKU', 'Weight range', 'Available', 'ROL set', 'Required'];
    const lines = [header.join(',')];
    for (const row of rows) {
        for (const r of row.ranges) {
            lines.push(
                [
                    `"${String(row.style_code || '').replace(/"/g, '""')}"`,
                    `"${String(row.sku || '').replace(/"/g, '""')}"`,
                    `"${r.label.replace(/"/g, '""')}"`,
                    r.available_qty,
                    r.rol_qty,
                    r.required_qty,
                ].join(','),
            );
        }
    }
    return lines.join('\n');
}

function sizeRolReportCsv(rows) {
    const header = ['Style', 'SKU', 'Product Name', 'Size', 'Available WT', 'ROL WT set', 'RequiredWT'];
    const lines = [header.join(',')];
    for (const r of rows) {
        lines.push(
            [
                csvEscape(r.style_code),
                csvEscape(r.sku),
                csvEscape(r.product_name),
                csvEscape(r.size),
                r.available_wt,
                r.rol_wt_g,
                r.required_wt,
            ].join(','),
        );
    }
    return lines.join('\n');
}

function mixedRolReportCsv(weightBlocks, sizeRows) {
    const header = [
        'Style',
        'SKU',
        'Product Name',
        'Weight range',
        'Size',
        'Available',
        'ROL set',
        'Required',
        'Available WT',
        'ROL WT set',
        'RequiredWT',
    ];
    const lines = [header.join(',')];
    for (const row of weightBlocks) {
        for (const r of row.ranges) {
            lines.push(
                [
                    csvEscape(row.style_code),
                    csvEscape(row.sku),
                    '""',
                    csvEscape(r.label),
                    '""',
                    r.available_qty,
                    r.rol_qty,
                    r.required_qty,
                    '',
                    '',
                    '',
                ].join(','),
            );
        }
    }
    for (const r of sizeRows) {
        lines.push(
            [
                csvEscape(r.style_code),
                csvEscape(r.sku),
                csvEscape(r.product_name),
                '""',
                csvEscape(r.size),
                r.available_qty || '',
                r.rol_qty || '',
                r.required_qty || '',
                r.available_wt,
                r.rol_wt_g,
                r.required_wt,
            ].join(','),
        );
    }
    return lines.join('\n');
}

function parseFilterList(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function parseSkuPairs(raw) {
    return parseFilterList(raw).map((s) => {
        const idx = s.indexOf('::');
        if (idx < 0) return { style: '', sku: normKey(s) };
        return { style: normKey(s.slice(0, idx)), sku: normKey(s.slice(idx + 2)) };
    });
}

function registerRolRoutes(app, deps) {
    const { query, checkAuth, erpGate, requireJson, pool } = deps;

    ensureRolSchema(pool).catch((e) => console.warn('rol schema:', e.message));

    app.get('/api/reseller/erp/rol/ranges', checkAuth, erpGate, async (req, res) => {
        try {
            const skuId = parseInt(String(req.query.sku_id || ''), 10);
            if (!Number.isFinite(skuId)) return res.status(400).json({ error: 'sku_id required' });
            const skuRows = await query(
                `SELECT sk.id, sk.sku, ds.style_code
                 FROM reseller_erp_design_skus sk
                 JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                 WHERE sk.reseller_user_id = $1 AND sk.id = $2`,
                [req.user.id, skuId],
            );
            if (!skuRows.length) return res.status(404).json({ error: 'SKU not found' });
            const ranges = await loadSkuRangesWithStock(query, req.user.id, skuRows[0]);
            res.json({ ranges });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load ROL ranges' });
        }
    });

    app.put('/api/reseller/erp/rol/ranges', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const skuId = parseInt(String(req.body.design_sku_id || req.body.sku_id || ''), 10);
            if (!Number.isFinite(skuId)) return res.status(400).json({ error: 'design_sku_id required' });
            const skuRows = await query(
                `SELECT sk.id, sk.sku, ds.style_code
                 FROM reseller_erp_design_skus sk
                 JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                 WHERE sk.reseller_user_id = $1 AND sk.id = $2`,
                [req.user.id, skuId],
            );
            if (!skuRows.length) return res.status(404).json({ error: 'SKU not found' });

            const incoming = Array.isArray(req.body.ranges) ? req.body.ranges : [];
            await query(
                `DELETE FROM reseller_erp_rol_weight_ranges
                 WHERE reseller_user_id = $1 AND design_sku_id = $2`,
                [req.user.id, skuId],
            );
            let order = 0;
            for (const r of incoming) {
                const target = Number(r.target_weight_g ?? r.target);
                const minG = Number(r.min_weight_g ?? r.min);
                const maxG = Number(r.max_weight_g ?? r.max);
                const rol = parseInt(String(r.rol_qty ?? r.rol ?? 0), 10) || 0;
                if (!Number.isFinite(target) || !Number.isFinite(minG) || !Number.isFinite(maxG)) continue;
                await query(
                    `INSERT INTO reseller_erp_rol_weight_ranges (
                        reseller_user_id, design_sku_id, target_weight_g, min_weight_g, max_weight_g, rol_qty, sort_order
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                    [req.user.id, skuId, target, minG, maxG, rol, order++],
                );
            }
            const ranges = await loadSkuRangesWithStock(query, req.user.id, skuRows[0]);
            res.json({ success: true, ranges });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save ROL ranges' });
        }
    });

    app.post('/api/reseller/erp/rol/ranges/standard', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const skuId = parseInt(String(req.body.design_sku_id || req.body.sku_id || ''), 10);
            if (!Number.isFinite(skuId)) return res.status(400).json({ error: 'design_sku_id required' });
            const skuRows = await query(
                `SELECT sk.id, sk.sku, ds.style_code
                 FROM reseller_erp_design_skus sk
                 JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                 WHERE sk.reseller_user_id = $1 AND sk.id = $2`,
                [req.user.id, skuId],
            );
            if (!skuRows.length) return res.status(404).json({ error: 'SKU not found' });

            await query(
                `DELETE FROM reseller_erp_rol_weight_ranges
                 WHERE reseller_user_id = $1 AND design_sku_id = $2`,
                [req.user.id, skuId],
            );
            let order = 0;
            for (const spec of STANDARD_WEIGHT_RANGES) {
                await query(
                    `INSERT INTO reseller_erp_rol_weight_ranges (
                        reseller_user_id, design_sku_id, target_weight_g, min_weight_g, max_weight_g, rol_qty, sort_order
                     ) VALUES ($1,$2,$3,$4,$5,0,$6)`,
                    [req.user.id, skuId, spec.target, spec.min, spec.max, order++],
                );
            }
            const ranges = await loadSkuRangesWithStock(query, req.user.id, skuRows[0]);
            res.json({ success: true, ranges });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to generate standard ranges' });
        }
    });

    async function buildWeightReport(resellerUserId, q) {
        const styleId = q.style_id ? parseInt(String(q.style_id), 10) : null;
        const skuIdsRaw = String(q.sku_ids || '').trim();
        const skuIds = skuIdsRaw
            ? skuIdsRaw.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
            : [];
        const styleCodes = parseFilterList(q.style_codes).map(normKey);
        const skuPairs = parseSkuPairs(q.sku_keys);
        const sizes = parseFilterList(q.sizes).map(normSize).filter(Boolean);

        let skuSql = `
            SELECT sk.id, sk.sku, ds.style_code, ds.id AS style_id
            FROM reseller_erp_design_skus sk
            JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
            WHERE sk.reseller_user_id = $1`;
        const params = [resellerUserId];
        if (Number.isFinite(styleId)) {
            params.push(styleId);
            skuSql += ` AND ds.id = $${params.length}`;
        }
        if (skuIds.length) {
            params.push(skuIds);
            skuSql += ` AND sk.id = ANY($${params.length}::int[])`;
        }
        if (styleCodes.length) {
            params.push(styleCodes);
            skuSql += ` AND upper(trim(ds.style_code)) = ANY($${params.length}::text[])`;
        }
        if (skuPairs.length) {
            const keys = skuPairs.map((p) =>
                p.style ? `${p.style}::${p.sku}` : p.sku,
            );
            params.push(keys);
            skuSql += ` AND (
                (upper(trim(ds.style_code)) || '::' || upper(trim(sk.sku))) = ANY($${params.length}::text[])
                OR upper(trim(sk.sku)) = ANY($${params.length}::text[])
            )`;
        }
        skuSql += ' ORDER BY ds.style_code, sk.sku';
        const skus = await query(skuSql, params);

        const report = [];
        if (!sizes.length) {
            for (const sk of skus) {
                const ranges = await loadSkuRangesWithStock(query, resellerUserId, sk);
                if (!ranges.length) continue;
                report.push({
                    kind: 'weight',
                    style_id: sk.style_id,
                    style_code: sk.style_code,
                    design_sku_id: sk.id,
                    sku: sk.sku,
                    ranges,
                    total_available: ranges.reduce((s, r) => s + r.available_qty, 0),
                    total_required: ranges.reduce((s, r) => s + r.required_qty, 0),
                });
            }
        }

        const sizeRows = await loadSizeTargetsWithStock(query, resellerUserId, {
            style_codes: styleCodes,
            sku_pairs: skuPairs,
            sizes,
        });
        return { report, size_report: sizeRows };
    }

    app.get('/api/reseller/erp/rol/report', checkAuth, erpGate, async (req, res) => {
        try {
            const data = await buildWeightReport(req.user.id, req.query);
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to build ROL report' });
        }
    });

    app.get('/api/reseller/erp/rol/export', checkAuth, erpGate, async (req, res) => {
        try {
            const data = await buildWeightReport(req.user.id, req.query);
            const flat = data.report.map((r) => ({
                style_code: r.style_code,
                sku: r.sku,
                ranges: r.ranges,
            }));
            const sizeRows = data.size_report || [];
            const hasWeight = flat.some((r) => r.ranges && r.ranges.length);
            const hasSize = sizeRows.length > 0;
            let csv;
            if (hasWeight && hasSize) csv = mixedRolReportCsv(flat, sizeRows);
            else if (hasSize) csv = sizeRolReportCsv(sizeRows);
            else csv = rolReportCsv(flat);
            const fname = `rol-report-${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
            res.send('\uFEFF' + csv);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });

    app.get('/api/reseller/erp/rol/catalog', checkAuth, erpGate, async (req, res) => {
        try {
            const styles = await query(
                `SELECT id, style_code FROM reseller_erp_design_styles
                 WHERE reseller_user_id = $1 ORDER BY style_code`,
                [req.user.id],
            );
            const skus = await query(
                `SELECT sk.id, sk.sku, ds.style_code, ds.id AS style_id
                 FROM reseller_erp_design_skus sk
                 JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                 WHERE sk.reseller_user_id = $1
                 ORDER BY ds.style_code, sk.sku`,
                [req.user.id],
            );
            const sizeRows = await query(
                `SELECT style_code, sku, product_name, size
                 FROM reseller_erp_rol_size_targets
                 WHERE reseller_user_id = $1
                 ORDER BY style_code, sku, product_name, size`,
                [req.user.id],
            );
            const rangeSkus = await query(
                `SELECT DISTINCT design_sku_id FROM reseller_erp_rol_weight_ranges
                 WHERE reseller_user_id = $1`,
                [req.user.id],
            );
            const rangeSet = new Set(rangeSkus.map((r) => r.design_sku_id));
            const map = new Map();
            const ensure = (styleCode) => {
                const k = normKey(styleCode);
                if (!map.has(k)) map.set(k, { style_code: k, skus: new Map() });
                return map.get(k);
            };
            const ensureSku = (styleCode, sku, extra = {}) => {
                const st = ensure(styleCode);
                const sk = normKey(sku);
                if (!st.skus.has(sk)) {
                    st.skus.set(sk, {
                        sku: sk,
                        design_sku_id: extra.design_sku_id || null,
                        sizes: new Set(),
                        products: new Set(),
                        has_weight_ranges: false,
                        has_size_targets: false,
                    });
                }
                const row = st.skus.get(sk);
                if (extra.design_sku_id) row.design_sku_id = extra.design_sku_id;
                if (extra.has_weight_ranges) row.has_weight_ranges = true;
                if (extra.has_size_targets) row.has_size_targets = true;
                if (extra.size) row.sizes.add(normSize(extra.size));
                if (extra.product) row.products.add(String(extra.product).trim());
                return row;
            };
            for (const s of styles) ensure(s.style_code);
            for (const sk of skus) {
                ensureSku(sk.style_code, sk.sku, {
                    design_sku_id: sk.id,
                    has_weight_ranges: rangeSet.has(sk.id),
                });
            }
            for (const r of sizeRows) {
                ensureSku(r.style_code, r.sku, {
                    has_size_targets: true,
                    size: r.size,
                    product: r.product_name,
                });
            }
            const tree = [...map.values()]
                .map((st) => ({
                    style_code: st.style_code,
                    skus: [...st.skus.values()].map((sk) => ({
                        ...sk,
                        sizes: [...sk.sizes].filter(Boolean).sort((a, b) => {
                            const na = Number(a);
                            const nb = Number(b);
                            if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
                            return String(a).localeCompare(String(b));
                        }),
                        products: [...sk.products].filter(Boolean).sort(),
                    })),
                }))
                .sort((a, b) => a.style_code.localeCompare(b.style_code));
            res.json({ tree });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load ROL catalog' });
        }
    });

    app.get('/api/reseller/erp/rol/size-targets', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await loadSizeTargetsWithStock(query, req.user.id, {
                style_code: req.query.style_code,
                sku: req.query.sku,
                style_codes: parseFilterList(req.query.style_codes),
                sku_pairs: parseSkuPairs(req.query.sku_keys),
                sizes: parseFilterList(req.query.sizes),
            });
            res.json({ rows });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load size ROL' });
        }
    });

    app.put('/api/reseller/erp/rol/size-targets', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const style = normKey(req.body.style_code || req.body.style);
            const sku = normKey(req.body.sku);
            if (!style || !sku) return res.status(400).json({ error: 'style_code and sku required' });
            const incoming = Array.isArray(req.body.rows) ? req.body.rows : [];
            await query(
                `DELETE FROM reseller_erp_rol_size_targets
                 WHERE reseller_user_id = $1
                   AND upper(trim(style_code)) = $2
                   AND upper(trim(sku)) = $3`,
                [req.user.id, style, sku],
            );
            const payload = incoming.map((r) => ({ ...r, style_code: style, sku }));
            await upsertSizeTargets(query, req.user.id, payload);
            const rows = await loadSizeTargetsWithStock(query, req.user.id, { style_code: style, sku });
            res.json({ success: true, rows });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save size ROL' });
        }
    });

    app.post('/api/reseller/erp/rol/import', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const sizeRows = Array.isArray(req.body.size_rows) ? req.body.size_rows : [];
            const weightRows = Array.isArray(req.body.weight_rows) ? req.body.weight_rows : [];
            const sizeUpserted = await upsertSizeTargets(query, req.user.id, sizeRows);
            const weight = await importWeightRows(query, req.user.id, weightRows);
            res.json({
                success: true,
                size_upserted: sizeUpserted,
                weight_imported: weight.imported,
                weight_skipped: weight.skipped,
            });
        } catch (e) {
            res.status(500).json({ error: e.message || 'ROL import failed' });
        }
    });
}

module.exports = {
    ensureRolSchema,
    registerRolRoutes,
    STANDARD_WEIGHT_RANGES,
};

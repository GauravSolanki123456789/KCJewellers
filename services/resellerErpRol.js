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
    `);
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

    app.get('/api/reseller/erp/rol/report', checkAuth, erpGate, async (req, res) => {
        try {
            const styleId = req.query.style_id ? parseInt(String(req.query.style_id), 10) : null;
            const skuIdsRaw = String(req.query.sku_ids || '').trim();
            const skuIds = skuIdsRaw
                ? skuIdsRaw.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
                : [];

            let skuSql = `
                SELECT sk.id, sk.sku, ds.style_code, ds.id AS style_id
                FROM reseller_erp_design_skus sk
                JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                WHERE sk.reseller_user_id = $1`;
            const params = [req.user.id];
            if (Number.isFinite(styleId)) {
                params.push(styleId);
                skuSql += ` AND ds.id = $${params.length}`;
            }
            if (skuIds.length) {
                params.push(skuIds);
                skuSql += ` AND sk.id = ANY($${params.length}::int[])`;
            }
            skuSql += ' ORDER BY ds.style_code, sk.sku';
            const skus = await query(skuSql, params);

            const report = [];
            for (const sk of skus) {
                const ranges = await loadSkuRangesWithStock(query, req.user.id, sk);
                if (!ranges.length) continue;
                report.push({
                    style_id: sk.style_id,
                    style_code: sk.style_code,
                    design_sku_id: sk.id,
                    sku: sk.sku,
                    ranges,
                    total_available: ranges.reduce((s, r) => s + r.available_qty, 0),
                    total_required: ranges.reduce((s, r) => s + r.required_qty, 0),
                });
            }
            res.json({ report });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to build ROL report' });
        }
    });

    app.get('/api/reseller/erp/rol/export', checkAuth, erpGate, async (req, res) => {
        try {
            const styleId = req.query.style_id ? parseInt(String(req.query.style_id), 10) : null;
            const skuIdsRaw = String(req.query.sku_ids || '').trim();
            const skuIds = skuIdsRaw
                ? skuIdsRaw.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
                : [];

            req.url = `/api/reseller/erp/rol/report?style_id=${styleId || ''}&sku_ids=${skuIds.join(',')}`;
            // Reuse report logic inline
            let skuSql = `
                SELECT sk.id, sk.sku, ds.style_code, ds.id AS style_id
                FROM reseller_erp_design_skus sk
                JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
                WHERE sk.reseller_user_id = $1`;
            const params = [req.user.id];
            if (Number.isFinite(styleId)) {
                params.push(styleId);
                skuSql += ` AND ds.id = $${params.length}`;
            }
            if (skuIds.length) {
                params.push(skuIds);
                skuSql += ` AND sk.id = ANY($${params.length}::int[])`;
            }
            skuSql += ' ORDER BY ds.style_code, sk.sku';
            const skus = await query(skuSql, params);

            const flat = [];
            for (const sk of skus) {
                const ranges = await loadSkuRangesWithStock(query, req.user.id, sk);
                flat.push({ style_code: sk.style_code, sku: sk.sku, ranges });
            }
            const csv = rolReportCsv(flat);
            const fname = `rol-report-${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
            res.send('\uFEFF' + csv);
        } catch (e) {
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });
}

module.exports = {
    ensureRolSchema,
    registerRolRoutes,
    STANDARD_WEIGHT_RANGES,
};

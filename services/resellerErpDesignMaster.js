/**
 * ERP Design Master — style / SKU default calculation fields for stock autofill & bulk updates.
 */

function normKey(v) {
    return String(v || '')
        .trim()
        .toUpperCase();
}

async function ensureDesignMasterSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_design_styles (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            style_code VARCHAR(128) NOT NULL,
            style_name VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, style_code)
        );
        CREATE TABLE IF NOT EXISTS reseller_erp_design_skus (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            style_id INTEGER NOT NULL REFERENCES reseller_erp_design_styles(id) ON DELETE CASCADE,
            sku VARCHAR(128) NOT NULL,
            product_name VARCHAR(255),
            purity NUMERIC(8, 2),
            metal_type VARCHAR(64),
            wastage_pct NUMERIC(8, 2),
            mc_rate NUMERIC(12, 2),
            mc_rate_slab_r NUMERIC(12, 2),
            mc_rate_slab_w NUMERIC(12, 2),
            mc_rate_slab_f NUMERIC(12, 2),
            metal_slab_r_pct NUMERIC(8, 4),
            metal_slab_w_pct NUMERIC(8, 4),
            metal_slab_f_pct NUMERIC(8, 4),
            mc_type VARCHAR(32),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, style_id, sku)
        );
    `);
}

function mapDesignSku(row) {
    if (!row) return null;
    return {
        id: row.id,
        style_id: row.style_id,
        style_code: row.style_code,
        style_name: row.style_name,
        sku: row.sku,
        product_name: row.product_name,
        purity: row.purity != null ? Number(row.purity) : null,
        metal_type: row.metal_type,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_rate_slab_r: row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
        mc_rate_slab_w: row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
        mc_rate_slab_f: row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
        metal_slab_r_pct: row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
        metal_slab_w_pct: row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
        metal_slab_f_pct: row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
        mc_type: row.mc_type,
    };
}

async function lookupDesignDefaults(query, resellerUserId, styleCode, sku) {
    const sc = normKey(styleCode);
    const sk = normKey(sku);
    if (!sc || !sk) return null;
    const rows = await query(
        `SELECT ds.id AS style_id, ds.style_code, ds.style_name,
                sk.id, sk.sku, sk.product_name, sk.purity, sk.metal_type,
                sk.wastage_pct, sk.mc_rate, sk.mc_rate_slab_r, sk.mc_rate_slab_w, sk.mc_rate_slab_f,
                sk.metal_slab_r_pct, sk.metal_slab_w_pct, sk.metal_slab_f_pct, sk.mc_type
         FROM reseller_erp_design_styles ds
         JOIN reseller_erp_design_skus sk ON sk.style_id = ds.id AND sk.reseller_user_id = ds.reseller_user_id
         WHERE ds.reseller_user_id = $1
           AND upper(trim(ds.style_code)) = $2
           AND upper(trim(sk.sku)) = $3
         LIMIT 1`,
        [resellerUserId, sc, sk],
    );
    return mapDesignSku(rows[0]);
}

function applyDesignDefaultsToPiece(piece, defaults) {
    if (!piece || !defaults) return piece;
    const fill = (key, val) => {
        if (val == null || val === '') return;
        if (piece[key] == null || piece[key] === '') piece[key] = val;
    };
    fill('product_name', defaults.product_name);
    fill('purity', defaults.purity);
    fill('metal_type', defaults.metal_type);
    fill('wastage_pct', defaults.wastage_pct);
    fill('mc_rate', defaults.mc_rate);
    fill('mc_rate_slab_r', defaults.mc_rate_slab_r);
    fill('mc_rate_slab_w', defaults.mc_rate_slab_w);
    fill('mc_rate_slab_f', defaults.mc_rate_slab_f);
    fill('metal_slab_r_pct', defaults.metal_slab_r_pct);
    fill('metal_slab_w_pct', defaults.metal_slab_w_pct);
    fill('metal_slab_f_pct', defaults.metal_slab_f_pct);
    fill('mc_type', defaults.mc_type);
    return piece;
}

async function propagateDesignSkuToStock(query, resellerUserId, designSkuId) {
    const rows = await query(
        `SELECT sk.*, ds.style_code
         FROM reseller_erp_design_skus sk
         JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
         WHERE sk.id = $1 AND sk.reseller_user_id = $2`,
        [designSkuId, resellerUserId],
    );
    if (!rows.length) return 0;
    const d = rows[0];
    const res = await query(
        `UPDATE reseller_erp_stock_pieces SET
            wastage_pct = COALESCE($1, wastage_pct),
            mc_rate = COALESCE($2, mc_rate),
            mc_rate_slab_r = COALESCE($3, mc_rate_slab_r),
            mc_rate_slab_w = COALESCE($4, mc_rate_slab_w),
            mc_rate_slab_f = COALESCE($5, mc_rate_slab_f),
            metal_slab_r_pct = COALESCE($6, metal_slab_r_pct),
            metal_slab_w_pct = COALESCE($7, metal_slab_w_pct),
            metal_slab_f_pct = COALESCE($8, metal_slab_f_pct),
            mc_type = COALESCE($9, mc_type),
            purity = COALESCE($10, purity),
            metal_type = COALESCE($11, metal_type),
            updated_at = NOW()
         WHERE reseller_user_id = $12 AND status = 'in_stock'
           AND upper(trim(style_code)) = upper(trim($13))
           AND upper(trim(sku)) = upper(trim($14))`,
        [
            d.wastage_pct,
            d.mc_rate,
            d.mc_rate_slab_r,
            d.mc_rate_slab_w,
            d.mc_rate_slab_f,
            d.metal_slab_r_pct,
            d.metal_slab_w_pct,
            d.metal_slab_f_pct,
            d.mc_type,
            d.purity,
            d.metal_type,
            resellerUserId,
            d.style_code,
            d.sku,
        ],
    );
    return res.length || res.rowCount || 0;
}

async function seedDesignMasterFromStock(query, resellerUserId, opts = {}) {
    const overwrite = !!opts.overwrite;
    const batchId = opts.batch_id ? String(opts.batch_id).trim() : null;
    const params = [resellerUserId];
    let batchFilter = '';
    if (batchId) {
        params.push(batchId);
        batchFilter = ' AND batch_id = $2::uuid';
    }
    const rows = await query(
        `SELECT DISTINCT ON (upper(trim(style_code)), upper(trim(sku)))
            style_code, sku, product_name, purity, metal_type,
            wastage_pct, mc_rate, mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
            metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct, mc_type
         FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND style_code IS NOT NULL AND trim(style_code) <> ''
           AND sku IS NOT NULL AND trim(sku) <> ''
           ${batchFilter}
         ORDER BY upper(trim(style_code)), upper(trim(sku)), updated_at DESC`,
        params,
    );

    let stylesCreated = 0;
    let skusCreated = 0;
    let skusUpdated = 0;
    let skipped = 0;

    for (const row of rows) {
        const styleCode = String(row.style_code).trim().slice(0, 128);
        const sku = String(row.sku).trim().slice(0, 128);
        if (!styleCode || !sku) {
            skipped += 1;
            continue;
        }

        let styleRows = await query(
            `SELECT id FROM reseller_erp_design_styles
             WHERE reseller_user_id = $1 AND upper(trim(style_code)) = upper(trim($2))`,
            [resellerUserId, styleCode],
        );
        let styleId = styleRows[0]?.id;
        if (!styleId) {
            const ins = await query(
                `INSERT INTO reseller_erp_design_styles (reseller_user_id, style_code, style_name)
                 VALUES ($1, $2, $2) RETURNING id`,
                [resellerUserId, styleCode],
            );
            styleId = ins[0].id;
            stylesCreated += 1;
        }

        const existingSku = await query(
            `SELECT id FROM reseller_erp_design_skus
             WHERE reseller_user_id = $1 AND style_id = $2 AND upper(trim(sku)) = upper(trim($3))`,
            [resellerUserId, styleId, sku],
        );

        const vals = [
            row.product_name ? String(row.product_name).slice(0, 255) : null,
            row.purity != null ? Number(row.purity) : null,
            row.metal_type ? String(row.metal_type).slice(0, 64) : null,
            row.wastage_pct != null ? Number(row.wastage_pct) : null,
            row.mc_rate != null ? Number(row.mc_rate) : null,
            row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
            row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
            row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
            row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
            row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
            row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
            row.mc_type ? String(row.mc_type).slice(0, 32) : null,
        ];

        if (!existingSku.length) {
            await query(
                `INSERT INTO reseller_erp_design_skus (
                    reseller_user_id, style_id, sku, product_name, purity, metal_type,
                    wastage_pct, mc_rate, mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                    metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct, mc_type
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
                [resellerUserId, styleId, sku, ...vals],
            );
            skusCreated += 1;
        } else if (overwrite) {
            await query(
                `UPDATE reseller_erp_design_skus SET
                    product_name = $1, purity = $2, metal_type = $3, wastage_pct = $4,
                    mc_rate = $5, mc_rate_slab_r = $6, mc_rate_slab_w = $7, mc_rate_slab_f = $8,
                    metal_slab_r_pct = $9, metal_slab_w_pct = $10, metal_slab_f_pct = $11,
                    mc_type = $12, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $13`,
                [...vals, existingSku[0].id],
            );
            skusUpdated += 1;
        } else {
            await query(
                `UPDATE reseller_erp_design_skus SET
                    product_name = COALESCE(product_name, $1),
                    purity = COALESCE(purity, $2),
                    metal_type = COALESCE(metal_type, $3),
                    wastage_pct = COALESCE(wastage_pct, $4),
                    mc_rate = COALESCE(mc_rate, $5),
                    mc_rate_slab_r = COALESCE(mc_rate_slab_r, $6),
                    mc_rate_slab_w = COALESCE(mc_rate_slab_w, $7),
                    mc_rate_slab_f = COALESCE(mc_rate_slab_f, $8),
                    metal_slab_r_pct = COALESCE(metal_slab_r_pct, $9),
                    metal_slab_w_pct = COALESCE(metal_slab_w_pct, $10),
                    metal_slab_f_pct = COALESCE(metal_slab_f_pct, $11),
                    mc_type = COALESCE(mc_type, $12),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $13`,
                [...vals, existingSku[0].id],
            );
            skusUpdated += 1;
        }
    }

    return {
        totalStockPairs: rows.length,
        stylesCreated,
        skusCreated,
        skusUpdated,
        skipped,
    };
}

function registerDesignMasterRoutes(app, deps) {
    const { query, checkAuth, erpGate, requireJson, pool } = deps;

    ensureDesignMasterSchema(pool).catch((e) => console.warn('design master schema:', e.message));

    app.get('/api/reseller/erp/design-master/tree', checkAuth, erpGate, async (req, res) => {
        try {
            const styles = await query(
                `SELECT id, style_code, style_name, created_at, updated_at
                 FROM reseller_erp_design_styles
                 WHERE reseller_user_id = $1
                 ORDER BY style_code`,
                [req.user.id],
            );
            const skus = await query(
                `SELECT sk.id, sk.style_id, sk.sku, sk.product_name, sk.purity, sk.metal_type,
                        sk.wastage_pct, sk.mc_rate, sk.mc_rate_slab_r, sk.mc_rate_slab_w, sk.mc_rate_slab_f,
                        sk.metal_slab_r_pct, sk.metal_slab_w_pct, sk.metal_slab_f_pct, sk.mc_type
                 FROM reseller_erp_design_skus sk
                 WHERE sk.reseller_user_id = $1
                 ORDER BY sk.sku`,
                [req.user.id],
            );
            const byStyle = Object.create(null);
            for (const s of styles) {
                byStyle[s.id] = { ...s, skus: [] };
            }
            for (const sk of skus) {
                if (byStyle[sk.style_id]) byStyle[sk.style_id].skus.push(mapDesignSku(sk));
            }
            res.json({ tree: styles.map((s) => byStyle[s.id]) });
        } catch (e) {
            console.error('design master tree:', e);
            res.status(500).json({ error: e.message || 'Failed to load design master' });
        }
    });

    app.get('/api/reseller/erp/design-master/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const style = req.query.style_code || req.query.style;
            const sku = req.query.sku;
            const defaults = await lookupDesignDefaults(query, req.user.id, style, sku);
            res.json({ defaults });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    app.post('/api/reseller/erp/design-master/styles', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const code = String(req.body.style_code || '').trim().slice(0, 128);
            if (!code) return res.status(400).json({ error: 'style_code required' });
            const name = String(req.body.style_name || code).trim().slice(0, 255);
            const rows = await query(
                `INSERT INTO reseller_erp_design_styles (reseller_user_id, style_code, style_name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (reseller_user_id, style_code) DO UPDATE SET
                    style_name = EXCLUDED.style_name,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [req.user.id, code, name],
            );
            res.json({ style: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save style' });
        }
    });

    app.put('/api/reseller/erp/design-master/skus/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const body = req.body || {};
            const num = (k) => (body[k] != null && body[k] !== '' ? Number(body[k]) : null);
            const rows = await query(
                `UPDATE reseller_erp_design_skus SET
                    product_name = COALESCE($1, product_name),
                    purity = $2, metal_type = $3, wastage_pct = $4,
                    mc_rate = $5, mc_rate_slab_r = $6, mc_rate_slab_w = $7, mc_rate_slab_f = $8,
                    metal_slab_r_pct = $9, metal_slab_w_pct = $10, metal_slab_f_pct = $11,
                    mc_type = $12, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $13 AND reseller_user_id = $14
                 RETURNING *`,
                [
                    body.product_name != null ? String(body.product_name).slice(0, 255) : null,
                    num('purity'),
                    body.metal_type != null ? String(body.metal_type).slice(0, 64) : null,
                    num('wastage_pct'),
                    num('mc_rate'),
                    num('mc_rate_slab_r'),
                    num('mc_rate_slab_w'),
                    num('mc_rate_slab_f'),
                    num('metal_slab_r_pct'),
                    num('metal_slab_w_pct'),
                    num('metal_slab_f_pct'),
                    body.mc_type != null ? String(body.mc_type).slice(0, 32) : null,
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'SKU not found' });
            const updatedStock = await propagateDesignSkuToStock(query, req.user.id, id);
            res.json({ sku: mapDesignSku({ ...rows[0], style_code: body.style_code }), stockPiecesUpdated: updatedStock });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to update SKU' });
        }
    });

    app.post('/api/reseller/erp/design-master/skus', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const styleCode = String(req.body.style_code || '').trim();
            const sku = String(req.body.sku || '').trim();
            if (!styleCode || !sku) return res.status(400).json({ error: 'style_code and sku required' });
            let styleRows = await query(
                `SELECT id FROM reseller_erp_design_styles
                 WHERE reseller_user_id = $1 AND upper(trim(style_code)) = upper(trim($2))`,
                [req.user.id, styleCode],
            );
            let styleId = styleRows[0]?.id;
            if (!styleId) {
                const ins = await query(
                    `INSERT INTO reseller_erp_design_styles (reseller_user_id, style_code, style_name)
                     VALUES ($1, $2, $2) RETURNING id`,
                    [req.user.id, styleCode.slice(0, 128)],
                );
                styleId = ins[0].id;
            }
            const num = (k) => (req.body[k] != null && req.body[k] !== '' ? Number(req.body[k]) : null);
            const rows = await query(
                `INSERT INTO reseller_erp_design_skus (
                    reseller_user_id, style_id, sku, product_name, purity, metal_type,
                    wastage_pct, mc_rate, mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                    metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct, mc_type
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
                 ON CONFLICT (reseller_user_id, style_id, sku) DO UPDATE SET
                    product_name = EXCLUDED.product_name,
                    purity = EXCLUDED.purity,
                    metal_type = EXCLUDED.metal_type,
                    wastage_pct = EXCLUDED.wastage_pct,
                    mc_rate = EXCLUDED.mc_rate,
                    mc_rate_slab_r = EXCLUDED.mc_rate_slab_r,
                    mc_rate_slab_w = EXCLUDED.mc_rate_slab_w,
                    mc_rate_slab_f = EXCLUDED.mc_rate_slab_f,
                    metal_slab_r_pct = EXCLUDED.metal_slab_r_pct,
                    metal_slab_w_pct = EXCLUDED.metal_slab_w_pct,
                    metal_slab_f_pct = EXCLUDED.metal_slab_f_pct,
                    mc_type = EXCLUDED.mc_type,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [
                    req.user.id,
                    styleId,
                    sku.slice(0, 128),
                    req.body.product_name ? String(req.body.product_name).slice(0, 255) : null,
                    num('purity'),
                    req.body.metal_type ? String(req.body.metal_type).slice(0, 64) : null,
                    num('wastage_pct'),
                    num('mc_rate'),
                    num('mc_rate_slab_r'),
                    num('mc_rate_slab_w'),
                    num('mc_rate_slab_f'),
                    num('metal_slab_r_pct'),
                    num('metal_slab_w_pct'),
                    num('metal_slab_f_pct'),
                    req.body.mc_type ? String(req.body.mc_type).slice(0, 32) : null,
                ],
            );
            const updatedStock = await propagateDesignSkuToStock(query, req.user.id, rows[0].id);
            res.json({ sku: mapDesignSku(rows[0]), stockPiecesUpdated: updatedStock });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to create SKU' });
        }
    });

    app.delete('/api/reseller/erp/design-master/skus/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            await query(
                `DELETE FROM reseller_erp_design_skus WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete SKU' });
        }
    });

    app.post('/api/reseller/erp/design-master/seed-from-stock', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const batchId = req.body.batch_id ? String(req.body.batch_id).trim() : null;
            const overwrite = !!req.body.overwrite;
            const result = await seedDesignMasterFromStock(query, req.user.id, {
                batch_id: batchId,
                overwrite,
            });
            res.json({ success: true, ...result });
        } catch (e) {
            console.error('design master seed:', e);
            res.status(500).json({ error: e.message || 'Failed to import from stock' });
        }
    });
}

module.exports = {
    ensureDesignMasterSchema,
    lookupDesignDefaults,
    applyDesignDefaultsToPiece,
    propagateDesignSkuToStock,
    seedDesignMasterFromStock,
    registerDesignMasterRoutes,
};

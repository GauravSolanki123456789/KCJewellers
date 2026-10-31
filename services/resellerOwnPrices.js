/**
 * Per-reseller catalogue prices — gift MRP and silver wastage/MC or fixed MRP.
 * Only applied on that reseller's website, shared catalogues, PDFs and WhatsApp.
 */

const { classifyCatalogMetalFamily, sqlProductMatchesCatalogMetal } = require('./catalogMetalFamily');
const { parseAllowedCategoryMetals, categoryHasMetalInScope } = require('./resellerCatalogScope');
const { resolveStorefrontResellerIdFromReq } = require('./storefrontTenantAuth');

async function ensureOwnPricesSchema(pool) {
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_own_prices_enabled BOOLEAN NOT NULL DEFAULT false;
        CREATE TABLE IF NOT EXISTS reseller_product_price_overrides (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES web_products(id) ON DELETE CASCADE,
            mode VARCHAR(24) NOT NULL DEFAULT 'fixed_mrp',
            fixed_price NUMERIC(14, 2),
            wastage_pct NUMERIC(8, 3),
            mc_rate NUMERIC(14, 4),
            mc_type VARCHAR(32),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, product_id)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_price_overrides_owner
            ON reseller_product_price_overrides (reseller_user_id);
    `);
}

async function isOwnPricesEnabled(query, resellerUserId) {
    const id = parseInt(String(resellerUserId), 10);
    if (!Number.isFinite(id) || id <= 0) return false;
    try {
        const rows = await query(
            `SELECT COALESCE(reseller_own_prices_enabled, false) AS on
             FROM users WHERE id = $1 LIMIT 1`,
            [id],
        );
        return !!rows[0]?.on;
    } catch (e) {
        if (String(e.message || '').includes('reseller_own_prices_enabled')) return false;
        throw e;
    }
}

function mergeOverrideOntoProduct(product, override) {
    if (!product || !override) return product;
    const mode = String(override.mode || 'fixed_mrp').toLowerCase();
    const next = { ...product };
    if (mode === 'wastage_mc') {
        if (override.wastage_pct != null && override.wastage_pct !== '') {
            const w = Number(override.wastage_pct);
            if (Number.isFinite(w) && w >= 0) next.wastage_pct = w;
        }
        if (override.mc_rate != null && override.mc_rate !== '') {
            const m = Number(override.mc_rate);
            if (Number.isFinite(m) && m >= 0) next.mc_rate = m;
        }
        if (override.mc_type) next.mc_type = String(override.mc_type).slice(0, 32);
        return next;
    }
    const fp = Number(override.fixed_price);
    if (Number.isFinite(fp) && fp > 0) {
        next.fixed_price = fp;
        next.own_price_fixed = true;
    }
    return next;
}

async function applyOwnPricesToProducts(query, resellerUserId, products) {
    if (!Array.isArray(products) || !products.length) return products;
    const uid = parseInt(String(resellerUserId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return products;
    const enabled = await isOwnPricesEnabled(query, uid);
    if (!enabled) return products;
    const ids = [
        ...new Set(
            products
                .map((p) => parseInt(String(p?.id), 10))
                .filter((n) => Number.isFinite(n) && n > 0),
        ),
    ];
    if (!ids.length) return products;
    const rows = await query(
        `SELECT product_id, mode, fixed_price, wastage_pct, mc_rate, mc_type
         FROM reseller_product_price_overrides
         WHERE reseller_user_id = $1 AND product_id = ANY($2::int[])`,
        [uid, ids],
    );
    if (!rows.length) return products;
    const byId = new Map(rows.map((r) => [Number(r.product_id), r]));
    return products.map((p) => {
        const o = byId.get(Number(p.id));
        return o ? mergeOverrideOntoProduct(p, o) : p;
    });
}

async function applyOwnPricesForRequest(query, req, products) {
    const fromHost = await resolveStorefrontResellerIdFromReq(req).catch(() => null);
    if (fromHost) return applyOwnPricesToProducts(query, fromHost, products);
    const domainRaw = String(req?.query?.domain || '').trim().toLowerCase();
    if (domainRaw) {
        const { findResellerByDomain } = require('./resellerMetalRates');
        const row = await findResellerByDomain(domainRaw).catch(() => null);
        if (row?.id) return applyOwnPricesToProducts(query, row.id, products);
    }
    return products;
}

function isGiftOwnPriceMetal(metalType) {
    const family = classifyCatalogMetalFamily(metalType);
    const mt = String(metalType || '').toLowerCase();
    return (
        family === 'gifting' ||
        mt.includes('gift') ||
        mt.includes('gifting') ||
        mt.includes('plated') ||
        mt.includes('brooch')
    );
}

function parseMode(raw, metalType) {
    if (isGiftOwnPriceMetal(metalType)) return 'fixed_mrp';
    const m = String(raw || 'fixed_mrp').toLowerCase();
    if (m === 'wastage_mc') return 'wastage_mc';
    return 'fixed_mrp';
}

function ownPriceMetalAllowed(metalType) {
    const family = classifyCatalogMetalFamily(metalType);
    return family === 'gifting' || family === 'silver' || family === 'other' || isGiftOwnPriceMetal(metalType);
}

async function loadResellerScope(query, userId) {
    const userRows = await query(
        `SELECT allowed_category_ids, COALESCE(allowed_category_metals, '{}'::jsonb) AS allowed_category_metals
         FROM users WHERE id = $1 LIMIT 1`,
        [userId],
    );
    const allowed = Array.isArray(userRows[0]?.allowed_category_ids)
        ? userRows[0].allowed_category_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
        : [];
    return {
        allowed,
        metalsMap: parseAllowedCategoryMetals(userRows[0]?.allowed_category_metals),
    };
}

async function loadOwnPriceProduct(query, productId) {
    const rows = await query(
        `SELECT wp.id, wp.metal_type, wc.id AS category_id
         FROM web_products wp
         LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         LEFT JOIN web_categories wc ON wc.id = ws.category_id
         WHERE wp.id = $1
         LIMIT 1`,
        [productId],
    );
    return rows[0] || null;
}

function productInResellerOwnPriceScope(product, scope) {
    if (!product) return false;
    if (!ownPriceMetalAllowed(product.metal_type)) return false;
    if (!scope.allowed.length) return true;
    const catId = parseInt(String(product.category_id), 10);
    if (!Number.isFinite(catId) || !scope.allowed.includes(catId)) return false;
    const family = classifyCatalogMetalFamily(product.metal_type);
    const metalKey = family === 'gifting' ? 'gifting' : 'silver';
    return categoryHasMetalInScope(catId, metalKey, scope.allowed, scope.metalsMap);
}

function registerResellerOwnPriceRoutes(app, deps) {
    const { query, pool, requireSharedCatalogCreator, requireJson } = deps;
    ensureOwnPricesSchema(pool).catch((e) => console.warn('own prices schema:', e.message));

    const gate = [requireSharedCatalogCreator];

    app.get('/api/reseller/own-prices/status', ...gate, async (req, res) => {
        try {
            const on = await isOwnPricesEnabled(query, req.user.id);
            res.json({ enabled: on });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load status' });
        }
    });

    app.get('/api/reseller/own-prices/products', ...gate, async (req, res) => {
        try {
            await ensureOwnPricesSchema(pool);
            const on = await isOwnPricesEnabled(query, req.user.id);
            if (!on) return res.status(403).json({ error: 'Own prices are not enabled for this account' });
            const metal = String(req.query.metal || 'gifting').toLowerCase();
            const metalKey = metal === 'silver' ? 'silver' : 'gifting';
            const q = String(req.query.q || '').trim().slice(0, 80);
            const mine =
                req.query.mine === '1' ||
                String(req.query.mine || '').toLowerCase() === 'true';
            const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
            const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
            const userRows = await query(
                `SELECT allowed_category_ids, COALESCE(allowed_category_metals, '{}'::jsonb) AS allowed_category_metals
                 FROM users WHERE id = $1 LIMIT 1`,
                [req.user.id],
            );
            const allAllowed = Array.isArray(userRows[0]?.allowed_category_ids)
                ? userRows[0].allowed_category_ids.map((n) => parseInt(String(n), 10)).filter((n) => n > 0)
                : [];
            const metalsMap = parseAllowedCategoryMetals(userRows[0]?.allowed_category_metals);
            const allowed = allAllowed.length
                ? allAllowed.filter((id) => categoryHasMetalInScope(id, metalKey, allAllowed, metalsMap))
                : [];
            if (allAllowed.length && !allowed.length) {
                return res.json({ products: [], total: 0, metal: metalKey });
            }
            const params = [req.user.id];
            let wp = 2;
            let where = `(wp.is_active IS NULL OR wp.is_active = true) AND (${sqlProductMatchesCatalogMetal('wp.metal_type', metalKey)})`;
            if (allowed.length) {
                params.push(allowed);
                where += ` AND wc.id = ANY($${wp++}::int[])`;
            }
            if (q) {
                params.push(`%${q}%`);
                where += ` AND (wp.name ILIKE $${wp} OR wp.sku ILIKE $${wp} OR wp.barcode ILIKE $${wp} OR wc.name ILIKE $${wp} OR ws.name ILIKE $${wp} OR COALESCE(wp.size,'') ILIKE $${wp})`;
                wp++;
            }
            if (mine) {
                where += ` AND o.product_id IS NOT NULL`;
            }
            const fromSql = `
                 FROM web_products wp
                 LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
                 LEFT JOIN web_categories wc ON wc.id = ws.category_id
                 LEFT JOIN reseller_product_price_overrides o
                   ON o.product_id = wp.id AND o.reseller_user_id = $1`;
            const countRows = await query(
                `SELECT COUNT(*)::int AS n ${fromSql} WHERE ${where}`,
                params,
            );
            const limPh = wp;
            const offPh = wp + 1;
            const rows = await query(
                `SELECT wp.id, wp.sku, wp.barcode, wp.name, wp.size, wp.image_url,
                        wp.metal_type, wp.mc_type, wp.mc_rate::float AS mc_rate,
                        wp.wastage_pct::float AS wastage_pct,
                        COALESCE(wp.fixed_price, 0)::float AS catalog_fixed_price,
                        wp.net_weight::float AS net_weight,
                        wc.id AS category_id, wc.name AS style_code, ws.name AS sku_code,
                        o.mode AS override_mode, o.fixed_price::float AS override_fixed_price,
                        o.wastage_pct::float AS override_wastage_pct,
                        o.mc_rate::float AS override_mc_rate,
                        o.mc_type AS override_mc_type,
                        (o.product_id IS NOT NULL) AS has_override
                 ${fromSql}
                 WHERE ${where}
                 ORDER BY wc.name, ws.name, wp.size NULLS LAST, wp.name, wp.id
                 LIMIT $${limPh} OFFSET $${offPh}`,
                [...params, limit, offset],
            );
            res.json({
                products: rows,
                total: Number(countRows[0]?.n || 0),
                metal: metalKey,
            });
        } catch (e) {
            console.error('own-prices list:', e);
            res.status(500).json({ error: e.message || 'Failed to load products' });
        }
    });

    app.put('/api/reseller/own-prices/products/:id', ...gate, requireJson, async (req, res) => {
        try {
            await ensureOwnPricesSchema(pool);
            const on = await isOwnPricesEnabled(query, req.user.id);
            if (!on) return res.status(403).json({ error: 'Own prices are not enabled for this account' });
            const productId = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(productId)) return res.status(400).json({ error: 'Invalid product' });
            const prod = await loadOwnPriceProduct(query, productId);
            if (!prod) return res.status(404).json({ error: 'Product not found' });
            const scope = await loadResellerScope(query, req.user.id);
            if (!productInResellerOwnPriceScope(prod, scope)) {
                return res.status(403).json({ error: 'This product is not in your catalogue' });
            }
            const mode = parseMode(req.body.mode, prod.metal_type);
            const clear = req.body.clear === true;
            if (clear) {
                await query(
                    `DELETE FROM reseller_product_price_overrides
                     WHERE reseller_user_id = $1 AND product_id = $2`,
                    [req.user.id, productId],
                );
                return res.json({ success: true, cleared: true });
            }
            const fp = parseFloat(String(req.body.fixed_price ?? '').replace(/,/g, ''));
            const wastage = parseFloat(String(req.body.wastage_pct ?? '').replace(/,/g, ''));
            const mc = parseFloat(String(req.body.mc_rate ?? '').replace(/,/g, ''));
            const mcType = String(req.body.mc_type || '').trim().slice(0, 32) || null;
            if (mode === 'fixed_mrp' && (!Number.isFinite(fp) || fp <= 0)) {
                return res.status(400).json({ error: 'Enter a fixed price' });
            }
            if (
                mode === 'wastage_mc' &&
                !Number.isFinite(wastage) &&
                !Number.isFinite(mc) &&
                !mcType
            ) {
                return res.status(400).json({ error: 'Enter wastage, making charge, or both' });
            }
            await query(
                `INSERT INTO reseller_product_price_overrides (
                    reseller_user_id, product_id, mode, fixed_price, wastage_pct, mc_rate, mc_type, updated_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                 ON CONFLICT (reseller_user_id, product_id) DO UPDATE SET
                    mode = EXCLUDED.mode,
                    fixed_price = EXCLUDED.fixed_price,
                    wastage_pct = EXCLUDED.wastage_pct,
                    mc_rate = EXCLUDED.mc_rate,
                    mc_type = EXCLUDED.mc_type,
                    updated_at = NOW()`,
                [
                    req.user.id,
                    productId,
                    mode,
                    mode === 'fixed_mrp' && Number.isFinite(fp) ? Math.round(fp * 100) / 100 : null,
                    Number.isFinite(wastage) && wastage >= 0 ? wastage : null,
                    Number.isFinite(mc) && mc >= 0 ? mc : null,
                    mcType,
                ],
            );
            res.json({ success: true });
        } catch (e) {
            console.error('own-prices save:', e);
            res.status(500).json({ error: e.message || 'Failed to save price' });
        }
    });

    app.put('/api/reseller/own-prices/bulk', ...gate, requireJson, async (req, res) => {
        try {
            await ensureOwnPricesSchema(pool);
            const on = await isOwnPricesEnabled(query, req.user.id);
            if (!on) return res.status(403).json({ error: 'Own prices are not enabled for this account' });
            const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 500) : [];
            const scope = await loadResellerScope(query, req.user.id);
            let saved = 0;
            for (const item of items) {
                const productId = parseInt(String(item.product_id || item.id), 10);
                if (!Number.isFinite(productId)) continue;
                const prodRow = await loadOwnPriceProduct(query, productId);
                if (!prodRow || !productInResellerOwnPriceScope(prodRow, scope)) continue;
                const prod = [prodRow];
                if (item.clear === true) {
                    await query(
                        `DELETE FROM reseller_product_price_overrides
                         WHERE reseller_user_id = $1 AND product_id = $2`,
                        [req.user.id, productId],
                    );
                    saved++;
                    continue;
                }
                const mode = parseMode(item.mode, prod[0].metal_type);
                const fp = parseFloat(String(item.fixed_price ?? '').replace(/,/g, ''));
                const wastage = parseFloat(String(item.wastage_pct ?? '').replace(/,/g, ''));
                const mc = parseFloat(String(item.mc_rate ?? '').replace(/,/g, ''));
                const mcType = String(item.mc_type || '').trim().slice(0, 32) || null;
                if (mode === 'fixed_mrp' && (!Number.isFinite(fp) || fp <= 0)) continue;
                if (
                    mode === 'wastage_mc' &&
                    !Number.isFinite(wastage) &&
                    !Number.isFinite(mc) &&
                    !mcType
                ) {
                    continue;
                }
                await query(
                    `INSERT INTO reseller_product_price_overrides (
                        reseller_user_id, product_id, mode, fixed_price, wastage_pct, mc_rate, mc_type, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                     ON CONFLICT (reseller_user_id, product_id) DO UPDATE SET
                        mode = EXCLUDED.mode,
                        fixed_price = EXCLUDED.fixed_price,
                        wastage_pct = EXCLUDED.wastage_pct,
                        mc_rate = EXCLUDED.mc_rate,
                        mc_type = EXCLUDED.mc_type,
                        updated_at = NOW()`,
                    [
                        req.user.id,
                        productId,
                        mode,
                        mode === 'fixed_mrp' && Number.isFinite(fp) ? Math.round(fp * 100) / 100 : null,
                        Number.isFinite(wastage) && wastage >= 0 ? wastage : null,
                        Number.isFinite(mc) && mc >= 0 ? mc : null,
                        mcType,
                    ],
                );
                saved++;
            }
            res.json({ success: true, saved });
        } catch (e) {
            console.error('own-prices bulk:', e);
            res.status(500).json({ error: e.message || 'Failed to save prices' });
        }
    });
}

module.exports = {
    ensureOwnPricesSchema,
    isOwnPricesEnabled,
    applyOwnPricesToProducts,
    applyOwnPricesForRequest,
    registerResellerOwnPriceRoutes,
};

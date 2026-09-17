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
            invoice_item_name VARCHAR(255),
            hsn_code VARCHAR(32),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, style_id, sku)
        );
    `);
    await pool.query(`
        ALTER TABLE reseller_erp_design_skus ADD COLUMN IF NOT EXISTS invoice_item_name VARCHAR(255);
        ALTER TABLE reseller_erp_design_skus ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(32);
        ALTER TABLE reseller_erp_design_skus ADD COLUMN IF NOT EXISTS fixed_price NUMERIC(12, 2);
        ALTER TABLE reseller_erp_design_skus ADD COLUMN IF NOT EXISTS product_names JSONB;
        CREATE TABLE IF NOT EXISTS reseller_erp_design_sku_sizes (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sku_id INTEGER NOT NULL REFERENCES reseller_erp_design_skus(id) ON DELETE CASCADE,
            size_label VARCHAR(128) NOT NULL,
            fixed_price_mrp NUMERIC(12, 2),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (sku_id, size_label)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_design_sku_sizes_sku
            ON reseller_erp_design_sku_sizes (sku_id);
    `);
}

function parseProductNames(raw) {
    if (!raw) return [];
    let list = raw;
    if (typeof raw === 'string') {
        try {
            list = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
        const name = String(item?.name || item?.product_name || item || '').trim();
        if (!name) continue;
        const key = name.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = {
            name,
            image_url: item?.image_url || item?.imageUrl || null,
        };
        const num = (k) => {
            const v = item?.[k];
            if (v == null || v === '') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };
        if (item?.mc_rate != null) entry.mc_rate = num('mc_rate');
        if (item?.mc_type) entry.mc_type = String(item.mc_type);
        if (item?.wastage_pct != null) entry.wastage_pct = num('wastage_pct');
        if (item?.purity != null) entry.purity = num('purity');
        if (item?.metal_type) entry.metal_type = String(item.metal_type);
        if (item?.fixed_price != null) entry.fixed_price = num('fixed_price');
        if (Array.isArray(item?.sizes) && item.sizes.length) entry.sizes = item.sizes;
        if (Array.isArray(item?.box_options) && item.box_options.length) entry.box_options = item.box_options;
        if (Array.isArray(item?.finish_options) && item.finish_options.length) {
            entry.finish_options = item.finish_options;
        }
        out.push(entry);
    }
    return out;
}

function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function normalizeCatalogProductName(name) {
    return String(name || '')
        .trim()
        .replace(/\s+GP\s*$/i, '')
        .replace(/\s+STANDARD\s*$/i, '')
        .trim();
}

function detectFinishLabel(row) {
    const name = String(row.name || row.product_name || '').trim();
    const dg = String(row.design_group || '').trim();
    if (/\bGP\b/i.test(name) || /\bGP\b/i.test(dg)) return 'GP';
    if (/\bSTANDARD\b/i.test(name) || /\bSTANDARD\b/i.test(dg)) return 'Standard';
    return null;
}

/** Normalize catalogue labels for exact Style/SKU matching (spaces/underscores/hyphens). */
function normCatalogLabel(s) {
    return String(s || '')
        .toUpperCase()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Exact category (style) match — avoids SILVER GIFT matching SILVER GIFT ITEMS via LIKE. */
function styleCatalogExactSql(paramRef) {
    return `(
             ${paramRef} = ''
             OR UPPER(REPLACE(REPLACE(TRIM(wc.name), '_', ' '), '-', ' ')) = ${paramRef}
             OR UPPER(REPLACE(COALESCE(wc.slug, ''), '-', ' ')) = ${paramRef}
             OR UPPER(REPLACE(COALESCE(wc.slug, ''), '-', '_')) = REPLACE(${paramRef}, ' ', '_')
           )`;
}

/** Exact subcategory (SKU) match. */
function skuCatalogExactSql(paramRef) {
    return `(
             UPPER(REPLACE(REPLACE(TRIM(ws.name), ' ', '_'), '-', '_')) = ${paramRef}
             OR UPPER(REPLACE(REPLACE(TRIM(ws.name), '_', ' '), '-', ' ')) = REPLACE(${paramRef}, '_', ' ')
             OR UPPER(REPLACE(COALESCE(ws.slug, ''), '-', '_')) = ${paramRef}
             OR UPPER(REPLACE(COALESCE(ws.slug, ''), '-', ' ')) = REPLACE(${paramRef}, '_', ' ')
           )`;
}

function buildCatalogProductDetails(rows) {
    const groups = new Map();
    for (const row of rows) {
        const dg = String(row.design_group || '').trim();
        const baseName = dg || normalizeCatalogProductName(row.name || row.product_name) || 'ITEM';
        const groupKey = `${row.subcategory_id || ''}::${baseName.toUpperCase()}`;
        const bucket = groups.get(groupKey) || { name: baseName, rows: [] };
        bucket.rows.push(row);
        groups.set(groupKey, bucket);
    }

    const products = [];
    for (const { name, rows: groupRows } of groups.values()) {
        const image_url =
            groupRows.find((r) => r.image_url && String(r.image_url).trim())?.image_url || null;
        const lead = groupRows[0];
        const sizes = [];
        const sizeSeen = new Set();
        const boxOptions = [];
        const boxSeen = new Set();
        const finishOptions = [];
        const finishSeen = new Set();

        for (const r of groupRows) {
            const sizeLabel = String(r.size || r.weight_display || '').trim();
            if (sizeLabel) {
                const sk = sizeLabel.toUpperCase();
                if (!sizeSeen.has(sk)) {
                    sizeSeen.add(sk);
                    sizes.push({
                        size_label: sizeLabel,
                        net_weight: numOrNull(r.net_weight),
                        gross_weight: numOrNull(r.gross_weight),
                        mc_rate: numOrNull(r.mc_rate),
                        mc_type: r.mc_type || null,
                        wastage_pct: numOrNull(r.wastage_pct),
                        purity: numOrNull(r.purity),
                        fixed_price: numOrNull(r.fixed_price),
                        box_charges: numOrNull(r.box_charges),
                        stone_charges: numOrNull(r.stone_charges),
                    });
                }
            }

            const boxCharge = numOrNull(r.box_charges);
            const nameHint = `${r.name || ''} ${r.design_group || ''}`.toUpperCase();
            const looksLikeBoxVariant =
                (boxCharge != null && boxCharge > 0) ||
                /\bWITH\s*BOX\b/.test(nameHint) ||
                /\bWITHOUT\s*BOX\b/.test(nameHint);
            if (looksLikeBoxVariant) {
                const withoutKey = 'WITHOUT BOX';
                const withKey = 'WITH BOX';
                if (!boxSeen.has(withoutKey)) {
                    boxSeen.add(withoutKey);
                    const baseRow =
                        groupRows.find((x) => !numOrNull(x.box_charges) || numOrNull(x.box_charges) === 0) ||
                        r;
                    boxOptions.push({
                        label: 'Without box',
                        box_charges: 0,
                        fixed_price: numOrNull(baseRow.fixed_price),
                    });
                }
                if (!boxSeen.has(withKey) && boxCharge != null && boxCharge > 0) {
                    boxSeen.add(withKey);
                    boxOptions.push({
                        label: 'With box',
                        box_charges: boxCharge,
                        fixed_price: numOrNull(r.fixed_price),
                    });
                }
            }

            const finish = detectFinishLabel(r);
            if (finish) {
                const fk = finish.toUpperCase();
                if (!finishSeen.has(fk)) {
                    finishSeen.add(fk);
                    finishOptions.push({
                        label: finish,
                        stone_charges: numOrNull(r.stone_charges) || 0,
                        fixed_price: numOrNull(r.fixed_price),
                    });
                }
            }
        }

        const distinctBoxCharges = [
            ...new Set(groupRows.map((r) => numOrNull(r.box_charges) || 0)),
        ].sort((a, b) => a - b);
        const maxBoxCharge = Math.max(...distinctBoxCharges, 0);
        if (maxBoxCharge > 0 || distinctBoxCharges.length > 1) {
            const withoutKey = 'WITHOUT BOX';
            const withKey = 'WITH BOX';
            if (!boxSeen.has(withoutKey)) {
                const baseRow =
                    groupRows.find((x) => !numOrNull(x.box_charges) || numOrNull(x.box_charges) === 0) ||
                    groupRows[0];
                boxSeen.add(withoutKey);
                boxOptions.push({
                    label: 'Without box',
                    box_charges: 0,
                    fixed_price: numOrNull(baseRow.fixed_price),
                });
            }
            if (!boxSeen.has(withKey) && maxBoxCharge > 0) {
                const withRow =
                    groupRows.find((x) => (numOrNull(x.box_charges) || 0) === maxBoxCharge) ||
                    groupRows[0];
                boxSeen.add(withKey);
                boxOptions.push({
                    label: 'With box',
                    box_charges: maxBoxCharge,
                    fixed_price: numOrNull(withRow.fixed_price),
                });
            }
        }

        const distinctFixed = [
            ...new Map(
                groupRows
                    .map((r) => numOrNull(r.fixed_price))
                    .filter((p) => p != null && p > 0)
                    .map((p) => [p, p]),
            ).values(),
        ].sort((a, b) => a - b);
        if (finishOptions.length < 2 && distinctFixed.length >= 2) {
            const lower = distinctFixed[0];
            const upper = distinctFixed[distinctFixed.length - 1];
            const lowerRow =
                groupRows.find((r) => numOrNull(r.fixed_price) === lower) || groupRows[0];
            const upperRow =
                groupRows.find((r) => numOrNull(r.fixed_price) === upper) || groupRows[0];
            finishOptions.length = 0;
            finishSeen.clear();
            finishOptions.push({
                label: 'Standard',
                stone_charges: numOrNull(lowerRow.stone_charges) || 0,
                fixed_price: lower,
            });
            finishOptions.push({
                label: 'GP',
                stone_charges: numOrNull(upperRow.stone_charges) || 0,
                fixed_price: upper,
            });
            finishSeen.add('STANDARD');
            finishSeen.add('GP');
        }

        const product = {
            name,
            image_url,
            mc_rate: numOrNull(lead.mc_rate),
            mc_type: lead.mc_type || null,
            wastage_pct: numOrNull(lead.wastage_pct),
            purity: numOrNull(lead.purity),
            metal_type: lead.metal_type || 'silver',
            fixed_price: numOrNull(lead.fixed_price),
            net_weight: numOrNull(lead.net_weight),
        };
        if (sizes.length) product.sizes = sizes;
        if (boxOptions.length >= 2) product.box_options = boxOptions;
        if (finishOptions.length >= 2) product.finish_options = finishOptions;
        else if (finishOptions.length === 1 && sizes.length <= 1) {
            product.default_finish = finishOptions[0].label;
            product.stone_charges = finishOptions[0].stone_charges;
        }
        products.push(product);
    }

    products.sort((a, b) => a.name.localeCompare(b.name));
    return products;
}

/** Product-level slugs (e.g. god-frames-balaji-padmavathi-8.5) are not design SKUs. */
function isLikelyProductSlugSku(sku) {
    const s = String(sku || '').trim();
    if (!s) return true;
    if (/[a-z]/.test(s) && s.includes('-')) return true;
    if (/\d+\.\d+/.test(s) && s.includes('-')) return true;
    if ((s.match(/-/g) || []).length >= 2) return true;
    return false;
}

async function queryCatalogSkusForStyle(query, styleCode) {
    const styleNorm = normCatalogLabel(styleCode);
    const rows = await query(
        `SELECT DISTINCT TRIM(ws.name) AS sku
         FROM web_subcategories ws
         JOIN web_categories wc ON wc.id = ws.category_id
         WHERE EXISTS (
             SELECT 1 FROM web_products wp
             WHERE wp.subcategory_id = ws.id
               AND (wp.is_active IS NULL OR wp.is_active = true)
         )
           AND ${styleCatalogExactSql('$1')}
         ORDER BY TRIM(ws.name)`,
        [styleNorm],
    );
    return (rows || [])
        .map((r) => String(r.sku || '').trim())
        .filter((sku) => sku && !isLikelyProductSlugSku(sku));
}

async function queryCatalogRows(query, styleCode, sku) {
    const skuNorm = String(sku || '').toUpperCase().replace(/[\s-]+/g, '_');
    const styleNorm = normCatalogLabel(styleCode);
    return query(
        `SELECT
            wp.id, wp.subcategory_id, wp.sku, wp.barcode, wp.name, wp.size, wp.image_url,
            wp.design_group,
            wp.gross_weight::float AS gross_weight,
            wp.net_weight::float AS net_weight,
            wp.weight_display,
            wp.wastage_pct::float AS wastage_pct,
            wp.purity::float AS purity,
            wp.mc_rate::float AS mc_rate,
            wp.mc_type,
            COALESCE(wp.fixed_price, 0)::float AS fixed_price,
            COALESCE(wp.stone_charges, 0)::float AS stone_charges,
            COALESCE(wp.box_charges, 0)::float AS box_charges,
            COALESCE(wp.metal_type, 'silver') AS metal_type
         FROM web_products wp
         JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         JOIN web_categories wc ON wc.id = ws.category_id
         WHERE (wp.is_active IS NULL OR wp.is_active = true)
           AND ${skuCatalogExactSql('$1')}
           AND ${styleCatalogExactSql('$2')}
         ORDER BY wp.design_group, wp.size, wp.name`,
        [skuNorm, styleNorm],
    );
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
        product_names: parseProductNames(row.product_names),
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
        invoice_item_name: row.invoice_item_name,
        hsn_code: row.hsn_code,
        fixed_price: row.fixed_price != null ? Number(row.fixed_price) : null,
        size_variants: row.size_variants || undefined,
    };
}

async function loadSkuSizes(query, skuId, resellerUserId) {
    const rows = await query(
        `SELECT id, size_label, fixed_price_mrp, sort_order
         FROM reseller_erp_design_sku_sizes
         WHERE sku_id = $1 AND reseller_user_id = $2
         ORDER BY sort_order, id`,
        [skuId, resellerUserId],
    );
    return rows.map((r) => ({
        id: r.id,
        size_label: r.size_label,
        fixed_price_mrp: r.fixed_price_mrp != null ? Number(r.fixed_price_mrp) : null,
        sort_order: r.sort_order,
    }));
}

async function importStyleCatalogFromWeb(query, resellerUserId, styleId) {
    const styleRows = await query(
        `SELECT id, style_code FROM reseller_erp_design_styles
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [styleId, resellerUserId],
    );
    if (!styleRows.length) throw new Error('Style not found');
    const styleCode = String(styleRows[0].style_code || '').trim();
    const skus = await queryCatalogSkusForStyle(query, styleCode);
    let skusCreated = 0;
    let skusUpdated = 0;
    for (const sku of skus) {
        const skuNorm = normKey(sku);
        if (!skuNorm) continue;
        let skuRows = await query(
            `SELECT id FROM reseller_erp_design_skus
             WHERE style_id = $1 AND reseller_user_id = $2 AND upper(trim(sku)) = $3
             LIMIT 1`,
            [styleId, resellerUserId, skuNorm],
        );
        let skuId;
        if (!skuRows.length) {
            const ins = await query(
                `INSERT INTO reseller_erp_design_skus (reseller_user_id, style_id, sku)
                 VALUES ($1, $2, $3) RETURNING id`,
                [resellerUserId, styleId, sku.trim()],
            );
            skuId = ins[0].id;
            skusCreated += 1;
        } else {
            skuId = skuRows[0].id;
        }
        const catalogRows = await queryCatalogRows(query, styleCode, sku);
        const products = buildCatalogProductDetails(catalogRows);
        if (!products.length) continue;
        const lead = products[0];
        await query(
            `UPDATE reseller_erp_design_skus SET
                product_names = $1::jsonb,
                mc_rate = COALESCE($2::float, mc_rate),
                mc_type = COALESCE(NULLIF($3::text, ''), mc_type),
                wastage_pct = COALESCE($4::float, wastage_pct),
                purity = COALESCE($5::float, purity),
                metal_type = COALESCE(NULLIF($6::text, ''), metal_type),
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND reseller_user_id = $8`,
            [
                JSON.stringify(products),
                lead.mc_rate,
                lead.mc_type || null,
                lead.wastage_pct,
                lead.purity,
                lead.metal_type || 'silver',
                skuId,
                resellerUserId,
            ],
        );
        skusUpdated += 1;
    }
    return {
        style_code: styleCode,
        skuCount: skus.length,
        skusCreated,
        skusUpdated,
    };
}

async function loadDesignMasterTreeForOffline(query, resellerUserId) {
    const styles = await query(
        `SELECT id, style_code, style_name
         FROM reseller_erp_design_styles
         WHERE reseller_user_id = $1
         ORDER BY style_code`,
        [resellerUserId],
    );
    const skus = await query(
        `SELECT sk.id, sk.style_id, sk.sku, sk.product_name, sk.product_names,
                sk.purity, sk.metal_type, sk.wastage_pct, sk.mc_rate,
                sk.mc_rate_slab_r, sk.mc_rate_slab_w, sk.mc_rate_slab_f,
                sk.metal_slab_r_pct, sk.metal_slab_w_pct, sk.metal_slab_f_pct,
                sk.mc_type, sk.invoice_item_name, sk.hsn_code, sk.fixed_price,
                ds.style_code
         FROM reseller_erp_design_skus sk
         JOIN reseller_erp_design_styles ds ON ds.id = sk.style_id
         WHERE sk.reseller_user_id = $1
         ORDER BY ds.style_code, sk.sku`,
        [resellerUserId],
    );
    const byStyle = Object.create(null);
    for (const s of styles) {
        byStyle[s.id] = {
            id: s.id,
            style_code: s.style_code,
            style_name: s.style_name,
            skus: [],
        };
    }
    for (const row of skus) {
        const style = byStyle[row.style_id];
        if (!style) continue;
        style.skus.push(mapDesignSku(row));
    }
    return Object.values(byStyle);
}

async function loadBillingCatalogForInvoiceItem(query, resellerUserId, invoiceItem) {
    const norm = String(invoiceItem || '').trim().toUpperCase();
    if (!norm) return [];
    const rows = await query(
        `SELECT ds.style_code, sk.sku, sk.product_name, sk.product_names, sk.invoice_item_name
         FROM reseller_erp_design_styles ds
         JOIN reseller_erp_design_skus sk
           ON sk.style_id = ds.id AND sk.reseller_user_id = ds.reseller_user_id
         WHERE ds.reseller_user_id = $1
           AND upper(trim(coalesce(sk.invoice_item_name, ''))) = $2
         ORDER BY ds.style_code, sk.sku`,
        [resellerUserId, norm],
    );
    const byStyle = Object.create(null);
    for (const r of rows) {
        const code = r.style_code;
        if (!byStyle[code]) byStyle[code] = { style_code: code, skus: [] };
        const skuKey = String(r.sku || '').trim().toUpperCase();
        if (byStyle[code].skus.some((s) => String(s.sku).trim().toUpperCase() === skuKey)) continue;
        byStyle[code].skus.push({
            sku: r.sku,
            product_name: r.product_name,
            product_names: parseProductNames(r.product_names),
        });
    }
    return Object.values(byStyle);
}

async function loadAllBillingCatalogsForOffline(query, resellerUserId, invoiceItems) {
    const names = new Set();
    for (const it of invoiceItems || []) {
        const n = String(it?.name || '').trim();
        if (n) names.add(n.toUpperCase());
    }
    const fromDb = await query(
        `SELECT DISTINCT upper(trim(invoice_item_name)) AS name
         FROM reseller_erp_design_skus
         WHERE reseller_user_id = $1 AND trim(coalesce(invoice_item_name, '')) <> ''`,
        [resellerUserId],
    );
    for (const row of fromDb || []) {
        if (row.name) names.add(String(row.name).trim().toUpperCase());
    }
    const out = Object.create(null);
    for (const upper of names) {
        const catalog = await loadBillingCatalogForInvoiceItem(query, resellerUserId, upper);
        const displayName =
            (invoiceItems || []).find((it) => it.name.trim().toUpperCase() === upper)?.name || upper;
        out[displayName] = catalog;
    }
    return out;
}

async function lookupDesignDefaults(query, resellerUserId, styleCode, sku) {
    const sc = normKey(styleCode);
    const sk = normKey(sku);
    if (!sc || !sk) return null;
    const rows = await query(
        `SELECT ds.id AS style_id, ds.style_code, ds.style_name,
                sk.id, sk.sku, sk.product_name, sk.product_names, sk.purity, sk.metal_type,
                sk.wastage_pct, sk.mc_rate, sk.mc_rate_slab_r, sk.mc_rate_slab_w, sk.mc_rate_slab_f,
                sk.metal_slab_r_pct, sk.metal_slab_w_pct, sk.metal_slab_f_pct, sk.mc_type,
                sk.invoice_item_name, sk.hsn_code, sk.fixed_price
         FROM reseller_erp_design_styles ds
         JOIN reseller_erp_design_skus sk ON sk.style_id = ds.id AND sk.reseller_user_id = ds.reseller_user_id
         WHERE ds.reseller_user_id = $1
           AND upper(trim(ds.style_code)) = $2
           AND upper(trim(sk.sku)) = $3
         LIMIT 1`,
        [resellerUserId, sc, sk],
    );
    if (!rows.length) return null;
    const mapped = mapDesignSku(rows[0]);
    mapped.size_variants = await loadSkuSizes(query, mapped.id, resellerUserId);
    return mapped;
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
    fill('invoice_item_name', defaults.invoice_item_name);
    fill('hsn_code', defaults.hsn_code);
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
        if (!styleCode || !sku || isLikelyProductSlugSku(sku)) {
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
                `SELECT sk.id, sk.style_id, sk.sku, sk.product_name, sk.product_names, sk.purity, sk.metal_type,
                        sk.wastage_pct, sk.mc_rate, sk.mc_rate_slab_r, sk.mc_rate_slab_w, sk.mc_rate_slab_f,
                        sk.metal_slab_r_pct, sk.metal_slab_w_pct, sk.metal_slab_f_pct, sk.mc_type,
                        sk.invoice_item_name, sk.hsn_code, sk.fixed_price
                 FROM reseller_erp_design_skus sk
                 WHERE sk.reseller_user_id = $1
                 ORDER BY sk.sku`,
                [req.user.id],
            );
            const sizeRows = await query(
                `SELECT sku_id, size_label, fixed_price_mrp, sort_order
                 FROM reseller_erp_design_sku_sizes
                 WHERE reseller_user_id = $1
                 ORDER BY sku_id, sort_order`,
                [req.user.id],
            );
            const sizesBySku = Object.create(null);
            for (const r of sizeRows) {
                if (!sizesBySku[r.sku_id]) sizesBySku[r.sku_id] = [];
                sizesBySku[r.sku_id].push({
                    size_label: r.size_label,
                    fixed_price_mrp: r.fixed_price_mrp != null ? Number(r.fixed_price_mrp) : null,
                });
            }
            const byStyle = Object.create(null);
            for (const s of styles) {
                byStyle[s.id] = { ...s, skus: [] };
            }
            for (const sk of skus) {
                if (!byStyle[sk.style_id]) continue;
                if (isLikelyProductSlugSku(sk.sku)) continue;
                const mapped = mapDesignSku(sk);
                mapped.size_variants = sizesBySku[sk.id] || [];
                byStyle[sk.style_id].skus.push(mapped);
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

    /** Styles + SKUs filtered by invoice item name (billing A/S/B shortcuts). */
    app.get('/api/reseller/erp/design-master/billing-catalog', checkAuth, erpGate, async (req, res) => {
        try {
            const invoiceItem = String(req.query.invoice_item || req.query.invoiceItem || '').trim();
            if (!invoiceItem) return res.status(400).json({ error: 'invoice_item required' });
            const norm = invoiceItem.toUpperCase();
            const rows = await query(
                `SELECT ds.style_code, sk.sku, sk.product_name, sk.product_names, sk.invoice_item_name
                 FROM reseller_erp_design_styles ds
                 JOIN reseller_erp_design_skus sk
                   ON sk.style_id = ds.id AND sk.reseller_user_id = ds.reseller_user_id
                 WHERE ds.reseller_user_id = $1
                   AND upper(trim(coalesce(sk.invoice_item_name, ''))) = $2
                 ORDER BY ds.style_code, sk.sku`,
                [req.user.id, norm],
            );
            const byStyle = Object.create(null);
            for (const r of rows) {
                const code = r.style_code;
                if (!byStyle[code]) byStyle[code] = { style_code: code, skus: [] };
                const skuKey = String(r.sku || '').trim().toUpperCase();
                if (byStyle[code].skus.some((s) => String(s.sku).trim().toUpperCase() === skuKey)) continue;
                byStyle[code].skus.push({
                    sku: r.sku,
                    product_name: r.product_name,
                    product_names: parseProductNames(r.product_names),
                });
            }
            res.json({ styles: Object.values(byStyle) });
        } catch (e) {
            console.error('design master billing-catalog:', e);
            res.status(500).json({ error: e.message || 'Failed to load billing catalog' });
        }
    });

    /** All catalogue SKUs + products under a design style (web shop). */
    app.get('/api/reseller/erp/design-master/catalog-by-style', checkAuth, erpGate, async (req, res) => {
        try {
            const styleCode = String(req.query.style_code || req.query.style || '').trim();
            if (!styleCode) return res.status(400).json({ error: 'style_code required' });
            const detailed = String(req.query.detailed || req.query.import || '') === '1';
            const skus = await queryCatalogSkusForStyle(query, styleCode);
            const payload = [];
            for (const sku of skus) {
                const rows = await queryCatalogRows(query, styleCode, sku);
                const products = buildCatalogProductDetails(rows);
                payload.push({
                    sku,
                    products: detailed
                        ? products
                        : products.map((p) => ({ name: p.name, image_url: p.image_url })),
                });
            }
            res.json({ style_code: styleCode, skus: payload });
        } catch (e) {
            console.error('design master catalog-by-style:', e);
            res.status(500).json({ error: e.message || 'Failed to load style catalogue' });
        }
    });

    /** Import all web catalogue SKUs + product names into design master for one style. */
    app.post('/api/reseller/erp/design-master/import-style-catalog', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const styleId = parseInt(String(req.body.style_id || req.params?.id || ''), 10);
            if (!Number.isFinite(styleId)) return res.status(400).json({ error: 'style_id required' });
            const result = await importStyleCatalogFromWeb(query, req.user.id, styleId);
            res.json({ success: true, ...result });
        } catch (e) {
            console.error('design master import-style-catalog:', e);
            res.status(500).json({ error: e.message || 'Failed to import style catalogue' });
        }
    });

    /** Catalogue products for a design style + SKU (names only, or detailed import). */
    app.get('/api/reseller/erp/design-master/catalog-products', checkAuth, erpGate, async (req, res) => {
        try {
            const styleCode = String(req.query.style_code || req.query.style || '').trim();
            const sku = String(req.query.sku || '').trim();
            if (!sku) return res.status(400).json({ error: 'sku required' });
            const detailed = String(req.query.detailed || req.query.import || '') === '1';
            const rows = await queryCatalogRows(query, styleCode, sku);
            if (detailed) {
                return res.json({ products: buildCatalogProductDetails(rows) });
            }
            const products = buildCatalogProductDetails(rows).map((p) => ({
                name: p.name,
                image_url: p.image_url,
            }));
            res.json({ products });
        } catch (e) {
            console.error('design master catalog-products:', e);
            res.status(500).json({ error: e.message || 'Failed to load catalogue products' });
        }
    });

    /** Apply invoice item + HSN to every SKU under a style. */
    app.put('/api/reseller/erp/design-master/styles/:id/invoice-item', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const styleId = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(styleId)) return res.status(400).json({ error: 'Invalid style id' });
            const invoiceItemName = req.body.invoice_item_name != null
                ? String(req.body.invoice_item_name).trim().slice(0, 255)
                : '';
            const hsnCode = req.body.hsn_code != null ? String(req.body.hsn_code).trim().slice(0, 32) : '';
            if (!invoiceItemName) return res.status(400).json({ error: 'invoice_item_name required' });
            const styleRows = await query(
                `SELECT id FROM reseller_erp_design_styles WHERE id = $1 AND reseller_user_id = $2`,
                [styleId, req.user.id],
            );
            if (!styleRows.length) return res.status(404).json({ error: 'Style not found' });
            const updated = await query(
                `UPDATE reseller_erp_design_skus SET
                    invoice_item_name = $1,
                    hsn_code = COALESCE(NULLIF($2, ''), hsn_code),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE style_id = $3 AND reseller_user_id = $4
                 RETURNING id`,
                [invoiceItemName, hsnCode, styleId, req.user.id],
            );
            res.json({ updated: updated.length });
        } catch (e) {
            console.error('design master style invoice-item:', e);
            res.status(500).json({ error: e.message || 'Failed to update style invoice item' });
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
            const newSku = body.sku != null ? String(body.sku).trim().slice(0, 128) : null;
            const productNames = body.product_names != null
                ? JSON.stringify(parseProductNames(body.product_names))
                : null;
            const rows = await query(
                `UPDATE reseller_erp_design_skus SET
                    sku = COALESCE($1, sku),
                    product_name = COALESCE($2, product_name),
                    purity = $3, metal_type = $4, wastage_pct = $5,
                    mc_rate = $6, mc_rate_slab_r = $7, mc_rate_slab_w = $8, mc_rate_slab_f = $9,
                    metal_slab_r_pct = $10, metal_slab_w_pct = $11, metal_slab_f_pct = $12,
                    mc_type = $13,
                    invoice_item_name = COALESCE($14, invoice_item_name),
                    hsn_code = COALESCE($15, hsn_code),
                    fixed_price = $16,
                    product_names = COALESCE($17::jsonb, product_names),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $18 AND reseller_user_id = $19
                 RETURNING *`,
                [
                    newSku,
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
                    body.invoice_item_name != null ? String(body.invoice_item_name).slice(0, 255) : null,
                    body.hsn_code != null ? String(body.hsn_code).slice(0, 32) : null,
                    num('fixed_price'),
                    productNames,
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'SKU not found' });
            if (Array.isArray(body.size_variants)) {
                await query(
                    `DELETE FROM reseller_erp_design_sku_sizes WHERE sku_id = $1 AND reseller_user_id = $2`,
                    [id, req.user.id],
                );
                let sort = 0;
                for (const sv of body.size_variants.slice(0, 50)) {
                    const label = String(sv.size_label || sv.label || '').trim().slice(0, 128);
                    if (!label) continue;
                    const mrp = sv.fixed_price_mrp != null && sv.fixed_price_mrp !== ''
                        ? Number(sv.fixed_price_mrp)
                        : null;
                    await query(
                        `INSERT INTO reseller_erp_design_sku_sizes
                            (reseller_user_id, sku_id, size_label, fixed_price_mrp, sort_order)
                         VALUES ($1,$2,$3,$4,$5)`,
                        [req.user.id, id, label, Number.isFinite(mrp) ? mrp : null, sort++],
                    );
                }
            }
            const updatedStock = await propagateDesignSkuToStock(query, req.user.id, id);
            const skuOut = mapDesignSku({ ...rows[0], style_code: body.style_code });
            skuOut.size_variants = await loadSkuSizes(query, id, req.user.id);
            res.json({ sku: skuOut, stockPiecesUpdated: updatedStock });
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
                `DELETE FROM reseller_erp_design_sku_sizes WHERE sku_id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            await query(
                `DELETE FROM reseller_erp_design_skus WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete SKU' });
        }
    });

    app.put('/api/reseller/erp/design-master/styles/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const code = String(req.body.style_code || '').trim().slice(0, 128);
            const name = String(req.body.style_name || code).trim().slice(0, 255);
            if (!code) return res.status(400).json({ error: 'style_code required' });
            const rows = await query(
                `UPDATE reseller_erp_design_styles SET style_code = $1, style_name = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3 AND reseller_user_id = $4 RETURNING *`,
                [code, name, id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Style not found' });
            res.json({ style: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to update style' });
        }
    });

    app.delete('/api/reseller/erp/design-master/styles/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const skus = await query(
                `SELECT id FROM reseller_erp_design_skus WHERE style_id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            for (const sk of skus) {
                await query(
                    `DELETE FROM reseller_erp_design_sku_sizes WHERE sku_id = $1 AND reseller_user_id = $2`,
                    [sk.id, req.user.id],
                );
            }
            await query(
                `DELETE FROM reseller_erp_design_skus WHERE style_id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            await query(
                `DELETE FROM reseller_erp_design_styles WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete style' });
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
    loadDesignMasterTreeForOffline,
    loadAllBillingCatalogsForOffline,
    importStyleCatalogFromWeb,
    queryCatalogSkusForStyle,
    isLikelyProductSlugSku,
};

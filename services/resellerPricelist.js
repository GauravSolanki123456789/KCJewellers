/**
 * B2B Pricelist module — isolated from web_products catalogue.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function slugify(name) {
    const base = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 128);
    return base || 'item';
}

function normalizeExcelRow(row) {
    const out = {};
    if (!row || typeof row !== 'object') return out;
    for (const [k, v] of Object.entries(row)) {
        const key = String(k || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');
        if (key) out[key] = v;
    }
    return out;
}

function pickExcelField(norm, aliases) {
    for (const alias of aliases) {
        const key = String(alias || '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '');
        if (!key) continue;
        const val = norm[key];
        if (val != null && String(val).trim() !== '') return String(val).trim();
    }
    return '';
}

function parsePricelistExcelRow(row) {
    const norm = normalizeExcelRow(row);
    const subName = pickExcelField(norm, [
        'PRICELISTSUBCATEGORY',
        'SUBCATEGORY',
        'SUB_CATEGORY',
        'SUBCAT',
        'CATEGORY',
        'STYLE',
    ]);
    const prodName = pickExcelField(norm, [
        'PRICELISTPRODUCTNAME',
        'PRODUCTNAME',
        'PRODUCT_NAME',
        'PRODUCT',
        'NAME',
        'ITEM',
        'DESCRIPTION',
    ]);
    const avgRaw = pickExcelField(norm, [
        'PRICELISTAVGWT',
        'AVGWT',
        'AVG_WEIGHT',
        'WEIGHT',
        'NETWT',
        'NET_WEIGHT',
        'AVGWEIGHT',
    ]);
    const avgNum = parseFloat(String(avgRaw || '').replace(/,/g, '').trim());
    const avgWeight = Number.isFinite(avgNum) ? avgNum : null;
    const slabRates = { ...extractSlabRates(row), ...extractSlabRates(norm) };
    return { subName, prodName, avgWeight, slabRates };
}

function extractSlabRates(row) {
    const rates = {};
    const normalized = normalizeExcelRow(row);
    for (const [k, v] of Object.entries(normalized)) {
        let slabKey = null;
        if (k.startsWith('PRICELISTSLAB')) {
            slabKey = k.slice('PRICELISTSLAB'.length) || 'default';
        } else if (/^SLAB\d+$/i.test(k)) {
            slabKey = k.slice('SLAB'.length);
        } else if (/^RATE\d+$/i.test(k)) {
            slabKey = k.slice('RATE'.length);
        } else if (/^MC\d+$/i.test(k)) {
            slabKey = `mc${k.slice('MC'.length)}`;
        }
        if (!slabKey) continue;
        const num = parseFloat(String(v ?? '').replace(/,/g, '').trim());
        if (Number.isFinite(num)) {
            rates[slabKey.toLowerCase()] = num;
        }
    }
    return rates;
}

async function ensurePricelistSchema(pool) {
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_pricelist_enabled BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS reseller_pricelist_categories (
            id SERIAL PRIMARY KEY,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(128) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (owner_user_id, slug)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_categories_owner
            ON reseller_pricelist_categories (owner_user_id, sort_order, name);

        CREATE TABLE IF NOT EXISTS reseller_pricelist_subcategories (
            id SERIAL PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(128) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (category_id, slug)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_subcategories_cat
            ON reseller_pricelist_subcategories (category_id, sort_order, name);

        CREATE TABLE IF NOT EXISTS reseller_pricelist_products (
            id SERIAL PRIMARY KEY,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
            subcategory_id INTEGER NOT NULL REFERENCES reseller_pricelist_subcategories(id) ON DELETE CASCADE,
            product_name VARCHAR(255) NOT NULL,
            product_slug VARCHAR(255) NOT NULL,
            avg_weight NUMERIC(12, 3),
            slab_rates JSONB NOT NULL DEFAULT '{}'::jsonb,
            image_url TEXT,
            batch_id UUID,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (subcategory_id, product_slug)
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_products_owner
            ON reseller_pricelist_products (owner_user_id, category_id, subcategory_id, is_active);

        CREATE TABLE IF NOT EXISTS pricelist_shared_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            product_ids INTEGER[] NOT NULL DEFAULT '{}',
            selected_slab_key VARCHAR(64),
            slab_keys_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
            hide_prices BOOLEAN NOT NULL DEFAULT false,
            hide_pdf BOOLEAN NOT NULL DEFAULT false,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_pricelist_shared_links_owner
            ON pricelist_shared_links (owner_user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reseller_pricelist_import_batches (
            id UUID PRIMARY KEY,
            category_id INTEGER NOT NULL REFERENCES reseller_pricelist_categories(id) ON DELETE CASCADE,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_filename VARCHAR(512) NOT NULL DEFAULT 'Excel import',
            product_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_pricelist_import_batches_cat
            ON reseller_pricelist_import_batches (category_id, owner_user_id, created_at DESC);
    `);
}

async function loadPricelistUser(query, userId) {
    const id = parseInt(String(userId), 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    try {
        const rows = await query(
            `SELECT id, customer_tier, account_status,
                    COALESCE(reseller_pricelist_enabled, false) AS pricelist_enabled
             FROM users WHERE id = $1`,
            [id],
        );
        return rows[0] || null;
    } catch (e) {
        const msg = String(e.message || '');
        if (msg.includes('reseller_pricelist_enabled')) {
            await query(
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_pricelist_enabled BOOLEAN NOT NULL DEFAULT false',
            );
            return loadPricelistUser(query, userId);
        }
        throw e;
    }
}

async function assertResellerPricelistAccess(query, userId) {
    const u = await loadPricelistUser(query, userId);
    if (!u) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    if (String(u.customer_tier || '').toUpperCase() !== 'RESELLER') {
        const err = new Error('Pricelist is available for RESELLER accounts only');
        err.status = 403;
        throw err;
    }
    if (String(u.account_status || '').toLowerCase() === 'suspended') {
        const err = new Error('Account suspended');
        err.status = 403;
        throw err;
    }
    if (!u.pricelist_enabled) {
        const err = new Error(
            'B2B Pricelist is not enabled for this account. Ask KC admin to turn it on.',
        );
        err.status = 403;
        throw err;
    }
    return u;
}

function requirePricelistGate(query) {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({ error: 'Sign in required' });
            }
            await assertResellerPricelistAccess(query, req.user.id);
            next();
        } catch (e) {
            const status = e.status || 500;
            if (status >= 500) console.error('pricelist gate:', e);
            res.status(status).json({ error: e.message || 'Pricelist access denied' });
        }
    };
}

async function getCategoryOrFail(query, userId, categoryId) {
    const cid = parseInt(String(categoryId), 10);
    if (!Number.isFinite(cid) || cid <= 0) {
        const err = new Error('Invalid category id');
        err.status = 400;
        throw err;
    }
    const rows = await query(
        `SELECT * FROM reseller_pricelist_categories
         WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
        [cid, userId],
    );
    if (!rows.length) {
        const err = new Error('Category not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

function parseSlabRatesJson(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw);
            return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
        } catch {
            return {};
        }
    }
    return {};
}

async function resolvePricelistShareBaseUrl(query, ownerUserId) {
    let clientSite =
        (process.env.NEXT_PUBLIC_SITE_URL || process.env.CLIENT_URL || '').trim().replace(/\/$/, '') ||
        'https://kcjewellers.co.in';
    const uid = parseInt(String(ownerUserId), 10);
    if (Number.isFinite(uid) && uid > 0) {
        const urows = await query(`SELECT customer_tier, custom_domain FROM users WHERE id = $1`, [uid]);
        const tier = String(urows[0]?.customer_tier || '').toUpperCase();
        if (tier === 'RESELLER') {
            const cd = String(urows[0]?.custom_domain || '')
                .trim()
                .replace(/^https?:\/\//i, '')
                .split('/')[0]
                .split(':')[0]
                .toLowerCase();
            if (cd) clientSite = `https://${cd}`;
        }
    }
    return clientSite;
}

function collectSlabKeysFromProducts(products) {
    const keys = new Set();
    for (const p of products || []) {
        const rates = parseSlabRatesJson(p.slab_rates);
        for (const k of Object.keys(rates)) {
            if (k) keys.add(k);
        }
    }
    return [...keys].sort();
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

function buildProductPhotoLookup(products) {
    const map = Object.create(null);
    for (const p of products || []) {
        const slug = String(p.product_slug || '').trim();
        if (!slug) continue;
        const entry = { id: p.id, product_slug: slug, row: p };
        registerBulkPhotoStemKey(map, slug, entry);
        registerBulkPhotoStemKey(map, p.product_name, entry);
    }
    return map;
}

function lookUpPhotoEntry(map, stem) {
    const s = normalizeBulkPhotoStem(stem);
    if (!s) return null;
    const compact = s.replace(/-/g, '');
    return map[s] || map[compact] || null;
}

function parseBulkUploadStemFromFilename(filename) {
    const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
    return normalizeBulkPhotoStem(base);
}

function createPricelistUploadMulter(uploadsDir) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const raw =
                    path.basename(String(file.originalname || '').trim()) ||
                    `upload-${Date.now()}.webp`;
                cb(null, raw);
            },
        }),
        limits: { fileSize: 15 * 1024 * 1024, files: 200 },
    }).fields([
        { name: 'images', maxCount: 200 },
        { name: 'primaryImage', maxCount: 200 },
    ]);
}

function createPricelistSinglePhotoMulter(uploadsDir) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: (req, file, cb) => cb(null, uploadsDir),
            filename: (req, file, cb) => {
                const raw =
                    path.basename(String(file.originalname || '').trim()) ||
                    `upload-${Date.now()}.webp`;
                cb(null, raw);
            },
        }),
        limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    }).single('image');
}

async function listPricelistImportBatches(query, userId, categoryId) {
    const rows = await query(
        `SELECT b.id, b.source_filename, b.product_count, b.created_at,
                (SELECT COUNT(*)::int FROM reseller_pricelist_products p
                 WHERE p.batch_id = b.id AND p.owner_user_id = $2 AND p.is_active = true) AS live_product_count
         FROM reseller_pricelist_import_batches b
         WHERE b.category_id = $1 AND b.owner_user_id = $2
         ORDER BY b.created_at DESC`,
        [categoryId, userId],
    );
    const known = new Set(rows.map((r) => String(r.id)));
    const orphanRows = await query(
        `SELECT p.batch_id AS id,
                'Excel import' AS source_filename,
                COUNT(*)::int AS product_count,
                MAX(p.created_at) AS created_at,
                COUNT(*)::int AS live_product_count
         FROM reseller_pricelist_products p
         WHERE p.category_id = $1 AND p.owner_user_id = $2
           AND p.batch_id IS NOT NULL
           AND p.is_active = true
         GROUP BY p.batch_id
         HAVING COUNT(*) > 0`,
        [categoryId, userId],
    );
    const merged = [...rows];
    for (const row of orphanRows) {
        if (!known.has(String(row.id))) merged.push(row);
    }
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged.map((r) => ({
        id: String(r.id),
        source_filename: r.source_filename || 'Excel import',
        product_count: r.live_product_count ?? r.product_count ?? 0,
        created_at: r.created_at,
    }));
}

async function upsertSubcategory(query, categoryId, name) {
    const trimmed = String(name || '').trim().slice(0, 255);
    if (!trimmed) return null;
    const slug = slugify(trimmed);
    const existing = await query(
        `SELECT id FROM reseller_pricelist_subcategories
         WHERE category_id = $1 AND slug = $2 LIMIT 1`,
        [categoryId, slug],
    );
    if (existing.length) return existing[0].id;
    const ins = await query(
        `INSERT INTO reseller_pricelist_subcategories (category_id, name, slug)
         VALUES ($1, $2, $3) RETURNING id`,
        [categoryId, trimmed, slug],
    );
    return ins[0].id;
}

function registerResellerPricelistRoutes(app, deps) {
    const {
        query,
        pool,
        checkAuth,
        requireJson,
        getPublicApiBaseUrl,
        uploadsWebProductsDir,
    } = deps;

    const uploadsPricelistDir =
        deps.uploadsPricelistDir ||
        (uploadsWebProductsDir
            ? path.join(path.dirname(uploadsWebProductsDir), 'pricelist')
            : path.join(__dirname, '..', 'public', 'uploads', 'pricelist'));

    const pricelistGate = requirePricelistGate(query);
    const PRICELIST_UPLOAD = createPricelistUploadMulter(uploadsPricelistDir);
    const PRICELIST_SINGLE_PHOTO = createPricelistSinglePhotoMulter(uploadsPricelistDir);

    ensurePricelistSchema(pool).catch((e) => console.warn('pricelist schema:', e.message));

    app.get('/api/reseller/pricelist/bootstrap', checkAuth, pricelistGate, async (req, res) => {
        try {
            await ensurePricelistSchema(pool);
            const [catCount, products] = await Promise.all([
                query(
                    `SELECT COUNT(*)::int AS n FROM reseller_pricelist_categories WHERE owner_user_id = $1`,
                    [req.user.id],
                ),
                query(
                    `SELECT slab_rates FROM reseller_pricelist_products
                     WHERE owner_user_id = $1 AND is_active = true`,
                    [req.user.id],
                ),
            ]);
            res.json({
                enabled: true,
                categoriesCount: catCount[0]?.n ?? 0,
                slabKeys: collectSlabKeysFromProducts(products),
            });
        } catch (e) {
            console.error('pricelist bootstrap:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to load pricelist bootstrap' });
        }
    });

    app.get('/api/reseller/pricelist/categories', checkAuth, pricelistGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT c.id, c.name, c.slug, c.sort_order, c.created_at, c.updated_at,
                        COUNT(p.id)::int AS product_count
                 FROM reseller_pricelist_categories c
                 LEFT JOIN reseller_pricelist_products p ON p.category_id = c.id AND p.is_active = true
                 WHERE c.owner_user_id = $1
                 GROUP BY c.id
                 ORDER BY c.sort_order, c.name`,
                [req.user.id],
            );
            res.json({ categories: rows });
        } catch (e) {
            console.error('pricelist categories:', e);
            res.status(500).json({ error: e.message || 'Failed to list categories' });
        }
    });

    app.post(
        '/api/reseller/pricelist/categories',
        checkAuth,
        pricelistGate,
        requireJson,
        async (req, res) => {
            try {
                const name = String(req.body?.name || '').trim().slice(0, 255);
                if (!name) return res.status(400).json({ error: 'name is required' });
                const slug = slugify(name);
                const existing = await query(
                    `SELECT id FROM reseller_pricelist_categories
                     WHERE owner_user_id = $1 AND slug = $2 LIMIT 1`,
                    [req.user.id, slug],
                );
                if (existing.length) {
                    return res.status(409).json({ error: 'A category with this name already exists' });
                }
                const rows = await query(
                    `INSERT INTO reseller_pricelist_categories (owner_user_id, name, slug)
                     VALUES ($1, $2, $3) RETURNING *`,
                    [req.user.id, name, slug],
                );
                res.json({ success: true, category: rows[0] });
            } catch (e) {
                console.error('pricelist create category:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to create category' });
            }
        },
    );

    app.delete(
        '/api/reseller/pricelist/categories/:id',
        checkAuth,
        pricelistGate,
        async (req, res) => {
            try {
                await getCategoryOrFail(query, req.user.id, req.params.id);
                await query(
                    `DELETE FROM reseller_pricelist_categories WHERE id = $1 AND owner_user_id = $2`,
                    [parseInt(req.params.id, 10), req.user.id],
                );
                res.json({ success: true });
            } catch (e) {
                console.error('pricelist delete category:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to delete category' });
            }
        },
    );

    app.get('/api/reseller/pricelist/tree', checkAuth, pricelistGate, async (req, res) => {
        try {
            const categories = await query(
                `SELECT id, name, slug, sort_order FROM reseller_pricelist_categories
                 WHERE owner_user_id = $1 ORDER BY sort_order, name`,
                [req.user.id],
            );
            const subcategories = await query(
                `SELECT sc.id, sc.category_id, sc.name, sc.slug, sc.sort_order
                 FROM reseller_pricelist_subcategories sc
                 JOIN reseller_pricelist_categories c ON c.id = sc.category_id
                 WHERE c.owner_user_id = $1
                 ORDER BY sc.sort_order, sc.name`,
                [req.user.id],
            );
            const products = await query(
                `SELECT p.id, p.category_id, p.subcategory_id, p.product_name, p.product_slug,
                        p.avg_weight, p.slab_rates, p.image_url, p.sort_order, p.is_active
                 FROM reseller_pricelist_products p
                 WHERE p.owner_user_id = $1 AND p.is_active = true
                 ORDER BY p.sort_order, p.product_name`,
                [req.user.id],
            );

            const subsByCat = Object.create(null);
            for (const sc of subcategories) {
                if (!subsByCat[sc.category_id]) subsByCat[sc.category_id] = [];
                subsByCat[sc.category_id].push({
                    id: sc.id,
                    name: sc.name,
                    slug: sc.slug,
                    sort_order: sc.sort_order,
                    products: [],
                });
            }
            const prodBySub = Object.create(null);
            for (const p of products) {
                if (!prodBySub[p.subcategory_id]) prodBySub[p.subcategory_id] = [];
                prodBySub[p.subcategory_id].push({
                    id: p.id,
                    product_name: p.product_name,
                    product_slug: p.product_slug,
                    avg_weight: p.avg_weight != null ? Number(p.avg_weight) : null,
                    slab_rates: parseSlabRatesJson(p.slab_rates),
                    image_url: p.image_url,
                    sort_order: p.sort_order,
                });
            }
            for (const catId of Object.keys(subsByCat)) {
                for (const sc of subsByCat[catId]) {
                    sc.products = prodBySub[sc.id] || [];
                }
            }
            res.json({
                tree: categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                    slug: c.slug,
                    sort_order: c.sort_order,
                    subcategories: subsByCat[c.id] || [],
                })),
            });
        } catch (e) {
            console.error('pricelist tree:', e);
            res.status(500).json({ error: e.message || 'Failed to load tree' });
        }
    });

    app.post(
        '/api/reseller/pricelist/categories/:id/upload-excel',
        checkAuth,
        pricelistGate,
        requireJson,
        async (req, res) => {
            try {
                const category = await getCategoryOrFail(query, req.user.id, req.params.id);
                const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
                if (!rows.length) return res.status(400).json({ error: 'rows array is required' });

                const batchId = crypto.randomUUID();
                let upserted = 0;
                const errors = [];

                for (let i = 0; i < rows.length; i++) {
                    try {
                        const parsed = parsePricelistExcelRow(rows[i]);
                        const { subName, prodName, avgWeight, slabRates } = parsed;
                        if (!subName || !prodName) {
                            errors.push({
                                row: i,
                                error: 'Subcategory and product name required (PRICELISTSUBCATEGORY + PRICELISTPRODUCTNAME, or SUBCATEGORY + PRODUCTNAME)',
                            });
                            continue;
                        }
                        const subcategoryId = await upsertSubcategory(query, category.id, subName);
                        const productSlug = slugify(prodName);

                        await query(
                            `INSERT INTO reseller_pricelist_products (
                                owner_user_id, category_id, subcategory_id, product_name, product_slug,
                                avg_weight, slab_rates, batch_id
                             ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::uuid)
                             ON CONFLICT (subcategory_id, product_slug) DO UPDATE SET
                                product_name = EXCLUDED.product_name,
                                avg_weight = EXCLUDED.avg_weight,
                                slab_rates = EXCLUDED.slab_rates,
                                batch_id = EXCLUDED.batch_id,
                                category_id = EXCLUDED.category_id,
                                updated_at = CURRENT_TIMESTAMP`,
                            [
                                req.user.id,
                                category.id,
                                subcategoryId,
                                prodName.slice(0, 255),
                                productSlug,
                                avgWeight,
                                JSON.stringify(slabRates),
                                batchId,
                            ],
                        );
                        upserted += 1;
                    } catch (rowErr) {
                        errors.push({ row: i, error: rowErr.message });
                    }
                }

                const sourceFilename = String(
                    req.body?.sourceFilename || req.body?.source_filename || 'Excel import',
                )
                    .trim()
                    .slice(0, 512);

                if (upserted > 0) {
                    await query(
                        `INSERT INTO reseller_pricelist_import_batches (
                            id, category_id, owner_user_id, source_filename, product_count
                         ) VALUES ($1::uuid, $2, $3, $4, $5)
                         ON CONFLICT (id) DO UPDATE SET
                            source_filename = EXCLUDED.source_filename,
                            product_count = EXCLUDED.product_count`,
                        [batchId, category.id, req.user.id, sourceFilename || 'Excel import', upserted],
                    );
                }

                res.json({
                    success: true,
                    batch_id: batchId,
                    source_filename: sourceFilename || 'Excel import',
                    upserted,
                    errors: errors.length ? errors : undefined,
                });
            } catch (e) {
                console.error('pricelist upload-excel:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to import Excel rows' });
            }
        },
    );

    app.get(
        '/api/reseller/pricelist/categories/:id/batches',
        checkAuth,
        pricelistGate,
        async (req, res) => {
            try {
                const category = await getCategoryOrFail(query, req.user.id, req.params.id);
                const batches = await listPricelistImportBatches(
                    query,
                    req.user.id,
                    category.id,
                );
                res.json({ batches });
            } catch (e) {
                console.error('pricelist list batches:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to list imports' });
            }
        },
    );

    app.delete(
        '/api/reseller/pricelist/categories/:id/batches/:batchId',
        checkAuth,
        pricelistGate,
        async (req, res) => {
            try {
                const category = await getCategoryOrFail(query, req.user.id, req.params.id);
                const batchId = String(req.params.batchId || '').trim();
                if (!UUID_RE.test(batchId)) {
                    return res.status(400).json({ error: 'Invalid batch id' });
                }
                const del = await query(
                    `DELETE FROM reseller_pricelist_products
                     WHERE owner_user_id = $1 AND category_id = $2 AND batch_id = $3::uuid
                     RETURNING id`,
                    [req.user.id, category.id, batchId],
                );
                await query(
                    `DELETE FROM reseller_pricelist_import_batches
                     WHERE id = $1::uuid AND category_id = $2 AND owner_user_id = $3`,
                    [batchId, category.id, req.user.id],
                );
                res.json({ success: true, deletedProducts: del.length });
            } catch (e) {
                console.error('pricelist delete batch:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to delete import' });
            }
        },
    );

    app.post(
        '/api/reseller/pricelist/products/:productId/photo',
        checkAuth,
        pricelistGate,
        PRICELIST_SINGLE_PHOTO,
        async (req, res) => {
            try {
                const productId = parseInt(String(req.params.productId), 10);
                if (!Number.isFinite(productId) || productId <= 0) {
                    return res.status(400).json({ error: 'Invalid product id' });
                }
                const rows = await query(
                    `SELECT * FROM reseller_pricelist_products
                     WHERE id = $1 AND owner_user_id = $2 AND is_active = true LIMIT 1`,
                    [productId, req.user.id],
                );
                if (!rows.length) {
                    return res.status(404).json({ error: 'Product not found' });
                }
                const product = rows[0];
                const file = req.file;
                if (!file) {
                    return res.status(400).json({ error: 'No image file received' });
                }
                const ext = path.extname(file.filename) || '.webp';
                const target = `${product.product_slug}${ext}`;
                const srcPath = path.join(uploadsPricelistDir, file.filename);
                const destPath = path.join(uploadsPricelistDir, target);
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
                const apiBase = getPublicApiBaseUrl();
                const url = `${apiBase}/uploads/pricelist/${target}`;
                await query(
                    `UPDATE reseller_pricelist_products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                    [url, product.id],
                );
                res.json({
                    success: true,
                    image_url: url,
                    product_slug: product.product_slug,
                    suggested_filename: `${product.product_slug}${ext}`,
                });
            } catch (e) {
                console.error('pricelist product photo:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to upload photo' });
            }
        },
    );

    app.post(
        '/api/reseller/pricelist/categories/:id/bulk-photos',
        checkAuth,
        pricelistGate,
        PRICELIST_UPLOAD,
        async (req, res) => {
            try {
                const category = await getCategoryOrFail(query, req.user.id, req.params.id);
                const batchId = String(req.body?.batch_id || req.query?.batch_id || '').trim();

                let productRows;
                if (batchId && UUID_RE.test(batchId)) {
                    productRows = await query(
                        `SELECT * FROM reseller_pricelist_products
                         WHERE owner_user_id = $1 AND category_id = $2 AND batch_id = $3::uuid`,
                        [req.user.id, category.id, batchId],
                    );
                } else {
                    productRows = await query(
                        `SELECT * FROM reseller_pricelist_products
                         WHERE owner_user_id = $1 AND category_id = $2`,
                        [req.user.id, category.id],
                    );
                }
                if (!productRows.length) {
                    return res.status(404).json({ error: 'No products found for this category' });
                }

                const lookup = buildProductPhotoLookup(productRows);
                const files = req.files || {};
                const uploads = [...(files.images || []), ...(files.primaryImage || [])];
                if (!uploads.length) {
                    return res.status(400).json({ error: 'No image files received' });
                }

                const apiBase = getPublicApiBaseUrl();
                const matched = [];
                const unmatched = [];
                const errors = [];

                for (const file of uploads) {
                    const originalName = String(file.originalname || file.filename || '').trim();
                    try {
                        const stem = parseBulkUploadStemFromFilename(originalName);
                        const entry = lookUpPhotoEntry(lookup, stem);
                        if (!entry) {
                            unmatched.push(originalName || file.filename);
                            continue;
                        }
                        const ext = path.extname(file.filename) || '.webp';
                        const target = `${entry.product_slug}${ext}`;
                        const srcPath = path.join(uploadsPricelistDir, file.filename);
                        const destPath = path.join(uploadsPricelistDir, target);
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
                        const url = `${apiBase}/uploads/pricelist/${target}`;
                        await query(
                            `UPDATE reseller_pricelist_products SET image_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
                            [url, entry.id],
                        );
                        matched.push({
                            filename: originalName,
                            product_slug: entry.product_slug,
                            image_url: url,
                        });
                    } catch (fileErr) {
                        errors.push({ filename: originalName, error: fileErr.message });
                    }
                }

                res.json({
                    success: true,
                    matched,
                    unmatched,
                    errors: errors.length ? errors : undefined,
                });
            } catch (e) {
                console.error('pricelist bulk-photos:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to upload photos' });
            }
        },
    );

    app.post(
        '/api/reseller/pricelist/shared-links',
        checkAuth,
        pricelistGate,
        requireJson,
        async (req, res) => {
            try {
                const productIds = Array.isArray(req.body?.productIds)
                    ? req.body.productIds
                          .map((x) => parseInt(String(x), 10))
                          .filter((n) => Number.isFinite(n) && n > 0)
                    : [];
                if (!productIds.length) {
                    return res.status(400).json({ error: 'productIds array is required' });
                }
                const selectedSlabKey =
                    String(req.body?.selectedSlabKey || '').trim().slice(0, 64) || null;
                const format = String(req.body?.format || 'temporary_web_link').trim();
                if (!['temporary_web_link', 'pdf'].includes(format)) {
                    return res.status(400).json({ error: 'format must be temporary_web_link or pdf' });
                }
                const expiresHours = Math.max(
                    1,
                    Math.min(720, parseInt(String(req.body?.expiresHours || 24), 10) || 24),
                );
                const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

                const products = await query(
                    `SELECT id, slab_rates FROM reseller_pricelist_products
                     WHERE owner_user_id = $1 AND id = ANY($2::int[]) AND is_active = true`,
                    [req.user.id, productIds],
                );
                if (!products.length) {
                    return res.status(400).json({ error: 'No valid products selected' });
                }
                const validIds = products.map((p) => p.id);
                const slabKeysSnapshot = collectSlabKeysFromProducts(products);

                const linkRows = await query(
                    `INSERT INTO pricelist_shared_links (
                        owner_user_id, created_by_user_id, product_ids, selected_slab_key,
                        slab_keys_snapshot, expires_at
                     ) VALUES ($1, $2, $3::int[], $4, $5::jsonb, $6)
                     RETURNING id, expires_at, created_at`,
                    [
                        req.user.id,
                        req.user.id,
                        validIds,
                        selectedSlabKey,
                        JSON.stringify(slabKeysSnapshot),
                        expiresAt,
                    ],
                );
                const link = linkRows[0];
                const clientSite = await resolvePricelistShareBaseUrl(query, req.user.id);
                const shareUrl = `${clientSite}/pricelist/${link.id}`;

                res.json({
                    success: true,
                    format,
                    id: link.id,
                    shareUrl,
                    share_url: shareUrl,
                    expiresAt: link.expires_at,
                    selectedProductIds: validIds,
                    selectedSlabKey,
                    slabKeysSnapshot,
                });
            } catch (e) {
                console.error('pricelist shared-links:', e);
                res.status(e.status || 500).json({ error: e.message || 'Failed to create shared link' });
            }
        },
    );

    app.get('/api/public/pricelist/:uuid', async (req, res) => {
        try {
            const uuid = String(req.params.uuid || '').trim();
            if (!UUID_RE.test(uuid)) {
                return res.status(400).json({ error: 'Invalid pricelist id' });
            }
            const linkRows = await query(
                `SELECT pl.*, u.business_name, u.logo_url, u.customer_tier
                 FROM pricelist_shared_links pl
                 LEFT JOIN users u ON u.id = pl.owner_user_id
                 WHERE pl.id = $1::uuid`,
                [uuid],
            );
            if (!linkRows.length) {
                return res.status(404).json({ error: 'Pricelist not found' });
            }
            const link = linkRows[0];
            const expired = new Date(link.expires_at).getTime() <= Date.now();

            const products = await query(
                `SELECT p.id, p.product_name, p.product_slug, p.avg_weight, p.slab_rates, p.image_url,
                        p.category_id, p.subcategory_id,
                        c.name AS category_name, sc.name AS subcategory_name
                 FROM reseller_pricelist_products p
                 JOIN reseller_pricelist_categories c ON c.id = p.category_id
                 JOIN reseller_pricelist_subcategories sc ON sc.id = p.subcategory_id
                 WHERE p.id = ANY($1::int[]) AND p.is_active = true
                 ORDER BY c.sort_order, c.name, sc.sort_order, sc.name, p.sort_order, p.product_name`,
                [link.product_ids || []],
            );

            const selectedSlabKey = link.selected_slab_key || null;
            const brochureProducts = products.map((p) => {
                const rates = parseSlabRatesJson(p.slab_rates);
                let selectedRate = null;
                if (selectedSlabKey && rates[selectedSlabKey] != null) {
                    selectedRate = Number(rates[selectedSlabKey]);
                } else if (selectedSlabKey) {
                    const alt = Object.keys(rates).find(
                        (k) => k.toLowerCase() === selectedSlabKey.toLowerCase(),
                    );
                    if (alt != null) selectedRate = Number(rates[alt]);
                }
                return {
                    id: p.id,
                    product_name: p.product_name,
                    product_slug: p.product_slug,
                    avg_weight: p.avg_weight != null ? Number(p.avg_weight) : null,
                    slab_rates: rates,
                    selected_slab_rate: selectedRate,
                    image_url: p.image_url,
                    category_name: p.category_name,
                    subcategory_name: p.subcategory_name,
                };
            });

            res.setHeader('Cache-Control', 'private, no-store');
            res.json({
                expired,
                id: link.id,
                expires_at: link.expires_at,
                selected_slab_key: selectedSlabKey,
                slab_keys_snapshot: link.slab_keys_snapshot || [],
                hide_prices: !!link.hide_prices,
                hide_pdf: !!link.hide_pdf,
                owner_business_name: link.business_name || null,
                owner_logo_url: link.logo_url || null,
                products: brochureProducts,
            });
        } catch (e) {
            console.error('public pricelist:', e);
            res.status(500).json({ error: e.message || 'Failed to load pricelist' });
        }
    });
}

module.exports = {
    ensurePricelistSchema,
    assertResellerPricelistAccess,
    registerResellerPricelistRoutes,
};

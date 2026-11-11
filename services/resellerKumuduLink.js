/**
 * Kumudu software stock link — per-reseller inbound APIs + field mapping.
 * Kumudu POSTs JSON to /external/kumudu-{inboundKey}/{catalogue_creation|product_creation|stock}.
 * Staff map Kumudu field paths onto KC catalogue fields (select / deselect / select all).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { upsertWebProductFromSyncItem, styleSlugFromCode } = require('./upsertWebProductFromSyncItem');
const { classifyCatalogMetalFamily } = require('./catalogMetalFamily');
const { parseAllowedCategoryMetals } = require('./resellerCatalogScope');
const { productImageFileExists } = require('./productImagePaths');

const ENDPOINTS = [
    {
        id: 'catalogue_creation',
        label: 'Catalogue creation',
        path: 'catalogue_creation',
        hint: 'New style / design created in Kumudu (style code, e.g. CURB › 3 or EMERALD IDOLS › GANESH).',
    },
    {
        id: 'product_creation',
        label: 'Product creation',
        path: 'product_creation',
        hint: 'New product row — name, photo and other details.',
    },
    {
        id: 'stock',
        label: 'Live stock',
        path: 'stock',
        hint: 'Quantity, weight and availability updates for existing pieces.',
    },
];

const ENDPOINT_IDS = ENDPOINTS.map((e) => e.id);

const KC_FIELDS = [
    {
        key: 'style_code',
        label: 'Style code',
        group: 'Catalogue',
        hint: 'Category / design family — e.g. EMERALD IDOLS or CURB',
    },
    {
        key: 'sku',
        label: 'SKU (subcategory)',
        group: 'Catalogue',
        hint: 'Sub-style — e.g. GANESH, or 3 in CURB › 3',
    },
    {
        key: 'barcode',
        label: 'Barcode / product SKU',
        group: 'Identity',
        hint: 'Unique piece code stored as web_products.sku — e.g. SFIDOL028-001',
    },
    { key: 'product_name', label: 'Product name', group: 'Identity' },
    { key: 'design_group', label: 'Design group', group: 'Identity' },
    {
        key: 'metal_type',
        label: 'Metal type',
        group: 'Identity',
        hint: 'gold / silver / diamond / gifting',
    },
    { key: 'size', label: 'Size', group: 'Identity' },
    {
        key: 'status',
        label: 'Status',
        group: 'Stock',
        hint: 'Active, inactive, in stock, out of stock',
    },
    { key: 'quantity', label: 'Quantity (PCS)', group: 'Stock' },
    {
        key: 'net_weight',
        label: 'Net weight (gm)',
        group: 'Stock',
        hint: 'Same as weight_gm across the catalogue',
    },
    { key: 'gross_weight', label: 'Gross weight (gm)', group: 'Stock' },
    { key: 'weight_display', label: 'Weight display label', group: 'Stock' },
    { key: 'wastage_pct', label: 'Wastage %', group: 'Stock' },
    { key: 'chain_weight', label: 'Chain weight (gm)', group: 'Stock' },
    { key: 'pendant_weight', label: 'Pendant weight (gm)', group: 'Stock' },
    { key: 'earring_weight', label: 'Earring weight (gm)', group: 'Stock' },
    { key: 'purity', label: 'Purity', group: 'Pricing' },
    { key: 'mc_rate', label: 'Making charge rate', group: 'Pricing' },
    { key: 'mc_type', label: 'Making charge type (MC/GM or MC/PC)', group: 'Pricing' },
    { key: 'fixed_price', label: 'Fixed price / MRP', group: 'Pricing' },
    { key: 'stone_charges', label: 'Stone charges', group: 'Pricing' },
    { key: 'box_charges', label: 'Box charges', group: 'Pricing' },
    { key: 'mrp_rate_behind_box', label: 'MRP behind box', group: 'Pricing' },
    { key: 'image_url', label: 'Primary image', group: 'Media' },
    { key: 'secondary_image_url', label: 'Secondary image', group: 'Media' },
    { key: 'box_image_url', label: 'Box image', group: 'Media' },
    { key: 'video_url', label: 'Video', group: 'Media' },
    { key: 'brand', label: 'Brand', group: 'Other' },
    { key: 'make_to_order_only', label: 'Make to order only', group: 'Other' },
    {
        key: 'store_id',
        label: 'Store ID',
        group: 'Connection',
        hint: 'Optional check that the payload is for this shop',
    },
];

const KC_FIELD_KEYS = new Set(KC_FIELDS.map((f) => f.key));

const RECOMMENDED = {
    catalogue_creation: ['style_code', 'sku', 'metal_type'],
    product_creation: [
        'style_code',
        'sku',
        'barcode',
        'product_name',
        'image_url',
        'metal_type',
        'design_group',
        'size',
    ],
    stock: [
        'barcode',
        'sku',
        'style_code',
        'product_name',
        'metal_type',
        'quantity',
        'net_weight',
        'gross_weight',
        'status',
    ],
};

const NUMERIC_FIELDS = new Set([
    'quantity',
    'net_weight',
    'gross_weight',
    'wastage_pct',
    'chain_weight',
    'pendant_weight',
    'earring_weight',
    'mc_rate',
    'fixed_price',
    'stone_charges',
    'box_charges',
    'mrp_rate_behind_box',
]);

function emptyMapping(endpointId) {
    return {
        selected: [...(RECOMMENDED[endpointId] || [])],
        map: {},
    };
}

function normalizeMapping(raw, endpointId) {
    const fallback = emptyMapping(endpointId);
    if (!raw || typeof raw !== 'object') return fallback;
    const selectedIn = Array.isArray(raw.selected) ? raw.selected : fallback.selected;
    const selected = [
        ...new Set(selectedIn.map((k) => String(k || '').trim()).filter((k) => KC_FIELD_KEYS.has(k))),
    ];
    const mapIn = raw.map && typeof raw.map === 'object' && !Array.isArray(raw.map) ? raw.map : {};
    const map = {};
    for (const [kc, pathVal] of Object.entries(mapIn)) {
        if (!KC_FIELD_KEYS.has(kc)) continue;
        const p = String(pathVal || '').trim();
        if (p) map[kc] = p;
    }
    return { selected, map };
}

function generateApiKey() {
    return `kmd_${crypto.randomBytes(24).toString('hex')}`;
}

function slugInboundKey(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 32);
}

function defaultInboundKey(user) {
    const domain = String(user?.custom_domain || '').toLowerCase();
    const invite = String(user?.reseller_invite_code || '').toUpperCase();
    if (domain.includes('jpsilver') || invite.includes('JPJEWEL') || invite === 'JP') return 'jp';
    const fromInvite = slugInboundKey(invite);
    if (fromInvite) return fromInvite;
    const fromBiz = slugInboundKey(user?.business_name);
    if (fromBiz) return fromBiz.slice(0, 16);
    return `r${user?.id || 'shop'}`;
}

function normalizeKey(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function flattenPayloadKeys(obj, prefix = '', out = [], depth = 0) {
    if (obj == null || depth > 8) return out;
    if (Array.isArray(obj)) {
        if (obj.length && typeof obj[0] === 'object') flattenPayloadKeys(obj[0], prefix, out, depth + 1);
        else if (prefix) out.push(prefix);
        return out;
    }
    if (typeof obj !== 'object') {
        if (prefix) out.push(prefix);
        return out;
    }
    for (const [k, v] of Object.entries(obj)) {
        if (k === '_parent') continue;
        const p = prefix ? `${prefix}.${k}` : k;
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
            flattenPayloadKeys(v, p, out, depth + 1);
        } else if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
            flattenPayloadKeys(v[0], p, out, depth + 1);
        } else {
            out.push(p);
        }
    }
    return out;
}

function uniqueKeys(keys) {
    const seen = new Set();
    const out = [];
    for (const k of keys) {
        const t = String(k || '').trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

function getByPath(obj, dotted) {
    if (obj == null || !dotted) return undefined;
    const parts = String(dotted)
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
    let cur = obj;
    for (const part of parts) {
        if (cur == null) return undefined;
        if (Array.isArray(cur)) cur = cur[0];
        if (cur == null || typeof cur !== 'object') return undefined;
        const want = normalizeKey(part);
        const hit = Object.keys(cur).find((k) => normalizeKey(k) === want);
        if (hit == null) return undefined;
        cur = cur[hit];
    }
    return cur;
}

function findValueDeep(obj, wantedKey, depth = 0) {
    if (obj == null || depth > 8) return undefined;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const v = findValueDeep(item, wantedKey, depth + 1);
            if (v !== undefined) return v;
        }
        return undefined;
    }
    if (typeof obj !== 'object') return undefined;
    const want = normalizeKey(wantedKey);
    if (!want) return undefined;
    for (const [k, v] of Object.entries(obj)) {
        if (k === '_parent') continue;
        if (normalizeKey(k) === want) return v;
    }
    for (const [k, v] of Object.entries(obj)) {
        if (k === '_parent') continue;
        if (v && typeof v === 'object') {
            const found = findValueDeep(v, wantedKey, depth + 1);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

function extractRecords(body) {
    if (body == null) return [];
    if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object');
    if (typeof body !== 'object') return [];
    const nestKeys = [
        'data',
        'items',
        'products',
        'records',
        'rows',
        'stock',
        'catalogue',
        'catalog',
        'payload',
    ];
    for (const key of nestKeys) {
        const hit = Object.keys(body).find((k) => normalizeKey(k) === normalizeKey(key));
        if (!hit) continue;
        const val = body[hit];
        if (Array.isArray(val)) return val.filter((x) => x && typeof x === 'object');
        if (val && typeof val === 'object') return [val];
    }
    return [body];
}

function suggestPathForField(kcKey, detectedKeys) {
    const want = normalizeKey(kcKey);
    const aliases = {
        net_weight: ['weightgm', 'weight', 'netweight', 'netwt', 'wt', 'avgweight', 'nwt'],
        gross_weight: ['grossweight', 'grosswt', 'gwt', 'grswt'],
        product_name: ['productname', 'itemname', 'name', 'shortname', 'title'],
        barcode: ['barcode', 'itemcode', 'productsku', 'tagno', 'tag', 'code'],
        sku: ['sku', 'skucode', 'subcategory', 'stylesku'],
        style_code: ['stylecode', 'style', 'catalogue', 'category', 'designcode'],
        image_url: ['imageurl', 'image', 'photo', 'photourl', 'img', 'picture'],
        quantity: ['quantity', 'qty', 'pcs', 'pieces', 'stockqty', 'availqty'],
        metal_type: ['metaltype', 'metal', 'puritygroup'],
        status: ['status', 'activestatus', 'stockstatus', 'isactive'],
        store_id: ['storeid', 'store', 'branchid', 'branch'],
        design_group: ['designgroup', 'design', 'itemcode'],
    };
    const wants = new Set([want, ...(aliases[kcKey] || [])]);
    const scored = [];
    for (const pathStr of detectedKeys) {
        const last = pathStr.split('.').pop() || pathStr;
        const n = normalizeKey(last);
        if (wants.has(n)) scored.push({ pathStr, score: 100 });
        else if ([...wants].some((w) => n.includes(w) || w.includes(n))) scored.push({ pathStr, score: 40 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.pathStr || '';
}

function lookupMappedValue(kcKey, mapping, record, body) {
    const pathStr = mapping.map?.[kcKey];
    if (pathStr) {
        const fromRecord = getByPath(record, pathStr);
        if (fromRecord !== undefined && fromRecord !== null && String(fromRecord).trim() !== '') {
            return fromRecord;
        }
        const fromBody = getByPath(body, pathStr);
        if (fromBody !== undefined && fromBody !== null && String(fromBody).trim() !== '') {
            return fromBody;
        }
        const last = pathStr.split('.').pop();
        const deepRec = findValueDeep(record, last);
        if (deepRec !== undefined && deepRec !== null && String(deepRec).trim() !== '') return deepRec;
        const deepBody = findValueDeep(body, last);
        if (deepBody !== undefined && deepBody !== null && String(deepBody).trim() !== '') return deepBody;
    }
    const deep = findValueDeep(record, kcKey);
    if (deep !== undefined && deep !== null && String(deep).trim() !== '') return deep;
    const deepBody = findValueDeep(body, kcKey);
    if (deepBody !== undefined && deepBody !== null && String(deepBody).trim() !== '') return deepBody;
    return undefined;
}

function parseNumber(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(String(raw).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

function parseQty(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw).replace(/[^0-9-]/g, ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseBoolish(raw) {
    if (raw === true || raw === false) return raw;
    const s = String(raw || '')
        .trim()
        .toLowerCase();
    if (!s) return null;
    if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
    return null;
}

function parseStatusActive(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const s = String(raw).trim().toLowerCase();
    if (
        ['0', 'false', 'inactive', 'disabled', 'out_of_stock', 'outofstock', 'out of stock', 'discontinued', 'n', 'no'].includes(
            s,
        )
    ) {
        return false;
    }
    if (['1', 'true', 'active', 'enabled', 'in_stock', 'instock', 'in stock', 'yes', 'y'].includes(s)) {
        return true;
    }
    return true;
}

function normalizeMetalType(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s) return '';
    if (s.includes('18') && s.includes('gold')) return 'gold_18k';
    if (s.includes('22') && s.includes('gold')) return 'gold_22k';
    if (s.includes('24') && s.includes('gold')) return 'gold';
    if (s.includes('gold')) return 'gold';
    if (s.includes('silver') || s === '925') return 'silver';
    if (s.includes('diamond')) return 'diamond';
    if (s.includes('gift')) return 'gifting';
    return s;
}

function splitStyleCombo(raw) {
    const s = String(raw || '').trim();
    if (!s) return { style_code: '', sku: '' };
    const parts = s.split(/\s*[>›/|]\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) return { style_code: parts[0], sku: parts.slice(1).join(' > ') };
    return { style_code: s, sku: '' };
}

function coerceField(kcKey, raw) {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        if (raw.url) return coerceField(kcKey, raw.url);
        if (raw.value != null) return coerceField(kcKey, raw.value);
    }
    if (kcKey === 'quantity') return parseQty(raw);
    if (NUMERIC_FIELDS.has(kcKey)) return parseNumber(raw);
    if (kcKey === 'make_to_order_only') return parseBoolish(raw);
    if (kcKey === 'status') return raw;
    if (kcKey === 'metal_type') return normalizeMetalType(raw);
    const t = String(raw).trim();
    return t === '' ? undefined : t;
}

function applyMapping(mapping, record, body) {
    const out = {};
    const selected = mapping.selected || [];
    for (const kcKey of selected) {
        const raw = lookupMappedValue(kcKey, mapping, record, body);
        const val = coerceField(kcKey, raw);
        if (val === undefined) continue;
        out[kcKey] = val;
    }
    if (out.style_code && !out.sku) {
        const split = splitStyleCombo(out.style_code);
        if (split.sku) {
            out.style_code = split.style_code;
            out.sku = split.sku;
        }
    }
    return out;
}

async function ensureKumuduSchema(pool) {
    await pool.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_kumudu_stock_link_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_kumudu_link (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            inbound_key VARCHAR(64) NOT NULL,
            api_key VARCHAR(128) NOT NULL,
            store_id VARCHAR(128),
            catalogue_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
            product_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
            stock_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
            sample_catalogue_payload JSONB,
            sample_product_payload JSONB,
            sample_stock_payload JSONB,
            last_catalogue_at TIMESTAMPTZ,
            last_product_at TIMESTAMPTZ,
            last_stock_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_kumudu_link_inbound_key
            ON reseller_kumudu_link (LOWER(TRIM(inbound_key)))
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_kumudu_events (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint VARCHAR(32) NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'ok',
            summary TEXT,
            payload JSONB,
            result JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_events_reseller
            ON reseller_kumudu_events (reseller_user_id, created_at DESC)
    `);
}

async function assertKumuduAccess(query, userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) {
        throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }
    const rows = await query(
        `SELECT id, customer_tier, business_name, custom_domain, reseller_invite_code,
                COALESCE(reseller_kumudu_stock_link_enabled, false) AS enabled
         FROM users WHERE id = $1 LIMIT 1`,
        [uid],
    );
    if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });
    if (String(rows[0].customer_tier || '').toUpperCase() !== 'RESELLER') {
        throw Object.assign(new Error('Only reseller accounts can use Kumudu stock link'), { status: 403 });
    }
    if (!rows[0].enabled) {
        throw Object.assign(new Error('Kumudu software stock link is not enabled for your shop'), {
            status: 403,
        });
    }
    return rows[0];
}

async function pickUniqueInboundKey(query, user, preferred) {
    let base = slugInboundKey(preferred) || defaultInboundKey(user);
    if (!base) base = `r${user.id}`;
    for (let i = 0; i < 12; i += 1) {
        const candidate = i === 0 ? base : `${base}${user.id}`.slice(0, 32);
        const clash = await query(
            `SELECT id FROM reseller_kumudu_link
             WHERE LOWER(TRIM(inbound_key)) = LOWER($1) AND reseller_user_id <> $2
             LIMIT 1`,
            [candidate, user.id],
        );
        if (!clash.length) return candidate;
    }
    return `r${user.id}${crypto.randomBytes(2).toString('hex')}`;
}

async function loadOrCreateLink(query, user) {
    const existing = await query(`SELECT * FROM reseller_kumudu_link WHERE reseller_user_id = $1 LIMIT 1`, [
        user.id,
    ]);
    if (existing[0]) return existing[0];
    const inboundKey = await pickUniqueInboundKey(query, user);
    const apiKey = generateApiKey();
    const inserted = await query(
        `INSERT INTO reseller_kumudu_link (
            reseller_user_id, inbound_key, api_key,
            catalogue_mapping, product_mapping, stock_mapping
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
         RETURNING *`,
        [
            user.id,
            inboundKey,
            apiKey,
            JSON.stringify(emptyMapping('catalogue_creation')),
            JSON.stringify(emptyMapping('product_creation')),
            JSON.stringify(emptyMapping('stock')),
        ],
    );
    return inserted[0];
}

function publicApiOrigin(getPublicApiBaseUrl) {
    const raw =
        (typeof getPublicApiBaseUrl === 'function' ? getPublicApiBaseUrl() : '') ||
        process.env.API_PUBLIC_URL ||
        process.env.API_BASE_URL ||
        'https://api.kcjewellers.co.in';
    return String(raw).replace(/\/$/, '');
}

function endpointUrls(origin, inboundKey) {
    const key = String(inboundKey || 'jp').trim();
    const urls = {};
    for (const ep of ENDPOINTS) {
        urls[ep.id] = `${origin}/external/kumudu-${key}/${ep.path}`;
    }
    return urls;
}

function serializeLink(row, origin) {
    const catalogue_mapping = normalizeMapping(row.catalogue_mapping, 'catalogue_creation');
    const product_mapping = normalizeMapping(row.product_mapping, 'product_creation');
    const stock_mapping = normalizeMapping(row.stock_mapping, 'stock');
    const sampleCatalogue = row.sample_catalogue_payload;
    const sampleProduct = row.sample_product_payload;
    const sampleStock = row.sample_stock_payload;
    return {
        inbound_key: row.inbound_key,
        store_id: row.store_id || '',
        api_key: row.api_key,
        endpoints: endpointUrls(origin, row.inbound_key),
        catalogue_mapping,
        product_mapping,
        stock_mapping,
        mappings: {
            catalogue_creation: catalogue_mapping,
            product_creation: product_mapping,
            stock: stock_mapping,
        },
        samples: {
            catalogue_creation: sampleCatalogue || null,
            product_creation: sampleProduct || null,
            stock: sampleStock || null,
        },
        detected_keys: {
            catalogue_creation: uniqueKeys(flattenPayloadKeys(sampleCatalogue)),
            product_creation: uniqueKeys(flattenPayloadKeys(sampleProduct)),
            stock: uniqueKeys(flattenPayloadKeys(sampleStock)),
        },
        last_catalogue_at: row.last_catalogue_at,
        last_product_at: row.last_product_at,
        last_stock_at: row.last_stock_at,
    };
}

function skuSlugFromStyleAndSku(styleSlug, skuCode) {
    const sku = String(skuCode || 'N/A').trim();
    return `${styleSlug}-${sku.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'na'}`;
}

async function ensureStyleAndSku(query, mapped, { publish = true } = {}) {
    const styleCode = String(mapped.style_code || '').trim();
    const skuCode = String(mapped.sku || '').trim() || (styleCode ? 'N/A' : '');
    if (!styleCode) return { catId: null, subId: null, styleCode: '', skuCode: '' };
    const styleSlug = styleSlugFromCode(styleCode);
    await query(
        `
        INSERT INTO web_categories (name, slug, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (slug) DO UPDATE SET name = $1, updated_at = CURRENT_TIMESTAMP
        `,
        [styleCode, styleSlug],
    );
    if (publish) {
        try {
            await query(
                `UPDATE web_categories SET is_published = true, updated_at = CURRENT_TIMESTAMP WHERE slug = $1`,
                [styleSlug],
            );
        } catch {
            /* is_published may be missing on very old DBs */
        }
    }
    const catRows = await query('SELECT id FROM web_categories WHERE slug = $1', [styleSlug]);
    const catId = catRows[0]?.id || null;
    let subId = null;
    if (catId && skuCode) {
        const skuSlug = skuSlugFromStyleAndSku(styleSlug, skuCode);
        await query(
            `
            INSERT INTO web_subcategories (category_id, name, slug, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (slug) DO UPDATE SET name = $2, category_id = $1, updated_at = CURRENT_TIMESTAMP
            `,
            [catId, skuCode, skuSlug],
        );
        const subRows = await query('SELECT id FROM web_subcategories WHERE slug = $1', [skuSlug]);
        subId = subRows[0]?.id || null;
    }
    return { catId, subId, styleCode, skuCode };
}

async function grantCategoryToReseller(query, resellerUserId, catId, metalType) {
    if (!catId) return;
    const rows = await query(
        `SELECT allowed_category_ids, COALESCE(allowed_category_metals, '{}'::jsonb) AS allowed_category_metals
         FROM users WHERE id = $1`,
        [resellerUserId],
    );
    if (!rows[0]) return;
    const rawIds = rows[0].allowed_category_ids;
    const ids = Array.isArray(rawIds)
        ? rawIds.map((n) => parseInt(String(n), 10)).filter((n) => Number.isFinite(n) && n > 0)
        : null;
    const metals = parseAllowedCategoryMetals(rows[0].allowed_category_metals);
    let changed = false;
    let nextIds = ids;
    if (ids) {
        if (!ids.includes(catId)) {
            nextIds = [...ids, catId];
            changed = true;
        }
    }
    const family = metalType ? classifyCatalogMetalFamily(metalType) : '';
    if (family && CATALOG_METAL_OK.has(family)) {
        const key = String(catId);
        const cur = Array.isArray(metals[key]) ? [...metals[key]] : [];
        if (!cur.includes(family)) {
            metals[key] = [...cur, family];
            changed = true;
        }
    }
    if (!changed) return;
    if (nextIds) {
        await query(
            `UPDATE users
             SET allowed_category_ids = $2,
                 allowed_category_metals = $3::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [resellerUserId, nextIds, JSON.stringify(metals)],
        );
    } else {
        await query(
            `UPDATE users
             SET allowed_category_metals = $2::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [resellerUserId, JSON.stringify(metals)],
        );
    }
}

const CATALOG_METAL_OK = new Set(['gold', 'silver', 'diamond', 'gifting']);

function trimCmp(a) {
    return String(a || '')
        .trim()
        .toLowerCase();
}

async function findExistingProduct(query, resellerUserId, mapped) {
    const barcode = String(mapped.barcode || '').trim();
    const name = String(mapped.product_name || '').trim();
    const style = String(mapped.style_code || '').trim();
    const sku = String(mapped.sku || '').trim();
    const metal = normalizeMetalType(mapped.metal_type || '');

    if (barcode) {
        const bySku = await query(
            `SELECT wp.*, ws.name AS subcategory_name, wc.name AS style_name
             FROM web_products wp
             LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
             LEFT JOIN web_categories wc ON wc.id = ws.category_id
             WHERE wp.submitted_by_user_id = $1
               AND (
                    LOWER(TRIM(wp.sku)) = LOWER($2)
                 OR LOWER(TRIM(COALESCE(wp.barcode, ''))) = LOWER($2)
               )
             ORDER BY wp.updated_at DESC NULLS LAST
             LIMIT 1`,
            [resellerUserId, barcode],
        );
        if (bySku[0]) return bySku[0];
    }

    const loose = await query(
        `SELECT wp.*, ws.name AS subcategory_name, wc.name AS style_name
         FROM web_products wp
         LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
         LEFT JOIN web_categories wc ON wc.id = ws.category_id
         WHERE wp.submitted_by_user_id = $1
         ORDER BY wp.updated_at DESC NULLS LAST
         LIMIT 4000`,
        [resellerUserId],
    );

    const scoreRow = (row) => {
        let s = 0;
        if (barcode && (trimCmp(row.sku) === trimCmp(barcode) || trimCmp(row.barcode) === trimCmp(barcode))) s += 50;
        if (style && trimCmp(row.style_name) === trimCmp(style)) s += 12;
        if (sku && trimCmp(row.subcategory_name) === trimCmp(sku)) s += 12;
        if (name && trimCmp(row.name) === trimCmp(name)) s += 10;
        if (metal && trimCmp(row.metal_type) === trimCmp(metal)) s += 6;
        if (mapped.design_group && trimCmp(row.design_group) === trimCmp(mapped.design_group)) s += 8;
        if (mapped.size && trimCmp(row.size) === trimCmp(mapped.size)) s += 4;
        return s;
    };

    let best = null;
    let bestScore = 0;
    for (const row of loose) {
        const s = scoreRow(row);
        if (s > bestScore) {
            best = row;
            bestScore = s;
        }
    }
    const need = (barcode ? 50 : 0) + (style && sku ? 20 : name && style ? 18 : 16);
    if (best && bestScore >= Math.min(need, 16)) return best;
    return null;
}

function maybeSaveDataImage(raw, prodSku, uploadsDir, suffix = '') {
    const s = String(raw || '').trim();
    if (!s || !uploadsDir || !prodSku) return null;
    const m = s.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
    if (!m) return null;
    const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return null;
    fs.mkdirSync(uploadsDir, { recursive: true });
    const file = `${prodSku}${suffix}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, file), buf);
    return file;
}

function resolveImageValue(raw, prodSku, uploadsDir, apiBase, suffix = '') {
    const s = String(raw || '').trim();
    if (!s) return { url: null, provided: false };
    const saved = maybeSaveDataImage(s, prodSku, uploadsDir, suffix);
    if (saved) return { url: `${apiBase}/uploads/web_products/${saved}`, provided: true };
    if (/^https?:\/\//i.test(s)) return { url: s, provided: true };
    if (s.startsWith('/')) return { url: `${apiBase}${s}`, provided: true };
    return { url: s, provided: true };
}

function hasExistingImage(row, uploadsDir) {
    if (row?.image_url && String(row.image_url).trim()) return true;
    if (uploadsDir && productImageFileExists(uploadsDir, row?.sku)) return true;
    return false;
}

function mappedToSyncItem(mapped) {
    const item = {};
    if (mapped.style_code != null) item.style_code = mapped.style_code;
    if (mapped.sku != null) item.sku = mapped.sku;
    if (mapped.barcode != null) {
        item.barcode = mapped.barcode;
        item.Barcode = mapped.barcode;
    }
    if (mapped.product_name != null) item.product_name = mapped.product_name;
    if (mapped.design_group != null) item.itemCode = mapped.design_group;
    if (mapped.metal_type != null) item.metal_type = mapped.metal_type;
    if (mapped.size != null) item.size = mapped.size;
    if (mapped.quantity != null) item.quantity = mapped.quantity;
    if (mapped.net_weight != null) item.net_weight = mapped.net_weight;
    if (mapped.gross_weight != null) item.gross_weight = mapped.gross_weight;
    if (mapped.weight_display != null) item.weight_display = mapped.weight_display;
    if (mapped.wastage_pct != null) item.wastage_pct = mapped.wastage_pct;
    if (mapped.chain_weight != null) item.chain_weight = mapped.chain_weight;
    if (mapped.pendant_weight != null) item.pendant_weight = mapped.pendant_weight;
    if (mapped.earring_weight != null) item.earring_weight = mapped.earring_weight;
    if (mapped.purity != null) item.purity = mapped.purity;
    if (mapped.mc_rate != null) item.mc_rate = mapped.mc_rate;
    if (mapped.mc_type != null) item.mc_type = mapped.mc_type;
    if (mapped.fixed_price != null) item.fixed_price = mapped.fixed_price;
    if (mapped.stone_charges != null) item.stone_charges = mapped.stone_charges;
    if (mapped.box_charges != null) item.box_charges = mapped.box_charges;
    if (mapped.mrp_rate_behind_box != null) item.mrp_rate_behind_box = mapped.mrp_rate_behind_box;
    if (mapped.image_url != null) item.image_url = mapped.image_url;
    if (mapped.secondary_image_url != null) item.secondary_image_url = mapped.secondary_image_url;
    if (mapped.box_image_url != null) item.box_image_url = mapped.box_image_url;
    if (mapped.video_url != null) item.video_url = mapped.video_url;
    if (mapped.brand != null) item.brand = mapped.brand;
    if (mapped.make_to_order_only != null) item.make_to_order_only = mapped.make_to_order_only;
    return item;
}

async function patchExistingProduct(query, row, mapped, { uploadsDir, apiBase }) {
    const sets = [];
    const params = [];
    const push = (sql, val) => {
        params.push(val);
        sets.push(`${sql} = $${params.length}`);
    };

    if (mapped.product_name != null && String(mapped.product_name).trim()) {
        push('name', String(mapped.product_name).trim());
    }
    if (mapped.size != null && String(mapped.size).trim()) push('size', String(mapped.size).trim());
    if (mapped.design_group != null && String(mapped.design_group).trim()) {
        push('design_group', String(mapped.design_group).trim());
    }
    if (mapped.metal_type != null && String(mapped.metal_type).trim()) {
        push('metal_type', String(mapped.metal_type).trim());
    }
    if (mapped.purity != null) push('purity', String(mapped.purity).trim() || null);
    if (mapped.quantity != null) push('quantity', mapped.quantity);
    if (mapped.net_weight != null) push('net_weight', mapped.net_weight);
    if (mapped.gross_weight != null) push('gross_weight', mapped.gross_weight);
    if (mapped.weight_display != null) push('weight_display', mapped.weight_display);
    if (mapped.wastage_pct != null) push('wastage_pct', mapped.wastage_pct);
    if (mapped.chain_weight != null) push('chain_weight', mapped.chain_weight);
    if (mapped.pendant_weight != null) push('pendant_weight', mapped.pendant_weight);
    if (mapped.earring_weight != null) push('earring_weight', mapped.earring_weight);
    if (mapped.mc_rate != null) push('mc_rate', mapped.mc_rate);
    if (mapped.mc_type != null) push('mc_type', mapped.mc_type);
    if (mapped.fixed_price != null) push('fixed_price', mapped.fixed_price);
    if (mapped.stone_charges != null) push('stone_charges', mapped.stone_charges);
    if (mapped.box_charges != null) push('box_charges', mapped.box_charges);
    if (mapped.mrp_rate_behind_box != null) push('mrp_rate_behind_box', mapped.mrp_rate_behind_box);
    if (mapped.brand != null) {
        try {
            push('brand', mapped.brand);
        } catch {
            /* optional column */
        }
    }
    if (mapped.make_to_order_only != null) push('make_to_order_only', !!mapped.make_to_order_only);

    const active = parseStatusActive(mapped.status);
    if (active != null) push('is_active', active);

    const img = mapped.image_url
        ? resolveImageValue(mapped.image_url, row.sku, uploadsDir, apiBase, '')
        : { url: null, provided: false };
    if (img.provided && img.url) {
        if (!hasExistingImage(row, uploadsDir) || String(row.image_url || '').trim() !== img.url) {
            push('image_url', img.url);
        }
    }
    if (mapped.secondary_image_url) {
        const sec = resolveImageValue(mapped.secondary_image_url, row.sku, uploadsDir, apiBase, '_secondary');
        if (sec.provided && sec.url && !String(row.secondary_image_url || '').trim()) {
            push('secondary_image_url', sec.url);
        } else if (sec.provided && sec.url && String(row.secondary_image_url || '').trim() !== sec.url) {
            push('secondary_image_url', sec.url);
        }
    }
    if (mapped.box_image_url) {
        const box = resolveImageValue(mapped.box_image_url, row.sku, uploadsDir, apiBase, '_box');
        if (box.provided && box.url) push('box_image_url', box.url);
    }
    if (mapped.video_url) {
        const vid = String(mapped.video_url).trim();
        if (vid) push('video_url', vid);
    }

    if (!sets.length) return { updated: false, id: row.id, sku: row.sku };

    params.push(row.id);
    await query(
        `UPDATE web_products
         SET ${sets.join(', ')}, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${params.length}`,
        params,
    );
    return { updated: true, id: row.id, sku: row.sku };
}

function identityForCreate(mapped) {
    const barcode = String(mapped.barcode || '').trim();
    const name = String(mapped.product_name || '').trim();
    const style = String(mapped.style_code || '').trim();
    const sku = String(mapped.sku || '').trim();
    if (barcode) return barcode;
    const bits = [style, sku, name].filter(Boolean);
    if (bits.length >= 2) {
        return bits
            .join('-')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80);
    }
    return '';
}

async function createProductFromMapped(upsertDeps, resellerUserId, mapped) {
    const barcode = identityForCreate(mapped);
    if (!barcode) {
        return { created: false, error: 'Need barcode / product SKU, or style code + SKU + product name, to create a product' };
    }
    const taken = await upsertDeps.query(
        `SELECT id, submitted_by_user_id, sku
         FROM web_products
         WHERE LOWER(TRIM(sku)) = LOWER($1)
            OR LOWER(TRIM(COALESCE(barcode, ''))) = LOWER($1)
         LIMIT 1`,
        [barcode],
    );
    if (taken[0] && Number(taken[0].submitted_by_user_id) !== Number(resellerUserId)) {
        return {
            created: false,
            error: `SKU ${barcode} already exists on another catalogue — skipped so that shop is not overwritten`,
        };
    }
    const item = mappedToSyncItem({ ...mapped, barcode });
    if (!item.style_code) item.style_code = mapped.style_code || 'Uncategorized';
    if (!item.sku) item.sku = mapped.sku || 'N/A';
    if (!item.product_name) item.product_name = mapped.product_name || barcode;
    const result = await upsertWebProductFromSyncItem(upsertDeps, item, {
        submittedByUserId: resellerUserId,
        publishCategory: true,
    });
    return { created: true, sku: result.prodSku, style_code: result.styleCode, catId: result.catId };
}

async function processRecord(deps, { endpoint, mapping, record, body, resellerUserId }) {
    const mapped = applyMapping(mapping, record, body);
    if (!Object.keys(mapped).length) {
        return { action: 'skipped', reason: 'no_mapped_values' };
    }

    if (endpoint === 'catalogue_creation') {
        const ensured = await ensureStyleAndSku(deps.query, mapped, { publish: true });
        if (!ensured.catId) {
            return { action: 'skipped', reason: 'missing_style_code', mapped };
        }
        await grantCategoryToReseller(deps.query, resellerUserId, ensured.catId, mapped.metal_type);
        const existing = await findExistingProduct(deps.query, resellerUserId, mapped);
        if (existing && (mapped.quantity != null || mapped.net_weight != null || mapped.image_url)) {
            const patch = await patchExistingProduct(deps.query, existing, mapped, {
                uploadsDir: deps.uploadsWebProductsDir,
                apiBase: deps.getPublicApiBaseUrl(),
            });
            return { action: 'catalogue_updated_product', ...ensured, ...patch, mapped };
        }
        return { action: 'catalogue_ensured', ...ensured, mapped };
    }

    const existing = await findExistingProduct(deps.query, resellerUserId, mapped);
    if (existing) {
        if (mapped.style_code || mapped.sku) {
            const ensured = await ensureStyleAndSku(deps.query, {
                style_code: mapped.style_code || existing.style_name,
                sku: mapped.sku || existing.subcategory_name,
            });
            if (ensured.catId) {
                await grantCategoryToReseller(deps.query, resellerUserId, ensured.catId, mapped.metal_type || existing.metal_type);
            }
            if (ensured.subId && ensured.subId !== existing.subcategory_id) {
                await deps.query(
                    `UPDATE web_products SET subcategory_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                    [existing.id, ensured.subId],
                );
            }
        }
        const patch = await patchExistingProduct(deps.query, existing, mapped, {
            uploadsDir: deps.uploadsWebProductsDir,
            apiBase: deps.getPublicApiBaseUrl(),
        });
        return { action: 'updated', ...patch, mapped };
    }

    if (endpoint === 'stock') {
        return { action: 'skipped', reason: 'product_not_found', mapped };
    }

    if (mapped.style_code) {
        const ensured = await ensureStyleAndSku(deps.query, mapped, { publish: true });
        if (ensured.catId) {
            await grantCategoryToReseller(deps.query, resellerUserId, ensured.catId, mapped.metal_type);
        }
    }
    const created = await createProductFromMapped(
        {
            query: deps.query,
            pool: deps.pool,
            getPublicApiBaseUrl: deps.getPublicApiBaseUrl,
            lookUpSecondaryDisk: deps.lookUpSecondaryDisk || (() => ''),
            resolveSecondaryUrlFromPayload: deps.resolveSecondaryUrlFromPayload,
            uploadsWebProductsDir: deps.uploadsWebProductsDir,
        },
        resellerUserId,
        mapped,
    );
    if (created.catId) {
        await grantCategoryToReseller(deps.query, resellerUserId, created.catId, mapped.metal_type);
    }
    return { action: created.created ? 'created' : 'skipped', ...created, mapped };
}

function mappingForEndpoint(linkRow, endpoint) {
    if (endpoint === 'catalogue_creation') return normalizeMapping(linkRow.catalogue_mapping, endpoint);
    if (endpoint === 'product_creation') return normalizeMapping(linkRow.product_mapping, endpoint);
    return normalizeMapping(linkRow.stock_mapping, endpoint);
}

function sampleColumn(endpoint) {
    if (endpoint === 'catalogue_creation') return 'sample_catalogue_payload';
    if (endpoint === 'product_creation') return 'sample_product_payload';
    return 'sample_stock_payload';
}

function lastAtColumn(endpoint) {
    if (endpoint === 'catalogue_creation') return 'last_catalogue_at';
    if (endpoint === 'product_creation') return 'last_product_at';
    return 'last_stock_at';
}

async function logEvent(query, { resellerUserId, endpoint, status, summary, payload, result }) {
    await query(
        `INSERT INTO reseller_kumudu_events (reseller_user_id, endpoint, status, summary, payload, result)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
            resellerUserId,
            endpoint,
            status,
            summary || '',
            payload != null ? JSON.stringify(payload) : null,
            result != null ? JSON.stringify(result) : null,
        ],
    );
    await query(
        `DELETE FROM reseller_kumudu_events
         WHERE reseller_user_id = $1
           AND id NOT IN (
             SELECT id FROM reseller_kumudu_events
             WHERE reseller_user_id = $1
             ORDER BY created_at DESC
             LIMIT 80
           )`,
        [resellerUserId],
    );
}

function readInboundApiKey(req) {
    const header = req.headers['x-api-key'] || req.headers['x-kumudu-key'];
    if (header) return String(header).trim();
    const auth = String(req.headers.authorization || '');
    if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
    if (req.query?.api_key) return String(req.query.api_key).trim();
    if (req.body && typeof req.body === 'object' && req.body.api_key) return String(req.body.api_key).trim();
    return '';
}

function readStoreId(req) {
    const header = req.headers['x-store-id'] || req.headers['x-kumudu-store'];
    if (header) return String(header).trim();
    if (req.query?.store_id) return String(req.query.store_id).trim();
    if (req.body && typeof req.body === 'object') {
        if (req.body.store_id) return String(req.body.store_id).trim();
        if (req.body.storeId) return String(req.body.storeId).trim();
    }
    return '';
}

function normalizeEndpointParam(raw) {
    const s = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/-/g, '_');
    if (s === 'catalogue' || s === 'catalog' || s === 'catalogue_creation') return 'catalogue_creation';
    if (s === 'product' || s === 'products' || s === 'product_creation') return 'product_creation';
    if (s === 'stock' || s === 'stocks' || s === 'inventory') return 'stock';
    if (s === 'health') return 'health';
    return s;
}

async function handleInbound(deps, req, res, inboundKey, endpointRaw) {
    const endpoint = normalizeEndpointParam(endpointRaw);
    if (endpoint === 'health') {
        return res.json({ ok: true, service: 'kumudu-stock-link', inbound_key: inboundKey });
    }
    if (!ENDPOINT_IDS.includes(endpoint)) {
        return res.status(404).json({ error: 'Unknown Kumudu endpoint' });
    }
    const key = slugInboundKey(inboundKey);
    if (!key) return res.status(404).json({ error: 'Unknown shop' });

    const links = await deps.query(
        `SELECT k.*, u.id AS user_id,
                COALESCE(u.reseller_kumudu_stock_link_enabled, false) AS enabled
         FROM reseller_kumudu_link k
         JOIN users u ON u.id = k.reseller_user_id
         WHERE LOWER(TRIM(k.inbound_key)) = LOWER($1)
         LIMIT 1`,
        [key],
    );
    const link = links[0];
    if (!link) return res.status(404).json({ error: 'Kumudu link not found for this shop' });
    if (!link.enabled) {
        return res.status(403).json({ error: 'Kumudu software stock link is turned off for this shop' });
    }

    const apiKey = readInboundApiKey(req);
    if (!apiKey || apiKey !== link.api_key) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const expectedStore = String(link.store_id || '').trim();
    const incomingStore = readStoreId(req);
    if (expectedStore && incomingStore && trimCmp(expectedStore) !== trimCmp(incomingStore)) {
        return res.status(403).json({ error: 'store_id does not match this shop' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const mapping = mappingForEndpoint(link, endpoint);
    const records = extractRecords(body);

    await deps.query(
        `UPDATE reseller_kumudu_link
         SET ${sampleColumn(endpoint)} = $2::jsonb,
             ${lastAtColumn(endpoint)} = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [link.id, JSON.stringify(body)],
    );

    if (!mapping.selected.length) {
        await logEvent(deps.query, {
            resellerUserId: link.reseller_user_id,
            endpoint,
            status: 'stored',
            summary: 'Payload stored. Map fields in Profile → Kumudu software stock link, then Kumudu can retry.',
            payload: body,
            result: { records: records.length },
        });
        return res.status(202).json({
            ok: true,
            stored: true,
            message: 'Payload stored. Select and map fields in the Kumudu software stock link module, then resend.',
            records: records.length,
        });
    }

    const results = [];
    for (const record of records) {
        try {
            const one = await processRecord(deps, {
                endpoint,
                mapping,
                record,
                body,
                resellerUserId: link.reseller_user_id,
            });
            results.push(one);
        } catch (e) {
            results.push({ action: 'error', error: e.message || 'Failed' });
        }
    }

    const errors = results.filter((r) => r.action === 'error' || r.action === 'skipped');
    const status = results.some((r) => r.action === 'error') ? 'error' : 'ok';
    const summary = `${results.length} record(s): ${results.map((r) => r.action).join(', ')}`;
    await logEvent(deps.query, {
        resellerUserId: link.reseller_user_id,
        endpoint,
        status,
        summary,
        payload: body,
        result: { results, error_count: errors.length },
    });

    return res.json({
        ok: status === 'ok',
        endpoint,
        count: results.length,
        results,
    });
}

function registerResellerKumuduLinkRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, getPublicApiBaseUrl } = deps;
    const origin = () => publicApiOrigin(getPublicApiBaseUrl);

    const inboundHandler = (req, res) => {
        handleInbound(deps, req, res, req.params.inboundKey, req.params.action).catch((e) => {
            console.error('kumudu inbound:', e);
            res.status(500).json({ error: e.message || 'Kumudu ingest failed' });
        });
    };

    const healthOnly = (req, res) => {
        const action = normalizeEndpointParam(req.params.action);
        if (action !== 'health') {
            return res.status(405).json({
                error: 'Use POST JSON for this Kumudu endpoint',
                endpoint: action,
            });
        }
        return inboundHandler(req, res);
    };

    app.post('/external/kumudu-:inboundKey/:action', inboundHandler);
    app.post('/api/external/kumudu-:inboundKey/:action', inboundHandler);
    app.post('/external/kumudu/:inboundKey/:action', inboundHandler);
    app.post('/api/external/kumudu/:inboundKey/:action', inboundHandler);
    app.get('/external/kumudu-:inboundKey/:action', healthOnly);
    app.get('/api/external/kumudu-:inboundKey/:action', healthOnly);
    app.get('/external/kumudu/:inboundKey/:action', healthOnly);
    app.get('/api/external/kumudu/:inboundKey/:action', healthOnly);

    app.get('/api/reseller/kumudu-link', checkAuth, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const events = await query(
                `SELECT id, endpoint, status, summary, created_at
                 FROM reseller_kumudu_events
                 WHERE reseller_user_id = $1
                 ORDER BY created_at DESC
                 LIMIT 25`,
                [user.id],
            );
            res.json({
                enabled: true,
                fields: KC_FIELDS,
                endpoints: ENDPOINTS,
                recommended: RECOMMENDED,
                ...serializeLink(link, origin()),
                events,
            });
        } catch (e) {
            const status = e.status || 500;
            if (status === 403) return res.status(403).json({ enabled: false, error: e.message });
            res.status(status).json({ error: e.message || 'Failed to load Kumudu link' });
        }
    });

    app.put('/api/reseller/kumudu-link', checkAuth, requireJson, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const body = req.body || {};
            const catalogue_mapping = normalizeMapping(
                body.catalogue_mapping || body.mappings?.catalogue_creation,
                'catalogue_creation',
            );
            const product_mapping = normalizeMapping(
                body.product_mapping || body.mappings?.product_creation,
                'product_creation',
            );
            const stock_mapping = normalizeMapping(body.stock_mapping || body.mappings?.stock, 'stock');
            const storeId =
                body.store_id !== undefined ? String(body.store_id || '').trim().slice(0, 128) : link.store_id;
            let inboundKey = link.inbound_key;
            if (body.inbound_key != null && String(body.inbound_key).trim()) {
                inboundKey = await pickUniqueInboundKey(query, user, body.inbound_key);
            }
            const updated = await query(
                `UPDATE reseller_kumudu_link
                 SET store_id = $2,
                     inbound_key = $3,
                     catalogue_mapping = $4::jsonb,
                     product_mapping = $5::jsonb,
                     stock_mapping = $6::jsonb,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [
                    link.id,
                    storeId || null,
                    inboundKey,
                    JSON.stringify(catalogue_mapping),
                    JSON.stringify(product_mapping),
                    JSON.stringify(stock_mapping),
                ],
            );
            res.json({ ok: true, ...serializeLink(updated[0], origin()) });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to save mapping' });
        }
    });

    app.post('/api/reseller/kumudu-link/regenerate-key', checkAuth, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const apiKey = generateApiKey();
            const updated = await query(
                `UPDATE reseller_kumudu_link
                 SET api_key = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [link.id, apiKey],
            );
            res.json({ ok: true, api_key: updated[0].api_key });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to regenerate key' });
        }
    });

    app.post('/api/reseller/kumudu-link/sample', checkAuth, requireJson, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const endpoint = normalizeEndpointParam(req.body?.endpoint);
            if (!ENDPOINT_IDS.includes(endpoint)) {
                return res.status(400).json({ error: 'Pick catalogue_creation, product_creation or stock' });
            }
            let payload = req.body?.payload;
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch {
                    return res.status(400).json({ error: 'Sample must be valid JSON' });
                }
            }
            if (!payload || typeof payload !== 'object') {
                return res.status(400).json({ error: 'Paste a JSON payload from Kumudu' });
            }
            const keys = uniqueKeys(flattenPayloadKeys(payload));
            const mapping = mappingForEndpoint(link, endpoint);
            const suggested = { ...mapping.map };
            for (const kc of mapping.selected) {
                if (!suggested[kc]) {
                    const guess = suggestPathForField(kc, keys);
                    if (guess) suggested[kc] = guess;
                }
            }
            await query(
                `UPDATE reseller_kumudu_link
                 SET ${sampleColumn(endpoint)} = $2::jsonb, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [link.id, JSON.stringify(payload)],
            );
            res.json({
                ok: true,
                endpoint,
                detected_keys: keys,
                suggested_map: suggested,
            });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to save sample' });
        }
    });

    app.post('/api/reseller/kumudu-link/preview', checkAuth, requireJson, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const endpoint = normalizeEndpointParam(req.body?.endpoint);
            if (!ENDPOINT_IDS.includes(endpoint)) {
                return res.status(400).json({ error: 'Pick an endpoint' });
            }
            let payload = req.body?.payload;
            if (typeof payload === 'string') {
                try {
                    payload = JSON.parse(payload);
                } catch {
                    return res.status(400).json({ error: 'Payload must be valid JSON' });
                }
            }
            const mapping = req.body?.mapping
                ? normalizeMapping(req.body.mapping, endpoint)
                : mappingForEndpoint(link, endpoint);
            const body = payload && typeof payload === 'object' ? payload : {};
            const records = extractRecords(body);
            const preview = records.slice(0, 20).map((record) => applyMapping(mapping, record, body));
            res.json({ ok: true, count: records.length, preview, detected_keys: uniqueKeys(flattenPayloadKeys(body)) });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Preview failed' });
        }
    });
}

async function provisionResellerKumuduLink(query, userRow) {
    if (!userRow || !userRow.id) return null;
    return loadOrCreateLink(query, userRow);
}

module.exports = {
    registerResellerKumuduLinkRoutes,
    ensureKumuduSchema,
    provisionResellerKumuduLink,
    KC_FIELDS,
    ENDPOINTS,
};

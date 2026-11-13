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
const { slugPart } = require('./productVariantIdentity');

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
    {
        key: 'kumudu_catalogue_ref',
        label: 'Kumudu catalogue id',
        group: 'Connection',
        hint: 'Their catalogue field (e.g. -P6962Fku…) — link products after catalogue_creation',
    },
    {
        key: 'catalogue_sync_id',
        label: 'KC catalogue sync id',
        group: 'Connection',
        hint: 'Value from catalogue_creation response — product/stock must match the right style',
    },
    {
        key: 'product_sync_id',
        label: 'KC product sync id',
        group: 'Connection',
        hint: 'From product_creation response — stock must reference the same piece',
    },
];

const KC_FIELD_KEYS = new Set(KC_FIELDS.map((f) => f.key));

const RECOMMENDED = {
    catalogue_creation: ['style_code', 'sku', 'product_name', 'metal_type'],
    product_creation: [
        'catalogue_sync_id',
        'kumudu_catalogue_ref',
        'barcode',
        'product_name',
        'sku',
        'image_url',
        'metal_type',
        'net_weight',
    ],
    stock: [
        'product_sync_id',
        'barcode',
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

function kumuduCustomField(record, wantedNames) {
    const list = Array.isArray(record?.customFields) ? record.customFields : [];
    const wants = wantedNames.map((n) => normalizeKey(n));
    for (const row of list) {
        const name = normalizeKey(row?.name);
        if (!name || !wants.includes(name)) continue;
        const val = row?.value;
        if (val !== undefined && val !== null && String(val).trim() !== '') return val;
    }
    return undefined;
}

function getByPath(obj, dotted) {
    if (obj == null || !dotted) return undefined;
    const path = String(dotted).trim();
    const cfMatch = path.match(/^customFields\.(.+)$/i);
    if (cfMatch) {
        return kumuduCustomField(obj, [cfMatch[1]]);
    }
    const parts = path
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
    let cur = obj;
    for (const part of parts) {
        if (cur == null) return undefined;
        if (/^\d+$/.test(part) && Array.isArray(cur)) {
            cur = cur[parseInt(part, 10)];
            continue;
        }
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
        'product',
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
        sku: ['skucode', 'subcategory', 'stylesku', 'itemsku', 'shortcode'],
        style_code: ['stylecode', 'style', 'category', 'designcode', 'description', 'item'],
        kumudu_catalogue_ref: ['catalogue', 'catalogueid', 'catid'],
        catalogue_sync_id: ['cataloguesyncid', 'kccatalogueid'],
        product_sync_id: ['productsyncid', 'kcproductid'],
        image_url: ['imageurl', 'image', 'photo', 'photourl', 'img', 'picture', 'mediaurl'],
        purity: ['purity', 'entityquality'],
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
    if (kcKey === 'barcode') {
        const skuPath = detectedKeys.find((p) => normalizeKey(p.split('.').pop() || '') === 'sku');
        if (skuPath) return skuPath;
    }
    if (kcKey === 'product_name') {
        const namePath = detectedKeys.find((p) => normalizeKey(p.split('.').pop() || '') === 'name');
        if (namePath) return namePath;
    }
    return scored[0]?.pathStr || '';
}

function lookupMappedValue(kcKey, mapping, record, body, options = {}) {
    const strict = !!options.strict;
    const pathStr = String(mapping.map?.[kcKey] || '').trim();
    if (!pathStr) {
        if (strict) return undefined;
    }
    if (pathStr) {
        const fromRecord = getByPath(record, pathStr);
        if (fromRecord !== undefined && fromRecord !== null && String(fromRecord).trim() !== '') {
            return fromRecord;
        }
        const fromBody = getByPath(body, pathStr);
        if (fromBody !== undefined && fromBody !== null && String(fromBody).trim() !== '') {
            return fromBody;
        }
        if (strict) return undefined;
        const last = pathStr.split('.').pop();
        const deepRec = findValueDeep(record, last);
        if (deepRec !== undefined && deepRec !== null && String(deepRec).trim() !== '') return deepRec;
        const deepBody = findValueDeep(body, last);
        if (deepBody !== undefined && deepBody !== null && String(deepBody).trim() !== '') return deepBody;
    }
    if (strict) return undefined;
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

function pickErpScalar(record, ...aliases) {
    for (const key of aliases) {
        const direct = record?.[key];
        if (direct !== undefined && direct !== null && String(direct).trim() !== '') {
            return String(direct).trim();
        }
        const deep = findValueDeep(record, key);
        if (deep !== undefined && deep !== null && String(deep).trim() !== '') {
            return String(deep).trim();
        }
    }
    return '';
}

function erpItemFirstWord(itemRaw) {
    const m = String(itemRaw || '')
        .trim()
        .match(/^([^\s]+)/);
    return m ? m[1].toLowerCase() : '';
}

function isEmeraldIdolsErpItem(itemRaw) {
    const n = String(itemRaw || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return /^emerald\s+idol(s)?(\s|$)/.test(n) || n === 'emerald idol' || n === 'emerald idols';
}

/**
 * Kumudu ERP rows: Item / Shortcode / Design semantics depend on the Item family.
 * Pitara* and Air* use fixed style codes with Item as subcategory SKU; Emerald uses Shortcode as SKU.
 */
function applyErpCatalogueSemantics(record, mapped) {
    const item = pickErpScalar(record, 'Item', 'item', 'ITEM');
    if (!item) return mapped;

    const shortcode = pickErpScalar(record, 'Shortcode', 'shortcode', 'SHORTCODE');
    const design = pickErpScalar(record, 'Design', 'design', 'DESIGN');
    const out = { ...mapped };
    const fw = erpItemFirstWord(item);

    if (isEmeraldIdolsErpItem(item)) {
        out.style_code = 'EMERALD IDOLS';
        if (shortcode) out.sku = shortcode;
        else if (out.sku && trimCmp(out.sku) === trimCmp(item)) delete out.sku;
        if (design) out.product_name = design;
    } else if (fw === 'pitara') {
        out.style_code = 'PITARA';
        out.sku = item;
        if (design) out.product_name = design;
    } else if (fw === 'air') {
        out.style_code = 'AIR COLLECTION';
        out.sku = item;
        if (design) out.product_name = design;
    }

    return out;
}

function applyMapping(mapping, record, body, options = {}) {
    const out = {};
    const selected = mapping.selected || [];
    for (const kcKey of selected) {
        const raw = lookupMappedValue(kcKey, mapping, record, body, options);
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
    if (options.endpoint === 'catalogue_creation') {
        return applyErpCatalogueSemantics(record, out);
    }
    return out;
}

const KUMUDU_STATIC_HINTS = {
    catalogue_creation: {
        style_code: 'Item',
        sku: 'Shortcode',
        product_name: 'Design',
        metal_type: 'MetalName',
        kumudu_catalogue_ref: 'catalogue',
    },
    product_creation: {
        catalogue_sync_id: 'catalogue_sync_id',
        kumudu_catalogue_ref: 'catalogue',
        barcode: 'sku',
        product_name: 'name',
        sku: 'Shortcode',
        style_code: 'description',
        design_group: 'catalogue',
        net_weight: 'weight',
        gross_weight: 'customFields.grossWeight',
        purity: 'customFields.Purity',
        size: 'customFields.Size',
        metal_type: 'productTypeDetails.entityType',
        image_url: 'media.mediaUrl',
    },
    stock: {
        product_sync_id: 'product_sync_id',
        barcode: 'sku',
        quantity: 'quantity',
        net_weight: 'weight',
    },
};

function pickKumuduCatalogueRef(record, mapped) {
    return (
        String(
            mapped?.kumudu_catalogue_ref ||
                mapped?.design_group ||
                record?.catalogue ||
                record?.CatalogueId ||
                '',
        ).trim() || null
    );
}

function pickCatalogueSyncId(record, mapped) {
    const fromMapped = String(mapped?.catalogue_sync_id || '').trim();
    if (fromMapped) return fromMapped;
    return (
        String(record?.catalogue_sync_id || record?.catalogueSyncId || '').trim() ||
        String(findValueDeep(record, 'catalogue_sync_id') || '').trim() ||
        ''
    );
}

function pickProductSyncId(record, mapped) {
    const fromMapped = String(mapped?.product_sync_id || '').trim();
    if (fromMapped) return fromMapped;
    return (
        String(record?.product_sync_id || record?.productSyncId || '').trim() ||
        String(findValueDeep(record, 'product_sync_id') || '').trim() ||
        ''
    );
}

function isPlaceholderCatalogueSku(sku) {
    const s = trimCmp(sku);
    return !s || s === 'n/a' || s === 'na' || s === 'null' || s === 'none' || s === '-';
}

function enrichKumuduConnectionFields(record, mapped, endpoint) {
    if (endpoint === 'product_creation' || endpoint === 'stock') {
        const catSync = pickCatalogueSyncId(record, mapped);
        if (catSync) mapped.catalogue_sync_id = catSync;
    }
    if (endpoint === 'stock') {
        const prSync = pickProductSyncId(record, mapped);
        if (prSync) mapped.product_sync_id = prSync;
    }
    const kRef = pickKumuduCatalogueRef(record, mapped);
    if (kRef && !mapped.kumudu_catalogue_ref) mapped.kumudu_catalogue_ref = kRef;
}

/** Web piece SKU stem: subcategory slug + product name slug (e.g. bingle-haram-just-a-haram). */
function kumuduCompositeBarcode(mapped, record) {
    const shortcode =
        String(mapped.sku || '').trim() ||
        pickErpScalar(record, 'Shortcode', 'shortcode', 'SKU', 'Sku');
    const design =
        String(mapped.product_name || '').trim() ||
        pickErpScalar(record, 'Design', 'design', 'name', 'Name');
    const cloudSku = pickErpScalar(record, 'sku', 'Sku');
    if (!mapped.product_name && design) mapped.product_name = design;
    if (shortcode && !mapped.sku) mapped.sku = shortcode;

    if (shortcode && design && trimCmp(shortcode) !== trimCmp(design)) {
        return `${slugPart(shortcode)}-${slugPart(design)}`;
    }
    if (design) return slugPart(design);
    if (cloudSku && design) return `${slugPart(cloudSku)}-${slugPart(design)}`;
    if (cloudSku) return slugPart(cloudSku);
    if (shortcode) return slugPart(shortcode);
    return '';
}

/** ERP rows: Shortcode = subcategory SKU; Design = product name; barcode = subcategory-product slug. */
function applyKumuduProductBarcodeFallback(record, mapped) {
    if (String(mapped.barcode || '').trim()) return;
    const composite = kumuduCompositeBarcode(mapped, record);
    if (composite) mapped.barcode = composite;
}

async function applyCataloguePlacementToMapped(query, mapped, placement) {
    if (!placement?.link) return placement;
    mapped.style_code = placement.style_code || placement.link.style_code;
    mapped.catalogue_sync_id = placement.catalogue_sync_id || placement.link.sync_id;
    const linkSku = placement.link.sku_subcategory;
    if (!isPlaceholderCatalogueSku(linkSku)) {
        mapped.sku = linkSku;
    }
    const ensured = await ensureStyleAndSku(query, mapped, { publish: true });
    const next = {
        ...placement,
        style_code: ensured.styleCode || mapped.style_code,
        sku: ensured.skuCode || mapped.sku,
        category_id: ensured.catId ?? placement.category_id,
        subcategory_id: ensured.subId ?? placement.subcategory_id,
    };
    mapped.style_code = next.style_code;
    mapped._placement = next;
    return next;
}

async function ensureKumuduCatalogueRefColumn(query) {
    try {
        await query(
            `ALTER TABLE reseller_kumudu_sync_records
             ADD COLUMN IF NOT EXISTS kumudu_catalogue_ref VARCHAR(128)`,
        );
    } catch {
        /* column may already exist */
    }
}

async function findCatalogueSyncRecord(query, resellerUserId, { syncId, kumuduRef, styleCode, skuCode }) {
    await ensureKumuduCatalogueRefColumn(query);
    const rows = await query(
        `SELECT sync_id, web_category_id, web_subcategory_id, style_code, sku_subcategory, kumudu_catalogue_ref
         FROM reseller_kumudu_sync_records
         WHERE reseller_user_id = $1
           AND sync_kind = 'catalogue'
           AND (
                ($2::text IS NOT NULL AND sync_id = $2)
             OR ($3::text IS NOT NULL AND kumudu_catalogue_ref = $3)
             OR (
                $4::text IS NOT NULL
                AND $5::text IS NOT NULL
                AND LOWER(TRIM(style_code)) = LOWER(TRIM($4))
                AND LOWER(TRIM(sku_subcategory)) = LOWER(TRIM($5))
             )
           )
         ORDER BY created_at DESC
         LIMIT 1`,
        [resellerUserId, syncId || null, kumuduRef || null, styleCode || null, skuCode || null],
    );
    return rows[0] || null;
}

async function findProductSyncRecord(query, resellerUserId, syncId) {
    const id = String(syncId || '').trim();
    if (!id) return null;
    const rows = await query(
        `SELECT sync_id, web_product_id, product_sku, style_code, sku_subcategory, web_subcategory_id
         FROM reseller_kumudu_sync_records
         WHERE reseller_user_id = $1 AND sync_kind = 'product' AND sync_id = $2
         LIMIT 1`,
        [resellerUserId, id],
    );
    return rows[0] || null;
}

async function registerCatalogueSyncIfMissing(query, {
    resellerUserId,
    shopKey,
    ensured,
    mapped,
    kumuduRef,
    batchSyncId,
}) {
    const style = ensured.styleCode || mapped.style_code;
    const sku = ensured.skuCode || mapped.sku;
    let row = await findCatalogueSyncRecord(query, resellerUserId, {
        kumuduRef,
        styleCode: style,
        skuCode: sku,
    });
    if (row?.sync_id) return row.sync_id;
    const syncId = newKumuduSyncId(shopKey, 'cat');
    await insertKumuduSyncRecord(query, {
        resellerUserId,
        shopKey,
        syncKind: 'catalogue',
        syncId,
        batchSyncId: batchSyncId || null,
        endpoint: 'catalogue_creation',
        action: 'catalogue_registered',
        webCategoryId: ensured.catId,
        webSubcategoryId: ensured.subId,
        styleCode: style,
        skuSubcategory: sku,
        kumuduCatalogueRef: kumuduRef,
    });
    return syncId;
}

async function resolveCataloguePlacement(query, resellerUserId, mapped, record) {
    const kumuduRef = pickKumuduCatalogueRef(record, mapped);
    const catSyncId = pickCatalogueSyncId(record, mapped) || null;
    const link = await findCatalogueSyncRecord(query, resellerUserId, {
        syncId: catSyncId,
        kumuduRef,
        styleCode: mapped.style_code,
        skuCode: mapped.sku,
    });
    if (!link && (kumuduRef || catSyncId)) {
        return { ok: false, error: 'Unknown catalogue — use catalogue_creation first or fix catalogue_sync_id / Kumudu catalogue id' };
    }
    if (!link) return { ok: true, link: null };
    if (mapped.style_code && link.style_code && trimCmp(mapped.style_code) !== trimCmp(link.style_code)) {
        return { ok: false, error: 'style_code does not match the linked catalogue' };
    }
    if (
        mapped.sku &&
        link.sku_subcategory &&
        !isPlaceholderCatalogueSku(link.sku_subcategory) &&
        trimCmp(mapped.sku) !== trimCmp(link.sku_subcategory)
    ) {
        return { ok: false, error: 'sku does not match the linked catalogue subcategory' };
    }
    const resolvedSku = isPlaceholderCatalogueSku(link.sku_subcategory) ? mapped.sku : link.sku_subcategory;
    return {
        ok: true,
        link,
        style_code: link.style_code,
        sku: resolvedSku,
        catalogue_sync_id: link.sync_id,
        subcategory_id: link.web_subcategory_id,
        category_id: link.web_category_id,
    };
}

function stripRecordRootPrefix(path, samplePayload) {
    if (!path || !samplePayload || typeof samplePayload !== 'object') return path;
    const records = extractRecords(samplePayload);
    if (!records.length) return path;
    const p = String(path);
    if (p.startsWith('data.')) return p.slice(5);
    if (p.startsWith('products.')) return p.slice(9);
    return p;
}

function buildMappingHints(endpoint, samplePayload) {
    const hints = { ...(KUMUDU_STATIC_HINTS[endpoint] || {}) };
    if (!samplePayload || typeof samplePayload !== 'object') return hints;
    const records = extractRecords(samplePayload);
    const keys =
        records.length > 0
            ? uniqueKeys(flattenPayloadKeys(records[0]))
            : uniqueKeys(flattenPayloadKeys(samplePayload));
    for (const field of KC_FIELDS) {
        const guess = suggestPathForField(field.key, keys);
        if (guess) hints[field.key] = stripRecordRootPrefix(guess, samplePayload);
    }
    return hints;
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
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_kumudu_sync_records (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            shop_key VARCHAR(32) NOT NULL,
            sync_kind VARCHAR(24) NOT NULL,
            sync_id VARCHAR(80) NOT NULL,
            batch_sync_id VARCHAR(80),
            endpoint VARCHAR(32) NOT NULL,
            action VARCHAR(48),
            web_category_id INTEGER,
            web_subcategory_id INTEGER,
            web_product_id INTEGER,
            style_code VARCHAR(255),
            sku_subcategory VARCHAR(255),
            product_sku VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT reseller_kumudu_sync_records_sync_id_key UNIQUE (sync_id)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_sync_reseller
            ON reseller_kumudu_sync_records (reseller_user_id, created_at DESC)
    `);
    await pool.query(`
        ALTER TABLE reseller_kumudu_sync_records
            ADD COLUMN IF NOT EXISTS kumudu_catalogue_ref VARCHAR(128)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_kumudu_sync_kumudu_cat
            ON reseller_kumudu_sync_records (reseller_user_id, kumudu_catalogue_ref)
            WHERE kumudu_catalogue_ref IS NOT NULL
    `);
}

function syncKindTag(endpoint) {
    if (endpoint === 'catalogue_creation') return 'cat';
    if (endpoint === 'product_creation') return 'prd';
    return 'stk';
}

function batchSyncKind(endpoint) {
    if (endpoint === 'catalogue_creation') return 'catalogue';
    if (endpoint === 'product_creation') return 'product';
    return 'stock';
}

function newKumuduSyncId(shopKey, tag) {
    const shop = slugInboundKey(shopKey) || 'shop';
    const suffix = crypto.randomBytes(8).toString('hex');
    return `${shop}-${tag}-${suffix}`;
}

async function insertKumuduSyncRecord(query, row) {
    try {
        await query(
            `INSERT INTO reseller_kumudu_sync_records (
                reseller_user_id, shop_key, sync_kind, sync_id, batch_sync_id, endpoint, action,
                web_category_id, web_subcategory_id, web_product_id,
                style_code, sku_subcategory, product_sku, kumudu_catalogue_ref
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
                row.resellerUserId,
                row.shopKey,
                row.syncKind,
                row.syncId,
                row.batchSyncId || null,
                row.endpoint,
                row.action || null,
                row.webCategoryId ?? null,
                row.webSubcategoryId ?? null,
                row.webProductId ?? null,
                row.styleCode || null,
                row.skuSubcategory || null,
                row.productSku || null,
                row.kumuduCatalogueRef || null,
            ],
        );
    } catch (e) {
        console.warn('kumudu sync record insert:', e.message);
    }
    return row.syncId;
}

async function lookupWebProductId(query, prodSku) {
    const sku = String(prodSku || '').trim();
    if (!sku) return null;
    const rows = await query(
        `SELECT id FROM web_products WHERE LOWER(TRIM(sku)) = LOWER($1) LIMIT 1`,
        [sku],
    );
    return rows[0]?.id ?? null;
}

function kumuduStatusFromAction(action) {
    if (action === 'created' || action === 'catalogue_ensured') return 'created';
    if (action === 'catalogue_exists') return 'exists';
    if (action === 'updated' || action === 'catalogue_updated_product') return 'updated';
    if (action === 'error') return 'error';
    return 'skipped';
}

async function buildPartnerConfirmRow(query, {
    endpoint,
    shopKey,
    batchSyncId,
    resellerUserId,
    processResult,
}) {
    const action = processResult.action || 'skipped';
    const status = action === 'error' ? 'error' : kumuduStatusFromAction(action);
    const tag = syncKindTag(endpoint);
    let itemSyncId = processResult.catalogue_sync_id || newKumuduSyncId(shopKey, tag);
    const syncKind = batchSyncKind(endpoint);

    if (endpoint === 'catalogue_creation') {
        const kumuduRef =
            processResult.kumudu_catalogue_ref ||
            pickKumuduCatalogueRef(processResult._record, processResult.mapped);
        const style = processResult.styleCode || processResult.mapped?.style_code || null;
        const sku = processResult.skuCode || processResult.mapped?.sku || null;
        const prior = await findCatalogueSyncRecord(query, resellerUserId, {
            kumuduRef,
            styleCode: style,
            skuCode: sku,
        });
        if (prior?.sync_id) itemSyncId = prior.sync_id;
        else if (action === 'catalogue_ensured' || action === 'catalogue_exists') {
            itemSyncId = newKumuduSyncId(shopKey, 'cat');
        }
        const row = {
            status,
            action,
            style_code: style,
            sku_subcategory: sku,
            category_id: processResult.catId ?? null,
            subcategory_id: processResult.subId ?? null,
            catalogue_sync_id: itemSyncId,
        };
        if (kumuduRef) row.kumudu_catalogue_ref = kumuduRef;
        if (processResult.error) row.message = processResult.error;
        if (processResult.reason) row.reason = processResult.reason;
        if (processResult.id) row.product_id = processResult.id;
        if (processResult.sku) row.product_sku = processResult.sku;
        const shouldInsert =
            action === 'catalogue_ensured' && !prior?.sync_id && row.category_id && row.subcategory_id;
        const shouldRegisterRef =
            prior?.sync_id && kumuduRef && !prior.kumudu_catalogue_ref;
        if (shouldInsert) {
            await insertKumuduSyncRecord(query, {
                resellerUserId,
                shopKey,
                syncKind,
                syncId: itemSyncId,
                batchSyncId,
                endpoint,
                action,
                webCategoryId: row.category_id,
                webSubcategoryId: row.subcategory_id,
                webProductId: row.product_id ?? null,
                styleCode: row.style_code,
                skuSubcategory: row.sku_subcategory,
                productSku: row.product_sku ?? null,
                kumuduCatalogueRef: kumuduRef,
            });
        } else if (shouldRegisterRef) {
            await query(
                `UPDATE reseller_kumudu_sync_records
                 SET kumudu_catalogue_ref = $2
                 WHERE sync_id = $1 AND reseller_user_id = $3`,
                [itemSyncId, kumuduRef, resellerUserId],
            );
        } else if (action === 'catalogue_exists' && !prior?.sync_id && row.category_id) {
            await insertKumuduSyncRecord(query, {
                resellerUserId,
                shopKey,
                syncKind,
                syncId: itemSyncId,
                batchSyncId,
                endpoint,
                action: 'catalogue_registered',
                webCategoryId: row.category_id,
                webSubcategoryId: row.subcategory_id,
                styleCode: row.style_code,
                skuSubcategory: row.sku_subcategory,
                kumuduCatalogueRef: kumuduRef,
            });
        }
        return row;
    }

    if (endpoint === 'product_creation') {
        let productId = processResult.id ?? null;
        const productSku =
            processResult.sku || processResult.prodSku || processResult.mapped?.barcode || null;
        if (!productId && productSku) {
            productId = await lookupWebProductId(query, productSku);
        }
        itemSyncId = newKumuduSyncId(shopKey, 'prd');
        const row = {
            status,
            action,
            product_sku: productSku,
            product_id: productId,
            style_code: processResult.style_code || processResult.mapped?.style_code || null,
            sku_subcategory: processResult.mapped?.sku || null,
            product_sync_id: itemSyncId,
            category_id: processResult.catId ?? null,
            subcategory_id: processResult.subId ?? processResult.placement?.subcategory_id ?? null,
        };
        if (processResult.placement?.catalogue_sync_id) {
            row.catalogue_sync_id = processResult.placement.catalogue_sync_id;
        }
        if (processResult.error) row.message = processResult.error;
        if (processResult.reason) row.reason = processResult.reason;
        if (action === 'created' || action === 'updated') {
            await insertKumuduSyncRecord(query, {
                resellerUserId,
                shopKey,
                syncKind,
                syncId: itemSyncId,
                batchSyncId,
                endpoint,
                action,
                webCategoryId: row.category_id,
                webSubcategoryId: row.subcategory_id,
                webProductId: productId,
                styleCode: row.style_code,
                skuSubcategory: row.sku_subcategory,
                productSku: row.product_sku,
                kumuduCatalogueRef: pickKumuduCatalogueRef(processResult._record, processResult.mapped),
            });
        }
        return row;
    }

    const productSku = processResult.sku || processResult.mapped?.barcode || null;
    const row = {
        status,
        action,
        product_sku: productSku,
        product_id: processResult.id ?? null,
        stock_sync_id: itemSyncId,
    };
    if (processResult.product_sync_id) row.product_sync_id = processResult.product_sync_id;
    if (processResult.error) row.message = processResult.error;
    if (processResult.mapped?.quantity != null) row.quantity = processResult.mapped.quantity;
    if (processResult.mapped?.net_weight != null) row.net_weight_gm = processResult.mapped.net_weight;
    await insertKumuduSyncRecord(query, {
        resellerUserId,
        shopKey,
        syncKind: 'stock',
        syncId: itemSyncId,
        batchSyncId,
        endpoint,
        action,
        webProductId: row.product_id,
        productSku: row.product_sku,
    });
    return row;
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
    const base = `${origin}/api/external/kumudu-${key}/v1`;
    const urls = {
        health: `${base}/health`,
        last_received: `${base}/last_received`,
        last_received_catalogue: `${base}/last_received_catalogue`,
        last_received_products: `${base}/last_received_products`,
        last_received_stock: `${base}/last_received_stock`,
    };
    for (const ep of ENDPOINTS) {
        urls[ep.id] = `${base}/${ep.path}`;
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
        mapping_hints: {
            catalogue_creation: buildMappingHints('catalogue_creation', sampleCatalogue),
            product_creation: buildMappingHints('product_creation', sampleProduct),
            stock: buildMappingHints('stock', sampleStock),
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
    const existingCatRows = await query('SELECT id FROM web_categories WHERE slug = $1 LIMIT 1', [styleSlug]);
    const categoryExisted = !!existingCatRows[0];
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
    let subcategoryExisted = false;
    if (catId && skuCode) {
        const skuSlug = skuSlugFromStyleAndSku(styleSlug, skuCode);
        const existingSubRows = await query('SELECT id FROM web_subcategories WHERE slug = $1 LIMIT 1', [skuSlug]);
        subcategoryExisted = !!existingSubRows[0];
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
    return {
        catId,
        subId,
        styleCode,
        skuCode,
        category_existed: categoryExisted,
        subcategory_existed: subcategoryExisted,
    };
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

async function findExistingProduct(query, resellerUserId, mapped, options = {}) {
    const allowSubcategoryOnly = !!options.allowSubcategoryOnlyMatch;
    const barcode = String(mapped.barcode || '').trim();
    const barcodeSlug = barcode ? slugPart(barcode) : '';
    const name = String(mapped.product_name || '').trim();
    const style = String(mapped.style_code || '').trim();
    const sku = String(mapped.sku || '').trim();
    const metal = normalizeMetalType(mapped.metal_type || '');

    const matchBarcode = async (needle) => {
        if (!needle) return null;
        const rows = await query(
            `SELECT wp.*, ws.name AS subcategory_name, wc.name AS style_name
             FROM web_products wp
             LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
             LEFT JOIN web_categories wc ON wc.id = ws.category_id
             WHERE wp.submitted_by_user_id = $1
               AND (
                    LOWER(TRIM(wp.sku)) = LOWER($2)
                 OR LOWER(REPLACE(TRIM(wp.sku), '_', '-')) = LOWER(REPLACE($2, '_', '-'))
                 OR LOWER(TRIM(COALESCE(wp.barcode, ''))) = LOWER($2)
                 OR LOWER(REPLACE(TRIM(COALESCE(wp.barcode, '')), '_', '-')) = LOWER(REPLACE($2, '_', '-'))
               )
             ORDER BY wp.updated_at DESC NULLS LAST
             LIMIT 1`,
            [resellerUserId, needle],
        );
        return rows[0] || null;
    };

    if (barcodeSlug) {
        const hit = (await matchBarcode(barcodeSlug)) || (barcode !== barcodeSlug ? await matchBarcode(barcode) : null);
        if (hit) return hit;
        if (!allowSubcategoryOnly) return null;
    }

    if (!name && !barcode && !(style && sku)) return null;

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
        if (barcodeSlug && (trimCmp(row.sku) === trimCmp(barcodeSlug) || trimCmp(row.barcode) === trimCmp(barcodeSlug)))
            s += 50;
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

    if (allowSubcategoryOnly) {
        const need = style && sku ? 20 : name && style ? 18 : 16;
        if (best && bestScore >= Math.min(need, 16)) return best;
        return null;
    }

    if (name && style && sku) {
        if (best && bestScore >= 34 && trimCmp(best.name) === trimCmp(name)) return best;
        return null;
    }
    if (name && best && trimCmp(best.name) === trimCmp(name) && bestScore >= 10) return best;
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
    if (barcode) return barcode;
    const name = String(mapped.product_name || '').trim();
    const sku = String(mapped.sku || '').trim();
    if (sku && name && trimCmp(sku) !== trimCmp(name) && sku !== 'N/A') {
        return `${slugPart(sku)}-${slugPart(name)}`;
    }
    if (name) return slugPart(name);
    if (sku && sku !== 'N/A') return slugPart(sku);
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
    const id = await lookupWebProductId(upsertDeps.query, result.prodSku);
    return {
        created: true,
        sku: result.prodSku,
        prodSku: result.prodSku,
        style_code: result.styleCode || mapped.style_code,
        catId: mapped._placement?.category_id ?? result.catId,
        subId: mapped._placement?.subcategory_id ?? null,
        placement: mapped._placement || null,
        id,
    };
}

async function processRecord(deps, { endpoint, mapping, record, body, resellerUserId }) {
    const mapped = applyMapping(mapping, record, body, { strict: true, endpoint });
    if (!Object.keys(mapped).length) {
        return { action: 'skipped', reason: 'no_mapped_values' };
    }
    if (endpoint === 'product_creation' || endpoint === 'stock') {
        enrichKumuduConnectionFields(record, mapped, endpoint);
    }
    if (endpoint === 'product_creation') {
        applyKumuduProductBarcodeFallback(record, mapped);
    }

    if (endpoint === 'catalogue_creation') {
        const ensured = await ensureStyleAndSku(deps.query, mapped, { publish: true });
        if (!ensured.catId) {
            return { action: 'skipped', reason: 'missing_style_code', mapped };
        }
        await grantCategoryToReseller(deps.query, resellerUserId, ensured.catId, mapped.metal_type);
        const existing = await findExistingProduct(deps.query, resellerUserId, mapped, {
            allowSubcategoryOnlyMatch: true,
        });
        if (existing && (mapped.quantity != null || mapped.net_weight != null || mapped.image_url)) {
            const patch = await patchExistingProduct(deps.query, existing, mapped, {
                uploadsDir: deps.uploadsWebProductsDir,
                apiBase: deps.getPublicApiBaseUrl(),
            });
            return { action: 'catalogue_updated_product', ...ensured, ...patch, mapped };
        }
        const kumuduRef = pickKumuduCatalogueRef(record, mapped);
        const catAction =
            ensured.category_existed && ensured.subcategory_existed
                ? 'catalogue_exists'
                : 'catalogue_ensured';
        return { action: catAction, ...ensured, mapped, kumudu_catalogue_ref: kumuduRef, _record: record };
    }

    if (endpoint === 'product_creation') {
        const placement = await resolveCataloguePlacement(deps.query, resellerUserId, mapped, record);
        if (!placement.ok) {
            return { action: 'skipped', error: placement.error, mapped, _record: record };
        }
        if (placement.link) {
            await applyCataloguePlacementToMapped(deps.query, mapped, placement);
        } else if (pickKumuduCatalogueRef(record, mapped) || pickCatalogueSyncId(record, mapped)) {
            return {
                action: 'skipped',
                error: 'Unknown catalogue — run catalogue_creation first or fix catalogue_sync_id / Kumudu catalogue id',
                mapped,
                _record: record,
            };
        }
    }

    if (endpoint === 'stock') {
        const prodSync = pickProductSyncId(record, mapped);
        if (prodSync) {
            const pr = await findProductSyncRecord(deps.query, resellerUserId, prodSync);
            if (!pr?.web_product_id) {
                return { action: 'skipped', error: 'Unknown product_sync_id', mapped, _record: record };
            }
            const rows = await deps.query(
                `SELECT wp.*, ws.name AS subcategory_name, wc.name AS style_name
                 FROM web_products wp
                 LEFT JOIN web_subcategories ws ON ws.id = wp.subcategory_id
                 LEFT JOIN web_categories wc ON wc.id = ws.category_id
                 WHERE wp.id = $1 AND wp.submitted_by_user_id = $2
                 LIMIT 1`,
                [pr.web_product_id, resellerUserId],
            );
            const row = rows[0];
            if (!row) {
                return { action: 'skipped', error: 'Product for product_sync_id not found', mapped, _record: record };
            }
            const barcode = String(mapped.barcode || '').trim();
            if (barcode && trimCmp(barcode) !== trimCmp(row.sku)) {
                return {
                    action: 'skipped',
                    error: 'barcode does not match the product for this product_sync_id',
                    mapped,
                    _record: record,
                };
            }
            const patch = await patchExistingProduct(deps.query, row, mapped, {
                uploadsDir: deps.uploadsWebProductsDir,
                apiBase: deps.getPublicApiBaseUrl(),
            });
            return {
                action: patch.updated ? 'updated' : 'skipped',
                ...patch,
                mapped,
                _record: record,
                product_sync_id: prodSync,
            };
        }
    }

    const productLookupOpts =
        endpoint === 'product_creation'
            ? { allowSubcategoryOnlyMatch: false }
            : endpoint === 'catalogue_creation'
              ? { allowSubcategoryOnlyMatch: true }
              : {};
    const existing = await findExistingProduct(deps.query, resellerUserId, mapped, productLookupOpts);
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
    if (!created.created) {
        return { action: 'skipped', error: created.error, reason: created.error, ...created, mapped, _record: record };
    }
    const placement = mapped._placement || null;
    return {
        action: 'created',
        ...created,
        subId: created.subId ?? placement?.subcategory_id ?? null,
        placement,
        mapped,
        _record: record,
    };
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
    if (s === 'last_received' || s === 'lastreceived' || s === 'inbound' || s === 'inbound_log') {
        return 'last_received';
    }
    if (s === 'last_received_catalogue' || s === 'lastreceivedcatalogue' || s === 'last_catalogue') {
        return 'last_received_catalogue';
    }
    if (
        s === 'last_received_products' ||
        s === 'last_received_product' ||
        s === 'lastreceivedproducts' ||
        s === 'last_products'
    ) {
        return 'last_received_products';
    }
    if (s === 'last_received_stock' || s === 'lastreceivedstock' || s === 'last_stock') {
        return 'last_received_stock';
    }
    return s;
}

const LAST_RECEIVED_VIEW = {
    last_received_catalogue: 'catalogue_creation',
    last_received_products: 'product_creation',
    last_received_stock: 'stock',
};

async function resolveKumuduLink(deps, inboundKey, { requireEnabled = true } = {}) {
    const key = slugInboundKey(inboundKey);
    if (!key) return { status: 404, error: 'Unknown shop' };
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
    if (!link) return { status: 404, error: 'Kumudu link not found for this shop' };
    if (requireEnabled && !link.enabled) {
        return { status: 403, error: 'Kumudu software stock link is turned off for this shop' };
    }
    return { status: 200, link };
}

async function handleKumuduHealth(deps, req, res, inboundKey) {
    const resolved = await resolveKumuduLink(deps, inboundKey, { requireEnabled: true });
    if (resolved.status !== 200) {
        return res.status(resolved.status).json({ error: resolved.error });
    }
    const link = resolved.link;
    const apiKey = readInboundApiKey(req);
    if (!apiKey || apiKey !== link.api_key) {
        return res.status(401).json({ error: 'Invalid API key' });
    }
    const incomingStore = readStoreId(req);
    const storeId = incomingStore || String(link.store_id || '').trim() || null;
    return res.json({
        ok: true,
        service: 'kumudu-stock-link',
        inbound_key: link.inbound_key,
        store_id: storeId,
    });
}

function mapRecentCallRows(events) {
    return events.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        status: row.status,
        summary: row.summary,
        received_at: row.created_at,
        payload: row.payload ?? null,
        result: row.result ?? null,
    }));
}

async function handleKumuduLastReceived(deps, req, res, inboundKey, viewId = 'last_received') {
    const resolved = await resolveKumuduLink(deps, inboundKey, { requireEnabled: true });
    if (resolved.status !== 200) {
        return res.status(resolved.status).json({ error: resolved.error });
    }
    const link = resolved.link;
    const apiKey = readInboundApiKey(req);
    if (!apiKey || apiKey !== link.api_key) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    const limitRaw = parseInt(String(req.query?.limit || '10'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;
    let endpointFilter = LAST_RECEIVED_VIEW[viewId] || null;
    if (!endpointFilter && req.query?.endpoint) {
        const q = normalizeEndpointParam(req.query.endpoint);
        if (ENDPOINT_IDS.includes(q)) endpointFilter = q;
        else if (LAST_RECEIVED_VIEW[q]) endpointFilter = LAST_RECEIVED_VIEW[q];
        else if (q !== 'last_received') {
            return res.status(400).json({
                error: 'endpoint must be catalogue_creation, product_creation, or stock',
            });
        }
    }

    const events = await deps.query(
        `SELECT id, endpoint, status, summary, payload, result, created_at
         FROM reseller_kumudu_events
         WHERE reseller_user_id = $1
           ${endpointFilter ? 'AND endpoint = $3' : ''}
         ORDER BY created_at DESC
         LIMIT $2`,
        endpointFilter ? [link.reseller_user_id, limit, endpointFilter] : [link.reseller_user_id, limit],
    );

    const lastAll = {
        catalogue_creation: link.sample_catalogue_payload || null,
        product_creation: link.sample_product_payload || null,
        stock: link.sample_stock_payload || null,
    };
    const lastAtAll = {
        catalogue_creation: link.last_catalogue_at || null,
        product_creation: link.last_product_at || null,
        stock: link.last_stock_at || null,
    };

    if (endpointFilter) {
        return res.json({
            ok: true,
            service: 'kumudu-stock-link',
            inbound_key: link.inbound_key,
            store_id: String(link.store_id || '').trim() || null,
            method: 'GET',
            endpoint: endpointFilter,
            last_payload: lastAll[endpointFilter] ?? null,
            last_received_at: lastAtAll[endpointFilter] ?? null,
            recent_calls: mapRecentCallRows(events),
        });
    }

    return res.json({
        ok: true,
        service: 'kumudu-stock-link',
        inbound_key: link.inbound_key,
        store_id: String(link.store_id || '').trim() || null,
        method: 'GET',
        hint: 'Use last_received_catalogue, last_received_products, or last_received_stock for one feed only.',
        last_payload: lastAll,
        last_received_at: lastAtAll,
        recent_calls: mapRecentCallRows(events),
    });
}

async function handleInbound(deps, req, res, inboundKey, endpointRaw) {
    const endpoint = normalizeEndpointParam(endpointRaw);
    if (endpoint === 'health') {
        return handleKumuduHealth(deps, req, res, inboundKey);
    }
    if (!ENDPOINT_IDS.includes(endpoint)) {
        return res.status(404).json({ error: 'Unknown Kumudu endpoint' });
    }
    const resolved = await resolveKumuduLink(deps, inboundKey, { requireEnabled: true });
    if (resolved.status !== 200) {
        return res.status(resolved.status).json({ error: resolved.error });
    }
    const link = resolved.link;

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

    const shopKey = link.inbound_key;
    const batchTag = syncKindTag(endpoint);
    const batchSyncId = newKumuduSyncId(shopKey, `${batchTag}-batch`);

    const results = [];
    const data = [];
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
            const confirm = await buildPartnerConfirmRow(deps.query, {
                endpoint,
                shopKey,
                batchSyncId,
                resellerUserId: link.reseller_user_id,
                processResult: { ...one, _record: record },
            });
            data.push(confirm);
        } catch (e) {
            const fail = { action: 'error', error: e.message || 'Failed' };
            results.push(fail);
            data.push(
                await buildPartnerConfirmRow(deps.query, {
                    endpoint,
                    shopKey,
                    batchSyncId,
                    resellerUserId: link.reseller_user_id,
                    processResult: fail,
                }),
            );
        }
    }

    const errors = results.filter((r) => r.action === 'error');
    const status = errors.length ? 'error' : 'ok';
    const summary = `${results.length} record(s): ${results.map((r) => r.action).join(', ')}`;
    await logEvent(deps.query, {
        resellerUserId: link.reseller_user_id,
        endpoint,
        status,
        summary,
        payload: body,
        result: { batch_sync_id: batchSyncId, data, error_count: errors.length },
    });

    const batchKey =
        endpoint === 'catalogue_creation'
            ? 'batch_catalogue_sync_id'
            : endpoint === 'product_creation'
              ? 'batch_product_sync_id'
              : 'batch_stock_sync_id';

    return res.json({
        ok: status === 'ok',
        shop: shopKey,
        endpoint,
        method: 'POST',
        [batchKey]: batchSyncId,
        count: data.length,
        data,
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

    const healthHandler = (req, res) => {
        handleKumuduHealth(deps, req, res, req.params.inboundKey).catch((e) => {
            console.error('kumudu health:', e);
            res.status(500).json({ error: e.message || 'Health check failed' });
        });
    };

    const getActionHandler = (req, res) => {
        const action = normalizeEndpointParam(req.params.action);
        if (action === 'health') return healthHandler(req, res);
        if (action === 'last_received' || LAST_RECEIVED_VIEW[action]) {
            const viewId = LAST_RECEIVED_VIEW[action] ? action : 'last_received';
            return handleKumuduLastReceived(deps, req, res, req.params.inboundKey, viewId).catch((e) => {
                console.error('kumudu last_received:', e);
                res.status(500).json({ error: e.message || 'Failed to load inbound log' });
            });
        }
        const shop = slugInboundKey(req.params.inboundKey) || req.params.inboundKey;
        const origin = publicApiOrigin(
            typeof deps.getPublicApiBaseUrl === 'function' ? deps.getPublicApiBaseUrl() : null,
        );
        return res.status(405).json({
            error: 'This URL accepts POST JSON only (GET is not used here).',
            endpoint: action,
            method_required: 'POST',
            health_check_get: `${origin}/api/external/kumudu-${shop}/v1/health`,
            last_received_get: `${origin}/api/external/kumudu-${shop}/v1/last_received`,
        });
    };

    const mountExternal = (base) => {
        const p = `${base}/kumudu-:inboundKey`;
        app.get(`${p}/v1/health`, healthHandler);
        const lastReceivedHandler = (viewId) => (req, res) =>
            handleKumuduLastReceived(deps, req, res, req.params.inboundKey, viewId).catch((e) => {
                console.error('kumudu last_received:', e);
                res.status(500).json({ error: e.message || 'Failed to load inbound log' });
            });
        app.get(`${p}/v1/last_received`, lastReceivedHandler('last_received'));
        app.get(`${p}/v1/last_received_catalogue`, lastReceivedHandler('last_received_catalogue'));
        app.get(`${p}/v1/last_received_products`, lastReceivedHandler('last_received_products'));
        app.get(`${p}/v1/last_received_stock`, lastReceivedHandler('last_received_stock'));
        app.post(`${p}/v1/:action`, inboundHandler);
        app.get(`${p}/health`, healthHandler);
        app.get(`${p}/v1/:action`, getActionHandler);
        app.post(`${p}/:action`, inboundHandler);
        app.get(`${p}/:action`, getActionHandler);
    };

    mountExternal('/api/external');
    mountExternal('/external');

    app.get('/api/reseller/kumudu-link', checkAuth, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const link = await loadOrCreateLink(query, user);
            const events = await query(
                `SELECT id, endpoint, status, summary, payload, result, created_at
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
            const recordKeys =
                extractRecords(payload).length > 0
                    ? uniqueKeys(flattenPayloadKeys(extractRecords(payload)[0]))
                    : keys;
            for (const kc of mapping.selected) {
                if (!suggested[kc]) {
                    const guess = suggestPathForField(kc, recordKeys);
                    if (guess) suggested[kc] = stripRecordRootPrefix(guess, payload);
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
                mapping_hints: buildMappingHints(endpoint, payload),
            });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to save sample' });
        }
    });

    app.delete('/api/reseller/kumudu-link/events/:eventId', checkAuth, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const eventId = parseInt(String(req.params.eventId), 10);
            if (!Number.isFinite(eventId) || eventId < 1) {
                return res.status(400).json({ error: 'Invalid event id' });
            }
            const deleted = await query(
                `DELETE FROM reseller_kumudu_events
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING id`,
                [eventId, user.id],
            );
            if (!deleted[0]) return res.status(404).json({ error: 'Call log not found' });
            res.json({ ok: true, deleted_id: eventId });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to delete call log' });
        }
    });

    app.delete('/api/reseller/kumudu-link/events', checkAuth, async (req, res) => {
        try {
            const user = await assertKumuduAccess(query, req.user.id);
            const endpoint = req.query?.endpoint ? normalizeEndpointParam(String(req.query.endpoint)) : null;
            if (endpoint && !ENDPOINT_IDS.includes(endpoint)) {
                return res.status(400).json({ error: 'Invalid endpoint filter' });
            }
            const removed = endpoint
                ? await query(
                      `DELETE FROM reseller_kumudu_events WHERE reseller_user_id = $1 AND endpoint = $2 RETURNING id`,
                      [user.id, endpoint],
                  )
                : await query(`DELETE FROM reseller_kumudu_events WHERE reseller_user_id = $1 RETURNING id`, [
                      user.id,
                  ]);
            res.json({ ok: true, deleted_count: removed.length });
        } catch (e) {
            res.status(e.status || 500).json({ error: e.message || 'Failed to clear call logs' });
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
            const preview = records
                .slice(0, 20)
                .map((record) => applyMapping(mapping, record, body, { endpoint }));
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

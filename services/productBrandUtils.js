/**
 * Optional Excel "Brand" column — listed brands become make-to-order catalogue products.
 */

const path = require('path');

/** Normalized brand tokens that trigger make-on-order (qty 0, customer enters qty at checkout). */
const MAKE_TO_ORDER_EXCEL_BRANDS = new Set(['emerald', 'utsarva']);

function normalizeExcelBrand(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    return s || null;
}

function isMakeToOrderExcelBrand(brand) {
    const b = normalizeExcelBrand(brand);
    return b != null && MAKE_TO_ORDER_EXCEL_BRANDS.has(b);
}

/** @deprecated Name kept for callers — includes emerald and utsarva. */
function isEmeraldMakeToOrderBrand(brand) {
    return isMakeToOrderExcelBrand(brand);
}

function applyEmeraldMakeToOrderFields(fields) {
    if (!fields || typeof fields !== 'object') return fields;
    const brand = normalizeExcelBrand(fields.brand) || 'emerald';
    fields.brand = brand;
    fields.make_to_order_only = true;
    fields.quantity = 0;
    if (fields.payload_json && typeof fields.payload_json === 'object') {
        fields.payload_json.brand = brand;
        fields.payload_json.makeToOrderOnly = true;
        fields.payload_json.make_to_order_only = true;
    }
    return fields;
}

function normalizeBulkPhotoStem(stem) {
    let s = String(stem || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/\s+/g, '-').replace(/_+/g, '-');
    while (s.includes('--')) s = s.replace(/--+/g, '-');
    return s;
}

/** Match keys for bulk photo filenames vs catalog sku (HMEF_LPHS-00001 ↔ hmeflphs-00001). */
function bulkPhotoStemAliases(stem) {
    const s = normalizeBulkPhotoStem(stem);
    if (!s) return [];
    const keys = new Set();
    keys.add(s);
    const noHyphen = s.replace(/-/g, '');
    if (noHyphen) keys.add(noHyphen);
    const alnum = s.replace(/[^a-z0-9]/g, '');
    if (alnum) keys.add(alnum);
    return [...keys];
}

function registerBulkPhotoStemKeys(map, stem, entry) {
    if (!entry) return;
    for (const k of bulkPhotoStemAliases(stem)) {
        if (k) map[k] = entry;
    }
}

function lookUpBulkPhotoStem(map, stem) {
    for (const k of bulkPhotoStemAliases(stem)) {
        if (map[k]) return map[k];
    }
    return null;
}

function parseBulkUploadStemFromFilename(filename, photoType = 'front') {
    const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
    let stem = normalizeBulkPhotoStem(base);
    if (photoType === 'back') {
        stem = stem.replace(/(-secondary|-back)$/, '');
    } else if (photoType === 'box') {
        stem = stem.replace(/(-box)$/, '');
    } else if (photoType === 'front') {
        stem = stem.replace(/(-front)$/, '');
    }
    if (/sfidol/i.test(base)) {
        const extracted = extractProductStemFromFilename(filename, photoType);
        if (extracted) return extracted;
    }
    const hmef = stem.match(/^hmef-lphs-(\d+)$/);
    if (hmef) {
        return normalizeBulkPhotoStem(`hmeflphs-${hmef[1]}`);
    }
    return stem;
}

/** Extract product code from bulk photo filename (e.g. murugan-sfidol1459-002 → sfidol1459-002). */
function extractProductStemFromFilename(filename, photoType = 'front') {
    const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
    let s = base.toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-');
    if (photoType === 'back') {
        s = s.replace(/(_secondary|-secondary|-back|_back)$/, '');
    } else if (photoType === 'front') {
        s = s.replace(/(-front|_front)$/, '');
    }
    const codeMatch =
        s.match(/sfidol\d+[-_]?(?:i\d+|i\d|\d+)/i) ||
        s.match(/sfidol\d+[-_][a-z0-9]+/i) ||
        s.match(/sfidol\d+/i);
    if (codeMatch) {
        return normalizeBulkPhotoStem(codeMatch[0].replace(/_/g, '-'));
    }
    const parts = s.split('-').filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
        if (/^sfidol/i.test(parts[i])) {
            return normalizeBulkPhotoStem(parts.slice(i).join('-'));
        }
    }
    return normalizeBulkPhotoStem(s);
}

module.exports = {
    normalizeExcelBrand,
    isMakeToOrderExcelBrand,
    isEmeraldMakeToOrderBrand,
    applyEmeraldMakeToOrderFields,
    MAKE_TO_ORDER_EXCEL_BRANDS,
    normalizeBulkPhotoStem,
    bulkPhotoStemAliases,
    registerBulkPhotoStemKeys,
    lookUpBulkPhotoStem,
    parseBulkUploadStemFromFilename,
    extractProductStemFromFilename,
};

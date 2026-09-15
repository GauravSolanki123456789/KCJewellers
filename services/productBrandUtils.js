/**
 * Optional Excel "Brand" column — emerald = make-to-order catalogue products.
 */

const path = require('path');

function normalizeExcelBrand(raw) {
    const s = String(raw ?? '').trim().toLowerCase();
    return s || null;
}

function isEmeraldMakeToOrderBrand(brand) {
    return normalizeExcelBrand(brand) === 'emerald';
}

function applyEmeraldMakeToOrderFields(fields) {
    if (!fields || typeof fields !== 'object') return fields;
    fields.brand = 'emerald';
    fields.make_to_order_only = true;
    fields.quantity = 0;
    if (fields.payload_json && typeof fields.payload_json === 'object') {
        fields.payload_json.brand = 'emerald';
        fields.payload_json.makeToOrderOnly = true;
        fields.payload_json.make_to_order_only = true;
    }
    return fields;
}

function normalizeBulkPhotoStem(stem) {
    let s = String(stem || '').trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/\s+/g, '-').replace(/_+/g, '-');
    return s;
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
    isEmeraldMakeToOrderBrand,
    applyEmeraldMakeToOrderFields,
    normalizeBulkPhotoStem,
    extractProductStemFromFilename,
};

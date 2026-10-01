/**
 * Parse weight values from Excel / ERP (handles European comma decimals).
 */

function parseExcelWeight(val) {
    if (val == null || String(val).trim() === '') return null;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    let s = String(val).trim().replace(/\s+/g, '');
    if (/^\d+,\d+$/.test(s)) {
        s = s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
        s = s.replace(/\./g, '').replace(',', '.');
    }
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    const m = s.match(/^(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
}

/** Keep Excel range text (e.g. "145-155") for storefront display. */
function parseExcelWeightDisplay(val) {
    if (val == null || String(val).trim() === '') return null;
    const s = String(val).trim();
    if (/\d\s*-\s*\d/.test(s)) return s.replace(/\s+/g, '');
    return null;
}

function normalizeExcelHeaderKey(key) {
    return String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[%()]/g, '')
        .replace(/[\s._-]+/g, '');
}

const EXCEL_WEIGHT_HEADER_ALIASES = new Set([
    'avgweight',
    'avgwt',
    'avgwtg',
    'netweight',
    'netwt',
    'weight',
    'weightg',
    'weightgm',
    'wt',
    'wtg',
    'wtgm',
    'wtonly',
    'netwtg',
    'netwtgm',
]);

const EXCEL_WEIGHT_HEADER_SKIP = new Set([
    'gross',
    'grossweight',
    'grosswt',
    'stonewt',
    'stoneweight',
    'bagwt',
    'bagweight',
    'chainwtonly',
    'chainweight',
    'pendantwtonly',
    'pendantweight',
    'earringwtonly',
    'earringweight',
    'wastage',
    'wastagepct',
]);

/**
 * Find net/avg weight from an Excel row — known headers first, then fuzzy column names.
 */
function pickExcelWeightFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    const directKeys = [
        'AvgWeight',
        'Avg Weight',
        'Avg. Weight',
        'Avg Wt',
        'AvgWt',
        'NET WT',
        'Net Wt',
        'Net Weight',
        'netWeight',
        'net_weight',
        'avg_weight',
        'Weight',
        'weight',
        'Wt',
        'WT',
        'Wt (g)',
        'Wt(g)',
        'Weight (g)',
        'Weight(g)',
        'NetWeight',
    ];
    for (const k of directKeys) {
        if (row[k] != null && String(row[k]).trim() !== '') {
            const n = parseExcelWeight(row[k]);
            if (n != null && n > 0) return n;
        }
    }
    for (const [key, val] of Object.entries(row)) {
        if (val == null || String(val).trim() === '') continue;
        const norm = normalizeExcelHeaderKey(key);
        if (!norm || EXCEL_WEIGHT_HEADER_SKIP.has(norm)) continue;
        if (EXCEL_WEIGHT_HEADER_ALIASES.has(norm) || norm.includes('avgweight') || norm === 'netwt') {
            const n = parseExcelWeight(val);
            if (n != null && n > 0) return n;
        }
    }
    return null;
}

/** Raw cell for weight_display ranges before numeric parse. */
function pickExcelWeightRawFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    const directKeys = [
        'AvgWeight',
        'Avg Weight',
        'netWeight',
        'net_weight',
        'Weight',
        'weight',
    ];
    for (const k of directKeys) {
        if (row[k] != null && String(row[k]).trim() !== '') return row[k];
    }
    for (const [key, val] of Object.entries(row)) {
        if (val == null || String(val).trim() === '') continue;
        const norm = normalizeExcelHeaderKey(key);
        if (EXCEL_WEIGHT_HEADER_SKIP.has(norm)) continue;
        if (EXCEL_WEIGHT_HEADER_ALIASES.has(norm)) return val;
    }
    return null;
}

module.exports = {
    parseExcelWeight,
    parseExcelWeightDisplay,
    pickExcelWeightFromRow,
    pickExcelWeightRawFromRow,
};

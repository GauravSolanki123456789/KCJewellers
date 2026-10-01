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

module.exports = {
    parseExcelWeight,
    parseExcelWeightDisplay,
};

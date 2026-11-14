/**
 * ERP bill / estimate line arrays — generous cap to block abuse while allowing large scans.
 * (Previously hard-capped at 200, which truncated estimates.)
 */
const ERP_BILL_MAX_LINES = 10000;

function normalizeErpBillLines(lines) {
    if (!Array.isArray(lines)) return [];
    if (lines.length <= ERP_BILL_MAX_LINES) return lines;
    return lines.slice(0, ERP_BILL_MAX_LINES);
}

module.exports = {
    ERP_BILL_MAX_LINES,
    normalizeErpBillLines,
};
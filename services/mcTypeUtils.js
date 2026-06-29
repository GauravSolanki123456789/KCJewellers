/**
 * MC/GM (per gram) vs MC/PC (per piece) — shared by upsert, pricingService, ERP sync.
 */

function normalizeMcType(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const t = String(raw).trim().toUpperCase().replace(/\s+/g, '');
    if (t === 'MC/PC' || t === 'MCPC' || t === 'PER_PIECE' || t === 'PERPIECE' || t === 'PIECE' || t === 'FIXED') {
        return 'MC/PC';
    }
    if (t === 'MC/GM' || t === 'MCGM' || t === 'PER_GRAM' || t === 'PERGRAM') {
        return 'MC/GM';
    }
    return String(raw).trim().toUpperCase();
}

function isMcPerPieceType(mcType) {
    const n = normalizeMcType(mcType);
    return n === 'MC/PC';
}

function defaultMcTypeWhenRatePresent(mcRate, mcTypeRaw) {
    const normalized = normalizeMcType(mcTypeRaw);
    if (normalized) return normalized;
    const rate = Number(mcRate);
    if (Number.isFinite(rate) && rate > 0) return 'MC/GM';
    return null;
}

module.exports = {
    normalizeMcType,
    isMcPerPieceType,
    defaultMcTypeWhenRatePresent,
};

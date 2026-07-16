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

/** Parse Excel cells like "300 MC/PC" or "45 MC/GM". */
function parseMcRateAndType(raw) {
    if (raw == null || String(raw).trim() === '') {
        return { mcRate: null, mcType: null };
    }
    const s = String(raw).trim();
    const pc = /MC\s*\/?\s*PC/i.test(s);
    const gm = /MC\s*\/?\s*GM/i.test(s);
    const numMatch = s.match(/[\d.]+/);
    const num = numMatch ? parseFloat(numMatch[0]) : NaN;
    return {
        mcRate: Number.isFinite(num) ? num : null,
        mcType: pc ? 'MC/PC' : gm ? 'MC/GM' : null,
    };
}

function defaultMcTypeWhenRatePresent(mcRate, mcTypeRaw, metalType) {
    const normalized = normalizeMcType(mcTypeRaw);
    if (normalized === 'MC/PC' || normalized === 'MC/GM') return normalized;
    const rate = Number(mcRate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const mt = String(metalType || '').toLowerCase();
    if (mt.startsWith('silver') || mt.startsWith('gift')) return 'MC/PC';
    return 'MC/GM';
}

module.exports = {
    normalizeMcType,
    isMcPerPieceType,
    parseMcRateAndType,
    defaultMcTypeWhenRatePresent,
};

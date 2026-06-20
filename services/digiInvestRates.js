/**
 * SIP gram accumulation — uses today's retail live rates (no separate DigiGold/DigiSilver tier).
 */
const { query } = require('../config/database');

function safeNum(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : null;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

/** Retail ₹/g from live rate payload (same basis as catalogue pricing). */
function retailPerGramFromPayload(payload, metalType) {
    const rates = payload?.rates || [];
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'silver') {
        const row = rates.find((r) => (r.metal_type || '').toLowerCase() === 'silver');
        const display = Number(row?.display_rate || row?.sell_rate || 0);
        return display > 0 ? display / 1000 : null;
    }
    if (mt === 'gold') {
        const row = rates.find((r) => (r.metal_type || '').toLowerCase() === 'gold');
        const display = Number(row?.display_rate || row?.sell_rate || 0);
        return display > 0 ? display / 10 : null;
    }
    return null;
}

/** SIP gram accumulation — returns ₹/g display rate used for metal_rate_on_date. */
async function resolveSipMetalRatePerGram(metalType, liveRateService) {
    const payload = await liveRateService.getCurrentPayload();
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'silver') {
        const g = retailPerGramFromPayload(payload, 'silver');
        return g ? { perGram: g, displayRate: g * 1000 } : null;
    }
    if (mt === 'gold') {
        const g = retailPerGramFromPayload(payload, 'gold');
        return g ? { perGram: g, displayRate: g * 10 } : null;
    }
    return null;
}

function gramsFromInstallment(amountInr, metalType, rateInfo) {
    if (!rateInfo?.displayRate || rateInfo.displayRate <= 0) return null;
    const amt = Number(amountInr) || 0;
    if (amt <= 0) return null;
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'gold') return amt / (rateInfo.displayRate / 10);
    if (mt === 'silver') return amt / (rateInfo.displayRate / 1000);
    return null;
}

module.exports = {
    resolveSipMetalRatePerGram,
    gramsFromInstallment,
};

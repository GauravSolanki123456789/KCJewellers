/**
 * Dual-currency ledger helpers — ₹ (amount_inr) + jewellery metal (grams).
 */

function roundMetalGm(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 1000) / 1000;
}

function parseMetalGm(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(String(raw).replace(/[,gG\s]/g, ''));
    if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return null;
    return roundMetalGm(n);
}

function looksJewelleryMetalRow(row) {
    const ref = String(row?.reference_no || '');
    const nar = String(row?.narration || '');
    const mode = String(row?.payment_mode || '').toLowerCase();
    return (
        mode === 'metal' ||
        /^(MT|MB|MI|MR)/i.test(ref) ||
        /\d+(?:\.\d+)?\s*g\b/i.test(nar) ||
        /metal (received|balance|issued|applied|converted)/i.test(nar)
    );
}

function metalGmFromNarration(narration) {
    const m = String(narration || '').match(/(\d+(?:\.\d+)?)\s*g\b/i);
    if (!m) return 0;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? roundMetalGm(n) : 0;
}

/**
 * Jewellery metal grams from a ledger row.
 * Prefers metal_gm. Falls back to weight_kg × 1000, then "123.000 g" in narration
 * (older Jainav posts stored grams only in the note, with amount_inr = 0).
 */
function metalGmFromLedgerRow(row) {
    if (!row || typeof row !== 'object') return 0;
    const gm = Number(row.metal_gm);
    if (Number.isFinite(gm) && Math.abs(gm) >= 0.0005) return roundMetalGm(gm);
    const jewellery = looksJewelleryMetalRow(row);
    const kg = Number(row.weight_kg);
    if (jewellery && Number.isFinite(kg) && kg > 0) {
        return kg >= 20 ? roundMetalGm(kg) : roundMetalGm(kg * 1000);
    }
    if (jewellery) return metalGmFromNarration(row.narration);
    return 0;
}

/**
 * Debit = customer owes shop metal. Credit = shop received metal / owes customer.
 */
function metalDebitCreditFromLedgerEntry(entryType, metalGm, narration) {
    const gm = roundMetalGm(Math.abs(Number(metalGm) || 0));
    if (gm < 0.0005) return { debit_metal_gm: 0, credit_metal_gm: 0 };
    const type = String(entryType || '').toLowerCase();
    const nar = String(narration || '').toLowerCase();
    if (type === 'payment_in' || type === 'bill_advance' || type === 'suspense_in') {
        return { debit_metal_gm: 0, credit_metal_gm: gm };
    }
    if (type === 'payment_out' || type === 'expense' || type === 'salary') {
        if (/converted to cash|metal to cash/i.test(nar)) {
            if (/payable|shop owes|you owe/i.test(nar) || Number(metalGm) < 0) {
                return { debit_metal_gm: gm, credit_metal_gm: 0 };
            }
            return { debit_metal_gm: 0, credit_metal_gm: gm };
        }
        return { debit_metal_gm: gm, credit_metal_gm: 0 };
    }
    if (type === 'adjustment') {
        if (/converted to cash|metal to cash/i.test(nar)) {
            if (/payable|shop owes|you owe/i.test(nar) || Number(metalGm) < 0) {
                return { debit_metal_gm: gm, credit_metal_gm: 0 };
            }
            return { debit_metal_gm: 0, credit_metal_gm: gm };
        }
        if (
            /due from customer|customer owes|metal applied|applied against|mc as metal|mc against metal/i.test(
                nar,
            ) ||
            Number(metalGm) < 0
        ) {
            return { debit_metal_gm: gm, credit_metal_gm: 0 };
        }
        return { debit_metal_gm: 0, credit_metal_gm: gm };
    }
    return { debit_metal_gm: 0, credit_metal_gm: 0 };
}

function metalDebitFromSaleWeight(weightGm) {
    const gm = roundMetalGm(weightGm);
    if (gm < 0.0005) return { debit_metal_gm: 0, credit_metal_gm: 0 };
    return { debit_metal_gm: gm, credit_metal_gm: 0 };
}

module.exports = {
    roundMetalGm,
    parseMetalGm,
    metalGmFromLedgerRow,
    metalGmFromNarration,
    metalDebitCreditFromLedgerEntry,
    metalDebitFromSaleWeight,
};

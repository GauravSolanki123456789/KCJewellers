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
function isVirtualMetalInrOffsetRow(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.virtual_metal_inr === true || row.virtual_metal_value_inr === true) return true;
    const nar = String(row.narration || '');
    return /₹ offset only|no cash received/i.test(nar);
}

/**
 * Metal received with ₹-offset: clear customer metal debt first, then value excess grams at rate.
 */
function metalRatePerGFromLedgerRow(row) {
    if (!row || typeof row !== 'object') return 0;
    const stored = Number(row.metal_settlement_rate_per_g);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const nar = String(row.narration || '');
    const m = nar.match(/@\s*₹?\s*([\d,.]+)\s*\/?\s*g/i);
    if (m) {
        const n = Number(String(m[1]).replace(/,/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

function sanitizeLedgerDescription(desc) {
    return String(desc || '')
        .replace(/\u00b9/g, '')
        .replace(/\s*[—–-]\s*₹?\s*offset only.*$/gi, '')
        .replace(/\s*offset only.*$/gi, '')
        .trim();
}

function virtualMetalReceiptSettlement(metalBalanceBeforeGm, receivedGm, ratePerG) {
    const recv = Math.abs(Number(receivedGm) || 0);
    const debt = Math.max(0, Number(metalBalanceBeforeGm) || 0);
    const cleared = roundMetalGm(Math.min(recv, debt));
    const excess = roundMetalGm(Math.max(0, recv - cleared));
    const rate = Number(ratePerG) || 0;
    const inrOffset =
        excess > 0 && rate > 0 ? Math.round(excess * rate * 100) / 100 : 0;
    return { metal_cleared_gm: cleared, inr_offset_inr: inrOffset, excess_metal_gm: excess };
}

/**
 * ₹-offset metal receipt in running ledger.
 * With metal debt: clear grams first, only excess × rate reduces ₹ (Metal+MC view).
 * With no metal debt: full grams × rate reduces ₹ (₹-only bill view).
 */
function applyVirtualMetalInrCredit(runningInr, runningMetalGm, recvGm, ratePerG) {
    const recv = Math.abs(Number(recvGm) || 0);
    const metalBefore = Number(runningMetalGm) || 0;
    if (recv < 0.0005) {
        return {
            creditInr: 0,
            runningMetalAfter: roundMetalGm(metalBefore),
            displayCreditMetalGm: 0,
            showInrCredit: false,
        };
    }
    const rate = Number(ratePerG) || 0;
    if (metalBefore >= 0.0005) {
        const settled = virtualMetalReceiptSettlement(metalBefore, recv, rate);
        return {
            creditInr: settled.inr_offset_inr,
            runningMetalAfter: Math.max(0, metalBefore - recv),
            displayCreditMetalGm: recv,
            showInrCredit: false,
        };
    }
    const inrVal = rate > 0 ? Math.round(recv * rate * 100) / 100 : 0;
    const due = Math.max(0, Number(runningInr) || 0);
    const creditInr = Math.min(due, inrVal);
    return {
        creditInr,
        runningMetalAfter: roundMetalGm(metalBefore),
        displayCreditMetalGm: 0,
        showInrCredit: creditInr > 0,
    };
}

/** Grams credited to metal running balance for this row. */
function metalGmForRunningBalance(row) {
    const nar = String(row?.narration || '');
    if (/metal credit converted to ₹ balance/i.test(nar)) {
        return metalGmFromLedgerRow(row);
    }
    if (isVirtualMetalInrOffsetRow(row)) {
        const cleared = Number(row.metal_cleared_gm);
        if (Number.isFinite(cleared) && cleared >= 0.0005) return roundMetalGm(cleared);
        return 0;
    }
    return metalGmFromLedgerRow(row);
}

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
        if (/metal credit converted to ₹ balance/i.test(nar)) {
            return { debit_metal_gm: gm, credit_metal_gm: 0 };
        }
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
    isVirtualMetalInrOffsetRow,
    metalRatePerGFromLedgerRow,
    sanitizeLedgerDescription,
    virtualMetalReceiptSettlement,
    applyVirtualMetalInrCredit,
    metalGmForRunningBalance,
    metalGmFromLedgerRow,
    metalGmFromNarration,
    metalDebitCreditFromLedgerEntry,
    metalDebitFromSaleWeight,
};

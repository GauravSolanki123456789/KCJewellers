/**
 * Jainav lane — metal owed on bills + optional settlement ledger rows.
 */

function parseMetalSlabFraction(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n > 1) return Math.min(1, Math.max(0, n / 100));
    if (n > 0 && n <= 1) return n;
    return null;
}

function metalSlabKeyForSlab(slab) {
    const s = String(slab || 'R').toUpperCase();
    if (s === 'R1') return 'metal_slab_r1_pct';
    if (s === 'W') return 'metal_slab_w_pct';
    if (s === 'F') return 'metal_slab_f_pct';
    return 'metal_slab_r_pct';
}

function lineNetWeightGm(line, slab) {
    const og = Number(line.originalWeightGm ?? line.original_weight_gm);
    const wg = Number(line.weightGm ?? line.weight_gm ?? line.net_weight);
    const hasOg = Number.isFinite(og) && og > 0;
    const hasWg = Number.isFinite(wg) && wg > 0;
    const key = metalSlabKeyForSlab(slab);
    const frac = parseMetalSlabFraction(line[key]);
    if (frac != null && frac > 0 && frac < 1) {
        if (hasOg && hasWg) {
            const billFromOg = Math.round(og * frac * 1000) / 1000;
            if (Math.abs(billFromOg - wg) <= 0.05 || og >= wg * 0.99) return og;
            return Math.round((wg / frac) * 1000) / 1000;
        }
        if (hasOg) return og;
        if (hasWg) return Math.round((wg / frac) * 1000) / 1000;
    }
    if (hasOg) return og;
    return hasWg ? wg : 0;
}

function jainavLineMetalOwedGm(line, slab) {
    const net = lineNetWeightGm(line, slab);
    if (net <= 0) return 0;
    const key = metalSlabKeyForSlab(slab);
    const frac = parseMetalSlabFraction(line[key]);
    if (frac != null && frac > 0 && frac < 1.0001) {
        return Math.round(net * frac * 1000) / 1000;
    }
    return Math.round(net * 1000) / 1000;
}

function jainavMetalOwedGmFromLines(lines, slab) {
    if (!Array.isArray(lines)) return 0;
    const sum = lines.reduce((s, l) => s + jainavLineMetalOwedGm(l, slab), 0);
    return Math.round(sum * 1000) / 1000;
}

function normalizeMcType(raw) {
    const t = String(raw || '').trim().toUpperCase();
    if (!t) return '';
    if (
        t === 'FIX' ||
        t === 'PCS' ||
        t === 'RS' ||
        t === 'PC' ||
        t === 'MC/PC' ||
        t === 'FIXED' ||
        t === 'PER_PIECE' ||
        t === 'PERPIECE' ||
        t === 'PIECE'
    ) {
        return 'MC/PC';
    }
    if (t === 'MC/GM' || t === 'MCGM' || t === 'PER_GRAM' || t === 'PERGRAM') return 'MC/GM';
    return t;
}

function jainavLineMcOwedInr(line) {
    const displayCandidates = [
        line.displayMcInr,
        line.display_mc_inr,
        line.mcInr,
        line.mc_inr,
        line.mc_amount,
        line.mcAmountInr,
        line.mc,
        line.MC,
        line.line_mc_inr,
        line.mcTotal,
        line.mc_total,
    ];
    for (const raw of displayCandidates) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
    const mc = Number(line.mc_rate);
    if (!Number.isFinite(mc) || mc <= 0) return 0;
    const qty = Math.max(1, Number(line.qty) || 1);
    const wt = Number(line.weightGm ?? line.weight_gm ?? line.originalWeightGm ?? line.net_weight ?? 0) || 0;
    const mcTypeNorm = normalizeMcType(line.mc_type || line.mcType);
    if (mcTypeNorm === 'MC/PC') {
        if (mc >= 300) return Math.round(mc * qty);
        if (wt > 0) return Math.round(mc * wt * qty);
        return Math.round(mc * qty);
    }
    const mcType = String(line.mc_type || line.mcType || '').toUpperCase();
    if (
        mcType === 'PCS' ||
        mcType === 'FIX' ||
        mcType === 'RS' ||
        mcType === 'PC' ||
        mcType === 'MC/PC' ||
        mcType === 'FIXED' ||
        mcType === 'PER_PIECE' ||
        mcType === 'PERPIECE' ||
        mcType === 'PIECE'
    ) {
        return Math.round(mc * qty);
    }
    if (mc >= 500 && qty === 1) return Math.round(mc);
    if (mcType.includes('GM') || mcType.includes('/G') || mcType.includes('PER G')) {
        return Math.round(mc * wt * qty);
    }
    if (mc >= 50 || qty === 1) return Math.round(mc * qty);
    return Math.round(mc * qty);
}

function jainavMcOwedInrFromLines(lines) {
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((s, l) => s + jainavLineMcOwedInr(l), 0);
}

function parseSessionJson(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function trimStr(v, max = 500) {
    const s = String(v ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
}

const { roundMetalGm } = require('./erpLedgerMetal');

async function nextLaneRef(query, resellerUserId, prefix) {
    const rows = await query(
        `SELECT reference_no FROM reseller_erp_ledger_entries
         WHERE reseller_user_id = $1 AND ledger_scope = 'lane'
           AND reference_no LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [resellerUserId, `${prefix}%`],
    );
    const last = rows[0]?.reference_no;
    const m = last ? /^([A-Z]+)(\d+)$/i.exec(String(last)) : null;
    const n = m ? parseInt(m[2], 10) + 1 : 1;
    return `${prefix}${String(n).padStart(4, '0')}`;
}

/**
 * Post metal received / pending metal & cash balances from session.jainavSettlement.
 */
async function applyJainavSettlementLedgerEntries(query, resellerUserId, bill) {
    const session = parseSessionJson(bill.session);
    const settlement = session.jainavSettlement;
    if (!settlement || typeof settlement !== 'object') return [];
    const customerId = bill.customer_id || null;
    if (!customerId || !bill.id) return [];

    const entryDate = bill.bill_date || new Date().toISOString().slice(0, 10);
    const billNo = bill.bill_number || '';
    const created = [];

    async function insertEntry(row) {
        const existing = await query(
            `SELECT id FROM reseller_erp_ledger_entries
             WHERE reseller_user_id = $1 AND shadow_bill_id = $2
               AND reference_no = $3 AND entry_type = $4
             LIMIT 1`,
            [resellerUserId, bill.id, row.reference_no, row.entry_type],
        );
        if (existing.length) return existing[0];
        const metalGm = roundMetalGm(row.metal_gm);
        const rows = await query(
            `INSERT INTO reseller_erp_ledger_entries (
                reseller_user_id, entry_date, entry_type, amount_inr, customer_id,
                shadow_bill_id, payment_mode, reference_no, narration, is_suspense, ledger_scope, weight_kg, metal_gm
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,'lane',$10,$11)
             RETURNING *`,
            [
                resellerUserId,
                entryDate,
                row.entry_type,
                Math.round((Number(row.amount_inr) || 0) * 100) / 100,
                customerId,
                bill.id,
                row.payment_mode || 'metal',
                row.reference_no,
                row.narration,
                row.weight_kg != null ? row.weight_kg : null,
                metalGm != null && Math.abs(metalGm) >= 0.0005 ? Math.abs(metalGm) : null,
            ],
        );
        created.push(rows[0]);
        return rows[0];
    }

    const receivedGm = Math.max(0, Number(settlement.metalReceivedGm) || 0);
    if (receivedGm > 0) {
        const ref = await nextLaneRef(query, resellerUserId, 'MT');
        await insertEntry({
            entry_type: 'payment_in',
            amount_inr: 0,
            payment_mode: 'metal',
            reference_no: ref,
            metal_gm: receivedGm,
            weight_kg: Math.round((receivedGm / 1000) * 1000000) / 1000000,
            narration: `(V NO: ${billNo}) Metal received ${receivedGm.toFixed(3)} g`,
        });
    }

    const finalMetalGm = Number(settlement.finalMetalBalanceGm);
    if (Number.isFinite(finalMetalGm) && Math.abs(finalMetalGm) >= 0.001) {
        const ref = await nextLaneRef(query, resellerUserId, 'MB');
        const sign = finalMetalGm > 0 ? 'credit to customer' : 'due from customer';
        await insertEntry({
            entry_type: 'adjustment',
            amount_inr: 0,
            payment_mode: 'metal',
            reference_no: ref,
            metal_gm: finalMetalGm > 0 ? Math.abs(finalMetalGm) : -Math.abs(finalMetalGm),
            weight_kg: Math.round((Math.abs(finalMetalGm) / 1000) * 1000000) / 1000000,
            narration: `(V NO: ${billNo}) Metal balance ${sign}: ${Math.abs(finalMetalGm).toFixed(3)} g`,
        });
    }

    const paidNow = Math.max(0, Number(settlement.cashPaidNowInr) || 0);
    if (paidNow > 0) {
        const ref = await nextLaneRef(query, resellerUserId, 'CP');
        await insertEntry({
            entry_type: 'payment_out',
            amount_inr: paidNow,
            payment_mode: 'cash',
            reference_no: ref,
            narration: `(V NO: ${billNo}) Cash paid on settlement`,
        });
    }

    const cashBal = Number(settlement.cashBalanceAfterPaidInr ?? settlement.finalCashBalanceInr);
    if (Number.isFinite(cashBal) && Math.abs(cashBal) >= 0.01) {
        const ref = await nextLaneRef(query, resellerUserId, 'MC');
        const entryType = cashBal > 0 ? 'payment_out' : 'payment_in';
        await insertEntry({
            entry_type: entryType,
            amount_inr: Math.abs(cashBal),
            payment_mode: 'cash',
            reference_no: ref,
            narration: `(V NO: ${billNo}) Cash settlement balance ₹${Math.abs(cashBal).toFixed(2)}`,
        });
    }

    return created;
}

module.exports = {
    jainavLineMetalOwedGm,
    jainavMetalOwedGmFromLines,
    jainavLineMcOwedInr,
    jainavMcOwedInrFromLines,
    applyJainavSettlementLedgerEntries,
};

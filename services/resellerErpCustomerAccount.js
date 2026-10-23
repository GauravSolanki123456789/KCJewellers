/**
 * Customer account statement — official bills + payments (+ optional shadow bills for lane ledger).
 */

const { parseDateOrNull, normDateIso } = require('./erpDateNormalize');
const { jainavMetalOwedGmFromLines, jainavMcOwedInrFromLines } = require('./erpJainavSettlement');
const { loadJewelleryLedgerMetalEnabled } = require('./erpJewelleryLedgerSettings');
const {
    isFixedAssetMetalRow,
    metalGmFromLedgerRow,
    metalGmForRunningBalance,
    metalDebitCreditFromLedgerEntry,
    metalDebitFromSaleWeight,
    metalRatePerGFromLedgerRow,
    sanitizeLedgerDescription,
    applyVirtualMetalInrCredit,
    roundMetalGm,
    inferLedgerMetalKind,
} = require('./erpLedgerMetal');

function normDate(d) {
    return normDateIso(d);
}

function accountCsvEscape(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function totalWeightGmFromLines(linesJson) {
    let lines = linesJson;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    if (!Array.isArray(lines)) return 0;
    return lines.reduce((s, l) => {
        const w =
            Number(l.weightGm) ||
            Number(l.originalWeightGm) ||
            Number(l.net_weight) ||
            Number(l.net_weight_gm) ||
            Number(l.avg_weight) ||
            Number(l.weight_gm) ||
            0;
        return s + (Number.isFinite(w) ? w : 0);
    }, 0);
}

function cashBookKind(name) {
    const n = compactCustomerName(name);
    if (n === 'cash' || n === 'cashbook') return 'cash';
    if (n === 'jainav2') return 'jainav2';
    return null;
}

function isInternalErpCustomerRow(row) {
    if (cashBookKind(row?.name)) return true;
    const notes = String(row?.notes || '').toLowerCase();
    if (/lane\s*cash|official\s*cash|cash\s*book/i.test(notes)) return true;
    return false;
}

/** SQL fragment — hide lane/cash system customers unless lane_books=1 (Jainav). */
function sqlExcludeInternalErpCustomers(nameCol = 'name', notesCol = 'notes', opts = {}) {
    const allowCashBook = opts.allowCashBook === true;
    const hideCash = !allowCashBook;
    const parts = [];
    if (hideCash) {
        parts.push(`regexp_replace(lower(trim(${nameCol})), '[\\s._-]+', '', 'g') NOT IN ('cash', 'cashbook', 'jainav2')`);
    } else {
        parts.push(`regexp_replace(lower(trim(${nameCol})), '[\\s._-]+', '', 'g') NOT IN ('jainav2')`);
    }
    parts.push(`COALESCE(lower(${notesCol}), '') NOT LIKE '%lane cash%'`);
    if (hideCash) {
        parts.push(`COALESCE(lower(${notesCol}), '') NOT LIKE '%official cash%'`);
    }
    return ` AND ${parts.join(' AND ')}`;
}

function compactCustomerName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '');
}

async function ensureCashBookCustomers(query, resellerUserId) {
    const books = [
        { name: 'Cash', note: 'Official cash book' },
        { name: 'Jainav-2', note: 'Lane cash book' },
    ];
    for (const book of books) {
        const existing = await query(
            `SELECT id FROM reseller_erp_customers
             WHERE reseller_user_id = $1
               AND ${customerNameCompactSql('name')} = $2
             LIMIT 1`,
            [resellerUserId, compactCustomerName(book.name)],
        );
        if (existing.length) continue;
        await query(
            `INSERT INTO reseller_erp_customers (reseller_user_id, name, notes, rate_slab)
             VALUES ($1, $2, $3, 'R')`,
            [resellerUserId, book.name, book.note],
        );
    }
}

function parseJsonObject(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function collectedFromSession(session) {
    const raw = session.collectedAmountInr ?? session.collected_amount_inr;
    if (raw == null || String(raw).trim() === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function rowKindRank(kind) {
    const k = String(kind || '').toLowerCase();
    if (k === 'sale' || k === 'debit') return 1;
    if (k === 'payment_in' || k === 'bill_advance' || k === 'suspense_in') return 2;
    if (k === 'credit' || k === 'sales_return') return 2;
    return 3;
}

function extractLinkedBillRefFromNarration(narration) {
    const nar = String(narration || '').trim();
    if (!nar) return null;
    const tail = nar.match(/ - ([A-Z][A-Z0-9-]{2,})$/i);
    if (tail) return tail[1].toUpperCase();
    return null;
}

/** Oldest first — standard ledger order; running balance flows top to bottom. */
function sortLedgerRowsChronologically(rows) {
    return [...rows].sort((a, b) => {
        const d = String(a.date || '').localeCompare(String(b.date || ''));
        if (d !== 0) return d;
        const ra = rowKindRank(a.kind);
        const rb = rowKindRank(b.kind);
        if (ra !== rb) return ra - rb;
        return (a.sort_id || 0) - (b.sort_id || 0);
    });
}

function billLedgerAmounts(kind, amountInr) {
    const k = String(kind || 'sale').toLowerCase();
    const amt = Number(amountInr) || 0;
    const isCredit = k === 'credit' || k === 'sales_return';
    return {
        debit_inr: isCredit ? 0 : amt,
        credit_inr: isCredit ? amt : 0,
    };
}

function ledgerEntryLedgerAmounts(entryType, amountInr) {
    const amt = Number(amountInr) || 0;
    const creditTypes = new Set(['payment_in', 'bill_advance', 'suspense_in', 'purchase']);
    let debit_inr = 0;
    let credit_inr = 0;
    if (creditTypes.has(entryType)) credit_inr = amt;
    else if (entryType === 'payment_out' || entryType === 'expense' || entryType === 'salary') debit_inr = amt;
    else if (entryType === 'adjustment') {
        if (amt >= 0) credit_inr = amt;
        else debit_inr = Math.abs(amt);
    }
    return { debit_inr, credit_inr };
}

function applyDaybookLedgerColumns(rows, opts = {}) {
    let running = Number(opts.openingInr) || 0;
    let runningMetal = Number(opts.openingMetalGm) || 0;
    let totalDebit = 0;
    let totalCredit = 0;
    let totalDebitMetal = 0;
    let totalCreditMetal = 0;
    const transactions = rows.map((r) => {
        const dc =
            r.source === 'bill' || r.source === 'shadow_bill'
                ? billLedgerAmounts(r.kind, r.amount_inr)
                : ledgerEntryLedgerAmounts(r.kind, r.amount_inr);
        const metalDc =
            r.debit_metal_gm != null || r.credit_metal_gm != null
                ? {
                      debit_metal_gm: roundMetalGm(r.debit_metal_gm),
                      credit_metal_gm: roundMetalGm(r.credit_metal_gm),
                  }
                : r.source === 'bill'
                  ? { debit_metal_gm: 0, credit_metal_gm: 0 }
                  : r.source === 'shadow_bill'
                    ? metalDebitFromSaleWeight(r.weight_gm)
                    : metalDebitCreditFromLedgerEntry(
                        r.kind,
                        r.weight_gm || r.metal_gm,
                        r.description || r.narration,
                    );
        const recvGm = Number(r.weight_gm || r.metal_gm) || 0;
        let virtualMetalShowInrCredit = false;
        if (r.virtual_metal_inr && recvGm > 0) {
            const rate = metalRatePerGFromLedgerRow({
                narration: r.narration || r.description,
                metal_settlement_rate_per_g: r.metal_settlement_rate_per_g,
            });
            const applied = applyVirtualMetalInrCredit(running, runningMetal, recvGm, rate);
            dc.credit_inr = applied.creditInr;
            runningMetal = applied.runningMetalAfter;
            metalDc.credit_metal_gm = applied.displayCreditMetalGm;
            virtualMetalShowInrCredit = applied.showInrCredit;
            totalDebit += dc.debit_inr;
            totalCredit += dc.credit_inr;
            totalDebitMetal += metalDc.debit_metal_gm;
            running -= dc.credit_inr;
        } else {
            totalDebit += dc.debit_inr;
            totalCredit += dc.credit_inr;
            totalDebitMetal += metalDc.debit_metal_gm;
            totalCreditMetal += metalDc.credit_metal_gm;
            running += dc.debit_inr - dc.credit_inr;
            runningMetal += metalDc.debit_metal_gm - metalDc.credit_metal_gm;
        }
        return {
            ...r,
            debit_inr: Math.round(dc.debit_inr * 100) / 100,
            credit_inr: Math.round(dc.credit_inr * 100) / 100,
            balance_inr: Math.round(running * 100) / 100,
            debit_metal_gm: metalDc.debit_metal_gm,
            credit_metal_gm: metalDc.credit_metal_gm,
            weight_gm: roundMetalGm(metalDc.debit_metal_gm || metalDc.credit_metal_gm || r.weight_gm),
            balance_metal_gm: roundMetalGm(runningMetal),
            virtual_metal_show_inr_credit: virtualMetalShowInrCredit,
        };
    });
    return {
        transactions,
        total_debit_inr: Math.round(totalDebit * 100) / 100,
        total_credit_inr: Math.round(totalCredit * 100) / 100,
        closing_balance_inr: Math.round(running * 100) / 100,
        total_debit_metal_gm: roundMetalGm(totalDebitMetal),
        total_credit_metal_gm: roundMetalGm(totalCreditMetal),
        closing_balance_metal_gm: roundMetalGm(runningMetal),
    };
}

function fmtReceiptDate(iso) {
    if (!iso) return '';
    const s = String(iso).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return '';
    return `${d}-${m}-${y.slice(2)}`;
}

function formatLedgerPaymentDescription(p, customerName, shadowBillById) {
    const ref = String(p.reference_no || '').trim();
    const nar = String(p.narration || '').trim();
    if (/^REC\d{4}-\d+/i.test(ref) || /^REC\d+$/i.test(ref)) {
        if (nar) return `(V NO: ${ref}) ${nar}`;
        return `(V NO: ${ref}) CASH - CASH RECEIVED`;
    }
    if (p.shadow_bill_id && shadowBillById && shadowBillById[p.shadow_bill_id]) {
        const sb = shadowBillById[p.shadow_bill_id];
        const billNo = sb.bill_number || ref;
        const name = String(sb.customer_name || customerName || '').trim().toUpperCase();
        const dt = fmtReceiptDate(sb.bill_date || p.entry_date);
        const recRef = /^REC/i.test(ref) ? ref : ref;
        const line = `CASH ${recRef} - ${name}${dt ? ` ${dt}` : ''} - ${billNo}`;
        return `(V NO: ${recRef}) ${line}`;
    }
    if (/^cash received$/i.test(nar) && /^SCB\d{4}-\d+/i.test(ref)) {
        const name = String(customerName || '').trim().toUpperCase();
        const dt = fmtReceiptDate(p.entry_date);
        const line = `CASH ${ref} - ${name}${dt ? ` ${dt}` : ''} - ${ref}`;
        return `(V NO: ${ref}) ${line}`;
    }
    if (nar) {
        if (/^\(V NO:/i.test(nar)) return nar;
        if (ref) return `(V NO: ${ref}) ${nar}`;
        return nar;
    }
    if (ref) return `(V NO: ${ref}) CASH - CASH RECEIVED`;
    return 'CASH - CASH RECEIVED';
}

function parseJsonObject(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function shadowSaleSession(s) {
    return parseJsonObject(s.session_json || s.session) || {};
}

function shadowSaleLines(s) {
    const lines = parseJsonObject(s.lines_json || s.lines);
    return Array.isArray(lines) ? lines : [];
}

function shadowSaleHasPostedSettlement(session) {
    const st = session && session.jainavSettlement;
    if (!st || typeof st !== 'object') return false;
    return (
        Number(st.metalReceivedGm) > 0 ||
        (Number.isFinite(Number(st.finalMetalBalanceGm)) && Math.abs(Number(st.finalMetalBalanceGm)) >= 0.001)
    );
}

function shadowSaleMcOwedInr(s) {
    const session = shadowSaleSession(s);
    const fromLines = jainavMcOwedInrFromLines(shadowSaleLines(s));
    const fromSession = Number(session.jainavMcOwedInr);
    const fromSettle = Number(session.jainavSettlement && session.jainavSettlement.totalMcOwedInr);
    const best = Math.max(
        fromLines > 0 ? fromLines : 0,
        Number.isFinite(fromSession) && fromSession > 0 ? fromSession : 0,
        Number.isFinite(fromSettle) && fromSettle > 0 ? fromSettle : 0,
    );
    return best > 0 ? Math.round(best) : 0;
}

function shadowSaleWeightGm(s) {
    const session = shadowSaleSession(s);
    const settled = session.jainavMetalOwedGm ?? session.jainavSettlement?.totalMetalOwedGm;
    if (settled != null && Number(settled) > 0) {
        return Math.round(Number(settled) * 1000) / 1000;
    }
    const lines = shadowSaleLines(s);
    const slab = session.rateSlab || 'R';
    const jainavWt = jainavMetalOwedGmFromLines(lines, slab);
    if (jainavWt > 0) return jainavWt;
    return (
        totalWeightGmFromLines(lines) ||
        Number(session.returnWeightGm || session.totalWeightGm) ||
        0
    );
}

function pushShadowSaleRows(rows, s) {
    const session = shadowSaleSession(s);
    const lane = s.lane || 'jainav';
    const isJainav = lane === 'jainav';
    const metalLedgerMode =
        session.jainavMetalLedger === true ||
        session.metal_ledger_mode === 'metal' ||
        session.metalLedgerMode === true;
    const metalGm = metalLedgerMode ? shadowSaleWeightGm(s) : 0;
    const mcOwed = metalLedgerMode ? shadowSaleMcOwedInr(s) : 0;
    const billAmt = metalLedgerMode ? mcOwed : Number(s.total_inr) || 0;
    rows.push({
        date: normDate(s.bill_date),
        sort_id: s.id,
        kind: 'sale',
        ref: s.bill_number,
        description: `(V NO: ${s.bill_number})`,
        debit: billAmt,
        credit: 0,
        lane,
        rupee_only_debit: !metalLedgerMode,
        shadow_bill_id: s.id,
        metal_ledger_mode: metalLedgerMode,
        weight_gm: metalGm > 0 ? Math.round(metalGm * 1000) / 1000 : 0,
        debit_metal_gm: metalGm > 0 ? roundMetalGm(metalGm) : 0,
        credit_metal_gm: 0,
    });
}

async function loadCustomerRow(query, resellerUserId, customerId) {
    const rows = await query(
        `SELECT id, name, mobile, email, gstin, pan, address
         FROM reseller_erp_customers
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [customerId, resellerUserId],
    );
    return rows[0] || null;
}

function customerNameCompactSql(columnExpr) {
    return `regexp_replace(regexp_replace(lower(trim(COALESCE(${columnExpr}, ''))), '&', ' and ', 'g'), '[^a-z0-9]+', '', 'g')`;
}

function customerMobile10Sql(columnExpr) {
    return `right(regexp_replace(COALESCE(${columnExpr}, ''), '[^0-9]', '', 'g'), 10)`;
}

/** Re-link bills / ledger rows after a customer was deleted and re-created (same name, new id). */
async function relinkOrphanedCustomerRecords(query, resellerUserId, customer) {
    if (!customer?.id) return;
    const compact = compactCustomerName(customer.name);
    if (!compact) return;
    const customerId = customer.id;
    const mobile10 = String(customer.mobile || '').replace(/\D/g, '').slice(-10);

    await query(
        `UPDATE reseller_erp_bills b
         SET customer_id = $1
         WHERE b.reseller_user_id = $2
           AND b.customer_id IS DISTINCT FROM $1
           AND (
                b.customer_id IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM reseller_erp_customers c
                    WHERE c.id = b.customer_id AND c.reseller_user_id = $2
                )
           )
           AND (
                ${customerNameCompactSql('b.customer_name')} = $3
                OR (
                    length($4) = 10
                    AND ${customerMobile10Sql(`COALESCE(b.session_json->>'mobile', '')`)} = $4
                )
           )`,
        [customerId, resellerUserId, compact, mobile10],
    );

    await query(
        `UPDATE reseller_erp_ledger_entries e
         SET customer_id = $1
         WHERE e.reseller_user_id = $2
           AND e.customer_id IS DISTINCT FROM $1
           AND (
                e.customer_id IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM reseller_erp_customers c
                    WHERE c.id = e.customer_id AND c.reseller_user_id = $2
                )
           )
           AND (
                ${customerNameCompactSql('e.counterparty_name')} = $3
                OR e.bill_id IN (
                    SELECT b.id FROM reseller_erp_bills b
                    WHERE b.reseller_user_id = $2
                      AND (
                          b.customer_id = $1
                          OR ${customerNameCompactSql('b.customer_name')} = $3
                      )
                )
           )`,
        [customerId, resellerUserId, compact],
    );

    try {
        await query(
            `UPDATE reseller_erp_shadow_bills sb
             SET customer_id = $1
             WHERE sb.reseller_user_id = $2
               AND sb.customer_id IS DISTINCT FROM $1
               AND (
                    sb.customer_id IS NULL
                    OR NOT EXISTS (
                        SELECT 1 FROM reseller_erp_customers c
                        WHERE c.id = sb.customer_id AND c.reseller_user_id = $2
                    )
               )
               AND ${customerNameCompactSql('sb.customer_name')} = $3`,
            [customerId, resellerUserId, compact],
        );
    } catch {
        /* shadow table optional */
    }
}

async function relinkAllOrphanedCustomerRecords(query, resellerUserId) {
    await query(
        `UPDATE reseller_erp_bills b
         SET customer_id = c.id
         FROM reseller_erp_customers c
         WHERE b.reseller_user_id = $1
           AND c.reseller_user_id = $1
           AND b.customer_id IS DISTINCT FROM c.id
           AND (
                b.customer_id IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM reseller_erp_customers x
                    WHERE x.id = b.customer_id AND x.reseller_user_id = $1
                )
           )
           AND ${customerNameCompactSql('b.customer_name')} <> ''
           AND ${customerNameCompactSql('b.customer_name')} = ${customerNameCompactSql('c.name')}`,
        [resellerUserId],
    );
    await query(
        `UPDATE reseller_erp_ledger_entries e
         SET customer_id = c.id
         FROM reseller_erp_customers c
         WHERE e.reseller_user_id = $1
           AND c.reseller_user_id = $1
           AND e.customer_id IS DISTINCT FROM c.id
           AND (
                e.customer_id IS NULL
                OR NOT EXISTS (
                    SELECT 1 FROM reseller_erp_customers x
                    WHERE x.id = e.customer_id AND x.reseller_user_id = $1
                )
           )
           AND (
                (${customerNameCompactSql('e.counterparty_name')} <> ''
                 AND ${customerNameCompactSql('e.counterparty_name')} = ${customerNameCompactSql('c.name')})
                OR e.bill_id IN (
                    SELECT b.id FROM reseller_erp_bills b
                    WHERE b.reseller_user_id = $1 AND b.customer_id = c.id
                )
           )`,
        [resellerUserId],
    );
    try {
        await query(
            `UPDATE reseller_erp_shadow_bills sb
             SET customer_id = c.id
             FROM reseller_erp_customers c
             WHERE sb.reseller_user_id = $1
               AND c.reseller_user_id = $1
               AND sb.customer_id IS DISTINCT FROM c.id
               AND (
                    sb.customer_id IS NULL
                    OR NOT EXISTS (
                        SELECT 1 FROM reseller_erp_customers x
                        WHERE x.id = sb.customer_id AND x.reseller_user_id = $1
                    )
               )
               AND ${customerNameCompactSql('sb.customer_name')} <> ''
               AND ${customerNameCompactSql('sb.customer_name')} = ${customerNameCompactSql('c.name')}`,
            [resellerUserId],
        );
    } catch {
        /* shadow optional */
    }
}

async function buildCustomerAccount(query, resellerUserId, opts) {
    const customerId = parseInt(String(opts.customerId), 10);
    if (!Number.isFinite(customerId) || customerId <= 0) {
        throw Object.assign(new Error('customer_id required'), { status: 400 });
    }
    const onDate = parseDateOrNull(opts.on);
    let from = parseDateOrNull(opts.from);
    let to = parseDateOrNull(opts.to);
    if (onDate) {
        from = onDate;
        to = onDate;
    }
    const includeShadow = !!opts.includeShadow;

    const metalLedgerOn = await loadJewelleryLedgerMetalEnabled(query, resellerUserId);
    const customer = await loadCustomerRow(query, resellerUserId, customerId);
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
    await relinkOrphanedCustomerRecords(query, resellerUserId, customer);
    const book = cashBookKind(customer.name);
    const nameCompact = compactCustomerName(customer.name);

    const saleParams = [resellerUserId, customerId, nameCompact];
    let saleSql = `SELECT id, bill_number, bill_date, bill_type, total_inr, status, created_at, lines_json, session_json
                   FROM reseller_erp_bills
                   WHERE reseller_user_id = $1
                     AND (
                        customer_id = $2
                        OR ${customerNameCompactSql('customer_name')} = $3
                     )
                     AND bill_type IN ('sale', 'credit', 'debit', 'sales_return')
                     AND LOWER(status) IN ('completed', 'paid', 'final', 'issued')`;
    if (!includeShadow) {
        saleSql += ` AND COALESCE(session_json->>'ledgerScope', 'official') <> 'lane'`;
    }
    if (from) {
        saleParams.push(from);
        saleSql += ` AND bill_date >= $${saleParams.length}::date`;
    }
    if (to) {
        saleParams.push(to);
        saleSql += ` AND bill_date <= $${saleParams.length}::date`;
    }
    saleSql += ' ORDER BY bill_date, id';
    let officialSales = book ? [] : await query(saleSql, saleParams);

    let shadowSales = [];
    if (includeShadow && book !== 'cash') {
        const shParams = book === 'jainav2' ? [resellerUserId] : [resellerUserId, customerId, nameCompact];
        let shSql = `SELECT id, bill_number, lane, bill_date, total_inr, payment_method, status, created_at, session_json, lines_json
                     FROM reseller_erp_shadow_bills
                     WHERE reseller_user_id = $1`;
        if (book !== 'jainav2') {
            shSql += ` AND (customer_id = $2 OR ${customerNameCompactSql('customer_name')} = $3)`;
        }
        if (from) {
            shParams.push(from);
            shSql += ` AND bill_date >= $${shParams.length}::date`;
        }
        if (to) {
            shParams.push(to);
            shSql += ` AND bill_date <= $${shParams.length}::date`;
        }
        shSql += ' ORDER BY bill_date, id';
        shadowSales = await query(shSql, shParams);
    }

    const entryParams = book ? [resellerUserId] : [resellerUserId, customerId, nameCompact];
    let entrySql = `SELECT id, entry_date, entry_type, amount_inr, payment_mode, reference_no,
                           narration, bill_id, shadow_bill_id, is_suspense, ledger_scope, weight_kg, metal_gm,
                           metal_cleared_gm, virtual_metal_inr
                    FROM reseller_erp_ledger_entries
                    WHERE reseller_user_id = $1 AND is_suspense = false`;
    if (book === 'cash') {
        entrySql += ` AND ledger_scope = 'official' AND LOWER(COALESCE(payment_mode, '')) = 'cash'`;
    } else if (book === 'jainav2') {
        if (includeShadow) {
            entrySql += ` AND ledger_scope = 'lane' AND entry_type = 'payment_in'
                          AND LOWER(COALESCE(payment_mode, '')) = 'cash'`;
        } else {
            entrySql += ` AND FALSE`;
        }
    } else {
        entrySql += ` AND (
            customer_id = $2
            OR bill_id IN (
                SELECT b.id FROM reseller_erp_bills b
                WHERE b.reseller_user_id = $1
                  AND (
                      b.customer_id = $2
                      OR ${customerNameCompactSql('b.customer_name')} = $3
                  )
            )
        )`;
        if (!includeShadow) {
            entrySql += ` AND ledger_scope = 'official'`;
        }
    }
    if (from) {
        entryParams.push(from);
        entrySql += ` AND entry_date >= $${entryParams.length}::date`;
    }
    if (to) {
        entryParams.push(to);
        entrySql += ` AND entry_date <= $${entryParams.length}::date`;
    }
    entrySql += ' ORDER BY entry_date, id';
    const payments = await query(entrySql, entryParams);

    const shadowBillIds = [...new Set(payments.map((p) => p.shadow_bill_id).filter(Boolean))];
    let shadowBillById = {};
    if (shadowBillIds.length) {
        const sbRows = await query(
            `SELECT id, bill_number, customer_name, bill_date
             FROM reseller_erp_shadow_bills
             WHERE reseller_user_id = $1 AND id = ANY($2::int[])`,
            [resellerUserId, shadowBillIds],
        );
        shadowBillById = Object.fromEntries((sbRows || []).map((r) => [r.id, r]));
    }
    const billIdToRef = Object.fromEntries(
        (officialSales || []).map((s) => [s.id, String(s.bill_number || '').trim()]),
    );

    const rows = [];

    for (const s of officialSales) {
        const kind = String(s.bill_type || 'sale').toLowerCase();
        let session = s.session_json;
        if (typeof session === 'string') {
            try {
                session = JSON.parse(session);
            } catch {
                session = null;
            }
        }
        const weightGm =
            totalWeightGmFromLines(s.lines_json) ||
            Number(session && session.returnWeightGm) ||
            0;
        const isCredit = kind === 'credit' || kind === 'sales_return';
        const amt = Number(s.total_inr) || 0;
        let description = `(V NO: ${s.bill_number}) SALES A/C -`;
        if (kind === 'credit' || kind === 'sales_return') description = `(V NO: ${s.bill_number}) CREDIT NOTE -`;
        if (kind === 'debit') description = `(V NO: ${s.bill_number}) DEBIT NOTE -`;
        const ledgerScope = String((session && session.ledgerScope) || 'official').toLowerCase();
        const lane = ledgerScope === 'lane' ? 'jainav' : 'gst';
        const convertedGm =
            session && session.metalLedgerConverted === true
                ? roundMetalGm(Number(session.metalLedgerWeightGm) || 0)
                : 0;
        const rateNote =
            session && session.metalLedgerRatePerG
                ? ` @ ₹${Number(session.metalLedgerRatePerG)}/g`
                : '';
        if (convertedGm > 0) {
            description += ` (metal ${convertedGm.toFixed(3)} g${rateNote})`;
        }
        rows.push({
            date: normDate(s.bill_date),
            sort_id: s.id,
            bill_id: s.id,
            kind,
            ref: s.bill_number,
            description,
            debit: isCredit || convertedGm > 0 ? 0 : amt,
            credit: isCredit && convertedGm <= 0 ? amt : 0,
            lane,
            rupee_only_debit: convertedGm > 0 ? false : lane === 'gst',
            weight_gm:
                convertedGm > 0
                    ? convertedGm
                    : weightGm > 0
                      ? Math.round(weightGm * 1000) / 1000
                      : 0,
            debit_metal_gm: convertedGm > 0 && !isCredit ? convertedGm : 0,
            credit_metal_gm: convertedGm > 0 && isCredit ? convertedGm : 0,
        });
    }

    if (includeShadow && book !== 'jainav2') {
        for (const s of shadowSales) pushShadowSaleRows(rows, s);
    }

    for (const p of payments) {
        const creditTypes = new Set(['payment_in', 'bill_advance', 'suspense_in']);
        let credit = 0;
        let debit = 0;
        if (creditTypes.has(p.entry_type)) credit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'payment_out') debit = Number(p.amount_inr) || 0;
        // Stock-in PV: party supplied goods, shop has not necessarily paid yet → credit.
        if (p.entry_type === 'purchase') {
            const pvMetal = metalGmFromLedgerRow(p);
            if (metalLedgerOn && pvMetal > 0 && (Number(p.amount_inr) || 0) < 0.01) {
                credit = 0;
            } else if (metalLedgerOn && String(p.payment_mode || '').toLowerCase() === 'metal' && pvMetal > 0) {
                credit = 0;
            } else {
                credit = Number(p.amount_inr) || 0;
            }
        }
        if (p.entry_type === 'expense' || p.entry_type === 'salary') debit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'adjustment') {
            const amt = Number(p.amount_inr) || 0;
            if (amt >= 0) credit = amt;
            else debit = Math.abs(amt);
        }
        const metalGmDisplay = metalGmFromLedgerRow(p);
        const metalGmBal = metalGmForRunningBalance(p);
        let metalDc = metalDebitCreditFromLedgerEntry(p.entry_type, metalGmBal, p.narration);
        if (isFixedAssetMetalRow(p) && metalGmDisplay > 0) {
            metalDc = metalDebitCreditFromLedgerEntry(p.entry_type, metalGmDisplay, p.narration);
        }
        const isPay = creditTypes.has(p.entry_type) || p.entry_type === 'payment_out';
        let linkedBillRef = null;
        if (p.shadow_bill_id && shadowBillById[p.shadow_bill_id]) {
            linkedBillRef = shadowBillById[p.shadow_bill_id].bill_number;
        } else if (p.bill_id && billIdToRef[p.bill_id]) {
            linkedBillRef = billIdToRef[p.bill_id];
        } else {
            linkedBillRef = extractLinkedBillRefFromNarration(p.narration);
        }
        rows.push({
            date: normDate(p.entry_date),
            sort_id: p.id,
            ledger_entry_id: p.id,
            kind: p.entry_type,
            ref: p.reference_no || '',
            description: isPay
                ? formatLedgerPaymentDescription(p, customer.name, shadowBillById)
                : p.narration || p.entry_type.replace(/_/g, ' '),
            narration: p.narration || '',
            debit,
            credit,
            payment_mode: p.payment_mode,
            linked_bill_ref: linkedBillRef,
            weight_gm: metalGmDisplay,
            debit_metal_gm: metalDc.debit_metal_gm,
            credit_metal_gm: metalDc.credit_metal_gm,
            virtual_metal_inr: !!p.virtual_metal_inr,
            metal_cleared_gm: p.metal_cleared_gm != null ? roundMetalGm(p.metal_cleared_gm) : undefined,
        });
    }

    const orderedRows = sortLedgerRowsChronologically(rows);

    let running = 0;
    let runningMetal = 0;
    const transactions = orderedRows.map((r) => {
        const debitInr = Number(r.debit) || 0;
        let creditInr = Number(r.credit) || 0;
        const dMetal = Number(r.debit_metal_gm) || 0;
        let cMetal = Number(r.credit_metal_gm) || 0;
        let displayCreditMetal = cMetal;

        let virtualMetalShowInrCredit = false;
        if (r.virtual_metal_inr && Number(r.weight_gm) > 0) {
            const rate = metalRatePerGFromLedgerRow(r);
            const recvGm = Number(r.weight_gm);
            const applied = applyVirtualMetalInrCredit(running, runningMetal, recvGm, rate);
            creditInr = applied.creditInr;
            runningMetal = applied.runningMetalAfter;
            displayCreditMetal = applied.displayCreditMetalGm;
            virtualMetalShowInrCredit = applied.showInrCredit;
            running -= creditInr;
        } else {
            running += debitInr - creditInr;
            runningMetal += dMetal - cMetal;
        }

        const { linked_bill_ref: _lb, ...pub } = r;
        return {
            ...pub,
            description: sanitizeLedgerDescription(pub.description),
            credit: creditInr,
            credit_metal_gm: displayCreditMetal,
            virtual_metal_show_inr_credit: virtualMetalShowInrCredit,
            balance_inr: Math.round(running * 100) / 100,
            balance_metal_gm: roundMetalGm(runningMetal),
        };
    });

    const totalBilled = orderedRows
        .filter((r) => r.kind === 'sale' || r.kind === 'debit')
        .reduce((s, r) => s + r.debit, 0);
    const payKinds = new Set(['payment_in', 'bill_advance', 'suspense_in']);
    const totalPaid = transactions
        .filter((r) => payKinds.has(r.kind))
        .reduce((s, r) => s + (Number(r.credit) || 0), 0);
    const balanceDue = transactions.length
        ? transactions[transactions.length - 1].balance_inr
        : 0;
    const metalBalance = transactions.length
        ? transactions[transactions.length - 1].balance_metal_gm
        : 0;

    return {
        customer: {
            id: customer.id,
            name: customer.name,
            mobile: customer.mobile,
            gstin: customer.gstin,
            pan: customer.pan,
            address: customer.address,
        },
        summary: {
            total_billed_inr: Math.round(totalBilled * 100) / 100,
            total_paid_inr: Math.round(totalPaid * 100) / 100,
            balance_due_inr: balanceDue,
            metal_balance_gm: roundMetalGm(metalBalance),
            transaction_count: transactions.length,
        },
        transactions,
    };
}

/** CSV / PDF: dd/mm/yyyy (never dd-mm-yy — that breaks re-import and Tally). */
function fmtLedgerDate(iso) {
    const s = normDateIso(iso);
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
}

function postingTs(createdAt, fallbackDate) {
    if (createdAt) return String(createdAt);
    const d = normDate(fallbackDate);
    return d ? `${d}T00:00:00.000Z` : '';
}

function ledgerEntryCashflows(entryType, amountInr) {
    const amt = Number(amountInr) || 0;
    const creditTypes = new Set(['payment_in', 'bill_advance', 'suspense_in']);
    let received = 0;
    let paid = 0;
    if (creditTypes.has(entryType)) received = amt;
    else if (entryType === 'payment_out' || entryType === 'expense' || entryType === 'salary') paid = amt;
    else if (entryType === 'purchase') received = amt;
    else if (entryType === 'adjustment') {
        if (amt >= 0) received = amt;
        else paid = Math.abs(amt);
    }
    return { received_inr: received, paid_out_inr: paid };
}

function billCashflows(billType, totalInr) {
    const kind = String(billType || 'sale').toLowerCase();
    const amt = Number(totalInr) || 0;
    const isCredit = kind === 'credit' || kind === 'sales_return';
    return isCredit
        ? { received_inr: amt, paid_out_inr: 0 }
        : { received_inr: 0, paid_out_inr: amt };
}

/** Official bill: ₹ sale converted to metal on ledger (session_json flags). */
function billSessionMetalConversion(session, billType) {
    const s = session && typeof session === 'object' ? session : {};
    const kind = String(billType || 'sale').toLowerCase();
    const isCredit = kind === 'credit' || kind === 'sales_return';
    const convertedGm =
        s.metalLedgerConverted === true ? roundMetalGm(Number(s.metalLedgerWeightGm) || 0) : 0;
    return {
        convertedGm,
        isCredit,
        ratePerG: s.metalLedgerRatePerG != null ? Number(s.metalLedgerRatePerG) : null,
        rupee_only_debit: convertedGm > 0 ? false : true,
    };
}

async function ledgerOpeningBeforeDay(query, resellerUserId, day, laneView) {
    const scope = laneView ? 'lane' : 'official';
    const rows = await query(
        `SELECT entry_type, amount_inr, metal_gm
         FROM reseller_erp_ledger_entries
         WHERE reseller_user_id = $1 AND entry_date < $2::date
           AND is_suspense = false AND ledger_scope = $3`,
        [resellerUserId, day, scope],
    );
    let inr = 0;
    let metal = 0;
    for (const e of rows) {
        const amt = Number(e.amount_inr) || 0;
        const type = String(e.entry_type || '');
        if (['payment_in', 'bill_advance', 'suspense_in'].includes(type)) inr -= amt;
        else if (['payment_out', 'purchase', 'expense', 'salary'].includes(type)) inr += amt;
        else if (type === 'adjustment') inr -= amt;
        metal += Number(e.metal_gm) || 0;
    }
    return {
        opening_inr: Math.round(inr * 100) / 100,
        opening_metal_gm: roundMetalGm(metal),
    };
}

function consolidateDaybookTransactions(transactions) {
    const map = new Map();
    for (const t of transactions) {
        const key = `${String(t.customer_name || '—').trim()}|${String(t.kind || '').trim()}|${String(t.payment_mode || '—').trim()}`;
        const cur = map.get(key) || {
            ...t,
            row_key: `sum:${key}`,
            debit_inr: 0,
            credit_inr: 0,
            debit_metal_gm: 0,
            credit_metal_gm: 0,
            weight_gm: 0,
            reference: '',
            _refs: [],
        };
        cur.debit_inr += Number(t.debit_inr) || 0;
        cur.credit_inr += Number(t.credit_inr) || 0;
        cur.debit_metal_gm += Number(t.debit_metal_gm) || 0;
        cur.credit_metal_gm += Number(t.credit_metal_gm) || 0;
        cur.weight_gm += Number(t.weight_gm) || 0;
        if (t.reference) cur._refs.push(String(t.reference));
        map.set(key, cur);
    }
    return [...map.values()].map((g) => ({
        ...g,
        debit_inr: Math.round(g.debit_inr * 100) / 100,
        credit_inr: Math.round(g.credit_inr * 100) / 100,
        debit_metal_gm: roundMetalGm(g.debit_metal_gm),
        credit_metal_gm: roundMetalGm(g.credit_metal_gm),
        weight_gm: roundMetalGm(g.weight_gm),
        reference: [...new Set(g._refs)].join(', '),
    }));
}

async function buildDaybook(query, resellerUserId, opts) {
    const day = parseDateOrNull(opts.date);
    if (!day) throw Object.assign(new Error('date required'), { status: 400 });
    const laneView = !!opts.laneView;
    const unassignedOnly = !!opts.unassignedOnly;

    const rows = [];

    if (!unassignedOnly) {
        const billParams = [resellerUserId, day];
        let billSql = `SELECT b.id, b.bill_number, b.bill_date, b.bill_type, b.total_inr, b.status, b.created_at,
                              b.lines_json, b.session_json, b.customer_id,
                              COALESCE(c.name, b.customer_name, 'Walk-in') AS customer_name
                       FROM reseller_erp_bills b
                       LEFT JOIN reseller_erp_customers c ON c.id = b.customer_id
                       WHERE b.reseller_user_id = $1
                         AND b.bill_date = $2::date
                         AND b.bill_type IN ('sale', 'credit', 'debit', 'sales_return')
                         AND LOWER(b.status) IN ('completed', 'paid', 'final', 'issued')`;
        if (!laneView) {
            billSql += ` AND COALESCE(b.session_json->>'ledgerScope', 'official') <> 'lane'`;
        }
        billSql += ' ORDER BY b.created_at ASC NULLS LAST, b.id ASC';
        const bills = await query(billSql, billParams);
        for (const b of bills) {
            const kind = String(b.bill_type || 'sale').toLowerCase();
            const session = parseJsonObject(b.session_json);
            const flows = billCashflows(kind, b.total_inr);
            const mode =
                String(session.paymentMethod || session.payment_mode || session.payMode || '').trim() || '—';
            const metalConv = billSessionMetalConversion(session, kind);
            const billTotal = Number(b.total_inr) || 0;
            const ledgerAmt =
                metalConv.convertedGm > 0 && !metalConv.isCredit ? 0 : billTotal;
            const pieceWt =
                totalWeightGmFromLines(b.lines_json) ||
                Number(session && session.returnWeightGm) ||
                0;
            rows.push({
                row_key: `bill:${b.id}`,
                source: 'bill',
                bill_id: b.id,
                ledger_entry_id: null,
                shadow_bill_id: null,
                created_at: postingTs(b.created_at, b.bill_date),
                entry_date: normDate(b.bill_date),
                kind,
                customer_name: b.customer_name || 'Walk-in',
                payment_mode: mode,
                reference: b.bill_number || '',
                amount_inr: ledgerAmt,
                weight_gm:
                    metalConv.convertedGm > 0
                        ? metalConv.convertedGm
                        : pieceWt > 0
                          ? Math.round(pieceWt * 1000) / 1000
                          : 0,
                debit_metal_gm:
                    metalConv.convertedGm > 0 && !metalConv.isCredit ? metalConv.convertedGm : 0,
                credit_metal_gm: 0,
                rupee_only_debit: metalConv.rupee_only_debit,
                ...flows,
            });
        }

        if (laneView) {
            const shadowSales = await query(
                `SELECT id, bill_number, lane, bill_date, total_inr, customer_name, created_at, session_json, lines_json
                 FROM reseller_erp_shadow_bills
                 WHERE reseller_user_id = $1 AND bill_date = $2::date
                 ORDER BY created_at ASC NULLS LAST, id ASC`,
                [resellerUserId, day],
            );
            for (const s of shadowSales) {
                const session = shadowSaleSession(s);
                const isJainav = String(s.lane || 'jainav') === 'jainav';
                const metalLedgerMode =
                    session.jainavMetalLedger === true ||
                    session.metal_ledger_mode === 'metal' ||
                    session.metalLedgerMode === true;
                const weightGm = metalLedgerMode ? shadowSaleWeightGm(s) : 0;
                const mcOwed = metalLedgerMode ? shadowSaleMcOwedInr(s) : 0;
                const amountInr = metalLedgerMode ? mcOwed : Number(s.total_inr) || 0;
                const metalDc = weightGm > 0
                    ? metalDebitFromSaleWeight(weightGm)
                    : { debit_metal_gm: 0, credit_metal_gm: 0 };
                const flows = billCashflows('sale', amountInr);
                rows.push({
                    row_key: `shadow:${s.id}`,
                    source: 'shadow_bill',
                    bill_id: null,
                    ledger_entry_id: null,
                    shadow_bill_id: s.id,
                    created_at: postingTs(s.created_at, s.bill_date),
                    entry_date: normDate(s.bill_date),
                    kind: 'sale',
                    customer_name: s.customer_name || 'Walk-in',
                    payment_mode: String(s.payment_method || 'cash').trim() || 'cash',
                    reference: s.bill_number || '',
                    amount_inr: amountInr,
                    weight_gm: weightGm,
                    metal_ledger_mode: metalLedgerMode,
                    ...metalDc,
                    ...flows,
                });
            }
        }
    }

    const entryParams = [resellerUserId, day];
    let entrySql = `SELECT e.id, e.entry_date, e.entry_type, e.amount_inr, e.payment_mode, e.reference_no,
                           e.narration, e.bill_id, e.shadow_bill_id, e.customer_id, e.created_at,
                           e.ledger_scope, e.counterparty_name, e.weight_kg, e.metal_gm, e.metal_cleared_gm,
                           e.virtual_metal_inr,
                           c.name AS customer_name, b.bill_number, pv.pv_number
                    FROM reseller_erp_ledger_entries e
                    LEFT JOIN reseller_erp_customers c ON c.id = e.customer_id
                    LEFT JOIN reseller_erp_bills b ON b.id = e.bill_id
                    LEFT JOIN reseller_erp_purchase_vouchers pv ON pv.id = e.pv_id
                    WHERE e.reseller_user_id = $1
                      AND e.entry_date = $2::date
                      AND e.is_suspense = false`;
    if (laneView) {
        entrySql += ` AND (
            e.ledger_scope = 'lane'
            OR e.entry_type = 'purchase'
            OR (e.ledger_scope = 'official' AND LOWER(COALESCE(e.payment_mode, '')) = 'cash')
        )`;
    } else {
        entrySql += ` AND e.ledger_scope = 'official'`;
    }
    if (unassignedOnly) {
        entrySql += ` AND e.customer_id IS NULL`;
    }
    entrySql += ' ORDER BY e.created_at ASC NULLS LAST, e.id ASC';
    const payments = await query(entrySql, entryParams);

    const shadowBillIds = [...new Set(payments.map((p) => p.shadow_bill_id).filter(Boolean))];
    let shadowBillById = {};
    if (shadowBillIds.length) {
        const sbRows = await query(
            `SELECT id, bill_number, customer_name, bill_date
             FROM reseller_erp_shadow_bills
             WHERE reseller_user_id = $1 AND id = ANY($2::int[])`,
            [resellerUserId, shadowBillIds],
        );
        shadowBillById = Object.fromEntries((sbRows || []).map((r) => [r.id, r]));
    }

    for (const p of payments) {
        const flows = ledgerEntryCashflows(p.entry_type, p.amount_inr);
        const party =
            p.customer_name ||
            p.counterparty_name ||
            (p.pv_number ? `PV ${p.pv_number}` : null) ||
            '—';
        const isPay = ['payment_in', 'bill_advance', 'suspense_in', 'payment_out'].includes(p.entry_type);
        const metalGmDisplay = metalGmFromLedgerRow(p);
        const metalGmBal = metalGmForRunningBalance(p);
        const metalDc = metalDebitCreditFromLedgerEntry(p.entry_type, metalGmBal, p.narration);
        rows.push({
            row_key: `ledger:${p.id}`,
            source: 'ledger',
            bill_id: p.bill_id || null,
            ledger_entry_id: p.id,
            shadow_bill_id: p.shadow_bill_id || null,
            created_at: postingTs(p.created_at, p.entry_date),
            entry_date: normDate(p.entry_date),
            kind: p.entry_type,
            customer_name: party,
            payment_mode: String(p.payment_mode || '—').trim() || '—',
            reference: p.reference_no || p.bill_number || p.pv_number || '',
            amount_inr: Number(p.amount_inr) || 0,
            weight_gm: metalGmDisplay,
            metal_gm: metalGmDisplay,
            ...metalDc,
            ...flows,
            virtual_metal_inr: !!p.virtual_metal_inr,
            narration: p.narration || '',
            description: isPay
                ? formatLedgerPaymentDescription(p, p.customer_name, shadowBillById)
                : p.narration || String(p.entry_type || '').replace(/_/g, ' '),
        });
    }

    rows.sort((a, b) => {
        const ta = Date.parse(a.created_at) || 0;
        const tb = Date.parse(b.created_at) || 0;
        if (ta !== tb) return ta - tb;
        return String(a.row_key).localeCompare(String(b.row_key));
    });

    let received = 0;
    let paid = 0;
    for (const r of rows) {
        received += Number(r.received_inr) || 0;
        paid += Number(r.paid_out_inr) || 0;
    }

    const opening = await ledgerOpeningBeforeDay(query, resellerUserId, day, laneView);
    const ledgerCols = applyDaybookLedgerColumns(rows, {
        openingInr: opening.opening_inr,
        openingMetalGm: opening.opening_metal_gm,
    });

    let exportTransactions = ledgerCols.transactions;
    const layout = String(opts.layout || 'detail').toLowerCase();
    if (layout === 'summary' || layout === 'consolidated') {
        exportTransactions = consolidateDaybookTransactions(ledgerCols.transactions);
    }

    return {
        date: day,
        lane_view: laneView,
        layout,
        summary: {
            received_inr: Math.round(received * 100) / 100,
            paid_out_inr: Math.round(paid * 100) / 100,
            net_inr: Math.round((received - paid) * 100) / 100,
            opening_balance_inr: opening.opening_inr,
            opening_balance_metal_gm: opening.opening_metal_gm,
            total_debit_inr: ledgerCols.total_debit_inr,
            total_credit_inr: ledgerCols.total_credit_inr,
            closing_balance_inr: ledgerCols.closing_balance_inr,
            total_debit_metal_gm: ledgerCols.total_debit_metal_gm,
            total_credit_metal_gm: ledgerCols.total_credit_metal_gm,
            closing_balance_metal_gm: ledgerCols.closing_balance_metal_gm,
            transaction_count: ledgerCols.transactions.length,
        },
        transactions: ledgerCols.transactions,
        export_transactions: exportTransactions,
    };
}

function daybookToCsv(daybook) {
    const lines = [];
    const push = (row) => lines.push(row.map(accountCsvEscape).join(','));
    const layout = daybook.layout || 'detail';
    push(['Day book', daybook.date]);
    push(['Report layout', layout]);
    push(['Opening balance ₹', daybook.summary.opening_balance_inr ?? '']);
    push(['Opening metal (g)', daybook.summary.opening_balance_metal_gm ?? '']);
    push(['Total debit', daybook.summary.total_debit_inr ?? '']);
    push(['Total credit', daybook.summary.total_credit_inr ?? '']);
    push(['Closing balance ₹', daybook.summary.closing_balance_inr ?? '']);
    push(['Metal debit (g)', daybook.summary.total_debit_metal_gm ?? '']);
    push(['Metal credit (g)', daybook.summary.total_credit_metal_gm ?? '']);
    push(['Closing metal (g)', daybook.summary.closing_balance_metal_gm ?? '']);
    lines.push('');
    push(['DATE', 'TYPE', 'CUSTOMER / PARTY', 'MODE', 'REFERENCE', 'DEBIT ₹', 'CREDIT ₹', 'METAL (g)', 'BALANCE ₹', 'METAL BAL (g)']);
    const rows = daybook.export_transactions || daybook.transactions;
    for (const t of rows) {
        push([
            fmtLedgerDate(t.entry_date),
            t.kind,
            t.customer_name,
            t.payment_mode,
            t.reference,
            t.debit_inr ? Number(t.debit_inr).toFixed(2) : '',
            t.credit_inr ? Number(t.credit_inr).toFixed(2) : '',
            t.weight_gm ? Number(t.weight_gm).toFixed(3) : '',
            t.balance_inr != null ? Number(t.balance_inr).toFixed(2) : '',
            t.balance_metal_gm != null ? Number(t.balance_metal_gm).toFixed(3) : '',
        ]);
    }
    return lines.join('\r\n');
}

function customerAccountToCsv(account) {
    const lines = [];
    const push = (row) => lines.push(row.map(accountCsvEscape).join(','));
    push(['Payment ledger']);
    push(['Customer', account.customer.name]);
    if (account.customer.mobile) push(['Mobile', account.customer.mobile]);
    if (account.customer.gstin) push(['GSTIN', account.customer.gstin]);
    lines.push('');
    push(['Balance due', account.summary.balance_due_inr]);
    push(['Metal balance (g)', account.summary.metal_balance_gm ?? 0]);
    lines.push('');
    push(['DATE', 'PARTICULARS', 'REF. DATE', 'WEIGHT (g)', 'DEBIT ₹', 'CREDIT ₹', 'BALANCE ₹', 'METAL BAL (g)']);
    for (const t of account.transactions) {
        const particulars =
            t.kind === 'sale'
                ? `(V NO: ${t.ref}) SALES A/C -`
                : t.description || t.kind;
        const wt = Number(t.weight_gm) || 0;
        push([
            fmtLedgerDate(t.date),
            particulars,
            t.credit > 0 ? fmtLedgerDate(t.date) : '',
            wt > 0 ? wt.toFixed(3) : '',
            t.debit ? Number(t.debit).toFixed(2) : '',
            t.credit ? Number(t.credit).toFixed(2) : '',
            Number(t.balance_inr).toFixed(2),
            t.balance_metal_gm != null ? Number(t.balance_metal_gm).toFixed(3) : '',
        ]);
    }
    return lines.join('\r\n');
}

function dateBounds(opts) {
    const on = parseDateOrNull(opts.on);
    if (on) return { from: on, to: on };
    return { from: parseDateOrNull(opts.from), to: parseDateOrNull(opts.to) };
}

function applyDateParams(sql, params, col, from, to) {
    let out = sql;
    if (from) {
        params.push(from);
        out += ` AND ${col} >= $${params.length}::date`;
    }
    if (to) {
        params.push(to);
        out += ` AND ${col} <= $${params.length}::date`;
    }
    return out;
}

function emptyBalanceBucket() {
    return {
        billed: 0,
        paid: 0,
        debit: 0,
        credit: 0,
        metal: 0,
        bills: [],
        tx: 0,
    };
}

function resolveCustomerIdFromMaps(row, byId, byCompact) {
    const id = parseInt(String(row.customer_id), 10);
    if (Number.isFinite(id) && id > 0 && byId.has(id)) return id;
    const compact = compactCustomerName(row.customer_name || row.counterparty_name || '');
    if (compact && byCompact.has(compact)) return byCompact.get(compact);
    return null;
}

async function buildCustomerBalancesReport(query, resellerUserId, opts = {}) {
    const from = parseDateOrNull(opts.from);
    const to = parseDateOrNull(opts.to);
    const on = parseDateOrNull(opts.on);
    const includeShadow = !!opts.includeShadow;
    const nonZeroOnly = opts.nonZeroOnly !== false;
    const bounds = dateBounds(opts);

    await relinkAllOrphanedCustomerRecords(query, resellerUserId);

    const customers = await query(
        `SELECT id, name, mobile, email, gstin, pan, address, notes
         FROM reseller_erp_customers
         WHERE reseller_user_id = $1
           ${sqlExcludeInternalErpCustomers('name', 'notes', { allowCashBook: includeShadow })}
         ORDER BY name ASC`,
        [resellerUserId],
    );
    const byId = new Map();
    const byCompact = new Map();
    for (const c of customers) {
        byId.set(c.id, emptyBalanceBucket());
        const compact = compactCustomerName(c.name);
        if (compact && !byCompact.has(compact)) byCompact.set(compact, c.id);
    }

    const billParams = [resellerUserId];
    let billSql = `SELECT customer_id, customer_name, bill_number, bill_type, total_inr, session_json
                   FROM reseller_erp_bills
                   WHERE reseller_user_id = $1
                     AND bill_type IN ('sale', 'credit', 'debit', 'sales_return')
                     AND LOWER(status) IN ('completed', 'paid', 'final', 'issued')`;
    if (!includeShadow) {
        billSql += ` AND COALESCE(session_json->>'ledgerScope', 'official') <> 'lane'`;
    }
    billSql = applyDateParams(billSql, billParams, 'bill_date', bounds.from, bounds.to);
    const bills = await query(billSql, billParams);
    for (const b of bills) {
        const cid = resolveCustomerIdFromMaps(b, byId, byCompact);
        if (!cid) continue;
        const bucket = byId.get(cid);
        const kind = String(b.bill_type || 'sale').toLowerCase();
        const amt = Number(b.total_inr) || 0;
        const isCredit = kind === 'credit' || kind === 'sales_return';
        if (isCredit) bucket.credit += amt;
        else {
            bucket.debit += amt;
            if (kind === 'sale' || kind === 'debit') bucket.billed += amt;
        }
        bucket.tx += 1;
        if (kind === 'sale' && b.bill_number) bucket.bills.push(String(b.bill_number).trim());
    }

    if (includeShadow) {
        const shParams = [resellerUserId];
        let shSql = `SELECT id, customer_id, customer_name, bill_number, total_inr, session_json, lines_json, lane
                     FROM reseller_erp_shadow_bills
                     WHERE reseller_user_id = $1`;
        shSql = applyDateParams(shSql, shParams, 'bill_date', bounds.from, bounds.to);
        let shadowBills = [];
        try {
            shadowBills = await query(shSql, shParams);
        } catch {
            shadowBills = [];
        }
        for (const s of shadowBills) {
            const cid = resolveCustomerIdFromMaps(s, byId, byCompact);
            if (!cid) continue;
            const bucket = byId.get(cid);
            const tmp = [];
            pushShadowSaleRows(tmp, s);
            const row = tmp[0];
            if (!row) continue;
            bucket.debit += Number(row.debit) || 0;
            bucket.billed += Number(row.debit) || 0;
            bucket.metal += Number(row.debit_metal_gm) || 0;
            bucket.tx += 1;
            if (row.ref) bucket.bills.push(String(row.ref).trim());
        }
    }

    const payParams = [resellerUserId];
    let paySql = `SELECT customer_id, counterparty_name, entry_type, amount_inr, metal_gm, weight_kg, metal_cleared_gm, narration, bill_id
                  FROM reseller_erp_ledger_entries
                  WHERE reseller_user_id = $1 AND is_suspense = false`;
    if (includeShadow) {
        paySql += ` AND (
            ledger_scope = 'lane'
            OR entry_type = 'purchase'
            OR (ledger_scope = 'official' AND LOWER(COALESCE(payment_mode, '')) = 'cash')
            OR ledger_scope = 'official'
        )`;
    } else {
        paySql += ` AND ledger_scope = 'official'`;
    }
    paySql = applyDateParams(paySql, payParams, 'entry_date', bounds.from, bounds.to);
    const payments = await query(paySql, payParams);
    const payKinds = new Set(['payment_in', 'bill_advance', 'suspense_in']);
    for (const p of payments) {
        const cid = resolveCustomerIdFromMaps(
            { customer_id: p.customer_id, customer_name: p.counterparty_name },
            byId,
            byCompact,
        );
        if (!cid) continue;
        const bucket = byId.get(cid);
        const flows = ledgerEntryCashflows(p.entry_type, p.amount_inr);
        bucket.credit += flows.received_inr;
        bucket.debit += flows.paid_out_inr;
        if (payKinds.has(p.entry_type)) bucket.paid += flows.received_inr;
        const metalDc = metalDebitCreditFromLedgerEntry(
            p.entry_type,
            metalGmForRunningBalance(p),
            p.narration,
        );
        bucket.metal += (Number(metalDc.debit_metal_gm) || 0) - (Number(metalDc.credit_metal_gm) || 0);
        bucket.tx += 1;
    }

    const rows = [];
    for (const c of customers) {
        const bucket = byId.get(c.id) || emptyBalanceBucket();
        const balanceDue = Math.round((bucket.debit - bucket.credit) * 100) / 100;
        const metalBal = roundMetalGm(bucket.metal);
        if (nonZeroOnly && Math.abs(balanceDue) < 0.005 && Math.abs(metalBal) < 0.0005) continue;
        rows.push({
            customer_id: c.id,
            name: c.name,
            mobile: c.mobile || '',
            email: c.email || '',
            gstin: c.gstin || '',
            pan: c.pan || '',
            address: c.address || '',
            total_billed_inr: Math.round(bucket.billed * 100) / 100,
            total_paid_inr: Math.round(bucket.paid * 100) / 100,
            balance_due_inr: balanceDue,
            metal_balance_gm: metalBal,
            bill_numbers: [...new Set(bucket.bills.filter(Boolean))],
            transaction_count: bucket.tx,
        });
    }

    rows.sort((a, b) => Math.abs(b.balance_due_inr) - Math.abs(a.balance_due_inr));

    return {
        report: 'customer_balances',
        from,
        to,
        on,
        include_shadow: includeShadow,
        rows,
        summary: {
            customer_count: rows.length,
            total_balance_due_inr: Math.round(rows.reduce((s, r) => s + (Number(r.balance_due_inr) || 0), 0) * 100) / 100,
            total_receivable_inr: Math.round(
                rows.filter((r) => (Number(r.balance_due_inr) || 0) > 0).reduce((s, r) => s + r.balance_due_inr, 0) * 100,
            ) / 100,
            total_payable_inr: Math.round(
                rows
                    .filter((r) => (Number(r.balance_due_inr) || 0) < 0)
                    .reduce((s, r) => s + Math.abs(r.balance_due_inr), 0) * 100,
            ) / 100,
        },
    };
}

function customerBalancesReportToCsv(report) {
    const lines = [];
    const push = (row) => lines.push(row.map(accountCsvEscape).join(','));
    push(['Customer balances report']);
    if (report.from) push(['From', report.from]);
    if (report.to) push(['To', report.to]);
    if (report.on) push(['On', report.on]);
    lines.push('');
    push([
        'Customer',
        'Mobile',
        'GSTIN',
        'Address',
        'Total billed ₹',
        'Total paid ₹',
        'Balance due ₹',
        'Metal balance (g)',
        'Sales bills',
        'Transactions',
    ]);
    for (const r of report.rows || []) {
        push([
            r.name,
            r.mobile,
            r.gstin,
            r.address,
            Number(r.total_billed_inr || 0).toFixed(2),
            Number(r.total_paid_inr || 0).toFixed(2),
            Number(r.balance_due_inr || 0).toFixed(2),
            Number(r.metal_balance_gm || 0).toFixed(3),
            (r.bill_numbers || []).join('; '),
            String(r.transaction_count || 0),
        ]);
    }
    return lines.join('\r\n');
}

async function buildMetalBalancesByTypeReport(query, resellerUserId, opts = {}) {
    const includeShadow = !!opts.includeShadow;
    const nonZeroOnly = opts.nonZeroOnly !== false;

    const customers = await query(
        `SELECT id, name, mobile, gstin
         FROM reseller_erp_customers
         WHERE reseller_user_id = $1
           ${sqlExcludeInternalErpCustomers('name', 'notes', { allowCashBook: includeShadow })}
         ORDER BY name ASC`,
        [resellerUserId],
    );

    const rows = [];
    let sumGold = 0;
    let sumSilver = 0;

    for (const c of customers) {
        let account;
        try {
            account = await buildCustomerAccount(query, resellerUserId, {
                customerId: c.id,
                from: parseDateOrNull(opts.from),
                to: parseDateOrNull(opts.to),
                on: parseDateOrNull(opts.on),
                includeShadow,
            });
        } catch {
            continue;
        }
        let goldRun = 0;
        let silverRun = 0;
        for (const tx of account.transactions || []) {
            const d = Number(tx.debit_metal_gm) || 0;
            const cr = Number(tx.credit_metal_gm) || 0;
            const delta = d - cr;
            if (Math.abs(delta) < 0.0005) continue;
            const kind = inferLedgerMetalKind(tx);
            if (kind === 'gold') goldRun += delta;
            else silverRun += delta;
        }
        const goldBal = roundMetalGm(goldRun);
        const silverBal = roundMetalGm(silverRun);
        if (nonZeroOnly && Math.abs(goldBal) < 0.0005 && Math.abs(silverBal) < 0.0005) {
            continue;
        }
        rows.push({
            customer_id: c.id,
            name: c.name,
            mobile: c.mobile || '',
            gstin: c.gstin || '',
            gold_balance_gm: goldBal,
            silver_balance_gm: silverBal,
            total_metal_balance_gm: roundMetalGm(goldBal + silverBal),
        });
        sumGold += goldBal;
        sumSilver += silverBal;
    }

    return {
        rows,
        summary: {
            customer_count: rows.length,
            total_gold_balance_gm: roundMetalGm(sumGold),
            total_silver_balance_gm: roundMetalGm(sumSilver),
        },
    };
}

async function getCustomerBalancesBeforeLedgerEntry(query, resellerUserId, customerId, ledgerEntryId) {
    const account = await buildCustomerAccount(query, resellerUserId, {
        customerId,
        includeShadow: true,
    });
    const txs = account.transactions || [];
    const idx = txs.findIndex((t) => t.ledger_entry_id === ledgerEntryId);
    if (idx <= 0) {
        return { balance_inr: 0, balance_metal_gm: 0 };
    }
    const prev = txs[idx - 1];
    return {
        balance_inr: Number(prev.balance_inr) || 0,
        balance_metal_gm: roundMetalGm(prev.balance_metal_gm),
    };
}

module.exports = {
    buildCustomerAccount,
    buildDaybook,
    buildCustomerBalancesReport,
    buildMetalBalancesByTypeReport,
    customerAccountToCsv,
    customerBalancesReportToCsv,
    daybookToCsv,
    cashBookKind,
    isInternalErpCustomerRow,
    sqlExcludeInternalErpCustomers,
    ensureCashBookCustomers,
    compactCustomerName,
    relinkOrphanedCustomerRecords,
    getCustomerBalancesBeforeLedgerEntry,
};

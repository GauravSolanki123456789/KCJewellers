/**
 * Customer account statement — official bills + payments (+ optional shadow bills for lane ledger).
 */

function parseDateOrNull(v) {
    if (!v) return null;
    const s = String(v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normDate(d) {
    if (!d) return '';
    const s = String(d);
    return s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
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
    const n = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[\s._-]+/g, '');
    if (n === 'cash' || n === 'cashbook') return 'cash';
    if (n === 'jainav2') return 'jainav2';
    return null;
}

function compactCustomerName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[\s._-]+/g, '');
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
               AND regexp_replace(lower(trim(name)), '[\\s._-]+', '', 'g') = $2
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

function interleaveSalesAndLinkedPayments(rows) {
    const saleKinds = new Set(['sale', 'debit', 'credit', 'sales_return']);
    const payKinds = new Set(['payment_in', 'bill_advance', 'suspense_in', 'payment_out']);
    const sales = [];
    const pays = [];
    const other = [];
    for (const r of rows) {
        const k = String(r.kind || '').toLowerCase();
        if (saleKinds.has(k)) sales.push(r);
        else if (payKinds.has(k)) pays.push(r);
        else other.push(r);
    }
    sales.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return (a.sort_id || 0) - (b.sort_id || 0);
    });
    const saleRefs = new Set(sales.map((s) => String(s.ref || '').trim().toUpperCase()).filter(Boolean));
    const paysByBill = new Map();
    const orphanPays = [];
    for (const p of pays) {
        const link = String(p.linked_bill_ref || '').trim().toUpperCase();
        if (link && saleRefs.has(link)) {
            if (!paysByBill.has(link)) paysByBill.set(link, []);
            paysByBill.get(link).push(p);
        } else {
            orphanPays.push(p);
        }
    }
    orphanPays.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return (a.sort_id || 0) - (b.sort_id || 0);
    });
    const out = [];
    for (const s of sales) {
        out.push(s);
        const ref = String(s.ref || '').trim().toUpperCase();
        const linked = (paysByBill.get(ref) || []).sort(
            (a, b) => (a.sort_id || 0) - (b.sort_id || 0),
        );
        for (const p of linked) out.push(p);
    }
    out.push(...orphanPays, ...other);
    return out;
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

function pushShadowSaleRows(rows, s) {
    const billAmt = Number(s.total_inr) || 0;
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
        Number(session && (session.returnWeightGm || session.totalWeightGm)) ||
        0;
    rows.push({
        date: normDate(s.bill_date),
        sort_id: s.id,
        kind: 'sale',
        ref: s.bill_number,
        description: `(V NO: ${s.bill_number}) SALES A/C -`,
        debit: billAmt,
        credit: 0,
        lane: s.lane || 'jainav',
        weight_gm: weightGm > 0 ? Math.round(weightGm * 1000) / 1000 : 0,
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

    const customer = await loadCustomerRow(query, resellerUserId, customerId);
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
    const book = cashBookKind(customer.name);

    const saleParams = [resellerUserId, customerId];
    let saleSql = `SELECT id, bill_number, bill_date, bill_type, total_inr, status, created_at, lines_json, session_json
                   FROM reseller_erp_bills
                   WHERE reseller_user_id = $1 AND customer_id = $2
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
        const shParams = book === 'jainav2' ? [resellerUserId] : [resellerUserId, customerId, customer.name];
        let shSql = `SELECT id, bill_number, lane, bill_date, total_inr, payment_method, status, created_at, session_json, lines_json
                     FROM reseller_erp_shadow_bills
                     WHERE reseller_user_id = $1`;
        if (book !== 'jainav2') {
            shSql += ` AND (customer_id = $2 OR LOWER(TRIM(customer_name)) = LOWER(TRIM($3)))`;
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

    const entryParams = book ? [resellerUserId] : [resellerUserId, customerId];
    let entrySql = `SELECT id, entry_date, entry_type, amount_inr, payment_mode, reference_no,
                           narration, bill_id, shadow_bill_id, is_suspense, ledger_scope
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
        entrySql += ` AND customer_id = $2`;
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
        rows.push({
            date: normDate(s.bill_date),
            sort_id: s.id,
            kind,
            ref: s.bill_number,
            description,
            debit: isCredit ? 0 : amt,
            credit: isCredit ? amt : 0,
            lane,
            weight_gm: weightGm > 0 ? Math.round(weightGm * 1000) / 1000 : 0,
        });
    }

    if (includeShadow && book !== 'jainav2') {
        for (const s of shadowSales) pushShadowSaleRows(rows, s);
    }

    const seenShadowPay = new Set();
    for (const p of payments) {
        if (p.shadow_bill_id) {
            const key = String(p.shadow_bill_id);
            if (seenShadowPay.has(key)) continue;
            seenShadowPay.add(key);
        }
        const creditTypes = new Set(['payment_in', 'bill_advance', 'suspense_in']);
        let credit = 0;
        let debit = 0;
        if (creditTypes.has(p.entry_type)) credit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'payment_out') debit = Number(p.amount_inr) || 0;
        // Stock-in PV: party supplied goods, shop has not necessarily paid yet → credit.
        if (p.entry_type === 'purchase') credit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'expense' || p.entry_type === 'salary') debit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'adjustment') {
            const amt = Number(p.amount_inr) || 0;
            if (amt >= 0) credit = amt;
            else debit = Math.abs(amt);
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
            kind: p.entry_type,
            ref: p.reference_no || '',
            description: isPay
                ? formatLedgerPaymentDescription(p, customer.name, shadowBillById)
                : p.narration || p.entry_type.replace(/_/g, ' '),
            debit,
            credit,
            payment_mode: p.payment_mode,
            linked_bill_ref: linkedBillRef,
        });
    }

    const orderedRows = interleaveSalesAndLinkedPayments(rows);

    let running = 0;
    const transactions = orderedRows.map((r) => {
        running += r.debit - r.credit;
        const { linked_bill_ref: _lb, ...pub } = r;
        return { ...pub, balance_inr: Math.round(running * 100) / 100 };
    });

    const totalBilled = orderedRows
        .filter((r) => r.kind === 'sale' || r.kind === 'debit')
        .reduce((s, r) => s + r.debit, 0);
    const totalPaid = orderedRows
        .filter((r) => r.kind === 'payment_in' || r.kind === 'bill_advance' || r.kind === 'suspense_in')
        .reduce((s, r) => s + r.credit, 0);
    const balanceDue = transactions.length
        ? transactions[transactions.length - 1].balance_inr
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
            transaction_count: transactions.length,
        },
        transactions,
    };
}

function fmtLedgerDate(iso) {
    if (!iso) return '';
    const parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}-${parts[1]}-${parts[0].slice(2)}`;
}

function customerAccountToCsv(account) {
    const lines = [];
    const push = (row) => lines.push(row.map(accountCsvEscape).join(','));
    push(['Payment ledger']);
    push(['Customer', account.customer.name]);
    if (account.customer.mobile) push(['Mobile', account.customer.mobile]);
    if (account.customer.gstin) push(['GSTIN', account.customer.gstin]);
    lines.push('');
    push(['Total billed', account.summary.total_billed_inr]);
    push(['Total paid', account.summary.total_paid_inr]);
    push(['Balance due', account.summary.balance_due_inr]);
    lines.push('');
    push(['DATE', 'PARTICULARS', 'REF. DATE', 'WEIGHT (g)', 'DEBIT', 'CREDIT', 'BALANCE']);
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
        ]);
    }
    return lines.join('\r\n');
}

module.exports = {
    buildCustomerAccount,
    customerAccountToCsv,
    cashBookKind,
    ensureCashBookCustomers,
    compactCustomerName,
};

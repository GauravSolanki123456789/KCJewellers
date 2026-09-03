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
    const from = parseDateOrNull(opts.from);
    const to = parseDateOrNull(opts.to);
    const includeShadow = !!opts.includeShadow;

    const customer = await loadCustomerRow(query, resellerUserId, customerId);
    if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

    const saleParams = [resellerUserId, customerId];
    let saleSql = `SELECT id, bill_number, bill_date, total_inr, status, created_at
                   FROM reseller_erp_bills
                   WHERE reseller_user_id = $1 AND customer_id = $2
                     AND bill_type = 'sale'
                     AND LOWER(status) IN ('completed', 'paid', 'final')`;
    if (from) {
        saleParams.push(from);
        saleSql += ` AND bill_date >= $${saleParams.length}::date`;
    }
    if (to) {
        saleParams.push(to);
        saleSql += ` AND bill_date <= $${saleParams.length}::date`;
    }
    saleSql += ' ORDER BY bill_date, id';
    const officialSales = await query(saleSql, saleParams);

    let shadowSales = [];
    if (includeShadow) {
        const shParams = [resellerUserId, customerId, customer.name];
        let shSql = `SELECT id, bill_number, lane, bill_date, total_inr, payment_method, status, created_at
                     FROM reseller_erp_shadow_bills
                     WHERE reseller_user_id = $1
                       AND (customer_id = $2 OR LOWER(TRIM(customer_name)) = LOWER(TRIM($3)))`;
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

    const entryParams = [resellerUserId, customerId];
    let entrySql = `SELECT id, entry_date, entry_type, amount_inr, payment_mode, reference_no,
                           narration, bill_id, is_suspense
                    FROM reseller_erp_ledger_entries
                    WHERE reseller_user_id = $1 AND customer_id = $2 AND is_suspense = false`;
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

    const rows = [];

    for (const s of officialSales) {
        rows.push({
            date: normDate(s.bill_date),
            sort_id: s.id,
            kind: 'sale',
            ref: s.bill_number,
            description: 'GST sale',
            debit: Number(s.total_inr) || 0,
            credit: 0,
            lane: 'gst',
        });
    }

    if (includeShadow) {
        for (const s of shadowSales) {
            rows.push({
                date: normDate(s.bill_date),
                sort_id: s.id,
                kind: 'shadow_sale',
                ref: s.bill_number,
                description: s.lane === 'hitesh' ? 'Hitesh' : 'Jainav',
                debit: Number(s.total_inr) || 0,
                credit: 0,
                lane: s.lane,
            });
        }
    }

    for (const p of payments) {
        const creditTypes = new Set(['payment_in', 'bill_advance', 'suspense_in']);
        const debitTypes = new Set(['payment_out', 'adjustment']);
        let credit = 0;
        let debit = 0;
        if (creditTypes.has(p.entry_type)) credit = Number(p.amount_inr) || 0;
        if (debitTypes.has(p.entry_type) && p.entry_type === 'payment_out') debit = Number(p.amount_inr) || 0;
        if (p.entry_type === 'adjustment') {
            const amt = Number(p.amount_inr) || 0;
            if (amt >= 0) credit = amt;
            else debit = Math.abs(amt);
        }
        rows.push({
            date: normDate(p.entry_date),
            sort_id: p.id,
            kind: p.entry_type,
            ref: p.reference_no || '',
            description: p.narration || p.entry_type.replace(/_/g, ' '),
            debit,
            credit,
            payment_mode: p.payment_mode,
        });
    }

    rows.sort((a, b) => {
        const d = a.date.localeCompare(b.date);
        if (d !== 0) return d;
        return (a.sort_id || 0) - (b.sort_id || 0);
    });

    let running = 0;
    const transactions = rows.map((r) => {
        running += r.debit - r.credit;
        return { ...r, balance_inr: Math.round(running * 100) / 100 };
    });

    const totalBilled = rows.reduce((s, r) => s + r.debit, 0);
    const totalPaid = rows.reduce((s, r) => s + r.credit, 0);
    const balanceDue = Math.round((totalBilled - totalPaid) * 100) / 100;

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

function customerAccountToCsv(account) {
    const lines = [];
    const push = (row) => lines.push(row.map(accountCsvEscape).join(','));
    push(['Customer account statement']);
    push(['Customer', account.customer.name]);
    if (account.customer.mobile) push(['Mobile', account.customer.mobile]);
    if (account.customer.gstin) push(['GSTIN', account.customer.gstin]);
    lines.push('');
    push(['Total billed', account.summary.total_billed_inr]);
    push(['Total paid', account.summary.total_paid_inr]);
    push(['Balance due', account.summary.balance_due_inr]);
    lines.push('');
    push(['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']);
    for (const t of account.transactions) {
        push([
            t.date,
            t.kind,
            t.ref,
            t.description,
            t.debit || '',
            t.credit || '',
            t.balance_inr,
        ]);
    }
    return lines.join('\r\n');
}

module.exports = {
    buildCustomerAccount,
    customerAccountToCsv,
};

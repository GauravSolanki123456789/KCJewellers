/**
 * Export official ERP day book rows to Tally Prime (per-reseller settings).
 */

const TallyIntegration = require('../config/tally-integration');

function parseTallySettings(settings) {
    const block = settings?.tally && typeof settings.tally === 'object' ? settings.tally : {};
    const enabledRaw = String(block.enabled ?? block.enable ?? '').trim().toLowerCase();
    const enabled =
        enabledRaw === '1' ||
        enabledRaw === 'true' ||
        enabledRaw === 'yes' ||
        enabledRaw === 'on' ||
        (!enabledRaw && String(block.serverUrl || block.company || '').trim());
    const serverUrl = String(block.serverUrl || block.tallyUrl || 'http://localhost:9000').trim();
    const company = String(block.company || block.companyName || '').trim();
    const apiKey = String(block.apiKey || block.secret || '').trim();
    return { enabled, serverUrl, company, apiKey };
}

async function loadResellerErpSettings(query, resellerUserId) {
    const rows = await query(`SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1`, [
        resellerUserId,
    ]);
    let settings = rows[0]?.settings ?? {};
    if (typeof settings === 'string') {
        try {
            settings = JSON.parse(settings);
        } catch {
            settings = {};
        }
    }
    return settings && typeof settings === 'object' ? settings : {};
}

function paymentModeLedger(mode) {
    const m = String(mode || '').trim().toLowerCase();
    if (!m || m === '—' || m === '-') return 'Cash';
    if (m === 'cash') return 'Cash';
    if (['upi', 'neft', 'imps', 'cheque', 'card', 'bank', 'gpay'].includes(m)) return 'Bank';
    return 'Bank';
}

function injectCompanyName(xml, companyName) {
    if (!companyName) return xml;
    if (xml.includes('<SVCURRENTCOMPANY>')) return xml;
    return xml.replace(
        '<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>',
        `<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>`,
    );
}

function mapBillToTallySales(b, customerName) {
    let lines = b.lines_json;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    const items = (Array.isArray(lines) ? lines : []).map((l) => ({
        itemName: l.description || l.sku || l.style || 'Jewellery',
        pcs: l.qty || l.pcs || 1,
        rate: l.rate || l.silver_rate || 0,
        total: l.line_total || l.total || l.amount || 0,
    }));
    if (!items.length) {
        items.push({
            itemName: 'Jewellery',
            pcs: 1,
            rate: Number(b.total_inr) || 0,
            total: Number(b.total_inr) || 0,
        });
    }
    return {
        date: b.bill_date,
        bill_no: b.bill_number,
        customer_name: customerName || b.customer_name || 'Walk-in',
        net_total: Number(b.total_inr) || 0,
        items,
        payment_method: 'Credit',
    };
}

async function syncDaybookRow(query, resellerUserId, tally, row, companyName) {
    const kind = String(row.kind || '').toLowerCase();
    const ref = row.reference || '';
    const party = row.customer_name || 'Party';
    const date = row.entry_date;
    const amt = Number(row.amount_inr) || 0;

    if (row.source === 'bill' && row.bill_id) {
        const bills = await query(
            `SELECT b.*, COALESCE(c.name, b.customer_name) AS customer_name
             FROM reseller_erp_bills b
             LEFT JOIN reseller_erp_customers c ON c.id = b.customer_id
             WHERE b.id = $1 AND b.reseller_user_id = $2 LIMIT 1`,
            [row.bill_id, resellerUserId],
        );
        const b = bills[0];
        if (!b) return { ok: false, ref, error: 'Bill not found' };
        const billType = String(b.bill_type || 'sale').toLowerCase();
        if (billType === 'credit' || billType === 'sales_return') {
            const xml = injectCompanyName(
                tally.generateSalesReturnXML({
                    date,
                    ssr_no: ref || b.bill_number,
                    customer_name: party,
                    net_total: amt,
                    total: amt,
                    items: [{ itemName: 'Jewellery', pcs: 1, total: amt }],
                }),
                companyName,
            );
            const result = await tally.sendToTally(xml);
            return { ok: true, ref, type: 'Sales Return', result };
        }
        if (billType === 'debit') {
            const xml = injectCompanyName(
                tally.generateSalesInvoiceXML({
                    ...mapBillToTallySales(b, party),
                    narration: `Debit note ${ref}`,
                }),
                companyName,
            );
            const result = await tally.sendToTally(xml);
            return { ok: true, ref, type: 'Debit Note', result };
        }
        const xml = injectCompanyName(
            tally.generateSalesInvoiceXML(mapBillToTallySales(b, party)),
            companyName,
        );
        const result = await tally.sendToTally(xml);
        return { ok: true, ref, type: 'Sales', result };
    }

    if (kind === 'purchase') {
        const xml = injectCompanyName(
            tally.generatePurchaseVoucherXML({
                date,
                pv_no: ref,
                supplier_name: party,
                total: amt,
                items: [{ itemName: 'Metal / Stock', weight: 1, total: amt }],
            }),
            companyName,
        );
        const result = await tally.sendToTally(xml);
        return { ok: true, ref, type: 'Purchase', result };
    }

    if (kind === 'payment_in' || kind === 'bill_advance' || kind === 'suspense_in') {
        const xml = injectCompanyName(
            tally.generatePaymentReceiptXML({
                date,
                reference: ref,
                amount: amt,
                customer_name: party,
                payment_method: paymentModeLedger(row.payment_mode),
                transaction_type: 'Receipt',
                description: row.description || 'Payment received',
            }),
            companyName,
        );
        const result = await tally.sendToTally(xml);
        return { ok: true, ref, type: 'Receipt', result };
    }

    if (kind === 'payment_out' || kind === 'expense' || kind === 'salary') {
        const xml = injectCompanyName(
            tally.generatePaymentReceiptXML({
                date,
                reference: ref,
                amount: amt,
                customer_name: party,
                payment_method: paymentModeLedger(row.payment_mode),
                transaction_type: 'Payment',
                description: row.description || kind,
            }),
            companyName,
        );
        const result = await tally.sendToTally(xml);
        return { ok: true, ref, type: 'Payment', result };
    }

    if (kind === 'sale' && row.source === 'shadow_bill') {
        return { ok: false, ref, skipped: true, error: 'Lane sale — not exported' };
    }

    if (kind === 'adjustment') {
        const xml = injectCompanyName(
            tally.generateCashEntryXML({
                date,
                reference: ref,
                amount: Math.abs(amt),
                customer_name: party,
                description: row.description || 'Adjustment',
                transaction_type: amt >= 0 ? 'Receipt' : 'Payment',
            }),
            companyName,
        );
        const result = await tally.sendToTally(xml);
        return { ok: true, ref, type: 'Adjustment', result };
    }

    return { ok: false, ref, skipped: true, error: `Unsupported type: ${kind}` };
}

async function exportDaybookToTally(query, resellerUserId, opts) {
    const { buildDaybook } = require('./resellerErpCustomerAccount');
    const settings = await loadResellerErpSettings(query, resellerUserId);
    const tallyCfg = parseTallySettings(settings);
    if (!tallyCfg.serverUrl) {
        throw Object.assign(new Error('Tally server URL not configured. Open ERP → Tally connectivity.'), {
            status: 400,
        });
    }
    if (!tallyCfg.company) {
        throw Object.assign(new Error('Tally company name not configured.'), { status: 400 });
    }

    const daybook = await buildDaybook(query, resellerUserId, {
        date: opts.date,
        laneView: false,
        unassignedOnly: false,
    });

    const tally = new TallyIntegration({
        tallyUrl: tallyCfg.serverUrl,
        companyName: tallyCfg.company,
        apiKey: tallyCfg.apiKey,
        enabled: true,
    });

    const results = [];
    let synced = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of daybook.transactions) {
        try {
            const r = await syncDaybookRow(query, resellerUserId, tally, row, tallyCfg.company);
            if (r.skipped) {
                skipped += 1;
                results.push(r);
                continue;
            }
            if (r.ok) synced += 1;
            else failed += 1;
            results.push(r);
        } catch (e) {
            failed += 1;
            results.push({ ok: false, ref: row.reference, error: e.message || String(e) });
        }
    }

    return {
        date: daybook.date,
        synced,
        failed,
        skipped,
        total: daybook.transactions.length,
        results,
        message:
            failed === 0
                ? `Exported ${synced} voucher(s) to Tally for ${daybook.date}.`
                : `Exported ${synced}; ${failed} failed. Check Tally is open with ODBC/HTTP enabled.`,
    };
}

async function testResellerTallyConnection(query, resellerUserId) {
    const settings = await loadResellerErpSettings(query, resellerUserId);
    const tallyCfg = parseTallySettings(settings);
    if (!tallyCfg.serverUrl) {
        throw Object.assign(new Error('Tally server URL required'), { status: 400 });
    }
    const tally = new TallyIntegration({
        tallyUrl: tallyCfg.serverUrl,
        companyName: tallyCfg.company || 'Default Company',
        enabled: true,
    });
    return tally.testConnection();
}

module.exports = {
    exportDaybookToTally,
    testResellerTallyConnection,
    parseTallySettings,
    loadResellerErpSettings,
};

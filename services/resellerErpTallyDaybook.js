/**
 * Export official ERP day book rows to Tally Prime (per-reseller settings).
 * Vouchers are posted from the shop PC via the local print agent (Tally on localhost).
 */

const {
    normalizeTallyUrl,
    buildSalesVoucherXml,
    buildReceiptVoucherXml,
    buildPaymentVoucherXml,
    buildPurchaseVoucherXml,
    buildCreditNoteVoucherXml,
    postXmlToTally,
} = require('../config/tally-daybook-xml');

function parseTallySettings(settings) {
    const block = settings?.tally && typeof settings.tally === 'object' ? settings.tally : {};
    const serverUrl = normalizeTallyUrl(block.serverUrl || block.tallyUrl || 'http://localhost:9000');
    const company = String(block.company || block.companyName || '').trim();
    const apiKey = String(block.apiKey || block.secret || '').trim();
    const salesLedger = String(block.salesLedger || 'Sales Account').trim() || 'Sales Account';
    const purchaseLedger = String(block.purchaseLedger || 'Purchase Account').trim() || 'Purchase Account';
    const cashLedger = String(block.cashLedger || 'Cash').trim() || 'Cash';
    const bankLedger = String(block.bankLedger || 'Bank').trim() || 'Bank';
    return { serverUrl, company, apiKey, salesLedger, purchaseLedger, cashLedger, bankLedger };
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

function cashOrBankLedger(mode, tallyCfg) {
    const m = String(mode || '').trim().toLowerCase();
    if (m === 'cash') return tallyCfg.cashLedger;
    if (['upi', 'neft', 'imps', 'cheque', 'card', 'bank', 'gpay', 'mixed'].includes(m)) {
        return tallyCfg.bankLedger;
    }
    return tallyCfg.cashLedger;
}

function normalizePartyName(name) {
    return String(name || 'Walk-in').trim();
}

async function buildTallyJobForRow(query, resellerUserId, row, tallyCfg) {
    const kind = String(row.kind || '').toLowerCase();
    const ref = String(row.reference || '').trim() || `ERP-${row.row_key || Date.now()}`;
    const party = normalizePartyName(row.customer_name);
    const date = row.entry_date;
    const amt = Number(row.amount_inr) || 0;
    const companyName = tallyCfg.company;
    const narration = row.description || '';

    if (row.source === 'bill' && row.bill_id) {
        const billType = String(row.kind || 'sale').toLowerCase();
        const voucherNumber = ref || `BILL-${row.bill_id}`;
        if (billType === 'credit' || billType === 'sales_return') {
            return {
                ref: voucherNumber,
                type: 'Credit Note',
                xml: buildCreditNoteVoucherXml({
                    companyName,
                    date,
                    voucherNumber,
                    party,
                    amount: amt,
                    salesLedger: tallyCfg.salesLedger,
                    narration,
                }),
            };
        }
        return {
            ref: voucherNumber,
            type: 'Sales',
            xml: buildSalesVoucherXml({
                companyName,
                date,
                voucherNumber,
                party,
                amount: amt,
                salesLedger: tallyCfg.salesLedger,
                narration: narration || `Sale ${voucherNumber}`,
            }),
        };
    }

    if (kind === 'purchase') {
        return {
            ref,
            type: 'Purchase',
            xml: buildPurchaseVoucherXml({
                companyName,
                date,
                voucherNumber: ref,
                party,
                amount: amt,
                purchaseLedger: tallyCfg.purchaseLedger,
                narration: narration || `Purchase ${ref}`,
            }),
        };
    }

    if (kind === 'payment_in' || kind === 'bill_advance' || kind === 'suspense_in') {
        return {
            ref,
            type: 'Receipt',
            xml: buildReceiptVoucherXml({
                companyName,
                date,
                voucherNumber: ref,
                party,
                amount: amt,
                cashOrBankLedger: cashOrBankLedger(row.payment_mode, tallyCfg),
                narration: narration || 'Payment received',
            }),
        };
    }

    if (kind === 'payment_out' || kind === 'expense' || kind === 'salary') {
        return {
            ref,
            type: 'Payment',
            xml: buildPaymentVoucherXml({
                companyName,
                date,
                voucherNumber: ref,
                party,
                amount: amt,
                cashOrBankLedger: cashOrBankLedger(row.payment_mode, tallyCfg),
                narration: narration || kind,
            }),
        };
    }

    if (kind === 'sale' && row.source === 'shadow_bill') {
        return { skipped: true, ref, error: 'Lane entry — not exported' };
    }

    if (kind === 'adjustment') {
        const isReceipt = amt >= 0;
        const abs = Math.abs(amt);
        if (isReceipt) {
            return {
                ref,
                type: 'Receipt',
                xml: buildReceiptVoucherXml({
                    companyName,
                    date,
                    voucherNumber: ref,
                    party,
                    amount: abs,
                    cashOrBankLedger: tallyCfg.cashLedger,
                    narration: narration || 'Adjustment',
                }),
            };
        }
        return {
            ref,
            type: 'Payment',
            xml: buildPaymentVoucherXml({
                companyName,
                date,
                voucherNumber: ref,
                party,
                amount: abs,
                cashOrBankLedger: tallyCfg.cashLedger,
                narration: narration || 'Adjustment',
            }),
        };
    }

    return { skipped: true, ref, error: `Unsupported type: ${kind}` };
}

async function buildDaybookTallyExportPack(query, resellerUserId, opts) {
    const { buildDaybook } = require('./resellerErpCustomerAccount');
    const settings = await loadResellerErpSettings(query, resellerUserId);
    const tallyBlock = settings?.tally && typeof settings.tally === 'object' ? settings.tally : {};
    const enabledRaw = String(tallyBlock.enabled || 'yes').trim().toLowerCase();
    if (['no', '0', 'false', 'off'].includes(enabledRaw)) {
        throw Object.assign(new Error('Enable day book export under ERP → Tally connectivity.'), { status: 400 });
    }
    const tallyCfg = parseTallySettings(settings);
    if (!tallyCfg.company) {
        throw Object.assign(new Error('Set Tally company name in ERP → Tally connectivity (exact name from Tally).'), {
            status: 400,
        });
    }

    const daybook = await buildDaybook(query, resellerUserId, {
        date: opts.date,
        laneView: false,
        unassignedOnly: false,
    });

    const jobs = [];
    const skipped = [];
    for (const row of daybook.transactions) {
        const job = await buildTallyJobForRow(query, resellerUserId, row, tallyCfg);
        if (job.skipped) skipped.push(job);
        else if (job.xml) jobs.push(job);
    }

    return {
        date: daybook.date,
        tallyUrl: tallyCfg.serverUrl,
        company: tallyCfg.company,
        jobs,
        skipped,
        transaction_count: daybook.transactions.length,
    };
}

async function runTallyJobsOnHost(tallyUrl, jobs) {
    const results = [];
    let synced = 0;
    let failed = 0;
    for (const job of jobs) {
        try {
            await postXmlToTally(tallyUrl, job.xml);
            synced += 1;
            results.push({ ok: true, ref: job.ref, type: job.type });
        } catch (e) {
            failed += 1;
            results.push({ ok: false, ref: job.ref, type: job.type, error: e.message || String(e) });
        }
    }
    return { synced, failed, results };
}

async function exportDaybookToTally(query, resellerUserId, opts) {
    const pack = await buildDaybookTallyExportPack(query, resellerUserId, opts);
    if (!pack.jobs.length) {
        return {
            ...pack,
            synced: 0,
            failed: 0,
            results: [],
            message:
                pack.skipped.length
                    ? 'No exportable vouchers for this day.'
                    : 'No transactions on this date.',
        };
    }

    return {
        ...pack,
        synced: 0,
        failed: 0,
        results: [],
        message: `Prepared ${pack.jobs.length} voucher(s). Posting via this PC…`,
        requiresLocalAgent: true,
    };
}

async function executeTallyJobsOnServer(tallyUrl, jobs) {
    return runTallyJobsOnHost(tallyUrl, jobs);
}

async function testResellerTallyConnection(query, resellerUserId) {
    const settings = await loadResellerErpSettings(query, resellerUserId);
    const tallyCfg = parseTallySettings(settings);
    if (!tallyCfg.company) {
        throw Object.assign(new Error('Tally company name required'), { status: 400 });
    }
    const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Companies</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${tallyCfg.company.replace(/&/g, '&amp;')}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const result = await postXmlToTally(tallyCfg.serverUrl, testXml, 15000);
        return { success: true, message: 'Tally reachable on this PC', result };
    } catch (e) {
        return { success: false, message: e.message || 'Tally test failed' };
    }
}

module.exports = {
    exportDaybookToTally,
    buildDaybookTallyExportPack,
    executeTallyJobsOnServer,
    testResellerTallyConnection,
    parseTallySettings,
    loadResellerErpSettings,
    postXmlToTally,
};

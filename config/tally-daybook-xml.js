/**
 * Tally Prime — day book voucher XML (Import Data envelope).
 */

function escapeXml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function normalizeTallyUrl(raw) {
    let s = String(raw || 'http://localhost:9000').trim();
    if (!s) s = 'http://localhost:9000';
    if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
    try {
        const u = new URL(s);
        if (!u.port) {
            u.port = u.protocol === 'https:' ? '443' : '9000';
        }
        return u.toString().replace(/\/$/, '');
    } catch {
        return 'http://localhost:9000';
    }
}

function tallyDateYmd(isoDate) {
    const s = String(isoDate || '').slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
    return s.replace(/-/g, '').slice(0, 8);
}

function formatTallyAmount(amount, deemedPositive) {
    const n = Math.abs(Number(amount) || 0);
    const signed = deemedPositive === 'Yes' ? n : -n;
    return signed.toFixed(2);
}

function ledgerEntryXml(ledgerName, amount, deemedPositive) {
    const name = String(ledgerName || '').trim();
    if (!name) return '';
    return `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(name)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${deemedPositive}</ISDEEMEDPOSITIVE>
            <AMOUNT>${formatTallyAmount(amount, deemedPositive)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`;
}

function wrapImportEnvelope(companyName, voucherInnerXml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
${voucherInnerXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function buildSalesVoucherXml(opts) {
    const {
        companyName,
        date,
        voucherNumber,
        party,
        amount,
        salesLedger,
        narration,
    } = opts;
    const amt = Number(amount) || 0;
    const partyName = String(party || 'Walk-in').trim();
    const inner = `
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>${tallyDateYmd(date)}</DATE>
            <EFFECTIVEDATE>${tallyDateYmd(date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(narration || `ERP Sales ${voucherNumber}`)}</NARRATION>
            ${ledgerEntryXml(partyName, amt, 'Yes')}
            ${ledgerEntryXml(salesLedger, amt, 'No')}
          </VOUCHER>`;
    return wrapImportEnvelope(companyName, inner);
}

function buildReceiptVoucherXml(opts) {
    const {
        companyName,
        date,
        voucherNumber,
        party,
        amount,
        cashOrBankLedger,
        narration,
    } = opts;
    const amt = Number(amount) || 0;
    const partyName = String(party || 'Walk-in').trim();
    const bankCash = String(cashOrBankLedger || 'Cash').trim();
    const inner = `
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>${tallyDateYmd(date)}</DATE>
            <EFFECTIVEDATE>${tallyDateYmd(date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(narration || `ERP Receipt ${voucherNumber}`)}</NARRATION>
            ${ledgerEntryXml(bankCash, amt, 'Yes')}
            ${ledgerEntryXml(partyName, amt, 'No')}
          </VOUCHER>`;
    return wrapImportEnvelope(companyName, inner);
}

function buildPaymentVoucherXml(opts) {
    const {
        companyName,
        date,
        voucherNumber,
        party,
        amount,
        cashOrBankLedger,
        narration,
    } = opts;
    const amt = Number(amount) || 0;
    const partyName = String(party || 'Party').trim();
    const bankCash = String(cashOrBankLedger || 'Cash').trim();
    const inner = `
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>${tallyDateYmd(date)}</DATE>
            <EFFECTIVEDATE>${tallyDateYmd(date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(narration || `ERP Payment ${voucherNumber}`)}</NARRATION>
            ${ledgerEntryXml(partyName, amt, 'Yes')}
            ${ledgerEntryXml(bankCash, amt, 'No')}
          </VOUCHER>`;
    return wrapImportEnvelope(companyName, inner);
}

function buildPurchaseVoucherXml(opts) {
    const {
        companyName,
        date,
        voucherNumber,
        party,
        amount,
        purchaseLedger,
        narration,
    } = opts;
    const amt = Number(amount) || 0;
    const partyName = String(party || 'Supplier').trim();
    const inner = `
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>${tallyDateYmd(date)}</DATE>
            <EFFECTIVEDATE>${tallyDateYmd(date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(narration || `ERP Purchase ${voucherNumber}`)}</NARRATION>
            ${ledgerEntryXml(purchaseLedger, amt, 'Yes')}
            ${ledgerEntryXml(partyName, amt, 'No')}
          </VOUCHER>`;
    return wrapImportEnvelope(companyName, inner);
}

function buildCreditNoteVoucherXml(opts) {
    const {
        companyName,
        date,
        voucherNumber,
        party,
        amount,
        salesLedger,
        narration,
    } = opts;
    const amt = Number(amount) || 0;
    const partyName = String(party || 'Walk-in').trim();
    const inner = `
          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
            <DATE>${tallyDateYmd(date)}</DATE>
            <EFFECTIVEDATE>${tallyDateYmd(date)}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${escapeXml(partyName)}</PARTYLEDGERNAME>
            <NARRATION>${escapeXml(narration || `ERP Credit Note ${voucherNumber}`)}</NARRATION>
            ${ledgerEntryXml(salesLedger, amt, 'Yes')}
            ${ledgerEntryXml(partyName, amt, 'No')}
          </VOUCHER>`;
    return wrapImportEnvelope(companyName, inner);
}

function parseTallyImportResponse(xmlResponse) {
    const raw = String(xmlResponse || '');
    if (!raw.trim()) {
        return { ok: false, error: 'Empty response from Tally' };
    }
    const lineErr = raw.match(/<LINEERROR>([^<]*)<\/LINEERROR>/i);
    if (lineErr && lineErr[1]) {
        return { ok: false, error: lineErr[1].trim() || 'Tally line error' };
    }
    const errMsg = raw.match(/<ERRMSG[^>]*>([^<]*)<\/ERRMSG>/i);
    if (errMsg && errMsg[1]) {
        return { ok: false, error: errMsg[1].trim() };
    }
    const created = raw.match(/<CREATED>(\d+)<\/CREATED>/i);
    const altered = raw.match(/<ALTERED>(\d+)<\/ALTERED>/i);
    const errors = raw.match(/<ERRORS>(\d+)<\/ERRORS>/i);
    if (errors && Number(errors[1]) > 0) {
        return { ok: false, error: 'Tally reported import errors' };
    }
    const c = created ? Number(created[1]) : 0;
    const a = altered ? Number(altered[1]) : 0;
    if (c > 0 || a > 0) {
        return { ok: true, created: c, altered: a };
    }
    if (/Unknown Request|Could not find/i.test(raw)) {
        return { ok: false, error: raw.slice(0, 200) };
    }
    if (/<RESPONSE>/i.test(raw)) {
        return { ok: false, error: 'Tally did not create voucher (check company name & ledgers)' };
    }
    return { ok: true, created: 0, altered: 0, note: 'unparsed' };
}

function postXmlToTally(tallyUrl, xml, timeoutMs = 45000) {
    const http = require('http');
    const https = require('https');
    const url = new URL(normalizeTallyUrl(tallyUrl));
    const isHttps = url.protocol === 'https:';
    const mod = isHttps ? https : http;
    const port = url.port ? parseInt(url.port, 10) : isHttps ? 443 : 9000;

    return new Promise((resolve, reject) => {
        const postData = String(xml || '');
        const req = mod.request(
            {
                hostname: url.hostname,
                port,
                path: url.pathname && url.pathname !== '/' ? url.pathname : '/',
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'Content-Length': Buffer.byteLength(postData),
                },
                timeout: timeoutMs,
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`Tally HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
                        return;
                    }
                    const parsed = parseTallyImportResponse(data);
                    if (!parsed.ok) {
                        reject(new Error(parsed.error || 'Tally import failed'));
                        return;
                    }
                    resolve({ statusCode: res.statusCode, data, parsed });
                });
            },
        );
        req.on('error', (e) => reject(new Error(`Cannot reach Tally at ${url.hostname}:${port} — ${e.message}`)));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Tally connection timed out'));
        });
        req.write(postData);
        req.end();
    });
}

module.exports = {
    escapeXml,
    normalizeTallyUrl,
    tallyDateYmd,
    buildSalesVoucherXml,
    buildReceiptVoucherXml,
    buildPaymentVoucherXml,
    buildPurchaseVoucherXml,
    buildCreditNoteVoucherXml,
    parseTallyImportResponse,
    postXmlToTally,
};

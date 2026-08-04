/**
 * GSTZen sandbox + production helpers for reseller ERP e-invoice / e-way.
 */

const GSTZEN_SANDBOX_TOKEN = 'de3a3a01-273a-4a81-8b75-13fe37f14dc6';
const GSTZEN_EINVOICE_URL_DEFAULT =
    'https://my.gstzen.in/~gstzen/a/post-einvoice-data/einvoice-json/';
const GSTZEN_EWAY_CREATE_URL_DEFAULT = 'https://my.gstzen.in/~gstzen/a/ewbapi/create/';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function gstStateCode(gstin) {
    return String(gstin || '').slice(0, 2);
}

function formatNicDate(input) {
    const dt = input ? new Date(input) : new Date();
    if (Number.isNaN(dt.getTime())) return formatNicDate(null);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function parseCompliance(row) {
    let c = row?.compliance_json;
    if (typeof c === 'string') {
        try {
            c = JSON.parse(c);
        } catch {
            c = null;
        }
    }
    return c && typeof c === 'object' ? c : {};
}

async function loadErpSettings(query, resellerUserId) {
    const rows = await query(
        `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    const settings = rows[0]?.settings;
    if (typeof settings === 'string') {
        try {
            return JSON.parse(settings);
        } catch {
            return {};
        }
    }
    return settings && typeof settings === 'object' ? settings : {};
}

function validateGstSettings(gst) {
    const errors = [];
    const gstin = String(gst?.gstin || '')
        .trim()
        .toUpperCase();
    const legalName = String(gst?.legalName || '').trim();
    if (!gstin) errors.push('Business GSTIN is required in GST settings.');
    else if (!GSTIN_RE.test(gstin)) errors.push('Business GSTIN format is invalid.');
    if (!legalName) errors.push('Legal name is required in GST settings.');
    return { ok: errors.length === 0, errors, gstin, legalName };
}

function resolveEinvoiceConfig(settings) {
    const einvoice = settings?.einvoice || {};
    const gst = settings?.gst || {};
    const useSandbox =
        einvoice.useSandbox === true ||
        einvoice.useSandbox === 'true' ||
        String(einvoice.useSandbox || '').toLowerCase() === 'yes' ||
        !String(einvoice.apiKey || '').trim();

    if (useSandbox) {
        return {
            sandbox: true,
            url: String(einvoice.apiUrl || '').trim() || GSTZEN_EINVOICE_URL_DEFAULT,
            token: String(einvoice.apiKey || '').trim() || GSTZEN_SANDBOX_TOKEN,
            gstin: String(gst.gstin || '')
                .trim()
                .toUpperCase() || '33AADCG4992P1Z0',
        };
    }

    return {
        sandbox: false,
        url: String(einvoice.apiUrl || '').trim() || GSTZEN_EINVOICE_URL_DEFAULT,
        token: String(einvoice.apiKey || '').trim(),
        gstin: String(gst.gstin || '')
            .trim()
            .toUpperCase(),
    };
}

function resolveEwayConfig(settings) {
    const eway = settings?.eway || {};
    const gst = settings?.gst || {};
    const einvoice = settings?.einvoice || {};
    const useSandbox =
        eway.useSandbox === true ||
        eway.useSandbox === 'true' ||
        einvoice.useSandbox === true ||
        einvoice.useSandbox === 'true' ||
        !String(eway.apiKey || einvoice.apiKey || '').trim();

    if (useSandbox) {
        return {
            sandbox: true,
            url: String(eway.apiUrl || '').trim() || GSTZEN_EWAY_CREATE_URL_DEFAULT,
            token: String(eway.apiKey || einvoice.apiKey || '').trim() || GSTZEN_SANDBOX_TOKEN,
            gstin: String(gst.gstin || '')
                .trim()
                .toUpperCase() || '33AADCG4992P1Z0',
            transporterGstin: String(eway.gstin || gst.gstin || '')
                .trim()
                .toUpperCase(),
        };
    }

    return {
        sandbox: false,
        url: String(eway.apiUrl || '').trim() || GSTZEN_EWAY_CREATE_URL_DEFAULT,
        token: String(eway.apiKey || einvoice.apiKey || '').trim(),
        gstin: String(gst.gstin || '')
            .trim()
            .toUpperCase(),
        transporterGstin: String(eway.gstin || '').trim().toUpperCase(),
    };
}

function buildEinvoicePayload(bill, gst, customer) {
    const gstin = String(gst.gstin || '')
        .trim()
        .toUpperCase();
    const stcd = gstStateCode(gstin);
    const lines = Array.isArray(bill.lines) ? bill.lines : [];
    let assVal = 0;
    let cgstVal = 0;
    let sgstVal = 0;

    const itemList = lines.map((line, i) => {
        const total = Number(line.lineTotalInr) || 0;
        const taxable = Math.round(total / 1.03);
        const gstAmt = total - taxable;
        const half = Math.round(gstAmt / 2);
        assVal += taxable;
        cgstVal += half;
        sgstVal += half;
        return {
            SlNo: String(i + 1),
            PrdDesc: String(line.name || 'Jewellery item').slice(0, 300),
            IsServc: 'N',
            HsnCd: '711319',
            Qty: Number(line.qty) || 1,
            Unit: 'PCS',
            UnitPrice: taxable,
            TotAmt: taxable,
            AssAmt: taxable,
            GstRt: 3,
            CgstAmt: half,
            SgstAmt: half,
            IgstAmt: 0,
            TotItemVal: total,
        };
    });

    const net = Number(bill.total_inr) || assVal + cgstVal + sgstVal;
    if (!itemList.length) {
        const taxable = Math.round(net / 1.03);
        const gstAmt = net - taxable;
        assVal = taxable;
        cgstVal = Math.round(gstAmt / 2);
        sgstVal = gstAmt - cgstVal;
        itemList.push({
            SlNo: '1',
            PrdDesc: 'Jewellery sale',
            IsServc: 'N',
            HsnCd: '711319',
            Qty: 1,
            Unit: 'PCS',
            UnitPrice: taxable,
            TotAmt: taxable,
            AssAmt: taxable,
            GstRt: 3,
            CgstAmt: cgstVal,
            SgstAmt: sgstVal,
            IgstAmt: 0,
            TotItemVal: net,
        });
    }

    const buyerGstin = String(customer?.gstin || 'URP').trim().toUpperCase();
    const buyerName = String(bill.customer_name || customer?.name || 'Walk-in customer').slice(0, 100);
    const place = String(gst.placeOfSupply || 'Tamil Nadu').slice(0, 100);

    return {
        Version: '1.1',
        TranDtls: {
            TaxSch: 'GST',
            SupTyp: buyerGstin.length === 15 ? 'B2B' : 'B2C',
            RegRev: 'N',
            IgstOnIntra: 'N',
        },
        DocDtls: {
            Typ: 'INV',
            No: String(bill.bill_number || bill.id).slice(0, 16),
            Dt: formatNicDate(bill.bill_date || bill.created_at),
        },
        SellerDtls: {
            Gstin: gstin,
            LglNm: String(gst.legalName || '').slice(0, 100),
            TrdNm: String(gst.legalName || '').slice(0, 100),
            Addr1: place.slice(0, 100) || 'Business address',
            Loc: place.slice(0, 50) || 'City',
            Pin: 600001,
            Stcd: stcd,
        },
        BuyerDtls: {
            Gstin: buyerGstin.length === 15 ? buyerGstin : 'URP',
            LglNm: buyerName,
            Pos: stcd,
            Addr1: String(customer?.address || place || 'Customer address').slice(0, 100),
            Loc: place.slice(0, 50) || 'City',
            Pin: 600001,
            Stcd: stcd,
        },
        ItemList: itemList,
        ValDtls: {
            AssVal: assVal,
            CgstVal: cgstVal,
            SgstVal: sgstVal,
            IgstVal: 0,
            TotInvVal: net,
        },
    };
}

function buildEwayPayload(bill, gst, compliance, customer) {
    const gstin = String(gst.gstin || '')
        .trim()
        .toUpperCase();
    const stcd = parseInt(gstStateCode(gstin), 10) || 33;
    const net = Number(bill.total_inr) || 0;
    const lines = Array.isArray(bill.lines) ? bill.lines : [];

    return {
        supplyType: 'O',
        subSupplyType: '1',
        subSupplyDesc: '',
        docType: 'INV',
        docNo: String(bill.bill_number || bill.id).slice(0, 16),
        docDate: formatNicDate(bill.bill_date || bill.created_at),
        fromGstin: gstin,
        fromTrdName: String(gst.legalName || '').slice(0, 100),
        fromAddr1: String(gst.placeOfSupply || 'Business address').slice(0, 120),
        fromPlace: String(gst.placeOfSupply || 'City').slice(0, 50),
        fromPincode: 600001,
        fromStateCode: stcd,
        toGstin: String(customer?.gstin || 'URP').slice(0, 15),
        toTrdName: String(bill.customer_name || customer?.name || 'Customer').slice(0, 100),
        toAddr1: String(customer?.address || gst.placeOfSupply || 'Customer address').slice(0, 120),
        toPlace: String(gst.placeOfSupply || 'City').slice(0, 50),
        toPincode: 600001,
        toStateCode: stcd,
        totalValue: net,
        cgstValue: Math.round((net - net / 1.03) / 2),
        sgstValue: Math.round((net - net / 1.03) / 2),
        igstValue: 0,
        totInvValue: net,
        transMode: '1',
        transDistance: 10,
        transDocNo: String(bill.bill_number || bill.id).slice(0, 16),
        transDocDate: formatNicDate(bill.bill_date || bill.created_at),
        vehicleNo: 'NA',
        vehicleType: 'R',
        itemList: lines.map((line, i) => ({
            itemNo: i + 1,
            productName: String(line.name || 'Jewellery').slice(0, 100),
            productDesc: String(line.name || 'Jewellery').slice(0, 100),
            hsnCode: 711319,
            quantity: Number(line.qty) || 1,
            qtyUnit: 'PCS',
            taxableAmount: Math.round((Number(line.lineTotalInr) || 0) / 1.03),
            sgstRate: 1.5,
            cgstRate: 1.5,
            igstRate: 0,
        })),
        irn: compliance?.einvoice?.irn || undefined,
    };
}

async function postGstzen(url, token, gstin, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Token: token,
            gstin: gstin,
        },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }
    if (!res.ok) {
        const msg =
            data?.message ||
            data?.error ||
            data?.ErrorMessage ||
            `GSTZen request failed (${res.status})`;
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.status = res.status;
        err.response = data;
        throw err;
    }
    return data;
}

async function updateBillCompliance(query, billId, resellerUserId, patch) {
    const rows = await query(
        `SELECT compliance_json FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2`,
        [billId, resellerUserId],
    );
    if (!rows.length) return null;
    const cur = parseCompliance(rows[0]);
    const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
    const updated = await query(
        `UPDATE reseller_erp_bills
         SET compliance_json = $1::jsonb, updated_at = NOW()
         WHERE id = $2 AND reseller_user_id = $3
         RETURNING *`,
        [JSON.stringify(next), billId, resellerUserId],
    );
    return updated[0];
}

async function generateEinvoiceForBill({ query, bill, resellerUserId, customer }) {
    const settings = await loadErpSettings(query, resellerUserId);
    const gstCheck = validateGstSettings(settings.gst || {});
    if (!gstCheck.ok) {
        const err = new Error(gstCheck.errors.join(' '));
        err.status = 400;
        throw err;
    }

    const cfg = resolveEinvoiceConfig(settings);
    if (!cfg.url || !cfg.token) {
        const err = new Error('E-invoice API URL and token are required in E-invoice settings.');
        err.status = 400;
        throw err;
    }

    if (cfg.gstin !== gstCheck.gstin) {
        const err = new Error('GSTIN mismatch between GST settings and e-invoice configuration.');
        err.status = 400;
        throw err;
    }

    const payload = buildEinvoicePayload(bill, settings.gst, customer);
    const response = await postGstzen(cfg.url, cfg.token, cfg.gstin, payload);

    const irn = response?.Irn || response?.irn || response?.data?.Irn || null;
    const ackNo = response?.AckNo || response?.ackNo || response?.data?.AckNo || null;
    const ackDt = response?.AckDt || response?.ackDt || response?.data?.AckDt || null;

    const compliancePatch = {
        einvoice: {
            status: irn ? 'generated' : 'submitted',
            sandbox: cfg.sandbox,
            irn,
            ack_no: ackNo,
            ack_date: ackDt,
            generated_at: new Date().toISOString(),
            response,
        },
    };

    const row = await updateBillCompliance(query, bill.id, resellerUserId, compliancePatch);
    return {
        bill: row,
        irn,
        ackNo,
        ackDt,
        sandbox: cfg.sandbox,
        response,
    };
}

async function generateEwayForBill({ query, bill, resellerUserId, customer }) {
    const settings = await loadErpSettings(query, resellerUserId);
    const gstCheck = validateGstSettings(settings.gst || {});
    if (!gstCheck.ok) {
        const err = new Error(gstCheck.errors.join(' '));
        err.status = 400;
        throw err;
    }

    const cfg = resolveEwayConfig(settings);
    if (!cfg.url || !cfg.token) {
        const err = new Error('E-way bill API URL and token are required in E-way settings.');
        err.status = 400;
        throw err;
    }

    const compliance = parseCompliance(bill);
    const payload = buildEwayPayload(bill, settings.gst, compliance, customer);
    const response = await postGstzen(cfg.url, cfg.token, cfg.gstin, payload);

    const ewbNo =
        response?.ewayBillNo ||
        response?.EwbNo ||
        response?.ewbNo ||
        response?.data?.ewayBillNo ||
        null;

    const compliancePatch = {
        eway: {
            status: ewbNo ? 'generated' : 'submitted',
            sandbox: cfg.sandbox,
            ewb_no: ewbNo,
            generated_at: new Date().toISOString(),
            pdf_url: response?.EWayBillPdfUrl || response?.EWayBillPDFURL || null,
            response,
        },
    };

    const row = await updateBillCompliance(query, bill.id, resellerUserId, compliancePatch);
    return {
        bill: row,
        ewbNo,
        sandbox: cfg.sandbox,
        response,
    };
}

module.exports = {
    GSTZEN_SANDBOX_TOKEN,
    GSTZEN_EINVOICE_URL_DEFAULT,
    GSTZEN_EWAY_CREATE_URL_DEFAULT,
    loadErpSettings,
    validateGstSettings,
    resolveEinvoiceConfig,
    resolveEwayConfig,
    parseCompliance,
    buildEinvoicePayload,
    generateEinvoiceForBill,
    generateEwayForBill,
};

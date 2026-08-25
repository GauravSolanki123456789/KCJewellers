/**
 * Shadow-mode billing ledger (Hitesh / Jainav lanes) — separate from public GST bills.
 */

const { DEFAULT_SHADOW_SEQUENCE, getSessionOperator, requireErpOperatorAdmin } = require('./resellerErpOperators');
const { markPiecesSold, markPiecesShadowLane, findSoldBarcodeConflicts } = require('./resellerErpStockPieces');

async function ensureShadowSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_shadow_bills (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            bill_number VARCHAR(64) NOT NULL,
            lane VARCHAR(16) NOT NULL,
            bill_type VARCHAR(32) NOT NULL DEFAULT 'sale',
            customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
            customer_name VARCHAR(255),
            customer_gstin VARCHAR(20),
            payment_method VARCHAR(32),
            total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'completed',
            lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            session_json JSONB DEFAULT NULL,
            notes TEXT,
            bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_by_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_shadow_bills_reseller
            ON reseller_erp_shadow_bills (reseller_user_id, lane, bill_date DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_shadow_bills_number
            ON reseller_erp_shadow_bills (reseller_user_id, bill_number);
    `);
}

function trimStr(v, max = 255) {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s.slice(0, max) : null;
}

function parseDateOrNull(v) {
    if (!v) return null;
    const s = String(v).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function mapShadowBill(row) {
    if (!row) return null;
    let lines = row.lines_json;
    if (typeof lines === 'string') {
        try { lines = JSON.parse(lines); } catch { lines = []; }
    }
    let session = row.session_json;
    if (typeof session === 'string') {
        try { session = JSON.parse(session); } catch { session = null; }
    }
    return {
        id: row.id,
        bill_number: row.bill_number,
        lane: row.lane,
        bill_type: row.bill_type,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_gstin: row.customer_gstin,
        payment_method: row.payment_method,
        total_inr: Number(row.total_inr) || 0,
        status: row.status,
        lines,
        session,
        notes: row.notes,
        bill_date: row.bill_date,
        created_at: row.created_at,
    };
}

function hasValidGstin(gst) {
    const s = String(gst || '').trim().toUpperCase();
    return /^[0-9]{2}[A-Z0-9]{13}$/.test(s);
}

function inferPaymentMethodFromSession(session, fallback) {
    const explicit = session?.paymentMethod || session?.payment_method || fallback;
    if (explicit) return String(explicit).trim().toLowerCase();
    const cash = Number(session?.cashAmountInr);
    const online = Number(session?.onlineAmountInr);
    if (Number.isFinite(cash) && Number.isFinite(online) && cash > 0 && online > 0) return 'mixed';
    if (Number.isFinite(online) && online > 0) return 'upi';
    return 'cash';
}

function classifyLane({ customerGstin, paymentMethod, laneOverride, session }) {
    const lane = String(laneOverride || '').trim().toLowerCase();
    if (lane === 'hitesh' || lane === 'jainav') return lane;
    const pay = String(paymentMethod || 'cash').trim().toLowerCase();
    if (pay === 'mixed') {
        const online = Number(session?.onlineAmountInr) || 0;
        return online > 0 ? 'hitesh' : 'jainav';
    }
    const online = ['upi', 'card', 'online', 'bank', 'neft', 'rtgs', 'cheque', 'gpay', 'phonepe', 'paytm'].includes(pay);
    if (online) return 'hitesh';
    return 'jainav';
}

async function createShadowBillFromBillingPayload(query, resellerUserId, body, operatorId) {
    const linesRaw = Array.isArray(body.lines) ? body.lines.slice(0, 200) : [];
    let total = Number(body.total_inr);
    if (!Number.isFinite(total)) {
        total = linesRaw.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0);
    }
    const sessionObj = body.session && typeof body.session === 'object' ? body.session : {};
    const customerGstin = trimStr(sessionObj.customerGst || body.customer_gstin, 20);
    const paymentMethod = inferPaymentMethodFromSession(sessionObj, body.payment_method);
    const lane = classifyLane({
        customerGstin,
        paymentMethod,
        laneOverride: body.lane,
        session: sessionObj,
    });
    const statusRaw = trimStr(body.status, 32) || 'completed';
    const status = statusRaw.toLowerCase();
    const barcodes = linesRaw.map((l) => (l.barcode || l.code || '').trim()).filter(Boolean);
    const conflicts = await findSoldBarcodeConflicts(query, resellerUserId, barcodes);
    if (conflicts.length) {
        const err = new Error('One or more items are already sold');
        err.status = 409;
        err.conflicts = conflicts;
        throw err;
    }
    const billNumber = await nextShadowBillNumber(query, resellerUserId, lane);
    const sessionJson = JSON.stringify(sessionObj);
    const rows = await query(
        `INSERT INTO reseller_erp_shadow_bills (
            reseller_user_id, bill_number, lane, bill_type, customer_id, customer_name,
            customer_gstin, payment_method, total_inr, status, lines_json, session_json,
            notes, bill_date, created_by_operator_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15)
         RETURNING *`,
        [
            resellerUserId,
            billNumber,
            lane,
            trimStr(body.bill_type, 32) || 'sale',
            body.customer_id != null ? parseInt(String(body.customer_id), 10) || null : null,
            trimStr(body.customer_name, 255),
            customerGstin,
            paymentMethod,
            Math.round(total * 100) / 100,
            trimStr(body.status, 32) || 'completed',
            JSON.stringify(linesRaw),
            sessionJson,
            trimStr(body.notes, 2000),
            parseDateOrNull(body.bill_date) || new Date().toISOString().slice(0, 10),
            operatorId || null,
        ],
    );
    const bill = mapShadowBill(rows[0]);
    if (['completed', 'paid', 'final'].includes(status)) {
        await markPiecesShadowLane(query, resellerUserId, linesRaw);
    }
    return { bill, lane };
}

async function markEstimateBilledViaLedger(query, resellerUserId, sourceEstimateId) {
    const sourceId = parseInt(String(sourceEstimateId), 10);
    if (!Number.isFinite(sourceId) || sourceId <= 0) return;
    await query(
        `DELETE FROM reseller_erp_bills
         WHERE id = $1 AND reseller_user_id = $2 AND bill_type = 'estimate'`,
        [sourceId, resellerUserId],
    );
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

function mapOfficialGstSaleToHiteshRow(row) {
    const session = parseSessionJson(row.session_json);
    let lines = row.lines_json;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    return {
        id: `gst-${row.id}`,
        bill_number: row.bill_number,
        lane: 'hitesh',
        bill_type: 'sale',
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_gstin: trimStr(session.customerGst, 20),
        payment_method: 'gst',
        total_inr: Number(row.total_inr) || 0,
        status: row.status,
        lines: Array.isArray(lines) ? lines : [],
        session,
        notes: row.notes,
        bill_date: row.bill_date,
        created_at: row.created_at,
        source: 'official_gst',
    };
}

async function loadOfficialGstSalesAsHitesh(query, resellerUserId, from, to) {
    const rows = await query(
        `SELECT id, bill_number, bill_type, customer_id, customer_name, total_inr, status,
                lines_json, session_json, notes, bill_date, created_at
         FROM reseller_erp_bills
         WHERE reseller_user_id = $1
           AND bill_type = 'sale'
           AND LOWER(status) IN ('completed', 'paid', 'final')
           AND bill_date >= $2
           AND bill_date <= $3
         ORDER BY bill_date, id`,
        [resellerUserId, from, to || from],
    );
    return rows
        .filter((row) => hasValidGstin(parseSessionJson(row.session_json).customerGst))
        .map(mapOfficialGstSaleToHiteshRow);
}

async function loadUnifiedLaneBills(query, resellerUserId, { lane, from, to }) {
    const dateFrom = from || new Date().toISOString().slice(0, 10);
    const dateTo = to || dateFrom;
    const params = [resellerUserId, dateFrom, dateTo];
    let sql = `SELECT * FROM reseller_erp_shadow_bills
               WHERE reseller_user_id = $1 AND bill_date >= $2 AND bill_date <= $3`;
    if (lane === 'hitesh' || lane === 'jainav') {
        params.push(lane);
        sql += ` AND lane = $${params.length}`;
    }
    sql += ' ORDER BY bill_date, id';
    const shadowRows = await query(sql, params);
    const shadowBills = shadowRows.map(mapShadowBill);
    if (lane === 'jainav') return shadowBills;
    const gstBills = await loadOfficialGstSalesAsHitesh(query, resellerUserId, dateFrom, dateTo);
    if (lane === 'hitesh') return [...gstBills, ...shadowBills.filter((b) => b.lane === 'hitesh')];
    return [...gstBills, ...shadowBills];
}

async function loadUnifiedLaneSummary(query, resellerUserId, from) {
    const dateFrom = from || new Date().toISOString().slice(0, 10);
    const rows = await query(
        `SELECT lane, COUNT(*)::int AS count, COALESCE(SUM(total_inr),0)::float AS total
         FROM reseller_erp_shadow_bills
         WHERE reseller_user_id = $1 AND bill_date = $2
         GROUP BY lane`,
        [resellerUserId, dateFrom],
    );
    const summary = { hitesh: { count: 0, total: 0 }, jainav: { count: 0, total: 0 } };
    for (const r of rows) {
        if (r.lane === 'hitesh' || r.lane === 'jainav') {
            summary[r.lane] = { count: r.count, total: r.total };
        }
    }
    const gstBills = await loadOfficialGstSalesAsHitesh(query, resellerUserId, dateFrom, dateFrom);
    for (const b of gstBills) {
        summary.hitesh.count += 1;
        summary.hitesh.total += b.total_inr || 0;
    }
    return summary;
}

async function purgeLedgerLinkedEstimates(query, resellerUserId, from, to) {
    const params = [resellerUserId, from];
    let sql = `DELETE FROM reseller_erp_bills
               WHERE reseller_user_id = $1
                 AND bill_type = 'estimate'
                 AND (
                   COALESCE(session_json->>'billedViaLedger', '') = 'true'
                   OR (
                     LOWER(status) = 'billed'
                     AND session_json->>'billedSaleBillNumber' IS NULL
                     AND session_json->>'billedSaleBillId' IS NULL
                   )
                 )
                 AND bill_date >= $2`;
    if (to) {
        params.push(to);
        sql += ` AND bill_date <= $${params.length}`;
    }
    sql += ' RETURNING id';
    return query(sql, params);
}

async function loadShadowSettings(query, resellerUserId) {
    const rows = await query(
        `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    let settings = rows[0]?.settings ?? {};
    if (typeof settings === 'string') {
        try { settings = JSON.parse(settings); } catch { settings = {}; }
    }
    const shadow = settings.shadow && typeof settings.shadow === 'object' ? settings.shadow : {};
    return {
        secretSequence: String(shadow.secretSequence || DEFAULT_SHADOW_SEQUENCE),
        companies: {
            hitesh: { label: shadow?.companies?.hitesh?.label || 'Hitesh', note: shadow?.companies?.hitesh?.note || 'GST & online payments' },
            jainav: { label: shadow?.companies?.jainav?.label || 'Jainav', note: shadow?.companies?.jainav?.note || 'Cash / no GST' },
        },
    };
}

async function nextShadowBillNumber(query, resellerUserId, lane) {
    const prefix = lane === 'hitesh' ? 'SH-H' : 'SH-J';
    const rows = await query(
        `SELECT bill_number FROM reseller_erp_shadow_bills
         WHERE reseller_user_id = $1 AND bill_number LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [resellerUserId, `${prefix}-%`],
    );
    let seq = 1;
    if (rows.length) {
        const m = String(rows[0].bill_number).match(/(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}-${String(seq).padStart(5, '0')}`;
}

function requireShadowUnlocked() {
    return (req, res, next) => {
        const op = getSessionOperator(req);
        if (!op || op.role !== 'admin' || !op.shadowAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!req.session?.shadowUnlocked) {
            return res.status(403).json({ error: 'Locked', code: 'INTERNAL_LOCKED' });
        }
        req.erpOperator = op;
        next();
    };
}

function csvEscape(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function billsToCsv(bills) {
    const headers = [
        'bill_number', 'lane', 'bill_date', 'customer_name', 'customer_gstin',
        'payment_method', 'total_inr', 'status', 'lines_count', 'notes',
    ];
    const rows = bills.map((b) => [
        b.bill_number,
        b.lane,
        b.bill_date,
        b.customer_name || '',
        b.customer_gstin || '',
        b.payment_method || '',
        b.total_inr,
        b.status,
        Array.isArray(b.lines) ? b.lines.length : 0,
        b.notes || '',
    ]);
    return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

const WEIGHT_RANGE_BUCKETS = [
    { label: '0–50 g', min: 0, max: 50 },
    { label: '50–100 g', min: 50, max: 100 },
    { label: '100–200 g', min: 100, max: 200 },
    { label: '200–500 g', min: 200, max: 500 },
    { label: '500 g+', min: 500, max: Infinity },
];

function mapStockPieceRow(row) {
    const w = Number(row.avg_weight) || 0;
    return {
        id: row.id,
        barcode: row.barcode,
        sku: row.sku || '',
        style_code: row.style_code || '',
        product_name: row.product_name || '',
        size: row.size || '',
        avg_weight: w,
        gross_weight: row.gross_weight != null ? Number(row.gross_weight) : null,
        purity: row.purity != null ? Number(row.purity) : null,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_type: row.mc_type || '',
        pcs: row.pcs != null ? Number(row.pcs) : 1,
        metal_type: row.metal_type || '',
        item_code: row.item_code || '',
        status: row.status,
        floor_id: row.floor_id || null,
        box_id: row.box_id || null,
        rfid_tag: row.rfid_tag || '',
    };
}

async function loadStockPiecesForReport(query, resellerUserId, { styleCode, skus, status }) {
    const params = [resellerUserId];
    let sql = `SELECT id, barcode, sku, style_code, product_name, size, avg_weight, gross_weight,
                      purity, wastage_pct, mc_rate, mc_type, pcs, metal_type, item_code, status,
                      floor_id, box_id, rfid_tag
               FROM reseller_erp_stock_pieces
               WHERE reseller_user_id = $1`;
    const st = String(status || 'in_stock').trim().toLowerCase();
    if (st && st !== 'all') {
        if (st === 'in_stock' || st === 'available') {
            sql += ` AND status = 'in_stock'`;
        } else {
            params.push(st);
            sql += ` AND LOWER(status) = $${params.length}`;
        }
    }
    if (styleCode) {
        params.push(styleCode);
        sql += ` AND UPPER(TRIM(style_code)) = UPPER(TRIM($${params.length}))`;
    }
    const skuList = Array.isArray(skus)
        ? skus.map((s) => String(s || '').trim()).filter(Boolean)
        : String(skus || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
    if (skuList.length) {
        params.push(skuList.map((s) => s.toUpperCase()));
        sql += ` AND UPPER(TRIM(sku)) = ANY($${params.length})`;
    }
    sql += ` ORDER BY style_code NULLS LAST, sku NULLS LAST, barcode ASC`;
    const rows = await query(sql, params);
    return rows.map(mapStockPieceRow);
}

async function countLaneReservedForReport(query, resellerUserId, { styleCode, skus }) {
    const params = [resellerUserId];
    let sql = `SELECT COUNT(*)::int AS count,
                      COALESCE(SUM(COALESCE(avg_weight, 0)), 0)::float AS total_weight
               FROM reseller_erp_stock_pieces
               WHERE reseller_user_id = $1 AND status = 'lane'`;
    if (styleCode) {
        params.push(styleCode);
        sql += ` AND UPPER(TRIM(style_code)) = UPPER(TRIM($${params.length}))`;
    }
    const skuList = Array.isArray(skus)
        ? skus.map((s) => String(s || '').trim()).filter(Boolean)
        : String(skus || '')
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
    if (skuList.length) {
        params.push(skuList.map((s) => s.toUpperCase()));
        sql += ` AND UPPER(TRIM(sku)) = ANY($${params.length})`;
    }
    const rows = await query(sql, params);
    const count = rows[0]?.count ?? 0;
    const totalWeight = Number(rows[0]?.total_weight) || 0;
    return {
        count,
        total_weight_g: Math.round(totalWeight * 1000) / 1000,
    };
}

function buildStockSummary(pieces) {
    const weights = pieces.map((p) => p.avg_weight || 0).filter((w) => w > 0);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    const totalPcs = pieces.reduce((s, p) => s + (p.pcs || 1), 0);
    const byStyle = {};
    const bySku = {};
    for (const p of pieces) {
        const style = p.style_code || '(no style)';
        const sku = p.sku || '(no sku)';
        if (!byStyle[style]) byStyle[style] = { style_code: style, count: 0, total_weight: 0, skus: new Set() };
        byStyle[style].count += 1;
        byStyle[style].total_weight += p.avg_weight || 0;
        byStyle[style].skus.add(sku);
        const skuKey = `${style}::${sku}`;
        if (!bySku[skuKey]) bySku[skuKey] = { style_code: style, sku, count: 0, total_weight: 0 };
        bySku[skuKey].count += 1;
        bySku[skuKey].total_weight += p.avg_weight || 0;
    }
    const weightRanges = WEIGHT_RANGE_BUCKETS.map((b) => ({
        label: b.label,
        count: pieces.filter((p) => {
            const w = p.avg_weight || 0;
            return w >= b.min && (b.max === Infinity ? true : w < b.max);
        }).length,
    }));
    return {
        total_pieces: pieces.length,
        total_pcs: totalPcs,
        total_weight_g: Math.round(totalWeight * 1000) / 1000,
        average_weight_g: pieces.length ? Math.round((totalWeight / pieces.length) * 1000) / 1000 : 0,
        min_weight_g: weights.length ? Math.min(...weights) : 0,
        max_weight_g: weights.length ? Math.max(...weights) : 0,
        weight_ranges: weightRanges,
        by_style: Object.values(byStyle).map((s) => ({
            style_code: s.style_code,
            count: s.count,
            total_weight_g: Math.round(s.total_weight * 1000) / 1000,
            avg_weight_g: s.count ? Math.round((s.total_weight / s.count) * 1000) / 1000 : 0,
            sku_count: s.skus.size,
        })).sort((a, b) => a.style_code.localeCompare(b.style_code)),
        by_sku: Object.values(bySku).map((s) => ({
            style_code: s.style_code,
            sku: s.sku,
            count: s.count,
            total_weight_g: Math.round(s.total_weight * 1000) / 1000,
            avg_weight_g: s.count ? Math.round((s.total_weight / s.count) * 1000) / 1000 : 0,
        })).sort((a, b) => `${a.style_code}/${a.sku}`.localeCompare(`${b.style_code}/${b.sku}`)),
    };
}

function stockReportHtml({ reportType, summary, pieces, filters, generatedAt }) {
    const title = reportType === 'summary' ? 'Stock Summary Report' : 'Stock Detailed Report';
    const filterLine = [
        filters.styleCode ? `Style: ${filters.styleCode}` : null,
        filters.skus?.length ? `SKU: ${filters.skus.join(', ')}` : null,
        `Status: ${filters.status || 'in_stock'}`,
    ].filter(Boolean).join(' · ');
    let body = '';
    if (reportType === 'summary' && summary) {
        body += `<h2>Totals</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px">
<tr><td>Pieces</td><td>${summary.total_pieces}</td></tr>
<tr><td>Total weight (g)</td><td>${summary.total_weight_g}</td></tr>
<tr><td>Average weight (g)</td><td>${summary.average_weight_g}</td></tr>
<tr><td>Min / Max (g)</td><td>${summary.min_weight_g} / ${summary.max_weight_g}</td></tr>
</table>`;
        body += `<h2>Weight ranges</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px"><tr><th>Range</th><th>Count</th></tr>`;
        for (const r of summary.weight_ranges) {
            body += `<tr><td>${r.label}</td><td>${r.count}</td></tr>`;
        }
        body += '</table>';
        body += `<h2>By style</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px"><tr><th>Style</th><th>Count</th><th>Total g</th><th>Avg g</th><th>SKUs</th></tr>`;
        for (const s of summary.by_style) {
            body += `<tr><td>${s.style_code}</td><td>${s.count}</td><td>${s.total_weight_g}</td><td>${s.avg_weight_g}</td><td>${s.sku_count}</td></tr>`;
        }
        body += '</table>';
        body += `<h2>By SKU</h2><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:11px"><tr><th>Style</th><th>SKU</th><th>Count</th><th>Total g</th><th>Avg g</th></tr>`;
        for (const s of summary.by_sku) {
            body += `<tr><td>${s.style_code}</td><td>${s.sku}</td><td>${s.count}</td><td>${s.total_weight_g}</td><td>${s.avg_weight_g}</td></tr>`;
        }
        body += '</table>';
    } else {
        body += `<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:10px"><tr>
<th>Barcode</th><th>Style</th><th>SKU</th><th>Product</th><th>Size</th><th>Wt(g)</th><th>Purity</th><th>MC</th><th>Status</th></tr>`;
        for (const p of pieces) {
            body += `<tr><td>${p.barcode}</td><td>${p.style_code}</td><td>${p.sku}</td><td>${p.product_name}</td><td>${p.size}</td><td>${p.avg_weight}</td><td>${p.purity ?? ''}</td><td>${p.mc_rate ?? ''}</td><td>${p.status}</td></tr>`;
        }
        body += '</table>';
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a1814}h1{font-size:18px}h2{font-size:14px;margin-top:20px}table{margin-top:8px}</style></head>
<body><h1>${title}</h1><p style="font-size:12px;color:#666">${filterLine}<br>Generated: ${generatedAt}</p>${body}</body></html>`;
}

function stockDetailCsv(pieces) {
    const headers = ['barcode', 'style_code', 'sku', 'product_name', 'size', 'avg_weight_g', 'gross_weight_g', 'purity', 'wastage_pct', 'mc_rate', 'mc_type', 'pcs', 'metal_type', 'item_code', 'status', 'rfid_tag'];
    const rows = pieces.map((p) => headers.map((h) => {
        if (h === 'avg_weight_g') return p.avg_weight;
        if (h === 'gross_weight_g') return p.gross_weight ?? '';
        return p[h] ?? '';
    }));
    return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

function stockSummaryCsv(summary, meta = {}) {
    const lines = [];
    const push = (row) => lines.push(row.map(csvEscape).join(','));
    const blank = () => lines.push('');

    push(['Stock Summary Report']);
    if (meta.generatedAt) push(['Generated', String(meta.generatedAt).slice(0, 10)]);
    if (meta.filters) {
        if (meta.filters.styleCode) push(['Style', meta.filters.styleCode]);
        if (meta.filters.skus?.length) push(['SKUs', meta.filters.skus.join('; ')]);
        if (meta.filters.status) push(['Status', meta.filters.status]);
    }
    blank();

    push(['By SKU']);
    push(['Style', 'SKU', 'Count', 'Total weight (g)', 'Average weight (g)']);
    for (const s of summary.by_sku) {
        push([s.style_code, s.sku, s.count, s.total_weight_g, s.avg_weight_g]);
    }
    blank();

    push(['By style']);
    push(['Style', 'Count', 'Total weight (g)', 'Average weight (g)', 'SKU count']);
    for (const s of summary.by_style) {
        push([s.style_code, s.count, s.total_weight_g, s.avg_weight_g, s.sku_count]);
    }
    blank();

    push(['Weight ranges']);
    push(['Range', 'Count']);
    for (const r of summary.weight_ranges) {
        push([r.label, r.count]);
    }
    blank();

    push(['Overview']);
    push(['Metric', 'Value']);
    push(['Available pcs (in stock)', summary.total_pieces]);
    if (summary.lane_reserved_count != null) {
        push(['Lane reserved (Jainav, not in available count)', summary.lane_reserved_count]);
        push(['Lane reserved weight (g)', summary.lane_reserved_weight_g ?? 0]);
    }
    push(['Total weight (g)', summary.total_weight_g]);
    push(['Average weight (g)', summary.average_weight_g]);
    push(['Min weight (g)', summary.min_weight_g]);
    push(['Max weight (g)', summary.max_weight_g]);

    return lines.join('\r\n');
}

function shouldRouteSaleToShadowLedger(sessionObj) {
    if (!sessionObj || typeof sessionObj !== 'object') return true;
    if (!hasValidGstin(sessionObj.customerGst)) return true;
    const paymentMethod = inferPaymentMethodFromSession(sessionObj);
    const pay = String(paymentMethod || 'cash').trim().toLowerCase();
    if (pay === 'cash') return true;
    if (pay === 'mixed') {
        const online = Number(sessionObj.onlineAmountInr) || 0;
        return online <= 0;
    }
    return false;
}

function registerShadowRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;
    const shadowGate = requireShadowUnlocked();

    ensureShadowSchema(pool).catch((e) => console.warn('erp shadow schema:', e.message));

    app.post('/api/reseller/erp/shadow/unlock', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const op = getSessionOperator(req);
            if (!op || op.role !== 'admin' || !op.shadowAccess) {
                return res.status(403).json({ error: 'Access denied' });
            }
            const sequence = String(req.body.sequence || '').trim();
            const settings = await loadShadowSettings(query, req.user.id);
            if (sequence !== settings.secretSequence) {
                return res.status(403).json({ error: 'Invalid sequence' });
            }
            req.session.shadowUnlocked = true;
            res.json({ success: true, shadowUnlocked: true, companies: settings.companies });
        } catch (e) {
            console.error('shadow unlock:', e);
            res.status(500).json({ error: e.message || 'Unlock failed' });
        }
    });

    app.post('/api/reseller/erp/shadow/lock', checkAuth, erpGate, async (req, res) => {
        req.session.shadowUnlocked = false;
        res.json({ success: true });
    });

    app.get('/api/reseller/erp/shadow/settings', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const settings = await loadShadowSettings(query, req.user.id);
            res.json({ settings: { companies: settings.companies, secretSequenceSet: !!settings.secretSequence } });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load shadow settings' });
        }
    });

    app.put('/api/reseller/erp/shadow/settings', checkAuth, erpGate, shadowGate, requireJson, async (req, res) => {
        try {
            const newSeq = req.body.secretSequence != null ? String(req.body.secretSequence).trim() : null;
            if (newSeq != null && newSeq.length < 3) {
                return res.status(400).json({ error: 'Secret sequence must be at least 3 characters' });
            }
            const rows = await query(
                `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
                [req.user.id],
            );
            let settings = rows[0]?.settings ?? {};
            if (typeof settings === 'string') {
                try { settings = JSON.parse(settings); } catch { settings = {}; }
            }
            if (!settings.shadow || typeof settings.shadow !== 'object') settings.shadow = {};
            if (newSeq != null) settings.shadow.secretSequence = newSeq;
            if (req.body.companies && typeof req.body.companies === 'object') {
                settings.shadow.companies = {
                    ...settings.shadow.companies,
                    ...req.body.companies,
                };
            }
            await query(
                `INSERT INTO reseller_erp_settings (reseller_user_id, settings, updated_at)
                 VALUES ($1, $2::jsonb, NOW())
                 ON CONFLICT (reseller_user_id) DO UPDATE SET settings = $2::jsonb, updated_at = NOW()`,
                [req.user.id, JSON.stringify(settings)],
            );
            res.json({ success: true });
        } catch (e) {
            console.error('shadow settings update:', e);
            res.status(500).json({ error: e.message || 'Failed to save shadow settings' });
        }
    });

    app.get('/api/reseller/erp/shadow/bills', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const lane = String(req.query.lane || '').trim().toLowerCase();
            const from = parseDateOrNull(req.query.from);
            const to = parseDateOrNull(req.query.to);
            const bills = await loadUnifiedLaneBills(query, req.user.id, {
                lane: lane === 'hitesh' || lane === 'jainav' ? lane : '',
                from: from || new Date().toISOString().slice(0, 10),
                to: to || from || new Date().toISOString().slice(0, 10),
            });
            res.json({ bills: bills.slice(0, 500) });
        } catch (e) {
            console.error('shadow bills list:', e);
            res.status(500).json({ error: e.message || 'Failed to list shadow bills' });
        }
    });

    app.post('/api/reseller/erp/shadow/bills', checkAuth, erpGate, shadowGate, requireJson, async (req, res) => {
        try {
            const linesRaw = Array.isArray(req.body.lines) ? req.body.lines.slice(0, 200) : [];
            let total = Number(req.body.total_inr);
            if (!Number.isFinite(total)) {
                total = linesRaw.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0);
            }
            const sessionObj =
                req.body.session && typeof req.body.session === 'object' ? req.body.session : {};
            const customerGstin = trimStr(req.body.customer_gstin || req.body.customerGstin || sessionObj.customerGst, 20);
            const paymentMethod = inferPaymentMethodFromSession(
                sessionObj,
                trimStr(req.body.payment_method || req.body.paymentMethod, 32),
            );
            const lane = classifyLane({
                customerGstin,
                paymentMethod,
                laneOverride: req.body.lane,
                session: sessionObj,
            });
            const barcodes = linesRaw.map((l) => (l.barcode || l.code || '').trim()).filter(Boolean);
            const conflicts = await findSoldBarcodeConflicts(query, req.user.id, barcodes);
            if (conflicts.length) {
                return res.status(409).json({ error: 'One or more items are already sold', conflicts });
            }
            const billNumber = await nextShadowBillNumber(query, req.user.id, lane);
            const op = getSessionOperator(req);
            const sessionJson = req.body.session && typeof req.body.session === 'object'
                ? JSON.stringify(req.body.session)
                : null;

            const rows = await query(
                `INSERT INTO reseller_erp_shadow_bills (
                    reseller_user_id, bill_number, lane, bill_type, customer_id, customer_name,
                    customer_gstin, payment_method, total_inr, status, lines_json, session_json,
                    notes, bill_date, created_by_operator_id
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15)
                 RETURNING *`,
                [
                    req.user.id,
                    billNumber,
                    lane,
                    trimStr(req.body.bill_type, 32) || 'sale',
                    req.body.customer_id != null ? parseInt(String(req.body.customer_id), 10) || null : null,
                    trimStr(req.body.customer_name, 255),
                    customerGstin,
                    paymentMethod,
                    Math.round(total * 100) / 100,
                    trimStr(req.body.status, 32) || 'completed',
                    JSON.stringify(linesRaw),
                    sessionJson,
                    trimStr(req.body.notes, 2000),
                    parseDateOrNull(req.body.bill_date) || new Date().toISOString().slice(0, 10),
                    op?.id || null,
                ],
            );
            const bill = mapShadowBill(rows[0]);
            await markPiecesShadowLane(query, req.user.id, linesRaw);
            res.json({ success: true, bill });
        } catch (e) {
            console.error('shadow bill create:', e);
            res.status(500).json({ error: e.message || 'Failed to create shadow bill' });
        }
    });

    app.get('/api/reseller/erp/shadow/export', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const lane = String(req.query.lane || 'both').trim().toLowerCase();
            const from = parseDateOrNull(req.query.from) || new Date().toISOString().slice(0, 10);
            const to = parseDateOrNull(req.query.to) || from;
            const bills = await loadUnifiedLaneBills(query, req.user.id, {
                lane: lane === 'hitesh' || lane === 'jainav' ? lane : '',
                from,
                to,
            });
            const csv = billsToCsv(bills);
            const filename = `ledger-${lane}-${from}${to !== from ? `_to_${to}` : ''}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send('\ufeff' + csv);
        } catch (e) {
            console.error('shadow export:', e);
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });

    app.get('/api/reseller/erp/shadow/export-detail', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const lane = String(req.query.lane || 'both').trim().toLowerCase();
            const from = parseDateOrNull(req.query.from) || new Date().toISOString().slice(0, 10);
            const to = parseDateOrNull(req.query.to) || from;
            const bills = await loadUnifiedLaneBills(query, req.user.id, {
                lane: lane === 'hitesh' || lane === 'jainav' ? lane : '',
                from,
                to,
            });
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="ledger-detail-${lane}-${from}.json"`);
            res.json({
                exported_at: new Date().toISOString(),
                lane,
                from,
                to,
                count: bills.length,
                total_inr: bills.reduce((s, b) => s + (b.total_inr || 0), 0),
                bills,
            });
        } catch (e) {
            console.error('shadow export detail:', e);
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });

    app.post('/api/reseller/erp/shadow/purge', checkAuth, erpGate, shadowGate, requireJson, async (req, res) => {
        try {
            const lane = String(req.body.lane || 'jainav').trim().toLowerCase();
            if (lane !== 'jainav' && lane !== 'hitesh') {
                return res.status(400).json({ error: 'lane must be hitesh or jainav' });
            }
            const confirm = String(req.body.confirm || '').trim().toUpperCase();
            if (confirm !== 'PURGE') {
                return res.status(400).json({ error: 'Type PURGE to confirm permanent deletion' });
            }
            const from = parseDateOrNull(req.body.from);
            const to = parseDateOrNull(req.body.to) || from;
            if (!from) return res.status(400).json({ error: 'from date required' });

            const params = [req.user.id, lane, from];
            let sql = `DELETE FROM reseller_erp_shadow_bills
                       WHERE reseller_user_id = $1 AND lane = $2 AND bill_date >= $3`;
            if (to) {
                params.push(to);
                sql += ` AND bill_date <= $${params.length}`;
            }
            sql += ' RETURNING id';
            const deleted = await query(sql, params);
            let estimatesDeleted = 0;
            if (lane === 'jainav') {
                const estDeleted = await purgeLedgerLinkedEstimates(query, req.user.id, from, to);
                estimatesDeleted = estDeleted.length;
            }
            res.json({ success: true, deletedCount: deleted.length, estimatesDeleted });
        } catch (e) {
            console.error('shadow purge:', e);
            res.status(500).json({ error: e.message || 'Purge failed' });
        }
    });

    app.get('/api/reseller/erp/shadow/summary', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const from = parseDateOrNull(req.query.from) || new Date().toISOString().slice(0, 10);
            const summary = await loadUnifiedLaneSummary(query, req.user.id, from);
            res.json({ date: from, summary });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Summary failed' });
        }
    });

    app.get('/api/reseller/erp/shadow/stock-report', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const reportType = String(req.query.type || 'detail').trim().toLowerCase() === 'summary' ? 'summary' : 'detail';
            const format = String(req.query.format || 'json').trim().toLowerCase();
            const styleCode = trimStr(req.query.style_code || req.query.style, 128);
            const skusRaw = req.query.skus || req.query.sku || '';
            const skus = String(skusRaw).split(',').map((s) => s.trim()).filter(Boolean);
            const status = trimStr(req.query.status, 32) || 'in_stock';
            const pieces = await loadStockPiecesForReport(query, req.user.id, { styleCode, skus, status });
            const summary = buildStockSummary(pieces);
            const laneReserved = await countLaneReservedForReport(query, req.user.id, { styleCode, skus });
            summary.lane_reserved_count = laneReserved.count;
            summary.lane_reserved_weight_g = laneReserved.total_weight_g;
            summary.available_count = summary.total_pieces;
            const filters = { styleCode: styleCode || null, skus, status };
            const generatedAt = new Date().toISOString();

            if (format === 'csv') {
                const csv = reportType === 'summary'
                    ? stockSummaryCsv(summary, { generatedAt, filters })
                    : stockDetailCsv(pieces);
                const fname = `stock-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
                return res.send('\ufeff' + csv);
            }
            if (format === 'html' || format === 'pdf') {
                const html = stockReportHtml({ reportType, summary, pieces, filters, generatedAt });
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                if (format === 'pdf') {
                    res.setHeader('Content-Disposition', 'inline; filename="stock-report.html"');
                }
                return res.send(html);
            }
            res.json({
                reportType,
                generatedAt,
                filters,
                summary,
                pieces: reportType === 'summary' ? undefined : pieces,
                pieceCount: pieces.length,
            });
        } catch (e) {
            console.error('shadow stock report:', e);
            res.status(500).json({ error: e.message || 'Stock report failed' });
        }
    });

    app.get('/api/reseller/erp/shadow/customer-account', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const { buildCustomerAccount, customerAccountToCsv } = require('./resellerErpCustomerAccount');
            const customerId = parseInt(String(req.query.customer_id || ''), 10);
            const account = await buildCustomerAccount(query, req.user.id, {
                customerId,
                from: parseDateOrNull(req.query.from),
                to: parseDateOrNull(req.query.to),
                includeShadow: true,
            });
            res.json(account);
        } catch (e) {
            const status = e.status || 500;
            if (status !== 500) return res.status(status).json({ error: e.message });
            console.error('shadow customer-account:', e);
            res.status(500).json({ error: e.message || 'Failed to load account' });
        }
    });

    app.get('/api/reseller/erp/shadow/customer-account/export', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const { buildCustomerAccount, customerAccountToCsv } = require('./resellerErpCustomerAccount');
            const customerId = parseInt(String(req.query.customer_id || ''), 10);
            const format = String(req.query.format || 'csv').toLowerCase();
            const account = await buildCustomerAccount(query, req.user.id, {
                customerId,
                from: parseDateOrNull(req.query.from),
                to: parseDateOrNull(req.query.to),
                includeShadow: true,
            });
            if (format === 'html') {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                const rows = account.transactions
                    .map(
                        (t) =>
                            `<tr><td>${t.date}</td><td>${t.kind}</td><td>${t.ref}</td><td>${t.description}</td><td>${t.debit || ''}</td><td>${t.credit || ''}</td><td>${t.balance_inr}</td></tr>`,
                    )
                    .join('');
                return res.send(
                    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lane ledger</title></head><body><h1>${account.customer.name}</h1><p>Balance due: ₹${account.summary.balance_due_inr}</p><table border="1" cellpadding="4"><tr><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>${rows}</table></body></html>`,
                );
            }
            const csv = customerAccountToCsv(account);
            const fname = `lane-ledger-${account.customer.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
            res.send('\ufeff' + csv);
        } catch (e) {
            const status = e.status || 500;
            if (status !== 500) return res.status(status).json({ error: e.message });
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });
}

module.exports = {
    ensureShadowSchema,
    registerShadowRoutes,
    classifyLane,
    hasValidGstin,
    inferPaymentMethodFromSession,
    createShadowBillFromBillingPayload,
    markEstimateBilledViaLedger,
    shouldRouteSaleToShadowLedger,
};

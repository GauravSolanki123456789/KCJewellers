/**
 * Ledger reports — GST sales register (official) and lane all-bills detail (Jainav).
 */
const { normDateIso } = require('./erpDateNormalize');

function parseDateOrNull(v) {
    const s = String(v ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
}

function parseLines(raw) {
    let lines = raw;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    return Array.isArray(lines) ? lines : [];
}

function mapOfficialBillRow(row) {
    const lines = parseLines(row.lines_json);
    return {
        source: 'official',
        lane: null,
        id: row.id,
        bill_number: row.bill_number,
        bill_date: normDateIso(row.bill_date) || row.bill_date,
        customer_name: row.customer_name,
        status: row.status,
        gst_enabled: row.gst_enabled !== false,
        total_inr: row.total_inr != null ? Number(row.total_inr) : 0,
        item_count: lines.length,
        lines,
        created_at: row.created_at,
    };
}

function mapShadowBillRow(row) {
    const lines = parseLines(row.lines_json);
    return {
        source: 'shadow',
        lane: row.lane,
        id: row.id,
        bill_number: row.bill_number,
        bill_date: normDateIso(row.bill_date) || row.bill_date,
        customer_name: row.customer_name,
        status: row.status,
        gst_enabled: false,
        total_inr: Number(row.total_inr) || 0,
        item_count: lines.length,
        lines,
        created_at: row.created_at,
    };
}

function billDateSqlFragment(params, { from, to, on }, alias = '') {
    const col = `${alias}bill_date`;
    if (on) {
        params.push(on);
        return ` AND ${col} = $${params.length}::date`;
    }
    let frag = '';
    if (from) {
        params.push(from);
        frag += ` AND ${col} >= $${params.length}::date`;
    }
    if (to) {
        params.push(to);
        frag += ` AND ${col} <= $${params.length}::date`;
    }
    return frag;
}

function isGoldLine(line) {
    return String(line?.metal_type || line?.metalType || '').toLowerCase().includes('gold');
}

function lineValueInr(line) {
    const direct = Number(line?.lineTotalInr ?? line?.line_total_inr);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const unit = Number(line?.unitInr ?? line?.rate) || 0;
    const qty = Number(line?.qty) || 1;
    return unit * qty;
}

function summarizeMetalFromBills(bills) {
    let goldWeightGm = 0;
    let silverWeightGm = 0;
    let goldValueInr = 0;
    let silverValueInr = 0;
    for (const bill of bills) {
        if (String(bill.status || '').toLowerCase() === 'cancelled') continue;
        for (const line of bill.lines || []) {
            const wt = Number(line.weightGm ?? line.weight_gm) || 0;
            const val = lineValueInr(line);
            if (isGoldLine(line)) {
                goldWeightGm += wt;
                goldValueInr += val;
            } else {
                silverWeightGm += wt;
                silverValueInr += val;
            }
        }
    }
    return {
        goldWeightGm: Math.round(goldWeightGm * 1000) / 1000,
        silverWeightGm: Math.round(silverWeightGm * 1000) / 1000,
        goldValueInr: Math.round(goldValueInr * 100) / 100,
        silverValueInr: Math.round(silverValueInr * 100) / 100,
    };
}

function computeBillStats(bills) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let totalValue = 0;
    let monthCount = 0;
    let todayCount = 0;
    for (const b of bills) {
        if (String(b.status || '').toLowerCase() === 'cancelled') continue;
        totalValue += Number(b.total_inr) || 0;
        const created = b.created_at ? new Date(b.created_at) : null;
        if (created && !Number.isNaN(created.getTime())) {
            if (created >= monthStart) monthCount++;
            if (created >= dayStart) todayCount++;
        }
    }
    return {
        total: bills.filter((b) => String(b.status || '').toLowerCase() !== 'cancelled').length,
        totalValue: Math.round(totalValue * 100) / 100,
        monthCount,
        todayCount,
    };
}

async function buildGstSalesRegisterReport(query, userId, opts = {}) {
    const from = parseDateOrNull(opts.from);
    const to = parseDateOrNull(opts.to);
    const on = parseDateOrNull(opts.on);
    const params = [userId];
    let sql = `SELECT * FROM reseller_erp_bills
               WHERE reseller_user_id = $1
                 AND bill_type = 'sale'
                 AND COALESCE(gst_enabled, true) = true
                 AND LOWER(COALESCE(status, '')) NOT IN ('cancelled')`;
    sql += billDateSqlFragment(params, { from, to, on });
    sql += ` ORDER BY bill_date ASC, id ASC LIMIT 2000`;
    const rows = await query(sql, params);
    const bills = rows.map(mapOfficialBillRow);
    return {
        bills,
        summary: computeBillStats(bills),
        metal: summarizeMetalFromBills(bills),
        period: { from, to, on },
    };
}

async function buildLaneAllBillsDetailReport(query, userId, opts = {}) {
    const from = parseDateOrNull(opts.from);
    const to = parseDateOrNull(opts.to);
    const on = parseDateOrNull(opts.on);

    const paramsOff = [userId];
    let sqlOff = `SELECT * FROM reseller_erp_bills
                  WHERE reseller_user_id = $1
                    AND bill_type = 'sale'
                    AND LOWER(COALESCE(status, '')) NOT IN ('cancelled')`;
    sqlOff += billDateSqlFragment(paramsOff, { from, to, on });
    sqlOff += ` ORDER BY bill_date ASC, id ASC LIMIT 1500`;

    const paramsSh = [userId];
    let sqlSh = `SELECT * FROM reseller_erp_shadow_bills
                 WHERE reseller_user_id = $1
                   AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'void')`;
    sqlSh += billDateSqlFragment(paramsSh, { from, to, on }, '');
    sqlSh += ` ORDER BY bill_date ASC, id ASC LIMIT 1500`;

    const [offRows, shRows] = await Promise.all([query(sqlOff, paramsOff), query(sqlSh, paramsSh)]);
    const bills = [
        ...offRows.map(mapOfficialBillRow),
        ...shRows.map(mapShadowBillRow),
    ].sort((a, b) => {
        const da = String(a.bill_date || '');
        const db = String(b.bill_date || '');
        if (da !== db) return da.localeCompare(db);
        return String(a.bill_number || '').localeCompare(String(b.bill_number || ''), undefined, {
            numeric: true,
            sensitivity: 'base',
        });
    });

    return {
        bills,
        summary: computeBillStats(bills),
        metal: summarizeMetalFromBills(bills),
        period: { from, to, on },
    };
}

function salesRegisterToCsv(report) {
    const header = ['Bill no', 'Date', 'Customer', 'Items', 'Net total'];
    const lines = [header.join(',')];
    for (const b of report.bills || []) {
        const row = [
            b.bill_number,
            b.bill_date,
            `"${String(b.customer_name || '').replace(/"/g, '""')}"`,
            b.item_count,
            Number(b.total_inr).toFixed(2),
        ];
        lines.push(row.join(','));
    }
    return lines.join('\n');
}

function gstSalesRegisterToCsv(report) {
    return salesRegisterToCsv(report);
}

function laneBillsDetailToCsv(report) {
    return salesRegisterToCsv(report);
}

module.exports = {
    buildGstSalesRegisterReport,
    buildLaneAllBillsDetailReport,
    gstSalesRegisterToCsv,
    laneBillsDetailToCsv,
};

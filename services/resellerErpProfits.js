/**
 * Jainav profit reports — sold pieces vs design-master cost + PV metal rate.
 */

const { getSessionOperator, operatorCanAccessModule } = require('./resellerErpOperators');

function round2(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
}

function roundGm(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * 1000) / 1000;
}

function parseJson(raw, fallback) {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function parseMetalFrac(raw) {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n > 1) return Math.min(1, n / 100);
    return n;
}

function isMcPerPiece(raw) {
    const t = String(raw || '')
        .trim()
        .toUpperCase();
    return (
        t === 'MC/PC' ||
        t === 'PCS' ||
        t === 'FIX' ||
        t === 'RS' ||
        t === 'PC' ||
        t === 'FIXED' ||
        t === 'PER_PIECE' ||
        t === 'PERPIECE' ||
        t === 'PIECE'
    );
}

function metalKeyForSlab(slab) {
    const s = String(slab || 'R').toUpperCase();
    if (s === 'R1') return 'metal_slab_r1_pct';
    if (s === 'W') return 'metal_slab_w_pct';
    if (s === 'F') return 'metal_slab_f_pct';
    return 'metal_slab_r_pct';
}

function mcKeyForSlab(slab) {
    const s = String(slab || 'R').toUpperCase();
    if (s === 'R1') return 'mc_rate_slab_r1';
    if (s === 'W') return 'mc_rate_slab_w';
    if (s === 'F') return 'mc_rate_slab_f';
    return 'mc_rate_slab_r';
}

function csvEscape(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function requireJainavProfits() {
    return (req, res, next) => {
        if (!req.session?.shadowUnlocked) {
            return res.status(403).json({ error: 'Locked', code: 'INTERNAL_LOCKED' });
        }
        const op = getSessionOperator(req);
        if (!op || !operatorCanAccessModule(op, 'profits')) {
            return res.status(403).json({
                error: 'You do not have access to this module',
                module: 'profits',
            });
        }
        req.erpOperator = op;
        next();
    };
}

function runningTagFromPayload(payloadJson) {
    const payload = parseJson(payloadJson, {});
    const tag = payload && payload.running_tag_barcode;
    return tag ? String(tag).trim() : '';
}

function findBillLine(lines, piece) {
    if (!Array.isArray(lines) || !lines.length) return null;
    const id = Number(piece.id);
    const barcode = String(piece.barcode || '').trim().toLowerCase();
    const running = runningTagFromPayload(piece.payload_json).toLowerCase();
    for (const line of lines) {
        if (!line || typeof line !== 'object') continue;
        if (line.stock_piece_id != null && Number(line.stock_piece_id) === id) return line;
        const lb = String(line.barcode || line.code || '').trim().toLowerCase();
        if (barcode && lb && lb === barcode) return line;
        if (running && lb && lb === running) return line;
    }
    return null;
}

function soldMetalRate(line, session, metalType) {
    const rowRate = Number(line?.ratePerGram ?? line?.rate_per_gram);
    if (Number.isFinite(rowRate) && rowRate > 0) return rowRate;
    const metal = String(metalType || line?.metal_type || '').toUpperCase();
    const isGold = metal.includes('GOLD');
    const slab = String(session?.rateSlab || 'R').toUpperCase();
    if (isGold) {
        if (slab === 'R1' || slab === 'W' || slab === 'F') {
            const wh = Number(session?.wholesaleGold);
            if (Number.isFinite(wh) && wh > 0) return wh;
        }
        const g = Number(session?.goldPerG ?? session?.gold_per_g);
        return Number.isFinite(g) && g > 0 ? g : 0;
    }
    if (slab === 'R1' || slab === 'W' || slab === 'F') {
        const wh = Number(session?.wholesaleSilver);
        if (Number.isFinite(wh) && wh > 0) return wh;
    }
    const s = Number(session?.silverPerG ?? session?.silver_per_g);
    return Number.isFinite(s) && s > 0 ? s : 0;
}

function soldMetalFraction(line, piece, slab) {
    const key = metalKeyForSlab(slab);
    const fromLine = parseMetalFrac(line?.[key]);
    if (fromLine != null) return fromLine;
    const fromPiece = parseMetalFrac(piece[key]);
    if (fromPiece != null) return fromPiece;
    return 1;
}

function soldMcRate(line, piece, slab) {
    const key = mcKeyForSlab(slab);
    const fromLine = Number(line?.[key] ?? line?.mc_rate);
    if (Number.isFinite(fromLine) && fromLine > 0) return fromLine;
    const fromPiece = Number(piece[key] ?? piece.mc_rate);
    return Number.isFinite(fromPiece) && fromPiece > 0 ? fromPiece : 0;
}

function netWeightGm(line, piece) {
    const og = Number(line?.originalWeightGm ?? line?.original_weight_gm);
    if (Number.isFinite(og) && og > 0) return roundGm(og);
    const wg = Number(line?.weightGm ?? line?.weight_gm ?? line?.net_weight);
    if (Number.isFinite(wg) && wg > 0) return roundGm(wg);
    const pw = Number(piece.avg_weight);
    return Number.isFinite(pw) && pw > 0 ? roundGm(pw) : 0;
}

function pieceCount(line, piece) {
    const q = Number(line?.qty ?? line?.pcs ?? piece.pcs ?? 1);
    return Number.isFinite(q) && q > 0 ? q : 1;
}

function isMrpLine(line, piece) {
    if (line?.mrpMode === true) return true;
    const billedFp = Number(line?.fixed_price_r ?? line?.fixed_price);
    const rate = Number(line?.ratePerGram ?? line?.rate_per_gram);
    if (Number.isFinite(billedFp) && billedFp > 0 && !(Number.isFinite(rate) && rate > 0)) return true;
    const pieceFp = Number(piece.fixed_price);
    const wt = netWeightGm(line, piece);
    return Number.isFinite(pieceFp) && pieceFp > 0 && !(wt > 0);
}

function computePieceProfit(row) {
    const officialLines = parseJson(row.lines_json, []);
    const shadowLines = parseJson(row.shadow_lines_json, []);
    const useShadow = String(row.status) === 'shadow_sold' || (!row.sold_bill_id && row.shadow_bill_id);
    const lines = useShadow ? shadowLines : officialLines;
    const session = parseJson(useShadow ? row.shadow_session_json : row.session_json, {}) || {};
    const line = findBillLine(Array.isArray(lines) ? lines : [], row) || {};
    const slab = String(session.rateSlab || 'R').toUpperCase();
    const gstOn =
        !useShadow &&
        row.gst_enabled !== false &&
        session.gstEnabled !== false;
    const gstPct = gstOn ? 3 : 0;
    const wt = netWeightGm(line, row);
    const pcs = pieceCount(line, row);
    const mcType = line.mc_type || row.mc_type;
    const pvRate = Number(row.metal_rate_per_gm) || 0;
    const costMetalFrac = parseMetalFrac(row.metal_cost_pct) ?? 0;
    const costWastageFrac = parseMetalFrac(row.wastage_cost_pct) ?? 0;
    const mrpCost = Number(row.mrp_cost) || 0;
    const mcCostRate = Number(row.mc_cost) || 0;
    const soldRate = soldMetalRate(line, session, row.metal_type);
    const soldFrac = soldMetalFraction(line, row, slab);
    const soldMc = soldMcRate(line, row, slab);
    const wastagePct = Number(line.wastage_pct ?? row.wastage_pct) || 0;
    const box = Number(line.box_charges ?? row.box_charges) || 0;
    const stone = Number(line.stone_charges ?? row.stone_charges) || 0;

    let soldMetal = 0;
    let costMetal = 0;
    let soldMcInr = 0;
    let costMcInr = 0;
    let soldWastage = 0;
    let costWastage = 0;
    let soldMrp = 0;
    let costMrp = 0;
    let extras = round2(box + stone);
    let mode = 'metal';

    if (isMrpLine(line, row)) {
        mode = 'mrp';
        soldMrp = Number(line.fixed_price_r ?? line.fixed_price ?? line.unitInr ?? row.fixed_price) || 0;
        costMrp = mrpCost;
    } else {
        soldMetal = round2(soldRate * soldFrac * wt);
        costMetal = round2(pvRate * costMetalFrac * wt);
        if (isMcPerPiece(mcType)) {
            soldMcInr = round2(soldMc * pcs);
            costMcInr = round2(mcCostRate * pcs);
        } else {
            const mcWt = wastagePct > 0 ? roundGm(wt * (1 + wastagePct / 100)) : wt;
            soldMcInr = round2(soldMc * mcWt);
            costMcInr = round2(mcCostRate * wt);
        }
        soldWastage = round2(soldRate * (wastagePct / 100) * wt);
        costWastage = round2(pvRate * costWastageFrac * wt);
    }

    const soldTaxable =
        mode === 'mrp'
            ? round2(soldMrp + extras)
            : round2(soldMetal + soldMcInr + soldWastage + extras);
    const costTotal =
        mode === 'mrp'
            ? round2(costMrp)
            : round2(costMetal + costMcInr + costWastage);
    const gstInr = gstPct > 0 ? round2(soldTaxable * (gstPct / 100)) : 0;
    const profit = round2(soldTaxable - costTotal);

    const billNumber = useShadow
        ? row.shadow_bill_number || row.bill_number
        : row.bill_number || row.shadow_bill_number;
    const billDate = useShadow
        ? row.shadow_bill_date || row.bill_date
        : row.bill_date || row.shadow_bill_date;

    return {
        id: row.id,
        barcode: runningTagFromPayload(row.payload_json) || row.barcode,
        style_code: row.style_code || '',
        sku: row.sku || '',
        product_name: row.product_name || '',
        metal_type: row.metal_type || '',
        size: row.size || '',
        avg_weight: wt,
        pcs,
        mc_type: mcType || '',
        status: 'sold',
        bill_number: billNumber || '',
        bill_date: billDate || null,
        pv_number: row.pv_number || '',
        pv_rate: pvRate,
        sold_rate: soldRate,
        cost_metal_pct: costMetalFrac,
        sold_metal_pct: soldFrac,
        cost_metal: costMetal,
        sold_metal: soldMetal,
        cost_mc: costMcInr,
        sold_mc: soldMcInr,
        cost_wastage: costWastage,
        sold_wastage: soldWastage,
        cost_mrp: costMrp,
        sold_mrp: soldMrp,
        extras,
        gst_inr: gstInr,
        gst_enabled: gstOn,
        sold_taxable: soldTaxable,
        cost_total: costTotal,
        profit,
        mode,
    };
}

function buildProfitSummary(rows) {
    const bySku = new Map();
    const byStyle = new Map();
    const byMetal = new Map();
    let totalProfit = 0;
    let totalSold = 0;
    let totalCost = 0;
    let totalWeight = 0;
    let totalGst = 0;

    const bump = (map, key, extra) => {
        const cur = map.get(key) || {
            count: 0,
            total_weight_g: 0,
            sold_taxable: 0,
            cost_total: 0,
            profit: 0,
            gst_inr: 0,
            ...extra,
        };
        cur.count += 1;
        cur.total_weight_g = roundGm(cur.total_weight_g + (extra.weight || 0));
        cur.sold_taxable = round2(cur.sold_taxable + extra.sold);
        cur.cost_total = round2(cur.cost_total + extra.cost);
        cur.profit = round2(cur.profit + extra.profit);
        cur.gst_inr = round2(cur.gst_inr + extra.gst);
        map.set(key, cur);
    };

    for (const r of rows) {
        totalProfit = round2(totalProfit + r.profit);
        totalSold = round2(totalSold + r.sold_taxable);
        totalCost = round2(totalCost + r.cost_total);
        totalWeight = roundGm(totalWeight + r.avg_weight);
        totalGst = round2(totalGst + r.gst_inr);
        const extra = {
            weight: r.avg_weight,
            sold: r.sold_taxable,
            cost: r.cost_total,
            profit: r.profit,
            gst: r.gst_inr,
        };
        bump(bySku, `${r.style_code}::${r.sku}`, { style_code: r.style_code, sku: r.sku, ...extra });
        bump(byStyle, r.style_code || '—', { style_code: r.style_code || '—', ...extra });
        bump(byMetal, r.metal_type || '—', { metal_type: r.metal_type || '—', ...extra });
    }

    const mapRows = (map, keyName) =>
        Array.from(map.values())
            .map((r) => ({
                ...r,
                avg_weight_g: r.count ? roundGm(r.total_weight_g / r.count) : 0,
                avg_profit: r.count ? round2(r.profit / r.count) : 0,
            }))
            .sort((a, b) => b.profit - a.profit);

    return {
        total_pieces: rows.length,
        total_weight_g: totalWeight,
        sold_taxable: totalSold,
        cost_total: totalCost,
        gst_inr: totalGst,
        profit: totalProfit,
        avg_profit: rows.length ? round2(totalProfit / rows.length) : 0,
        by_sku: mapRows(bySku).map((r) => ({
            style_code: r.style_code,
            sku: r.sku,
            count: r.count,
            total_weight_g: r.total_weight_g,
            avg_weight_g: r.avg_weight_g,
            sold_taxable: r.sold_taxable,
            cost_total: r.cost_total,
            profit: r.profit,
            avg_profit: r.avg_profit,
        })),
        by_style: mapRows(byStyle).map((r) => ({
            style_code: r.style_code,
            count: r.count,
            sku_count: 0,
            total_weight_g: r.total_weight_g,
            avg_weight_g: r.avg_weight_g,
            sold_taxable: r.sold_taxable,
            cost_total: r.cost_total,
            profit: r.profit,
            avg_profit: r.avg_profit,
        })),
        by_metal: mapRows(byMetal).map((r) => ({
            metal_type: r.metal_type,
            count: r.count,
            total_weight_g: r.total_weight_g,
            avg_weight_g: r.avg_weight_g,
            sold_taxable: r.sold_taxable,
            cost_total: r.cost_total,
            profit: r.profit,
            avg_profit: r.avg_profit,
        })),
    };
}

function profitDetailCsv(rows) {
    const headers = [
        'barcode',
        'bill_number',
        'bill_date',
        'pv_number',
        'metal',
        'style',
        'sku',
        'product',
        'weight_g',
        'pv_rate',
        'sold_rate',
        'cost_metal_pct',
        'sold_metal_pct',
        'cost_metal',
        'sold_metal',
        'cost_mc',
        'sold_mc',
        'cost_wastage',
        'sold_wastage',
        'cost_mrp',
        'sold_mrp',
        'extras',
        'gst',
        'cost_total',
        'sold_taxable',
        'profit',
    ];
    const lines = [headers.join(',')];
    for (const r of rows) {
        lines.push(
            [
                r.barcode,
                r.bill_number,
                r.bill_date ? String(r.bill_date).slice(0, 10) : '',
                r.pv_number,
                r.metal_type,
                r.style_code,
                r.sku,
                r.product_name,
                r.avg_weight,
                r.pv_rate,
                r.sold_rate,
                r.cost_metal_pct,
                r.sold_metal_pct,
                r.cost_metal,
                r.sold_metal,
                r.cost_mc,
                r.sold_mc,
                r.cost_wastage,
                r.sold_wastage,
                r.cost_mrp,
                r.sold_mrp,
                r.extras,
                r.gst_inr,
                r.cost_total,
                r.sold_taxable,
                r.profit,
            ]
                .map(csvEscape)
                .join(','),
        );
    }
    return lines.join('\n');
}

function profitSummaryCsv(summary) {
    const lines = [
        ['metric', 'value'].map(csvEscape).join(','),
        ['pieces', summary.total_pieces].join(','),
        ['weight_g', summary.total_weight_g].join(','),
        ['sold_taxable', summary.sold_taxable].join(','),
        ['cost_total', summary.cost_total].join(','),
        ['gst', summary.gst_inr].join(','),
        ['profit', summary.profit].join(','),
        '',
        ['style', 'sku', 'count', 'weight_g', 'sold_taxable', 'cost_total', 'profit'].join(','),
    ];
    for (const r of summary.by_sku || []) {
        lines.push(
            [r.style_code, r.sku, r.count, r.total_weight_g, r.sold_taxable, r.cost_total, r.profit]
                .map(csvEscape)
                .join(','),
        );
    }
    return lines.join('\n');
}

async function loadSoldProfitRows(query, resellerUserId, filters) {
    const params = [resellerUserId];
    const where = [
        `p.reseller_user_id = $1`,
        `p.status IN ('sold', 'shadow_sold')`,
    ];
    const metals = (filters.metals || []).map((m) => String(m).trim().toUpperCase()).filter(Boolean);
    if (metals.length) {
        params.push(metals);
        where.push(`upper(trim(coalesce(p.metal_type, ''))) = ANY($${params.length}::text[])`);
    }
    const styleCodes = (filters.styleCodes || []).map((s) => String(s).trim()).filter(Boolean);
    if (styleCodes.length) {
        params.push(styleCodes.map((s) => s.toUpperCase()));
        where.push(`upper(trim(coalesce(p.style_code, ''))) = ANY($${params.length}::text[])`);
    }
    const skus = (filters.skus || []).map((s) => String(s).trim()).filter(Boolean);
    if (skus.length) {
        const pairs = skus
            .map((s) => {
                const parts = s.includes('::') ? s.split('::') : s.split('/');
                if (parts.length >= 2) {
                    return { style: parts[0].trim().toUpperCase(), sku: parts.slice(1).join('/').trim().toUpperCase() };
                }
                return { style: '', sku: s.toUpperCase() };
            })
            .filter((p) => p.sku);
        if (pairs.length) {
            const ors = [];
            for (const pair of pairs) {
                if (pair.style) {
                    params.push(pair.style, pair.sku);
                    ors.push(
                        `(upper(trim(coalesce(p.style_code, ''))) = $${params.length - 1} AND upper(trim(coalesce(p.sku, ''))) = $${params.length})`,
                    );
                } else {
                    params.push(pair.sku);
                    ors.push(`upper(trim(coalesce(p.sku, ''))) = $${params.length}`);
                }
            }
            where.push(`(${ors.join(' OR ')})`);
        }
    }
    if (filters.from) {
        params.push(filters.from);
        where.push(`COALESCE(b.bill_date, sb.bill_date) >= $${params.length}::date`);
    }
    if (filters.to) {
        params.push(filters.to);
        where.push(`COALESCE(b.bill_date, sb.bill_date) <= $${params.length}::date`);
    }

    const rows = await query(
        `SELECT
            p.id, p.barcode, p.sku, p.style_code, p.product_name, p.size,
            p.avg_weight, p.pcs, p.mc_rate, p.mc_type, p.wastage_pct, p.metal_type,
            p.fixed_price, p.box_charges, p.stone_charges, p.status,
            p.sold_bill_id, p.shadow_bill_id, p.payload_json,
            p.metal_slab_r_pct, p.metal_slab_r1_pct, p.metal_slab_w_pct, p.metal_slab_f_pct,
            p.mc_rate_slab_r, p.mc_rate_slab_r1, p.mc_rate_slab_w, p.mc_rate_slab_f,
            b.bill_number, b.bill_date, b.lines_json, b.session_json, b.gst_enabled, b.total_inr,
            sb.bill_number AS shadow_bill_number, sb.bill_date AS shadow_bill_date,
            sb.lines_json AS shadow_lines_json, sb.session_json AS shadow_session_json,
            pv.pv_number, pv.metal_rate_per_gm,
            sk.mrp_cost, sk.metal_cost_pct, sk.mc_cost, sk.wastage_cost_pct
         FROM reseller_erp_stock_pieces p
         LEFT JOIN reseller_erp_bills b
            ON b.id = p.sold_bill_id AND b.reseller_user_id = p.reseller_user_id
         LEFT JOIN reseller_erp_shadow_bills sb
            ON sb.id = p.shadow_bill_id AND sb.reseller_user_id = p.reseller_user_id
         LEFT JOIN reseller_erp_stock_batches bat ON bat.id = p.batch_id
         LEFT JOIN reseller_erp_purchase_vouchers pv ON pv.id = bat.purchase_voucher_id
         LEFT JOIN reseller_erp_design_styles ds
            ON ds.reseller_user_id = p.reseller_user_id
           AND upper(trim(ds.style_code)) = upper(trim(coalesce(p.style_code, '')))
         LEFT JOIN reseller_erp_design_skus sk
            ON sk.style_id = ds.id AND sk.reseller_user_id = p.reseller_user_id
           AND upper(trim(sk.sku)) = upper(trim(coalesce(p.sku, '')))
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(b.bill_date, sb.bill_date) DESC NULLS LAST, p.id DESC`,
        params,
    );
    return rows.map(computePieceProfit);
}

function registerResellerErpProfitRoutes(app, deps) {
    const { query, checkAuth, erpGate } = deps;
    const profitsGate = requireJainavProfits();

    app.get('/api/reseller/erp/profits', checkAuth, erpGate, profitsGate, async (req, res) => {
        try {
            const reportType =
                String(req.query.type || 'summary').trim().toLowerCase() === 'detail' ? 'detail' : 'summary';
            const format = String(req.query.format || 'json').trim().toLowerCase();
            const styleCodes = String(req.query.style_codes || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const skus = String(req.query.skus || req.query.sku || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const metals = String(req.query.metals || req.query.metal || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const from = String(req.query.from || '').trim() || null;
            const to = String(req.query.to || '').trim() || null;
            const rows = await loadSoldProfitRows(query, req.user.id, {
                styleCodes,
                skus,
                metals,
                from,
                to,
            });
            const summary = buildProfitSummary(rows);
            const generatedAt = new Date().toISOString();
            if (format === 'csv') {
                const csv = reportType === 'detail' ? profitDetailCsv(rows) : profitSummaryCsv(summary);
                const fname = `profits-${reportType}-${new Date().toISOString().slice(0, 10)}.csv`;
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
                return res.send('\ufeff' + csv);
            }
            res.json({
                reportType,
                generatedAt,
                summary,
                pieces: reportType === 'summary' ? undefined : rows,
                pieceCount: rows.length,
            });
        } catch (e) {
            console.error('erp profits:', e);
            res.status(500).json({ error: e.message || 'Profit report failed' });
        }
    });
}

module.exports = {
    registerResellerErpProfitRoutes,
    computePieceProfit,
    buildProfitSummary,
};

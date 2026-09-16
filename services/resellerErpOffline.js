/**
 * Exhibition / offline kit — snapshot, exhibition pack export, and merge on return.
 */

const fs = require('fs');
const path = require('path');

function trimStr(v, max = 500) {
    const s = String(v ?? '').trim();
    return s.length > max ? s.slice(0, max) : s;
}

function parseDateOrNull(v) {
    if (v == null || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function mapOfflinePiece(row) {
    return {
        id: row.id,
        barcode: row.barcode,
        sku: row.sku || '',
        style_code: row.style_code || '',
        name: row.product_name || '',
        product_name: row.product_name || '',
        size: row.size || '',
        net_weight: row.avg_weight != null ? Number(row.avg_weight) : null,
        gross_weight: row.gross_weight != null ? Number(row.gross_weight) : null,
        bag_wt: row.bag_wt != null ? Number(row.bag_wt) : null,
        bags: row.bags ?? null,
        purity: row.purity != null ? Number(row.purity) : null,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_type: row.mc_type || '',
        mc_rate_slab_r: row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
        mc_rate_slab_w: row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
        mc_rate_slab_f: row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
        metal_slab_r_pct: row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
        metal_slab_w_pct: row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
        metal_slab_f_pct: row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
        pcs: row.pcs != null ? Number(row.pcs) : 1,
        box_charges: row.box_charges != null ? Number(row.box_charges) : 0,
        stone_charges: row.stone_charges != null ? Number(row.stone_charges) : 0,
        stone_wt: row.stone_wt != null ? Number(row.stone_wt) : null,
        metal_type: row.metal_type || '',
        item_code: row.item_code || '',
        image_url: row.image_url || '',
        attr_color: row.attr_color || '',
        attr_stone: row.attr_stone || '',
        fixed_price: row.fixed_price != null ? Number(row.fixed_price) : null,
    };
}

function mapOfflineCustomer(row) {
    return {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        gstin: row.gstin,
        pan: row.pan,
        address: row.address,
        state: row.state,
        birthdate: row.birthdate,
        anniversary_date: row.anniversary_date,
        notes: row.notes,
        rate_slab: row.rate_slab,
    };
}

async function loadOfflineSnapshot(query, resellerUserId) {
    const customers = await query(
        `SELECT id, name, mobile, email, gstin, pan, address, state,
                birthdate, anniversary_date, notes, rate_slab
         FROM reseller_erp_customers
         WHERE reseller_user_id = $1
           AND regexp_replace(lower(trim(name)), '[\\s._-]+', '', 'g') <> 'jainav2'
         ORDER BY updated_at DESC, id DESC
         LIMIT 5000`,
        [resellerUserId],
    );
    const pieces = await query(
        `SELECT id, barcode, sku, style_code, product_name, size, avg_weight,
                gross_weight, bag_wt, bags, purity, wastage_pct, mc_rate, mc_type,
                mc_rate_slab_r, mc_rate_slab_w, mc_rate_slab_f,
                metal_slab_r_pct, metal_slab_w_pct, metal_slab_f_pct,
                pcs, box_charges, stone_charges, stone_wt, metal_type, item_code,
                image_url, attr_color, attr_stone, fixed_price
         FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND COALESCE(status, 'in_stock') = 'in_stock'
           AND barcode IS NOT NULL AND trim(barcode) <> ''
         ORDER BY id
         LIMIT 25000`,
        [resellerUserId],
    );
    const blockedRows = await query(
        `SELECT barcode FROM reseller_erp_stock_pieces
         WHERE reseller_user_id = $1
           AND status IN ('sold', 'shadow_sold')
           AND barcode IS NOT NULL AND trim(barcode) <> ''
         LIMIT 25000`,
        [resellerUserId],
    );
    let settings = {};
    try {
        const setRows = await query(
            `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1 LIMIT 1`,
            [resellerUserId],
        );
        settings = setRows[0]?.settings || {};
        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
            } catch {
                settings = {};
            }
        }
    } catch {
        settings = {};
    }
    let rates = {
        gold_per_gram: 7500,
        silver_per_gram: 252.2,
        gold_24k_per_gram: 0,
        gold_22k_per_gram: 0,
        gold_18k_per_gram: 0,
    };
    try {
        const rateRows = await query(
            `SELECT silver_per_gram, gold_24k_per_gram, gold_22k_per_gram, gold_18k_per_gram
             FROM reseller_metal_rates WHERE user_id = $1 LIMIT 1`,
            [resellerUserId],
        );
        const r = rateRows[0];
        if (r) {
            rates = {
                gold_per_gram: Number(r.gold_22k_per_gram) || Number(r.gold_24k_per_gram) || 7500,
                gold_24k_per_gram: Number(r.gold_24k_per_gram) || 0,
                gold_22k_per_gram: Number(r.gold_22k_per_gram) || 0,
                gold_18k_per_gram: Number(r.gold_18k_per_gram) || 0,
                silver_per_gram: Number(r.silver_per_gram) || 252.2,
            };
        }
    } catch {
        /* keep defaults */
    }
    return {
        capturedAt: new Date().toISOString(),
        customers: (customers || []).map(mapOfflineCustomer),
        pieces: (pieces || []).map(mapOfflinePiece),
        blockedBarcodes: (blockedRows || [])
            .map((r) => String(r.barcode || '').trim())
            .filter(Boolean),
        settings,
        rates,
        slabSettings: settings?.reseller_slab_settings || settings?.slabSettings || null,
    };
}

async function nextEstimateHint(query, resellerUserId) {
    const rows = await query(
        `SELECT bill_number FROM reseller_erp_bills
         WHERE reseller_user_id = $1 AND bill_type = 'estimate'
           AND UPPER(bill_number) ~ '^ESTIMATE-[0-9]+$'
         ORDER BY id DESC LIMIT 200`,
        [resellerUserId],
    );
    const used = new Set();
    for (const row of rows) {
        const m = String(row.bill_number || '').match(/^ESTIMATE-(\d+)$/i);
        if (m) {
            const digits = m[1];
            const n = parseInt(digits, 10);
            if (Number.isFinite(n) && n > 0 && !(digits.length > 3 && n < 1000)) used.add(n);
        }
    }
    let next = 1;
    while (used.has(next)) next += 1;
    return `ESTIMATE-${String(next).padStart(3, '0')}`;
}

async function nextShadowBillHint(query, resellerUserId) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear() % 100).padStart(2, '0');
    const prefix = `SCB${mm}${yy}-`;
    const rows = await query(
        `SELECT bill_number FROM reseller_erp_shadow_bills
         WHERE reseller_user_id = $1 AND bill_number LIKE $2
         ORDER BY id DESC LIMIT 1`,
        [resellerUserId, `${prefix}%`],
    );
    let seq = 1;
    if (rows.length) {
        const m = String(rows[0].bill_number).match(/-(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${seq}`;
}

function resolveExhibitionAppPath() {
    const candidates = [
        path.join(__dirname, '../client/public/exhibition-kit/index.html'),
        path.join(process.cwd(), 'client/public/exhibition-kit/index.html'),
        path.join(process.cwd(), 'public/exhibition-kit/index.html'),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function registerResellerErpOfflineRoutes(app, deps) {
    const { query, checkAuth, erpGate, requireJson } = deps;
    const { findShadowBillByOfflineOpId } = require('./resellerErpShadow');

    app.get('/api/reseller/erp/offline/exhibition-app', checkAuth, erpGate, async (req, res) => {
        try {
            const filePath = resolveExhibitionAppPath();
            if (!filePath) {
                return res.status(404).json({ error: 'Exhibition app file not found on server' });
            }
            const html = fs.readFileSync(filePath, 'utf8');
            if (!html || !html.trim()) {
                return res.status(404).json({ error: 'Exhibition app file is empty' });
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="kc-exhibition-billing.html"');
            res.send(html);
        } catch (e) {
            console.error('erp exhibition app download:', e);
            res.status(500).json({ error: e.message || 'Failed to download exhibition app' });
        }
    });

    app.get('/api/reseller/erp/offline/snapshot', checkAuth, erpGate, async (req, res) => {
        try {
            const snap = await loadOfflineSnapshot(query, req.user.id);
            res.json(snap);
        } catch (e) {
            console.error('erp offline snapshot:', e);
            res.status(500).json({ error: e.message || 'Failed to prepare offline snapshot' });
        }
    });

    app.get('/api/reseller/erp/offline/exhibition-pack', checkAuth, erpGate, async (req, res) => {
        try {
            const snap = await loadOfflineSnapshot(query, req.user.id);
            const pack = {
                packVersion: 1,
                kind: 'kc-exhibition-pack',
                exportedAt: new Date().toISOString(),
                resellerUserId: req.user.id,
                snapshot: snap,
                counters: {
                    nextEstimateNumber: await nextEstimateHint(query, req.user.id),
                    nextShadowBillNumber: await nextShadowBillHint(query, req.user.id),
                },
            };
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="exhibition-pack-${new Date().toISOString().slice(0, 10)}.json"`,
            );
            res.send(JSON.stringify(pack, null, 2));
        } catch (e) {
            console.error('erp exhibition pack:', e);
            res.status(500).json({ error: e.message || 'Failed to export exhibition pack' });
        }
    });

    app.post('/api/reseller/erp/offline/exhibition-merge', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const queue = Array.isArray(body.queue) ? body.queue : [];
            if (!queue.length) {
                return res.status(400).json({ error: 'No exhibition data in upload' });
            }

            const localToServerCustomer = new Map();
            const results = [];
            let ok = 0;
            let failed = 0;

            for (const raw of queue) {
                const item = raw && typeof raw === 'object' ? raw : {};
                const type = String(item.type || '').toLowerCase();
                const payload = item.payload && typeof item.payload === 'object' ? { ...item.payload } : {};
                const offlineOpId = trimStr(
                    payload.offline_op_id || (payload.session && payload.session.offlineOpId) || item.id,
                    80,
                );
                try {
                    if (type === 'customer') {
                        const mobile = String(payload.mobile || '').trim();
                        const name = String(payload.name || '').trim();
                        let customerId = null;
                        if (mobile) {
                            const found = await query(
                                `SELECT id FROM reseller_erp_customers
                                 WHERE reseller_user_id = $1
                                   AND regexp_replace(coalesce(mobile, ''), '\\D', '', 'g') =
                                       regexp_replace($2, '\\D', '', 'g')
                                 LIMIT 1`,
                                [req.user.id, mobile],
                            );
                            customerId = found[0]?.id || null;
                        }
                        if (!customerId && name) {
                            const found = await query(
                                `SELECT id FROM reseller_erp_customers
                                 WHERE reseller_user_id = $1 AND lower(trim(name)) = lower(trim($2))
                                 LIMIT 1`,
                                [req.user.id, name],
                            );
                            customerId = found[0]?.id || null;
                        }
                        if (!customerId) {
                            const ins = await query(
                                `INSERT INTO reseller_erp_customers (reseller_user_id, name, mobile, email, gstin, pan, address, state, notes, rate_slab)
                                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                                 RETURNING id`,
                                [
                                    req.user.id,
                                    name || 'Walk-in',
                                    payload.mobile || null,
                                    payload.email || null,
                                    payload.gstin || null,
                                    payload.pan || null,
                                    payload.address || null,
                                    payload.state || null,
                                    payload.notes || null,
                                    payload.rate_slab || null,
                                ],
                            );
                            customerId = ins[0]?.id;
                        }
                        if (item.localCustomerId && customerId) {
                            localToServerCustomer.set(Number(item.localCustomerId), customerId);
                        }
                        results.push({ id: item.id, ok: true, detail: 'Customer merged' });
                        ok += 1;
                        continue;
                    }

                    if (offlineOpId) {
                        const dupBill = await query(
                            `SELECT bill_number FROM reseller_erp_bills
                             WHERE reseller_user_id = $1 AND session_json->>'offlineOpId' = $2 LIMIT 1`,
                            [req.user.id, offlineOpId],
                        );
                        if (dupBill.length) {
                            results.push({
                                id: item.id,
                                ok: true,
                                detail: `Skipped duplicate ${dupBill[0].bill_number}`,
                            });
                            ok += 1;
                            continue;
                        }
                        const shadowHit = await findShadowBillByOfflineOpId(query, req.user.id, offlineOpId);
                        if (shadowHit) {
                            results.push({
                                id: item.id,
                                ok: true,
                                detail: `Skipped duplicate ${shadowHit.bill_number}`,
                            });
                            ok += 1;
                            continue;
                        }
                    }

                    const localCid =
                        item.localCustomerId ||
                        (payload.customer_id != null && Number(payload.customer_id) < 0
                            ? Number(payload.customer_id)
                            : null);
                    if (localCid && localToServerCustomer.has(localCid)) {
                        payload.customer_id = localToServerCustomer.get(localCid);
                    } else if (localCid && Number(payload.customer_id) < 0) {
                        throw new Error('Customer from exhibition pack not found — sync customers first');
                    }

                    const {
                        createShadowBillFromBillingPayload,
                        shouldRouteSaleToShadowLedger,
                    } = require('./resellerErpShadow');
                    const billType = String(
                        payload.bill_type || (type === 'estimate' ? 'estimate' : 'sale'),
                    ).toLowerCase();
                    if (!payload.session || typeof payload.session !== 'object') payload.session = {};
                    if (offlineOpId) {
                        payload.offline_op_id = offlineOpId;
                        payload.session.offlineOpId = offlineOpId;
                    }
                    const lines = Array.isArray(payload.lines) ? payload.lines : [];
                    let total = Number(payload.total_inr);
                    if (!Number.isFinite(total)) {
                        total = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0);
                    }

                    if (billType === 'estimate') {
                        const billNumber =
                            trimStr(payload.bill_number, 64) ||
                            (await nextEstimateHint(query, req.user.id));
                        const dup = await query(
                            `SELECT id FROM reseller_erp_bills
                             WHERE reseller_user_id = $1 AND bill_number = $2 LIMIT 1`,
                            [req.user.id, billNumber],
                        );
                        if (dup.length) {
                            results.push({ id: item.id, ok: true, detail: `Skipped ${billNumber}` });
                            ok += 1;
                            continue;
                        }
                        const ins = await query(
                            `INSERT INTO reseller_erp_bills (
                                reseller_user_id, bill_number, bill_type, customer_id, customer_name,
                                total_inr, status, lines_json, notes, bill_date, session_json
                             ) VALUES ($1,$2,'estimate',$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb)
                             RETURNING bill_number`,
                            [
                                req.user.id,
                                billNumber,
                                payload.customer_id != null
                                    ? parseInt(String(payload.customer_id), 10) || null
                                    : null,
                                trimStr(payload.customer_name, 255),
                                Math.round(total * 100) / 100,
                                trimStr(payload.status, 32) || 'draft',
                                JSON.stringify(lines),
                                trimStr(payload.notes, 2000),
                                parseDateOrNull(payload.bill_date) ||
                                    new Date().toISOString().slice(0, 10),
                                JSON.stringify(payload.session),
                            ],
                        );
                        results.push({
                            id: item.id,
                            ok: true,
                            detail: `${item.localBillNumber || type} → ${ins[0]?.bill_number || billNumber}`,
                        });
                        ok += 1;
                        continue;
                    }

                    if (billType === 'sale') {
                        if (shouldRouteSaleToShadowLedger(payload.session, true)) {
                            const { bill } = await createShadowBillFromBillingPayload(
                                query,
                                req.user.id,
                                payload,
                                null,
                            );
                            results.push({
                                id: item.id,
                                ok: true,
                                detail: `${item.localBillNumber || type} → ${bill?.bill_number || 'saved'}`,
                            });
                            ok += 1;
                            continue;
                        }
                        throw new Error('GST sale merge from exhibition pack is not supported yet');
                    }

                    throw new Error(`Unknown queue type: ${type}`);
                } catch (e) {
                    results.push({ id: item.id, ok: false, detail: e.message || 'Failed' });
                    failed += 1;
                }
            }

            res.json({ ok, failed, results, mergedAt: new Date().toISOString() });
        } catch (e) {
            console.error('erp exhibition merge:', e);
            res.status(500).json({ error: e.message || 'Exhibition merge failed' });
        }
    });
}

module.exports = {
    registerResellerErpOfflineRoutes,
    loadOfflineSnapshot,
};

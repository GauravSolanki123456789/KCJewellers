/**
 * Shadow-mode billing ledger (Hitesh / Jainav lanes) — separate from public GST bills.
 */

const { DEFAULT_SHADOW_SEQUENCE, getSessionOperator, requireErpOperatorAdmin } = require('./resellerErpOperators');
const { markPiecesSold, findSoldBarcodeConflicts } = require('./resellerErpStockPieces');

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

function classifyLane({ customerGstin, paymentMethod, laneOverride }) {
    const lane = String(laneOverride || '').trim().toLowerCase();
    if (lane === 'hitesh' || lane === 'jainav') return lane;
    const gst = trimStr(customerGstin, 20);
    const pay = String(paymentMethod || 'cash').trim().toLowerCase();
    const online = ['upi', 'card', 'online', 'bank', 'neft', 'rtgs', 'cheque', 'gpay', 'phonepe', 'paytm'].includes(pay);
    if (gst || online) return 'hitesh';
    return 'jainav';
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
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_erp_shadow_bills WHERE reseller_user_id = $1`;
            if (lane === 'hitesh' || lane === 'jainav') {
                params.push(lane);
                sql += ` AND lane = $${params.length}`;
            }
            if (from) {
                params.push(from);
                sql += ` AND bill_date >= $${params.length}`;
            }
            if (to) {
                params.push(to);
                sql += ` AND bill_date <= $${params.length}`;
            }
            sql += ' ORDER BY bill_date DESC, id DESC LIMIT 500';
            const rows = await query(sql, params);
            res.json({ bills: rows.map(mapShadowBill) });
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
            const customerGstin = trimStr(req.body.customer_gstin || req.body.customerGstin, 20);
            const paymentMethod = trimStr(req.body.payment_method || req.body.paymentMethod, 32) || 'cash';
            const lane = classifyLane({
                customerGstin,
                paymentMethod,
                laneOverride: req.body.lane,
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
            await markPiecesSold(query, req.user.id, linesRaw, null);
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
            const params = [req.user.id, from, to];
            let sql = `SELECT * FROM reseller_erp_shadow_bills
                       WHERE reseller_user_id = $1 AND bill_date >= $2 AND bill_date <= $3`;
            if (lane === 'hitesh' || lane === 'jainav') {
                params.push(lane);
                sql += ` AND lane = $${params.length}`;
            }
            sql += ' ORDER BY lane, bill_date, id';
            const rows = await query(sql, params);
            const bills = rows.map(mapShadowBill);
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
            const params = [req.user.id, from, to];
            let sql = `SELECT * FROM reseller_erp_shadow_bills
                       WHERE reseller_user_id = $1 AND bill_date >= $2 AND bill_date <= $3`;
            if (lane === 'hitesh' || lane === 'jainav') {
                params.push(lane);
                sql += ` AND lane = $${params.length}`;
            }
            sql += ' ORDER BY lane, bill_date, id';
            const rows = await query(sql, params);
            const bills = rows.map(mapShadowBill);
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
            res.json({ success: true, deletedCount: deleted.length });
        } catch (e) {
            console.error('shadow purge:', e);
            res.status(500).json({ error: e.message || 'Purge failed' });
        }
    });

    app.get('/api/reseller/erp/shadow/summary', checkAuth, erpGate, shadowGate, async (req, res) => {
        try {
            const from = parseDateOrNull(req.query.from) || new Date().toISOString().slice(0, 10);
            const rows = await query(
                `SELECT lane, COUNT(*)::int AS count, COALESCE(SUM(total_inr),0)::float AS total
                 FROM reseller_erp_shadow_bills
                 WHERE reseller_user_id = $1 AND bill_date = $2
                 GROUP BY lane`,
                [req.user.id, from],
            );
            const summary = { hitesh: { count: 0, total: 0 }, jainav: { count: 0, total: 0 } };
            for (const r of rows) {
                if (r.lane === 'hitesh' || r.lane === 'jainav') {
                    summary[r.lane] = { count: r.count, total: r.total };
                }
            }
            res.json({ date: from, summary });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Summary failed' });
        }
    });
}

module.exports = {
    ensureShadowSchema,
    registerShadowRoutes,
    classifyLane,
};

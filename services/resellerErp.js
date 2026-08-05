/**
 * Reseller ERP package — gate + customers, bills, stock/ROL, settings APIs.
 */

const {
    ensureStockPiecesSchema,
    registerStockPieceRoutes,
    lookupStockPiece,
    markPiecesSold,
    findSoldBarcodeConflicts,
} = require('./resellerErpStockPieces');
const {
    loadErpSettings,
    validateGstSettings,
    resolveEinvoiceConfig,
    resolveEwayConfig,
    parseCompliance,
    generateEinvoiceForBill,
    generateEwayForBill,
} = require('./resellerErpGstzen');

async function ensureResellerErpSchema(pool) {
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_erp_enabled BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS reseller_erp_customers (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            mobile VARCHAR(32),
            email VARCHAR(255),
            gstin VARCHAR(20),
            address TEXT,
            birthdate DATE,
            anniversary_date DATE,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_customers_reseller
            ON reseller_erp_customers (reseller_user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reseller_erp_settings (
            reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            settings JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reseller_erp_bills (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            bill_number VARCHAR(64) NOT NULL,
            bill_type VARCHAR(32) NOT NULL DEFAULT 'sale',
            customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
            customer_name VARCHAR(255),
            total_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'draft',
            lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            notes TEXT,
            bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reseller_erp_bills_reseller
            ON reseller_erp_bills (reseller_user_id, created_at DESC);

        ALTER TABLE reseller_erp_bills
            ADD COLUMN IF NOT EXISTS session_json JSONB DEFAULT NULL;

        ALTER TABLE reseller_erp_bills
            ADD COLUMN IF NOT EXISTS compliance_json JSONB DEFAULT NULL;

        CREATE TABLE IF NOT EXISTS reseller_erp_stock_alerts (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_barcode VARCHAR(128),
            product_sku VARCHAR(128),
            product_name VARCHAR(255),
            reorder_level NUMERIC(12, 3) NOT NULL DEFAULT 0,
            current_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
            notes TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await ensureStockPiecesSchema(pool);
}

async function resellerErpEnabled(query, userId) {
    const id = parseInt(String(userId), 10);
    if (!Number.isFinite(id) || id <= 0) return false;
    try {
        const rows = await query(
            `SELECT COALESCE(reseller_erp_enabled, false) AS enabled,
                    UPPER(COALESCE(customer_tier, '')) AS tier
             FROM users WHERE id = $1`,
            [id],
        );
        if (!rows.length) return false;
        return rows[0].tier === 'RESELLER' && !!rows[0].enabled;
    } catch (e) {
        if (String(e.message || '').includes('reseller_erp_enabled')) return false;
        throw e;
    }
}

function requireResellerErp(query) {
    return async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({ error: 'Sign in required' });
            }
            const ok = await resellerErpEnabled(query, req.user.id);
            if (!ok) {
                return res.status(403).json({
                    error: 'ERP is not enabled for your account. Ask KC admin to turn on ERP software.',
                });
            }
            next();
        } catch (e) {
            console.error('reseller erp gate:', e);
            res.status(500).json({ error: e.message || 'ERP check failed' });
        }
    };
}

function trimStr(v, max = 255) {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.slice(0, max);
}

function trimStrLower(v, max = 255) {
    const s = trimStr(v, max);
    return s ? s.toLowerCase() : '';
}

function daysUntilAnnualEvent(isoDate) {
    if (!isoDate) return null;
    const s = String(isoDate).trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), month, day);
    if (next.getTime() < today.getTime()) {
        next = new Date(today.getFullYear() + 1, month, day);
    }
    return Math.round((next.getTime() - today.getTime()) / 86400000);
}

async function lookupCatalogImageUrl(query, keys) {
    const name = trimStr(keys?.product_name, 255);
    const sku = trimStr(keys?.sku, 128);
    const item = trimStr(keys?.item_code, 128);
    if (!name && !sku && !item) return null;
    const rows = await query(
        `SELECT image_url FROM web_products wp
         WHERE (wp.is_active IS NULL OR wp.is_active = true)
           AND wp.image_url IS NOT NULL AND TRIM(wp.image_url) <> ''
           AND (
             ($1::text IS NOT NULL AND LOWER(TRIM(wp.name)) = LOWER($1))
             OR ($2::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($2))
             OR ($3::text IS NOT NULL AND LOWER(TRIM(wp.name)) = LOWER($3))
           )
         ORDER BY
           CASE
             WHEN $1::text IS NOT NULL AND LOWER(TRIM(wp.name)) = LOWER($1) THEN 0
             WHEN $2::text IS NOT NULL AND LOWER(TRIM(COALESCE(wp.sku, ''))) = LOWER($2) THEN 1
             ELSE 2
           END,
           wp.updated_at DESC NULLS LAST
         LIMIT 1`,
        [name, sku, item],
    );
    return rows[0]?.image_url || null;
}

function parseDateOrNull(v) {
    if (v == null || v === '') return null;
    const raw = String(v).trim();
    const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
    if (dmy) {
        const dd = parseInt(dmy[1], 10);
        const mm = parseInt(dmy[2], 10);
        const yyyy = parseInt(dmy[3], 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 1900 && yyyy <= 2100) {
            const d = new Date(yyyy, mm - 1, dd);
            if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) {
                return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
            }
        }
    }
    const s = raw.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const n = Number(v);
    if (Number.isFinite(n) && n > 25569 && n < 60000) {
        const epoch = new Date(Date.UTC(1899, 11, 30));
        epoch.setUTCDate(epoch.getUTCDate() + Math.floor(n));
        return epoch.toISOString().slice(0, 10);
    }
    return null;
}

function billTypePrefix(billType) {
    if (billType === 'estimate') return 'ESTIMATE';
    if (billType === 'credit') return 'CREDIT';
    if (billType === 'order') return 'ORDER';
    return 'SALE';
}

async function nextBillNumber(query, userId, billType) {
    const prefix = billTypePrefix(billType);
    const rows = await query(
        `SELECT bill_number FROM reseller_erp_bills
         WHERE reseller_user_id = $1 AND bill_type = $2 AND bill_number ~ $3`,
        [userId, billType, `^${prefix}-[0-9]+$`],
    );
    const used = new Set();
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    for (const row of rows) {
        const m = re.exec(String(row.bill_number || '').trim());
        if (m) used.add(parseInt(m[1], 10));
    }
    let n = 1;
    while (used.has(n)) n += 1;
    return `${prefix}-${String(n).padStart(4, '0')}`;
}

function mapCustomer(row) {
    if (!row) return row;
    return {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        email: row.email,
        gstin: row.gstin,
        address: row.address,
        birthdate: row.birthdate,
        anniversary_date: row.anniversary_date,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function mapBill(row) {
    if (!row) return row;
    let lines = row.lines_json;
    if (typeof lines === 'string') {
        try {
            lines = JSON.parse(lines);
        } catch {
            lines = [];
        }
    }
    if (!Array.isArray(lines)) lines = [];
    let session = row.session_json;
    if (typeof session === 'string') {
        try {
            session = JSON.parse(session);
        } catch {
            session = null;
        }
    }
    let compliance = row.compliance_json;
    if (typeof compliance === 'string') {
        try {
            compliance = JSON.parse(compliance);
        } catch {
            compliance = null;
        }
    }
    return {
        id: row.id,
        bill_number: row.bill_number,
        bill_type: row.bill_type,
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        total_inr: row.total_inr != null ? Number(row.total_inr) : 0,
        status: row.status,
        lines,
        notes: row.notes,
        bill_date: row.bill_date,
        session: session && typeof session === 'object' ? session : null,
        compliance: compliance && typeof compliance === 'object' ? compliance : null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function mapStock(row) {
    if (!row) return row;
    return {
        id: row.id,
        product_barcode: row.product_barcode,
        product_sku: row.product_sku,
        product_name: row.product_name,
        reorder_level: Number(row.reorder_level) || 0,
        current_qty: Number(row.current_qty) || 0,
        notes: row.notes,
        updated_at: row.updated_at,
        below_rol: Number(row.current_qty) <= Number(row.reorder_level),
    };
}

function registerResellerErpRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson } = deps;
    const erpGate = requireResellerErp(query);

    ensureResellerErpSchema(pool).catch((e) => console.warn('reseller erp schema:', e.message));

    registerStockPieceRoutes(app, { query, pool, checkAuth, requireJson, erpGate });

    app.get('/api/reseller/erp/status', checkAuth, async (req, res) => {
        try {
            await ensureResellerErpSchema(pool);
            const enabled = await resellerErpEnabled(query, req.user.id);
            if (!enabled) {
                return res.json({ enabled: false, summary: null });
            }
            const [cust, bills, stock, below, pieces] = await Promise.all([
                query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_customers WHERE reseller_user_id = $1`,
                    [req.user.id],
                ),
                query(
                    `SELECT COUNT(*)::int AS n,
                            COALESCE(SUM(total_inr) FILTER (WHERE status <> 'cancelled'), 0)::float AS total
                     FROM reseller_erp_bills WHERE reseller_user_id = $1`,
                    [req.user.id],
                ),
                query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_alerts WHERE reseller_user_id = $1`,
                    [req.user.id],
                ),
                query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_alerts
                     WHERE reseller_user_id = $1 AND current_qty <= reorder_level`,
                    [req.user.id],
                ),
                query(
                    `SELECT COUNT(*)::int AS n FROM reseller_erp_stock_pieces
                     WHERE reseller_user_id = $1 AND status = 'in_stock'`,
                    [req.user.id],
                ),
            ]);
            res.json({
                enabled: true,
                summary: {
                    customers: cust[0]?.n ?? 0,
                    bills: bills[0]?.n ?? 0,
                    billTotalInr: bills[0]?.total ?? 0,
                    stockItems: pieces[0]?.n ?? stock[0]?.n ?? 0,
                    belowRol: below[0]?.n ?? 0,
                },
            });
        } catch (e) {
            console.error('erp status:', e);
            res.status(500).json({ error: e.message || 'Failed to load ERP status' });
        }
    });

    // ——— Customers ———
    app.get('/api/reseller/erp/customers', checkAuth, erpGate, async (req, res) => {
        try {
            const q = String(req.query.q || '').trim();
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_erp_customers WHERE reseller_user_id = $1`;
            if (q) {
                params.push(`%${q}%`);
                sql += ` AND (
                    name ILIKE $2 OR COALESCE(mobile,'') ILIKE $2
                    OR COALESCE(email,'') ILIKE $2 OR COALESCE(gstin,'') ILIKE $2
                )`;
            }
            sql += ` ORDER BY updated_at DESC, id DESC LIMIT 500`;
            const rows = await query(sql, params);
            res.json({ customers: rows.map(mapCustomer) });
        } catch (e) {
            console.error('erp customers list:', e);
            res.status(500).json({ error: e.message || 'Failed to list customers' });
        }
    });

    app.post('/api/reseller/erp/customers', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const name = trimStr(req.body.name, 255);
            if (!name) return res.status(400).json({ error: 'Customer name is required' });
            const rows = await query(
                `INSERT INTO reseller_erp_customers (
                    reseller_user_id, name, mobile, email, gstin, address,
                    birthdate, anniversary_date, notes
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 RETURNING *`,
                [
                    req.user.id,
                    name,
                    trimStr(req.body.mobile, 32),
                    trimStr(req.body.email, 255),
                    trimStr(req.body.gstin, 20),
                    trimStr(req.body.address, 2000),
                    parseDateOrNull(req.body.birthdate),
                    parseDateOrNull(req.body.anniversary_date),
                    trimStr(req.body.notes, 2000),
                ],
            );
            res.json({ success: true, customer: mapCustomer(rows[0]) });
        } catch (e) {
            console.error('erp customer create:', e);
            res.status(500).json({ error: e.message || 'Failed to create customer' });
        }
    });

    app.put('/api/reseller/erp/customers/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id) || id <= 0) {
                return res.status(400).json({ error: 'Invalid customer id' });
            }
            const name = trimStr(req.body.name, 255);
            if (!name) return res.status(400).json({ error: 'Customer name is required' });
            const rows = await query(
                `UPDATE reseller_erp_customers SET
                    name = $1, mobile = $2, email = $3, gstin = $4, address = $5,
                    birthdate = $6, anniversary_date = $7, notes = $8, updated_at = NOW()
                 WHERE id = $9 AND reseller_user_id = $10
                 RETURNING *`,
                [
                    name,
                    trimStr(req.body.mobile, 32),
                    trimStr(req.body.email, 255),
                    trimStr(req.body.gstin, 20),
                    trimStr(req.body.address, 2000),
                    parseDateOrNull(req.body.birthdate),
                    parseDateOrNull(req.body.anniversary_date),
                    trimStr(req.body.notes, 2000),
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
            res.json({ success: true, customer: mapCustomer(rows[0]) });
        } catch (e) {
            console.error('erp customer update:', e);
            res.status(500).json({ error: e.message || 'Failed to update customer' });
        }
    });

    app.delete('/api/reseller/erp/customers/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const rows = await query(
                `DELETE FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('erp customer delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete customer' });
        }
    });

    app.get('/api/reseller/erp/customers/export', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT name, mobile, email, gstin, address, birthdate, anniversary_date, notes
                 FROM reseller_erp_customers WHERE reseller_user_id = $1
                 ORDER BY name ASC LIMIT 5000`,
                [req.user.id],
            );
            res.json({ customers: rows });
        } catch (e) {
            console.error('erp customers export:', e);
            res.status(500).json({ error: e.message || 'Export failed' });
        }
    });

    app.post('/api/reseller/erp/customers/bulk', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const rawRows = Array.isArray(req.body.rows) ? req.body.rows : [];
            if (!rawRows.length) return res.status(400).json({ error: 'rows required' });
            if (rawRows.length > 2000) return res.status(400).json({ error: 'Max 2000 rows' });

            let inserted = 0;
            let skipped = 0;
            for (const row of rawRows) {
                const name = trimStr(row.name || row.Name, 255);
                if (!name) {
                    skipped++;
                    continue;
                }
                await query(
                    `INSERT INTO reseller_erp_customers (
                        reseller_user_id, name, mobile, email, gstin, address,
                        birthdate, anniversary_date, notes
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        req.user.id,
                        name,
                        trimStr(row.mobile || row.Mobile, 32),
                        trimStr(row.email || row.Email, 255),
                        trimStr(row.gstin || row.GSTIN, 20),
                        trimStr(row.address || row.Address, 2000),
                        parseDateOrNull(row.birthdate || row.Birthday),
                        parseDateOrNull(row.anniversary_date || row.Anniversary),
                        trimStr(row.notes || row.Notes, 2000),
                    ],
                );
                inserted++;
            }
            res.json({ success: true, inserted, skipped });
        } catch (e) {
            console.error('erp customers bulk:', e);
            res.status(500).json({ error: e.message || 'Bulk upload failed' });
        }
    });

    // ——— Bills ———
    app.get('/api/reseller/erp/bills', checkAuth, erpGate, async (req, res) => {
        try {
            const billType = trimStrLower(req.query.bill_type, 32);
            const status = trimStrLower(req.query.status, 32);
            const q = trimStr(req.query.q, 200);
            const from = parseDateOrNull(req.query.from);
            const to = parseDateOrNull(req.query.to);
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_erp_bills WHERE reseller_user_id = $1`;
            if (billType) {
                params.push(billType);
                sql += ` AND bill_type = $${params.length}`;
            }
            if (status) {
                const st = status.toLowerCase();
                if (st === 'rate_unfix') {
                    sql += ` AND (
                        LOWER(COALESCE(status, 'draft')) = 'rate_unfix'
                        OR (
                            LOWER(COALESCE(status, 'draft')) = 'draft'
                            AND COALESCE(session_json->>'ratesUnfixed', 'false') = 'true'
                        )
                    )`;
                } else if (st === 'advance_paid') {
                    sql += ` AND (
                        LOWER(COALESCE(status, 'draft')) = 'advance_paid'
                        OR (
                            LOWER(COALESCE(status, 'draft')) NOT IN ('cancelled', 'rate_unfix')
                            AND COALESCE((session_json->>'advancePaidInr')::numeric, 0) > 0
                        )
                    )`;
                } else if (st === 'draft') {
                    sql += ` AND LOWER(COALESCE(status, 'draft')) = 'draft'
                        AND COALESCE(session_json->>'ratesUnfixed', 'false') != 'true'
                        AND COALESCE((session_json->>'advancePaidInr')::numeric, 0) <= 0`;
                } else {
                    params.push(st);
                    sql += ` AND LOWER(status) = $${params.length}`;
                }
            }
            if (from) {
                params.push(from);
                sql += ` AND bill_date >= $${params.length}::date`;
            }
            if (to) {
                params.push(to);
                sql += ` AND bill_date <= $${params.length}::date`;
            }
            if (q) {
                params.push(`%${q}%`);
                const idx = params.length;
                let searchSql = ` AND (bill_number ILIKE $${idx} OR customer_name ILIKE $${idx} OR COALESCE(session_json->>'mobile', '') ILIKE $${idx}`;
                const qDigits = q.replace(/\D/g, '');
                if (qDigits.length >= 4) {
                    params.push(`%${qDigits}%`);
                    searchSql += ` OR regexp_replace(COALESCE(session_json->>'mobile', ''), '[^0-9]', '', 'g') LIKE $${params.length}`;
                }
                searchSql += ')';
                sql += searchSql;
            }
            sql += ` ORDER BY created_at DESC, id DESC LIMIT 500`;
            const rows = await query(sql, params);
            res.json({ bills: rows.map(mapBill) });
        } catch (e) {
            console.error('erp bills list:', e);
            res.status(500).json({ error: e.message || 'Failed to list bills' });
        }
    });

    app.get('/api/reseller/erp/bills/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const rows = await query(
                `SELECT * FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            res.json({ bill: mapBill(rows[0]) });
        } catch (e) {
            console.error('erp bill get:', e);
            res.status(500).json({ error: e.message || 'Failed to load bill' });
        }
    });

    app.post('/api/reseller/erp/bills', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const billType = String(req.body.bill_type || 'sale').trim().toLowerCase();
            const allowed = ['sale', 'credit', 'estimate', 'order'];
            if (!allowed.includes(billType)) {
                return res.status(400).json({ error: 'Invalid bill type' });
            }
            const lines = Array.isArray(req.body.lines) ? req.body.lines.slice(0, 200) : [];
            let total = Number(req.body.total_inr);
            if (!Number.isFinite(total)) {
                total = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0);
            }
            const statusRaw = trimStr(req.body.status, 32) || 'draft';
            const status = statusRaw.toLowerCase();
            if (['completed', 'paid', 'final'].includes(status) && billType === 'sale') {
                const barcodes = lines.map((l) => (l.barcode || l.code || '').trim()).filter(Boolean);
                const conflicts = await findSoldBarcodeConflicts(query, req.user.id, barcodes);
                if (conflicts.length) {
                    return res.status(409).json({
                        error: 'One or more items are already sold',
                        conflicts,
                    });
                }
            }
            const typePrefix = billTypePrefix(billType);
            const billNumber =
                trimStr(req.body.bill_number, 64) ||
                (await nextBillNumber(query, req.user.id, billType));
            const sessionJson =
                req.body.session && typeof req.body.session === 'object'
                    ? JSON.stringify(req.body.session)
                    : null;

            const rows = await query(
                `INSERT INTO reseller_erp_bills (
                    reseller_user_id, bill_number, bill_type, customer_id, customer_name,
                    total_inr, status, lines_json, notes, bill_date, session_json
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb)
                 RETURNING *`,
                [
                    req.user.id,
                    billNumber,
                    billType,
                    req.body.customer_id != null ? parseInt(String(req.body.customer_id), 10) || null : null,
                    trimStr(req.body.customer_name, 255),
                    Math.round(total * 100) / 100,
                    trimStr(req.body.status, 32) || 'draft',
                    JSON.stringify(lines),
                    trimStr(req.body.notes, 2000),
                    parseDateOrNull(req.body.bill_date) || new Date().toISOString().slice(0, 10),
                    sessionJson,
                ],
            );
            const bill = mapBill(rows[0]);
            if (['completed', 'paid', 'final'].includes(status)) {
                await markPiecesSold(query, req.user.id, lines, bill.id);
            }
            res.json({ success: true, bill });
        } catch (e) {
            console.error('erp bill create:', e);
            res.status(500).json({ error: e.message || 'Failed to create bill' });
        }
    });

    app.put('/api/reseller/erp/bills/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const lines = Array.isArray(req.body.lines) ? req.body.lines.slice(0, 200) : [];
            let total = Number(req.body.total_inr);
            if (!Number.isFinite(total)) {
                total = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0);
            }
            const sessionJson =
                req.body.session && typeof req.body.session === 'object'
                    ? JSON.stringify(req.body.session)
                    : null;
            const status = trimStr(req.body.status, 32);
            const stLower = String(status || '').toLowerCase();
            if (['completed', 'paid', 'final'].includes(stLower)) {
                const billTypeRow = await query(
                    `SELECT bill_type FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [id, req.user.id],
                );
                const bt = String(billTypeRow[0]?.bill_type || req.body.bill_type || 'sale').toLowerCase();
                if (bt === 'sale') {
                    const barcodes = lines.map((l) => (l.barcode || l.code || '').trim()).filter(Boolean);
                    const conflicts = await findSoldBarcodeConflicts(query, req.user.id, barcodes, id);
                    if (conflicts.length) {
                        return res.status(409).json({
                            error: 'One or more items are already sold',
                            conflicts,
                        });
                    }
                }
            }
            const rows = await query(
                `UPDATE reseller_erp_bills SET
                    customer_id = COALESCE($1, customer_id),
                    customer_name = COALESCE($2, customer_name),
                    total_inr = $3,
                    status = COALESCE($4, status),
                    lines_json = $5::jsonb,
                    notes = COALESCE($6, notes),
                    session_json = COALESCE($7::jsonb, session_json),
                    updated_at = NOW()
                 WHERE id = $8 AND reseller_user_id = $9
                 RETURNING *`,
                [
                    req.body.customer_id != null ? parseInt(String(req.body.customer_id), 10) || null : null,
                    trimStr(req.body.customer_name, 255) || null,
                    Math.round(total * 100) / 100,
                    status || null,
                    JSON.stringify(lines),
                    trimStr(req.body.notes, 2000) || null,
                    sessionJson,
                    id,
                    req.user.id,
                ],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            const bill = mapBill(rows[0]);
            const st = String(bill.status || '').toLowerCase();
            if (['completed', 'paid', 'final'].includes(st)) {
                await markPiecesSold(query, req.user.id, bill.lines, bill.id);
            }
            res.json({ success: true, bill });
        } catch (e) {
            console.error('erp bill put:', e);
            res.status(500).json({ error: e.message || 'Failed to update bill' });
        }
    });

    app.patch('/api/reseller/erp/bills/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const status = trimStr(req.body.status, 32);
            if (!status) return res.status(400).json({ error: 'status required' });
            const rows = await query(
                `UPDATE reseller_erp_bills SET status = $1, updated_at = NOW()
                 WHERE id = $2 AND reseller_user_id = $3
                 RETURNING *`,
                [status, id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            const bill = mapBill(rows[0]);
            if (['completed', 'paid', 'final'].includes(String(status).toLowerCase())) {
                await markPiecesSold(query, req.user.id, bill.lines, bill.id);
            }
            res.json({ success: true, bill });
        } catch (e) {
            console.error('erp bill patch:', e);
            res.status(500).json({ error: e.message || 'Failed to update bill' });
        }
    });

    app.delete('/api/reseller/erp/bills/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const rows = await query(
                `DELETE FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('erp bill delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete bill' });
        }
    });

    app.post('/api/reseller/erp/bills/bulk-delete', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const ids = Array.isArray(req.body.ids)
                ? req.body.ids.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n))
                : [];
            if (!ids.length) return res.status(400).json({ error: 'ids required' });
            if (ids.length > 200) return res.status(400).json({ error: 'Max 200 ids' });
            const rows = await query(
                `DELETE FROM reseller_erp_bills
                 WHERE reseller_user_id = $1 AND id = ANY($2::int[])
                 RETURNING id`,
                [req.user.id, ids],
            );
            res.json({ success: true, deleted: rows.length });
        } catch (e) {
            console.error('erp bills bulk delete:', e);
            res.status(500).json({ error: e.message || 'Bulk delete failed' });
        }
    });

    // ——— Stock / ROL ———
    app.get('/api/reseller/erp/stock', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT * FROM reseller_erp_stock_alerts
                 WHERE reseller_user_id = $1
                 ORDER BY
                   CASE WHEN current_qty <= reorder_level THEN 0 ELSE 1 END,
                   product_name ASC NULLS LAST,
                   id DESC
                 LIMIT 500`,
                [req.user.id],
            );
            res.json({ items: rows.map(mapStock) });
        } catch (e) {
            console.error('erp stock list:', e);
            res.status(500).json({ error: e.message || 'Failed to list stock' });
        }
    });

    app.post('/api/reseller/erp/stock', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const barcode = trimStr(req.body.product_barcode, 128);
            const name = trimStr(req.body.product_name, 255);
            if (!barcode && !name) {
                return res.status(400).json({ error: 'Barcode or product name is required' });
            }
            const reorder = Number(req.body.reorder_level);
            const qty = Number(req.body.current_qty);
            const rows = await query(
                `INSERT INTO reseller_erp_stock_alerts (
                    reseller_user_id, product_barcode, product_sku, product_name,
                    reorder_level, current_qty, notes, updated_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                 ON CONFLICT DO NOTHING
                 RETURNING *`,
                [
                    req.user.id,
                    barcode,
                    trimStr(req.body.product_sku, 128),
                    name || barcode,
                    Number.isFinite(reorder) ? reorder : 0,
                    Number.isFinite(qty) ? qty : 0,
                    trimStr(req.body.notes, 1000),
                ],
            );
            if (!rows.length && barcode) {
                const updated = await query(
                    `UPDATE reseller_erp_stock_alerts SET
                        product_sku = COALESCE($1, product_sku),
                        product_name = COALESCE($2, product_name),
                        reorder_level = $3,
                        current_qty = $4,
                        notes = COALESCE($5, notes),
                        updated_at = NOW()
                     WHERE reseller_user_id = $6 AND product_barcode = $7
                     RETURNING *`,
                    [
                        trimStr(req.body.product_sku, 128),
                        name,
                        Number.isFinite(reorder) ? reorder : 0,
                        Number.isFinite(qty) ? qty : 0,
                        trimStr(req.body.notes, 1000),
                        req.user.id,
                        barcode,
                    ],
                );
                if (updated.length) {
                    return res.json({ success: true, item: mapStock(updated[0]) });
                }
            }
            if (!rows.length) {
                const inserted = await query(
                    `INSERT INTO reseller_erp_stock_alerts (
                        reseller_user_id, product_barcode, product_sku, product_name,
                        reorder_level, current_qty, notes, updated_at
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
                     RETURNING *`,
                    [
                        req.user.id,
                        barcode,
                        trimStr(req.body.product_sku, 128),
                        name || barcode || 'Item',
                        Number.isFinite(reorder) ? reorder : 0,
                        Number.isFinite(qty) ? qty : 0,
                        trimStr(req.body.notes, 1000),
                    ],
                );
                return res.json({ success: true, item: mapStock(inserted[0]) });
            }
            res.json({ success: true, item: mapStock(rows[0]) });
        } catch (e) {
            console.error('erp stock upsert:', e);
            res.status(500).json({ error: e.message || 'Failed to save stock item' });
        }
    });

    app.delete('/api/reseller/erp/stock/:id', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            const rows = await query(
                `DELETE FROM reseller_erp_stock_alerts WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Stock item not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('erp stock delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete stock item' });
        }
    });

    // ——— Settings (GST, e-invoice, e-way, tally, digi, scanner prefs) ———
    app.get('/api/reseller/erp/settings', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1`,
                [req.user.id],
            );
            let settings = rows[0]?.settings ?? {};
            if (typeof settings === 'string') {
                try {
                    settings = JSON.parse(settings);
                } catch {
                    settings = {};
                }
            }
            res.json({ settings: settings && typeof settings === 'object' ? settings : {} });
        } catch (e) {
            console.error('erp settings get:', e);
            res.status(500).json({ error: e.message || 'Failed to load settings' });
        }
    });

    app.put('/api/reseller/erp/settings', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const incoming = req.body?.settings;
            if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
                return res.status(400).json({ error: 'settings object required' });
            }
            const existing = await query(
                `SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1`,
                [req.user.id],
            );
            let prev = existing[0]?.settings ?? {};
            if (typeof prev === 'string') {
                try {
                    prev = JSON.parse(prev);
                } catch {
                    prev = {};
                }
            }
            const merged = { ...(prev && typeof prev === 'object' ? prev : {}), ...incoming };
            // Never store raw secrets longer than needed — keep keys as strings max 512
            for (const key of Object.keys(merged)) {
                if (typeof merged[key] === 'string') {
                    merged[key] = merged[key].slice(0, 512);
                }
            }
            await query(
                `INSERT INTO reseller_erp_settings (reseller_user_id, settings, updated_at)
                 VALUES ($1, $2::jsonb, NOW())
                 ON CONFLICT (reseller_user_id) DO UPDATE
                 SET settings = $2::jsonb, updated_at = NOW()`,
                [req.user.id, JSON.stringify(merged)],
            );
            res.json({ success: true, settings: merged });
        } catch (e) {
            console.error('erp settings put:', e);
            res.status(500).json({ error: e.message || 'Failed to save settings' });
        }
    });

    // ——— Product lookup (barcode / SKU from live catalogue) ———
    app.get('/api/reseller/erp/products/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const code = String(req.query.code || req.query.barcode || '').trim();
            if (!code) return res.status(400).json({ error: 'code required' });

            const stockHit = await lookupStockPiece(query, req.user.id, code);
            if (stockHit?.piece) {
                const p = stockHit.piece;
                if (p.status === 'sold') {
                    const conflicts = await findSoldBarcodeConflicts(query, req.user.id, [code]);
                    const soldBill = conflicts[0]?.sold_bill || null;
                    return res.status(409).json({
                        error: soldBill
                            ? `This piece is already sold in bill ${soldBill.bill_number}`
                            : 'This piece is already sold',
                        availability: stockHit.availability,
                        sold_bill: soldBill,
                        conflicts,
                    });
                }
                if (p.status !== 'in_stock') {
                    return res.status(409).json({ error: `Piece status: ${p.status}` });
                }
                let imageUrl = p.image_url;
                if (!imageUrl) {
                    imageUrl = await lookupCatalogImageUrl(query, {
                        product_name: p.product_name,
                        sku: p.sku,
                        style_code: p.style_code,
                        item_code: p.item_code,
                        metal_type: p.metal_type,
                    });
                }
                return res.json({
                    source: 'stock_piece',
                    product: {
                        id: p.id,
                        barcode: p.barcode,
                        sku: p.sku,
                        style_code: p.style_code,
                        name: p.product_name,
                        product_name: p.product_name,
                        size: p.size,
                        net_weight: p.avg_weight,
                        gross_weight: p.avg_weight,
                        purity: p.purity,
                        wastage_pct: p.wastage_pct,
                        mc_rate: p.mc_rate,
                        mc_type: p.mc_type,
                        pcs: p.pcs,
                        box_charges: p.box_charges,
                        stone_charges: p.stone_charges,
                        metal_type: p.metal_type,
                        item_code: p.item_code,
                        image_url: imageUrl,
                        attr_color: p.attr_color,
                        attr_stone: p.attr_stone,
                        fixed_price: p.fixed_price,
                    },
                    availability: stockHit.availability,
                });
            }

            const priorSold = await findSoldBarcodeConflicts(query, req.user.id, [code]);
            if (priorSold.length) {
                const soldBill = priorSold[0]?.sold_bill || null;
                return res.status(409).json({
                    error: soldBill
                        ? `This piece is already sold in bill ${soldBill.bill_number}`
                        : 'This piece is already sold',
                    sold_bill: soldBill,
                    conflicts: priorSold,
                });
            }

            const rows = await query(
                `SELECT wp.barcode, wp.sku, wp.name, wp.image_url, wp.size,
                        wp.net_weight::float AS net_weight,
                        wp.gross_weight::float AS gross_weight,
                        wp.purity::float AS purity,
                        COALESCE(wp.wastage_pct, 0)::float AS wastage_pct,
                        COALESCE(wp.metal_type, 'silver') AS metal_type,
                        wp.mc_rate::float AS mc_rate, wp.mc_type,
                        COALESCE(wp.fixed_price, 0)::float AS fixed_price,
                        COALESCE(wp.box_charges, 0)::float AS box_charges,
                        COALESCE(wp.stone_charges, 0)::float AS stone_charges
                 FROM web_products wp
                 WHERE (wp.barcode = $1 OR wp.sku = $1)
                   AND (wp.is_active IS NULL OR wp.is_active = true)
                 LIMIT 1`,
                [code],
            );
            if (!rows.length) return res.status(404).json({ error: 'Product not found' });
            const p = rows[0];
            res.json({
                source: 'catalogue',
                product: {
                    barcode: p.barcode,
                    sku: p.sku,
                    name: p.name,
                    product_name: p.name,
                    size: p.size,
                    image_url: p.image_url,
                    net_weight: p.net_weight,
                    gross_weight: p.gross_weight,
                    purity: p.purity,
                    wastage_pct: p.wastage_pct,
                    metal_type: p.metal_type,
                    mc_rate: p.mc_rate,
                    mc_type: p.mc_type,
                    fixed_price: p.fixed_price,
                    box_charges: p.box_charges,
                    stone_charges: p.stone_charges,
                },
            });
        } catch (e) {
            console.error('erp product lookup:', e);
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    // ——— DigiGold / DigiSilver rates ———
    app.get('/api/reseller/erp/rates/digi', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT silver_per_gram, gold_24k_per_gram, gold_22k_per_gram, gold_18k_per_gram,
                        digi_silver_per_gram, digi_gold_24k_per_gram,
                        digi_gold_22k_per_gram, digi_gold_18k_per_gram, updated_at
                 FROM reseller_metal_rates WHERE user_id = $1`,
                [req.user.id],
            );
            res.json({ rates: rows[0] ?? null });
        } catch (e) {
            if (String(e.message || '').includes('digi_')) {
                return res.json({ rates: null });
            }
            console.error('erp digi rates:', e);
            res.status(500).json({ error: e.message || 'Failed to load digi rates' });
        }
    });

    // ——— Resolve catalogue images for ERP lines (SKU / style / product name) ———
    app.post('/api/reseller/erp/products/resolve-images', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const keys = Array.isArray(req.body.keys) ? req.body.keys : [];
            if (keys.length > 200) return res.status(400).json({ error: 'Max 200 keys per request' });
            const images = [];
            for (const k of keys) {
                const url = await lookupCatalogImageUrl(query, k);
                images.push(url);
            }
            res.json({ images });
        } catch (e) {
            console.error('erp resolve images:', e);
            res.status(500).json({ error: e.message || 'Failed to resolve images' });
        }
    });

    // ——— Upcoming birthdays / anniversaries (today or 1 day before only) ———
    app.get('/api/reseller/erp/customers/upcoming', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT id, name, mobile, birthdate, anniversary_date
                 FROM reseller_erp_customers
                 WHERE reseller_user_id = $1
                 ORDER BY name ASC`,
                [req.user.id],
            );
            const events = [];
            for (const c of rows) {
                if (c.birthdate) {
                    const d = daysUntilAnnualEvent(c.birthdate);
                    if (d === 0 || d === 1) {
                        events.push({
                            customer_id: c.id,
                            name: c.name,
                            mobile: c.mobile,
                            kind: 'birthday',
                            event_date: c.birthdate,
                            when: d === 0 ? 'today' : 'tomorrow',
                        });
                    }
                }
                if (c.anniversary_date) {
                    const d = daysUntilAnnualEvent(c.anniversary_date);
                    if (d === 0 || d === 1) {
                        events.push({
                            customer_id: c.id,
                            name: c.name,
                            mobile: c.mobile,
                            kind: 'anniversary',
                            event_date: c.anniversary_date,
                            when: d === 0 ? 'today' : 'tomorrow',
                        });
                    }
                }
            }
            events.sort((a, b) => {
                if (a.when !== b.when) return a.when === 'today' ? -1 : 1;
                return String(a.name).localeCompare(String(b.name));
            });
            res.json({ events, customers: rows.filter((c) =>
                events.some((e) => e.customer_id === c.id),
            ) });
        } catch (e) {
            console.error('erp customers upcoming:', e);
            res.status(500).json({ error: e.message || 'Failed to load upcoming dates' });
        }
    });

    // ——— Sales summary ———
    app.get('/api/reseller/erp/reports/sales', checkAuth, erpGate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT
                    COUNT(*)::int AS bill_count,
                    COALESCE(SUM(total_inr) FILTER (WHERE status IN ('completed','paid','final')), 0)::float AS completed_inr,
                    COALESCE(SUM(total_inr) FILTER (WHERE bill_type = 'credit'), 0)::float AS credit_inr,
                    COALESCE(SUM(total_inr) FILTER (WHERE bill_type = 'estimate'), 0)::float AS estimate_inr,
                    COALESCE(SUM(total_inr) FILTER (WHERE bill_type = 'order'), 0)::float AS order_inr,
                    COALESCE(SUM(total_inr), 0)::float AS total_inr
                 FROM reseller_erp_bills
                 WHERE reseller_user_id = $1
                   AND created_at >= NOW() - INTERVAL '30 days'`,
                [req.user.id],
            );
            const byType = await query(
                `SELECT bill_type, COUNT(*)::int AS n, COALESCE(SUM(total_inr),0)::float AS total
                 FROM reseller_erp_bills
                 WHERE reseller_user_id = $1
                   AND created_at >= NOW() - INTERVAL '30 days'
                 GROUP BY bill_type
                 ORDER BY total DESC`,
                [req.user.id],
            );
            const summary = rows[0] || {};
            const completed = Number(summary.completed_inr) || 0;
            const total = Number(summary.total_inr) || 0;
            res.json({
                period: '30d',
                summary: {
                    billCount: summary.bill_count ?? 0,
                    completedInr: completed,
                    creditInr: Number(summary.credit_inr) || 0,
                    estimateInr: Number(summary.estimate_inr) || 0,
                    orderInr: Number(summary.order_inr) || 0,
                    totalInr: total,
                    completionPct: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
                },
                byType,
            });
        } catch (e) {
            console.error('erp sales report:', e);
            res.status(500).json({ error: e.message || 'Failed to load sales report' });
        }
    });

    // ——— GST compliance (GSTZen e-invoice / e-way) ———
    app.get('/api/reseller/erp/compliance/status', checkAuth, erpGate, async (req, res) => {
        try {
            const settings = await loadErpSettings(query, req.user.id);
            const gstCheck = validateGstSettings(settings.gst || {});
            const einvoiceCfg = resolveEinvoiceConfig(settings);
            const ewayCfg = resolveEwayConfig(settings);
            res.json({
                gst: gstCheck,
                einvoice: {
                    configured: !!(einvoiceCfg.url && einvoiceCfg.token),
                    sandbox: einvoiceCfg.sandbox,
                    url: einvoiceCfg.url,
                },
                eway: {
                    configured: !!(ewayCfg.url && ewayCfg.token),
                    sandbox: ewayCfg.sandbox,
                    url: ewayCfg.url,
                },
            });
        } catch (e) {
            console.error('erp compliance status:', e);
            res.status(500).json({ error: e.message || 'Failed to load compliance status' });
        }
    });

    app.post('/api/reseller/erp/bills/:id/e-invoice', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!id) return res.status(400).json({ error: 'Bill id required' });

            const rows = await query(
                `SELECT * FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            const billRow = rows[0];
            if (String(billRow.bill_type || '').toLowerCase() !== 'sale') {
                return res.status(400).json({ error: 'E-invoice can only be generated for sales bills.' });
            }

            const existing = parseCompliance(billRow);
            if (existing?.einvoice?.irn) {
                return res.json({
                    success: true,
                    already_generated: true,
                    irn: existing.einvoice.irn,
                    bill: mapBill(billRow),
                });
            }

            let customer = null;
            if (billRow.customer_id) {
                const custRows = await query(
                    `SELECT * FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [billRow.customer_id, req.user.id],
                );
                customer = custRows[0] || null;
            }

            const bill = mapBill(billRow);
            const result = await generateEinvoiceForBill({
                query,
                bill,
                resellerUserId: req.user.id,
                customer,
            });

            res.json({
                success: true,
                irn: result.irn,
                ack_no: result.ackNo,
                ack_date: result.ackDt,
                sandbox: result.sandbox,
                bill: mapBill(result.bill),
                message: result.irn
                    ? `E-invoice generated. IRN: ${result.irn}`
                    : 'E-invoice submitted to GSTZen. Check response for details.',
            });
        } catch (e) {
            console.error('erp e-invoice:', e);
            res.status(e.status || 500).json({
                error: e.message || 'E-invoice generation failed',
                details: e.response || undefined,
            });
        }
    });

    app.post('/api/reseller/erp/bills/:id/e-way', checkAuth, erpGate, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!id) return res.status(400).json({ error: 'Bill id required' });

            const rows = await query(
                `SELECT * FROM reseller_erp_bills WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Bill not found' });
            const billRow = rows[0];
            if (String(billRow.bill_type || '').toLowerCase() !== 'sale') {
                return res.status(400).json({ error: 'E-way bill can only be generated for sales bills.' });
            }

            const existing = parseCompliance(billRow);
            if (existing?.eway?.ewb_no) {
                return res.json({
                    success: true,
                    already_generated: true,
                    ewb_no: existing.eway.ewb_no,
                    bill: mapBill(billRow),
                });
            }

            let customer = null;
            if (billRow.customer_id) {
                const custRows = await query(
                    `SELECT * FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [billRow.customer_id, req.user.id],
                );
                customer = custRows[0] || null;
            }

            const bill = mapBill(billRow);
            const result = await generateEwayForBill({
                query,
                bill,
                resellerUserId: req.user.id,
                customer,
            });

            res.json({
                success: true,
                ewb_no: result.ewbNo,
                sandbox: result.sandbox,
                bill: mapBill(result.bill),
                message: result.ewbNo
                    ? `E-way bill generated. Number: ${result.ewbNo}`
                    : 'E-way bill submitted to GSTZen. Check response for details.',
            });
        } catch (e) {
            console.error('erp e-way:', e);
            res.status(e.status || 500).json({
                error: e.message || 'E-way bill generation failed',
                details: e.response || undefined,
            });
        }
    });
}

module.exports = {
    ensureResellerErpSchema,
    resellerErpEnabled,
    requireResellerErp,
    registerResellerErpRoutes,
};

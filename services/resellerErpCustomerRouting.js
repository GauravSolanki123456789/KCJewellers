/**
 * Customer routing & staff management — counters, visit queue, analytics.
 */

const {
    getSessionOperator,
    operatorCanAccessModule,
    requireJainavUnlockedAdmin,
    requireErpOperatorAdmin,
} = require('./resellerErpOperators');

const ROUTING_MODULE = 'customer-routing';

function slugify(name) {
    const base = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 128);
    return base || 'counter';
}

async function ensureCustomerRoutingSchema(pool) {
    await pool.query(`
        ALTER TABLE reseller_erp_operators
            ADD COLUMN IF NOT EXISTS is_store_greeter BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS reseller_erp_store_counters (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(128) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            incharge_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, slug)
        );

        CREATE TABLE IF NOT EXISTS reseller_erp_customer_visits (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
            status VARCHAR(32) NOT NULL DEFAULT 'active',
            greeter_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reseller_erp_visit_queue (
            id SERIAL PRIMARY KEY,
            visit_id INTEGER NOT NULL REFERENCES reseller_erp_customer_visits(id) ON DELETE CASCADE,
            counter_id INTEGER NOT NULL REFERENCES reseller_erp_store_counters(id) ON DELETE CASCADE,
            status VARCHAR(24) NOT NULL DEFAULT 'waiting',
            queued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            assigned_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS reseller_erp_visit_interactions (
            id SERIAL PRIMARY KEY,
            visit_id INTEGER NOT NULL REFERENCES reseller_erp_customer_visits(id) ON DELETE CASCADE,
            queue_id INTEGER REFERENCES reseller_erp_visit_queue(id) ON DELETE SET NULL,
            counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
            operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            outcome VARCHAR(32) NOT NULL,
            bill_number VARCHAR(64),
            bill_amount_inr NUMERIC(14, 2),
            purchase_notes TEXT,
            no_sale_reason TEXT,
            forward_counter_id INTEGER REFERENCES reseller_erp_store_counters(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function routingGate() {
    return (req, res, next) => {
        const op = getSessionOperator(req);
        if (!op) {
            return res.status(401).json({ error: 'ERP sign-in required', code: 'ERP_OPERATOR_REQUIRED' });
        }
        if (!operatorCanAccessModule(op, ROUTING_MODULE) && op.role !== 'admin' && !op.fullAccess) {
            return res.status(403).json({ error: 'No access to customer routing module' });
        }
        req.erpOperator = op;
        next();
    };
}

async function loadOperatorFlags(query, userId, operatorId) {
    const rows = await query(
        `SELECT id, role, full_access, is_store_greeter FROM reseller_erp_operators
         WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
        [operatorId, userId],
    );
    return rows[0] || null;
}

function isAdminOp(op) {
    return op && (op.role === 'admin' || op.fullAccess);
}

async function mapCounterRow(query, userId, row) {
    let incharge = null;
    if (row.incharge_operator_id) {
        const ops = await query(
            `SELECT id, display_name, username FROM reseller_erp_operators
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [row.incharge_operator_id, userId],
        );
        if (ops.length) {
            incharge = {
                id: ops[0].id,
                displayName: ops[0].display_name || ops[0].username,
            };
        }
    }
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        sort_order: row.sort_order,
        is_active: !!row.is_active,
        incharge_operator_id: row.incharge_operator_id,
        incharge,
    };
}

async function getVisitContext(query, userId, visitId) {
    const rows = await query(
        `SELECT v.*, c.name AS customer_name, c.mobile AS customer_mobile
         FROM reseller_erp_customer_visits v
         JOIN reseller_erp_customers c ON c.id = v.customer_id
         WHERE v.id = $1 AND v.reseller_user_id = $2 LIMIT 1`,
        [visitId, userId],
    );
    return rows[0] || null;
}

function registerResellerErpCustomerRoutingRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;
    const gate = routingGate();
    const jainavDelete = requireJainavUnlockedAdmin();
    const adminOnly = requireErpOperatorAdmin();

    ensureCustomerRoutingSchema(pool).catch((e) =>
        console.warn('customer routing schema:', e.message),
    );

    app.get('/api/reseller/erp/customer-routing/bootstrap', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const op = req.erpOperator;
            const flags = await loadOperatorFlags(query, req.user.id, op.id);
            const greeterRows = await query(
                `SELECT id, display_name, username FROM reseller_erp_operators
                 WHERE reseller_user_id = $1 AND is_active = true AND is_store_greeter = true
                 LIMIT 1`,
                [req.user.id],
            );
            const counters = await query(
                `SELECT * FROM reseller_erp_store_counters
                 WHERE reseller_user_id = $1 AND is_active = true
                 ORDER BY sort_order, name`,
                [req.user.id],
            );
            const mapped = [];
            for (const c of counters) {
                mapped.push(await mapCounterRow(query, req.user.id, c));
            }
            const myCounters = mapped.filter((c) => c.incharge_operator_id === op.id);
            res.json({
                role: isAdminOp(op)
                    ? 'admin'
                    : flags?.is_store_greeter
                      ? 'greeter'
                      : myCounters.length
                        ? 'counter'
                        : 'viewer',
                greeter: greeterRows[0]
                    ? {
                          id: greeterRows[0].id,
                          displayName: greeterRows[0].display_name || greeterRows[0].username,
                      }
                    : null,
                counters: mapped,
                myCounterIds: myCounters.map((c) => c.id),
            });
        } catch (e) {
            console.error('routing bootstrap:', e);
            res.status(500).json({ error: e.message || 'Failed to load routing' });
        }
    });

    app.get('/api/reseller/erp/customer-routing/counters', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT * FROM reseller_erp_store_counters
                 WHERE reseller_user_id = $1 ORDER BY sort_order, name`,
                [req.user.id],
            );
            const counters = [];
            for (const r of rows) counters.push(await mapCounterRow(query, req.user.id, r));
            res.json({ counters });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load counters' });
        }
    });

    app.post(
        '/api/reseller/erp/customer-routing/counters',
        checkAuth,
        erpGate,
        gate,
        adminOnly,
        requireJson,
        async (req, res) => {
            try {
                const name = String(req.body.name || '').trim().slice(0, 255);
                if (!name) return res.status(400).json({ error: 'Counter name required' });
                const slug = slugify(name);
                const ins = await query(
                    `INSERT INTO reseller_erp_store_counters (reseller_user_id, name, slug)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (reseller_user_id, slug) DO UPDATE SET
                        name = EXCLUDED.name,
                        is_active = true,
                        updated_at = CURRENT_TIMESTAMP
                     RETURNING *`,
                    [req.user.id, name, slug],
                );
                res.json({ counter: await mapCounterRow(query, req.user.id, ins[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to create counter' });
            }
        },
    );

    app.patch(
        '/api/reseller/erp/customer-routing/counters/:id',
        checkAuth,
        erpGate,
        gate,
        adminOnly,
        requireJson,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                const name = req.body.name != null ? String(req.body.name).trim().slice(0, 255) : null;
                const incharge =
                    req.body.incharge_operator_id !== undefined
                        ? parseInt(String(req.body.incharge_operator_id), 10) || null
                        : undefined;
                const isActive = req.body.is_active;
                const sets = [];
                const params = [req.user.id, id];
                if (name) {
                    params.push(name);
                    sets.push(`name = $${params.length}`);
                    params.push(slugify(name));
                    sets.push(`slug = $${params.length}`);
                }
                if (incharge !== undefined) {
                    params.push(incharge);
                    sets.push(`incharge_operator_id = $${params.length}`);
                }
                if (typeof isActive === 'boolean') {
                    params.push(isActive);
                    sets.push(`is_active = $${params.length}`);
                }
                if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
                sets.push('updated_at = CURRENT_TIMESTAMP');
                const rows = await query(
                    `UPDATE reseller_erp_store_counters SET ${sets.join(', ')}
                     WHERE reseller_user_id = $1 AND id = $2 RETURNING *`,
                    params,
                );
                if (!rows.length) return res.status(404).json({ error: 'Counter not found' });
                res.json({ counter: await mapCounterRow(query, req.user.id, rows[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to update counter' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/customer-routing/counters/:id',
        checkAuth,
        erpGate,
        gate,
        adminOnly,
        jainavDelete,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                await query(
                    `UPDATE reseller_erp_store_counters SET is_active = false, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [id, req.user.id],
                );
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete counter' });
            }
        },
    );

    app.put(
        '/api/reseller/erp/customer-routing/greeter',
        checkAuth,
        erpGate,
        gate,
        adminOnly,
        requireJson,
        async (req, res) => {
            try {
                const operatorId = parseInt(String(req.body.operator_id), 10);
                if (!Number.isFinite(operatorId)) {
                    return res.status(400).json({ error: 'operator_id required' });
                }
                await query(
                    `UPDATE reseller_erp_operators SET is_store_greeter = false
                     WHERE reseller_user_id = $1`,
                    [req.user.id],
                );
                await query(
                    `UPDATE reseller_erp_operators SET is_store_greeter = true, updated_at = NOW()
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [operatorId, req.user.id],
                );
                res.json({ success: true, operator_id: operatorId });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to set greeter' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/customer-routing/visits',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const flags = await loadOperatorFlags(query, req.user.id, op.id);
                if (!isAdminOp(op) && !flags?.is_store_greeter) {
                    return res.status(403).json({ error: 'Only greeter or admin can start visits' });
                }
                const customerId = parseInt(String(req.body.customer_id), 10);
                if (!Number.isFinite(customerId)) {
                    return res.status(400).json({ error: 'customer_id required' });
                }
                const cust = await query(
                    `SELECT id FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [customerId, req.user.id],
                );
                if (!cust.length) return res.status(404).json({ error: 'Customer not found' });
                const ins = await query(
                    `INSERT INTO reseller_erp_customer_visits (
                        reseller_user_id, customer_id, greeter_operator_id, notes
                     ) VALUES ($1, $2, $3, $4) RETURNING id`,
                    [
                        req.user.id,
                        customerId,
                        op.id,
                        String(req.body.notes || '').trim().slice(0, 2000) || null,
                    ],
                );
                res.json({ visit_id: ins[0].id });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to create visit' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/customer-routing/queue',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const flags = await loadOperatorFlags(query, req.user.id, op.id);
                if (!isAdminOp(op) && !flags?.is_store_greeter) {
                    return res.status(403).json({ error: 'Only greeter or admin can route customers' });
                }
                let visitId = parseInt(String(req.body.visit_id), 10);
                const customerId = parseInt(String(req.body.customer_id), 10);
                const counterId = parseInt(String(req.body.counter_id), 10);
                if (!Number.isFinite(counterId)) {
                    return res.status(400).json({ error: 'counter_id required' });
                }
                if (!Number.isFinite(visitId) && Number.isFinite(customerId)) {
                    const ins = await query(
                        `INSERT INTO reseller_erp_customer_visits (
                            reseller_user_id, customer_id, greeter_operator_id
                         ) VALUES ($1, $2, $3) RETURNING id`,
                        [req.user.id, customerId, op.id],
                    );
                    visitId = ins[0].id;
                }
                if (!Number.isFinite(visitId)) {
                    return res.status(400).json({ error: 'visit_id or customer_id required' });
                }
                const visit = await getVisitContext(query, req.user.id, visitId);
                if (!visit) return res.status(404).json({ error: 'Visit not found' });
                if (visit.status !== 'active') {
                    return res.status(400).json({ error: 'Visit is not active' });
                }
                const counter = await query(
                    `SELECT id, incharge_operator_id FROM reseller_erp_store_counters
                     WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
                    [counterId, req.user.id],
                );
                if (!counter.length) return res.status(404).json({ error: 'Counter not found' });
                const q = await query(
                    `INSERT INTO reseller_erp_visit_queue (
                        visit_id, counter_id, assigned_operator_id, status
                     ) VALUES ($1, $2, $3, 'waiting') RETURNING *`,
                    [visitId, counterId, counter[0].incharge_operator_id || null],
                );
                res.json({ queue: q[0], visit_id: visitId });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to queue customer' });
            }
        },
    );

    app.get('/api/reseller/erp/customer-routing/queue/live', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const op = req.erpOperator;
            const counterId = parseInt(String(req.query.counter_id || ''), 10);
            let counterIds = [];
            if (Number.isFinite(counterId)) {
                counterIds = [counterId];
            } else {
                const rows = await query(
                    `SELECT id FROM reseller_erp_store_counters
                     WHERE reseller_user_id = $1 AND is_active = true
                       AND incharge_operator_id = $2`,
                    [req.user.id, op.id],
                );
                counterIds = rows.map((r) => r.id);
            }
            if (!counterIds.length && isAdminOp(op)) {
                const all = await query(
                    `SELECT id FROM reseller_erp_store_counters
                     WHERE reseller_user_id = $1 AND is_active = true`,
                    [req.user.id],
                );
                counterIds = all.map((r) => r.id);
            }
            if (!counterIds.length) {
                return res.json({ queue: [] });
            }
            const items = await query(
                `SELECT q.*, v.customer_id, c.name AS customer_name, c.mobile AS customer_mobile,
                        sc.name AS counter_name
                 FROM reseller_erp_visit_queue q
                 JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
                 JOIN reseller_erp_customers c ON c.id = v.customer_id
                 JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
                 WHERE q.counter_id = ANY($1::int[])
                   AND q.status IN ('waiting', 'serving')
                   AND v.reseller_user_id = $2
                 ORDER BY q.queued_at ASC`,
                [counterIds, req.user.id],
            );
            res.json({ queue: items });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load queue' });
        }
    });

    app.post(
        '/api/reseller/erp/customer-routing/queue/:id/start',
        checkAuth,
        erpGate,
        gate,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const qid = parseInt(String(req.params.id), 10);
                const rows = await query(
                    `SELECT q.*, sc.incharge_operator_id
                     FROM reseller_erp_visit_queue q
                     JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
                     JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
                     WHERE q.id = $1 AND v.reseller_user_id = $2 LIMIT 1`,
                    [qid, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Queue item not found' });
                const row = rows[0];
                if (!isAdminOp(op) && row.incharge_operator_id !== op.id) {
                    return res.status(403).json({ error: 'Not incharge of this counter' });
                }
                await query(
                    `UPDATE reseller_erp_visit_queue SET status = 'serving', started_at = COALESCE(started_at, NOW()),
                     assigned_operator_id = $2 WHERE id = $1`,
                    [qid, op.id],
                );
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to start serving' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/customer-routing/queue/:id/complete',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const qid = parseInt(String(req.params.id), 10);
                const outcome = String(req.body.outcome || '').trim();
                const allowed = ['sale_closed', 'forward', 'no_sale', 'sale_and_forward', 'left_shop'];
                if (!allowed.includes(outcome)) {
                    return res.status(400).json({ error: 'Invalid outcome' });
                }
                const rows = await query(
                    `SELECT q.*, v.id AS visit_id, v.status AS visit_status, sc.incharge_operator_id
                     FROM reseller_erp_visit_queue q
                     JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
                     JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
                     WHERE q.id = $1 AND v.reseller_user_id = $2 LIMIT 1`,
                    [qid, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Queue item not found' });
                const row = rows[0];
                if (!isAdminOp(op) && row.incharge_operator_id !== op.id) {
                    return res.status(403).json({ error: 'Not incharge of this counter' });
                }
                if (outcome === 'no_sale' || outcome === 'left_shop') {
                    const reason = String(req.body.no_sale_reason || '').trim();
                    if (!reason) {
                        return res.status(400).json({ error: 'Reason for not buying is required' });
                    }
                }
                const forwardId =
                    outcome === 'forward' || outcome === 'sale_and_forward'
                        ? parseInt(String(req.body.forward_counter_id), 10)
                        : null;
                if ((outcome === 'forward' || outcome === 'sale_and_forward') && !Number.isFinite(forwardId)) {
                    return res.status(400).json({ error: 'forward_counter_id required' });
                }
                const billAmount = parseFloat(String(req.body.bill_amount_inr || '').replace(/,/g, ''));
                await query(
                    `INSERT INTO reseller_erp_visit_interactions (
                        visit_id, queue_id, counter_id, operator_id, outcome,
                        bill_number, bill_amount_inr, purchase_notes, no_sale_reason, forward_counter_id
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                    [
                        row.visit_id,
                        qid,
                        row.counter_id,
                        op.id,
                        outcome,
                        String(req.body.bill_number || '').trim().slice(0, 64) || null,
                        Number.isFinite(billAmount) ? billAmount : null,
                        String(req.body.purchase_notes || '').trim().slice(0, 2000) || null,
                        String(req.body.no_sale_reason || '').trim().slice(0, 2000) || null,
                        Number.isFinite(forwardId) ? forwardId : null,
                    ],
                );
                await query(
                    `UPDATE reseller_erp_visit_queue SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                    [qid],
                );
                if (forwardId) {
                    const ctr = await query(
                        `SELECT incharge_operator_id FROM reseller_erp_store_counters
                         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                        [forwardId, req.user.id],
                    );
                    await query(
                        `INSERT INTO reseller_erp_visit_queue (
                            visit_id, counter_id, assigned_operator_id, status
                         ) VALUES ($1, $2, $3, 'waiting')`,
                        [
                            row.visit_id,
                            forwardId,
                            ctr[0]?.incharge_operator_id || null,
                        ],
                    );
                }
                if (outcome === 'left_shop' || outcome === 'no_sale') {
                    const pending = await query(
                        `SELECT COUNT(*)::int AS n FROM reseller_erp_visit_queue
                         WHERE visit_id = $1 AND status IN ('waiting', 'serving')`,
                        [row.visit_id],
                    );
                    if ((pending[0]?.n ?? 0) === 0) {
                        await query(
                            `UPDATE reseller_erp_customer_visits SET status = 'completed', ended_at = NOW()
                             WHERE id = $1`,
                            [row.visit_id],
                        );
                    }
                }
                res.json({ success: true });
            } catch (e) {
                console.error('queue complete:', e);
                res.status(500).json({ error: e.message || 'Failed to complete interaction' });
            }
        },
    );

    app.get('/api/reseller/erp/customer-routing/analytics', checkAuth, erpGate, gate, adminOnly, async (req, res) => {
        try {
            const from = String(req.query.from || '').trim().slice(0, 10);
            const to = String(req.query.to || '').trim().slice(0, 10);
            const operatorId = parseInt(String(req.query.operator_id || ''), 10);
            const params = [req.user.id];
            let dateFilter = '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
                params.push(from);
                dateFilter += ` AND i.created_at >= $${params.length}::date`;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
                params.push(to);
                dateFilter += ` AND i.created_at < ($${params.length}::date + interval '1 day')`;
            }
            let opFilter = '';
            if (Number.isFinite(operatorId)) {
                params.push(operatorId);
                opFilter = ` AND i.operator_id = $${params.length}`;
            }
            const summary = await query(
                `SELECT i.operator_id, o.display_name, o.username, i.counter_id, sc.name AS counter_name,
                        COUNT(*)::int AS interactions,
                        COUNT(*) FILTER (WHERE i.outcome IN ('sale_closed', 'sale_and_forward'))::int AS sales,
                        COUNT(*) FILTER (WHERE i.outcome IN ('no_sale', 'left_shop'))::int AS no_sales,
                        COUNT(*) FILTER (WHERE i.outcome = 'forward')::int AS forwards_only
                 FROM reseller_erp_visit_interactions i
                 LEFT JOIN reseller_erp_operators o ON o.id = i.operator_id
                 LEFT JOIN reseller_erp_store_counters sc ON sc.id = i.counter_id
                 WHERE EXISTS (
                    SELECT 1 FROM reseller_erp_customer_visits v
                    WHERE v.id = i.visit_id AND v.reseller_user_id = $1
                 ) ${dateFilter} ${opFilter}
                 GROUP BY i.operator_id, o.display_name, o.username, i.counter_id, sc.name
                 ORDER BY interactions DESC`,
                params,
            );
            const reasons = await query(
                `SELECT COALESCE(NULLIF(TRIM(i.no_sale_reason), ''), 'Unspecified') AS reason,
                        COUNT(*)::int AS count
                 FROM reseller_erp_visit_interactions i
                 WHERE EXISTS (
                    SELECT 1 FROM reseller_erp_customer_visits v
                    WHERE v.id = i.visit_id AND v.reseller_user_id = $1
                 )
                 AND i.outcome IN ('no_sale', 'left_shop') ${dateFilter}
                 GROUP BY 1 ORDER BY count DESC LIMIT 50`,
                params.slice(0, dateFilter ? params.length : 1),
            );
            const routed = await query(
                `SELECT sc.name AS counter_name, COUNT(*)::int AS routed
                 FROM reseller_erp_visit_queue q
                 JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
                 JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
                 WHERE v.reseller_user_id = $1
                 ${from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? `AND q.queued_at >= '${from}'::date` : ''}
                 ${to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? `AND q.queued_at < ('${to}'::date + interval '1 day')` : ''}
                 GROUP BY sc.name ORDER BY routed DESC`,
                [req.user.id],
            );
            res.json({
                summary: summary.map((r) => ({
                    ...r,
                    conversion_pct:
                        r.interactions > 0
                            ? Math.round((r.sales / r.interactions) * 1000) / 10
                            : 0,
                })),
                lost_sale_reasons: reasons,
                routed_by_counter: routed,
            });
        } catch (e) {
            console.error('routing analytics:', e);
            res.status(500).json({ error: e.message || 'Failed to load analytics' });
        }
    });

    app.get(
        '/api/reseller/erp/customer-routing/visits/:id/timeline',
        checkAuth,
        erpGate,
        gate,
        adminOnly,
        async (req, res) => {
            try {
                const visitId = parseInt(String(req.params.id), 10);
                const visit = await getVisitContext(query, req.user.id, visitId);
                if (!visit) return res.status(404).json({ error: 'Visit not found' });
                const interactions = await query(
                    `SELECT i.*, sc.name AS counter_name, fc.name AS forward_counter_name,
                            o.display_name AS operator_name
                     FROM reseller_erp_visit_interactions i
                     LEFT JOIN reseller_erp_store_counters sc ON sc.id = i.counter_id
                     LEFT JOIN reseller_erp_store_counters fc ON fc.id = i.forward_counter_id
                     LEFT JOIN reseller_erp_operators o ON o.id = i.operator_id
                     WHERE i.visit_id = $1 ORDER BY i.created_at ASC`,
                    [visitId],
                );
                const queue = await query(
                    `SELECT q.*, sc.name AS counter_name FROM reseller_erp_visit_queue q
                     JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
                     WHERE q.visit_id = $1 ORDER BY q.queued_at ASC`,
                    [visitId],
                );
                res.json({
                    visit: {
                        id: visit.id,
                        customer_name: visit.customer_name,
                        customer_mobile: visit.customer_mobile,
                        status: visit.status,
                        started_at: visit.started_at,
                        ended_at: visit.ended_at,
                    },
                    queue,
                    interactions,
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to load timeline' });
            }
        },
    );

    app.get('/api/reseller/erp/customer-routing/visits/active', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT v.id, v.customer_id, v.started_at, c.name AS customer_name, c.mobile AS customer_mobile
                 FROM reseller_erp_customer_visits v
                 JOIN reseller_erp_customers c ON c.id = v.customer_id
                 WHERE v.reseller_user_id = $1 AND v.status = 'active'
                 ORDER BY v.started_at DESC LIMIT 100`,
                [req.user.id],
            );
            res.json({ visits: rows });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load visits' });
        }
    });
}

module.exports = {
    ensureCustomerRoutingSchema,
    registerResellerErpCustomerRoutingRoutes,
};

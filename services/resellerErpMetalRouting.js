/**
 * Metal routing — counters, purities, stock lots (grams), reports.
 */

const {
    getSessionOperator,
    operatorCanAccessModule,
    requireErpOperatorAdmin,
} = require('./resellerErpOperators');

const ROUTING_MODULE = 'metal-routing';

function slugify(name) {
    const base = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 128);
    return base || 'counter';
}

async function ensureMetalRoutingSchema(pool) {
    await pool.query(`
        ALTER TABLE reseller_erp_operators
            ADD COLUMN IF NOT EXISTS is_metal_routing_manager BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS reseller_erp_metal_routing_counters (
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

        CREATE TABLE IF NOT EXISTS reseller_erp_metal_purities (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metal_type VARCHAR(16) NOT NULL DEFAULT 'silver',
            label VARCHAR(64) NOT NULL,
            default_charge_pct NUMERIC(8, 4),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_purities_label
            ON reseller_erp_metal_purities (reseller_user_id, metal_type, lower(trim(label)));

        CREATE TABLE IF NOT EXISTS reseller_erp_metal_stock_lots (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metal_type VARCHAR(16) NOT NULL,
            purity_id INTEGER REFERENCES reseller_erp_metal_purities(id) ON DELETE SET NULL,
            counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
            operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            parent_lot_id INTEGER REFERENCES reseller_erp_metal_stock_lots(id) ON DELETE SET NULL,
            gross_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
            charge_pct NUMERIC(8, 4),
            pure_gm NUMERIC(14, 3) NOT NULL DEFAULT 0,
            status VARCHAR(16) NOT NULL DEFAULT 'active',
            notes TEXT,
            move_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_metal_stock_lots_reseller
            ON reseller_erp_metal_stock_lots (reseller_user_id, metal_type, status);

        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS metal_type VARCHAR(16) NOT NULL DEFAULT 'silver';
        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS default_charge_pct NUMERIC(8, 4);
        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE reseller_erp_metal_purities
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS charge_pct NUMERIC(8, 4);
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS pure_gm NUMERIC(14, 3) NOT NULL DEFAULT 0;
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS move_date DATE NOT NULL DEFAULT CURRENT_DATE;
    `);
}

/** Append optional metal / counter filters; startIdx is the next $n placeholder index. */
function appendMetalRoutingReportFilters(metalType, counterFilter, startIdx) {
    let idx = startIdx;
    const extraParams = [];
    let metalClause = '';
    let counterClause = '';
    if (metalType === 'gold' || metalType === 'silver') {
        extraParams.push(metalType);
        metalClause = ` AND l.metal_type = $${idx}`;
        idx += 1;
    }
    if (counterFilter && counterFilter.length) {
        extraParams.push(counterFilter);
        counterClause = ` AND l.counter_id = ANY($${idx}::int[])`;
        idx += 1;
    }
    return { metalClause, counterClause, extraParams };
}

function routingGate() {
    return (req, res, next) => {
        const op = getSessionOperator(req);
        if (!op) {
            return res.status(401).json({ error: 'ERP sign-in required', code: 'ERP_OPERATOR_REQUIRED' });
        }
        if (!operatorCanAccessModule(op, ROUTING_MODULE) && op.role !== 'admin' && !op.fullAccess) {
            return res.status(403).json({ error: 'No access to metal routing module' });
        }
        req.erpOperator = op;
        next();
    };
}

function isAdminOp(op) {
    return op && (op.role === 'admin' || op.fullAccess);
}

async function loadOperatorFlags(query, userId, operatorId) {
    const rows = await query(
        `SELECT id, role, full_access, is_metal_routing_manager FROM reseller_erp_operators
         WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
        [operatorId, userId],
    );
    return rows[0] || null;
}

async function canManageMetalRouting(query, userId, op) {
    if (isAdminOp(op)) return true;
    const flags = await loadOperatorFlags(query, userId, op.id);
    return !!flags?.is_metal_routing_manager;
}

function parseNum(v, fallback = null) {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function roundGm(n) {
    return Math.round(Number(n) * 1000) / 1000;
}

async function resolveChargePct(query, userId, purityId, bodyPct) {
    const fromBody = parseNum(bodyPct);
    if (fromBody != null) return fromBody;
    if (purityId) {
        const rows = await query(
            `SELECT default_charge_pct FROM reseller_erp_metal_purities
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [purityId, userId],
        );
        if (rows.length && rows[0].default_charge_pct != null) {
            return Number(rows[0].default_charge_pct);
        }
    }
    return 100;
}

function computePureGm(grossGm, chargePct) {
    const g = Number(grossGm) || 0;
    const pct = Number(chargePct);
    const effective = Number.isFinite(pct) ? pct : 100;
    return roundGm(g * (effective / 100));
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

function mapPurityRow(row) {
    return {
        id: row.id,
        metal_type: row.metal_type,
        label: row.label,
        default_charge_pct:
            row.default_charge_pct != null ? Number(row.default_charge_pct) : null,
        sort_order: row.sort_order,
        is_active: !!row.is_active,
    };
}

async function mapLotRow(query, userId, row) {
    let purity = null;
    let counter = null;
    let operator = null;
    if (row.purity_id) {
        const p = await query(
            `SELECT id, label, metal_type FROM reseller_erp_metal_purities
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [row.purity_id, userId],
        );
        if (p.length) purity = { id: p[0].id, label: p[0].label, metal_type: p[0].metal_type };
    }
    if (row.counter_id) {
        const c = await query(
            `SELECT id, name FROM reseller_erp_metal_routing_counters
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [row.counter_id, userId],
        );
        if (c.length) counter = { id: c[0].id, name: c[0].name };
    }
    if (row.operator_id) {
        const o = await query(
            `SELECT id, display_name, username FROM reseller_erp_operators
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [row.operator_id, userId],
        );
        if (o.length) {
            operator = {
                id: o[0].id,
                displayName: o[0].display_name || o[0].username,
            };
        }
    }
    return {
        id: row.id,
        metal_type: row.metal_type,
        purity_id: row.purity_id,
        purity,
        counter_id: row.counter_id,
        counter,
        operator_id: row.operator_id,
        operator,
        parent_lot_id: row.parent_lot_id,
        gross_gm: Number(row.gross_gm),
        charge_pct: row.charge_pct != null ? Number(row.charge_pct) : null,
        pure_gm: Number(row.pure_gm),
        status: row.status,
        notes: row.notes,
        move_date: row.move_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function staffCounterIds(query, userId, operatorId) {
    const rows = await query(
        `SELECT id FROM reseller_erp_metal_routing_counters
         WHERE reseller_user_id = $1 AND is_active = true AND incharge_operator_id = $2`,
        [userId, operatorId],
    );
    return rows.map((r) => r.id);
}

function registerResellerErpMetalRoutingRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate } = deps;
    const gate = routingGate();
    const adminOnly = requireErpOperatorAdmin();

    const managerOrAdmin = async (req, res, next) => {
        try {
            const allowed = await canManageMetalRouting(query, req.user.id, req.erpOperator);
            if (!allowed) {
                return res.status(403).json({ error: 'Metal routing manager or admin required' });
            }
            next();
        } catch (e) {
            res.status(500).json({ error: e.message || 'Authorization failed' });
        }
    };

    ensureMetalRoutingSchema(pool).catch((e) =>
        console.warn('metal routing schema:', e.message),
    );

    app.get('/api/reseller/erp/metal-routing/bootstrap', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const op = req.erpOperator;
            const flags = await loadOperatorFlags(query, req.user.id, op.id);
            const managerRows = await query(
                `SELECT id, display_name, username FROM reseller_erp_operators
                 WHERE reseller_user_id = $1 AND is_active = true AND is_metal_routing_manager = true
                 LIMIT 1`,
                [req.user.id],
            );
            const counters = await query(
                `SELECT * FROM reseller_erp_metal_routing_counters
                 WHERE reseller_user_id = $1 AND is_active = true
                 ORDER BY sort_order, name`,
                [req.user.id],
            );
            const mapped = [];
            for (const c of counters) {
                mapped.push(await mapCounterRow(query, req.user.id, c));
            }
            const myCounters = mapped.filter((c) => c.incharge_operator_id === op.id);
            const isManager = !!flags?.is_metal_routing_manager;
            res.json({
                role: isAdminOp(op)
                    ? 'admin'
                    : isManager
                      ? 'manager'
                      : myCounters.length
                        ? 'counter'
                        : 'viewer',
                manager: managerRows[0]
                    ? {
                          id: managerRows[0].id,
                          displayName: managerRows[0].display_name || managerRows[0].username,
                      }
                    : null,
                counters: mapped,
                myCounterIds: myCounters.map((c) => c.id),
                isMetalRoutingManager: isManager,
            });
        } catch (e) {
            console.error('metal routing bootstrap:', e);
            res.status(500).json({ error: e.message || 'Failed to load metal routing' });
        }
    });

    app.get('/api/reseller/erp/metal-routing/counters', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT * FROM reseller_erp_metal_routing_counters
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
        '/api/reseller/erp/metal-routing/counters',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const name = String(req.body.name || '').trim().slice(0, 255);
                if (!name) return res.status(400).json({ error: 'Counter name required' });
                const slug = slugify(name);
                const ins = await query(
                    `INSERT INTO reseller_erp_metal_routing_counters (reseller_user_id, name, slug)
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
        '/api/reseller/erp/metal-routing/counters/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
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
                    `UPDATE reseller_erp_metal_routing_counters SET ${sets.join(', ')}
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
        '/api/reseller/erp/metal-routing/counters/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                await query(
                    `UPDATE reseller_erp_metal_routing_counters SET is_active = false, updated_at = CURRENT_TIMESTAMP
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
        '/api/reseller/erp/metal-routing/manager',
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
                    `UPDATE reseller_erp_operators SET is_metal_routing_manager = false
                     WHERE reseller_user_id = $1`,
                    [req.user.id],
                );
                await query(
                    `UPDATE reseller_erp_operators SET is_metal_routing_manager = true, updated_at = NOW()
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [operatorId, req.user.id],
                );
                res.json({ success: true, operator_id: operatorId });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to set manager' });
            }
        },
    );

    app.get('/api/reseller/erp/metal-routing/purities', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const metalType = String(req.query.metal_type || '').trim().toLowerCase();
            let sql = `SELECT * FROM reseller_erp_metal_purities WHERE reseller_user_id = $1`;
            const params = [req.user.id];
            if (metalType === 'gold' || metalType === 'silver') {
                params.push(metalType);
                sql += ` AND metal_type = $${params.length}`;
            }
            sql += ` ORDER BY metal_type, sort_order, label`;
            const rows = await query(sql, params);
            res.json({ purities: rows.map(mapPurityRow) });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load purities' });
        }
    });

    app.post(
        '/api/reseller/erp/metal-routing/purities',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const metalType = String(req.body.metal_type || 'silver').toLowerCase();
                if (metalType !== 'gold' && metalType !== 'silver') {
                    return res.status(400).json({ error: 'metal_type must be gold or silver' });
                }
                const label = String(req.body.label || '').trim().slice(0, 64);
                if (!label) return res.status(400).json({ error: 'label required' });
                const defaultCharge = parseNum(req.body.default_charge_pct);
                const sortOrder = parseInt(String(req.body.sort_order ?? 0), 10) || 0;
                const existing = await query(
                    `SELECT id FROM reseller_erp_metal_purities
                     WHERE reseller_user_id = $1 AND metal_type = $2 AND lower(trim(label)) = lower(trim($3))
                     LIMIT 1`,
                    [req.user.id, metalType, label],
                );
                if (existing.length) {
                    const updated = await query(
                        `UPDATE reseller_erp_metal_purities SET
                            default_charge_pct = COALESCE($2, default_charge_pct),
                            sort_order = $3,
                            is_active = true,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1 RETURNING *`,
                        [existing[0].id, defaultCharge, sortOrder],
                    );
                    return res.json({ purity: mapPurityRow(updated[0]) });
                }
                const ins = await query(
                    `INSERT INTO reseller_erp_metal_purities (
                        reseller_user_id, metal_type, label, default_charge_pct, sort_order
                     ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                    [req.user.id, metalType, label, defaultCharge, sortOrder],
                );
                res.json({ purity: mapPurityRow(ins[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to create purity' });
            }
        },
    );

    app.patch(
        '/api/reseller/erp/metal-routing/purities/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                const label = req.body.label != null ? String(req.body.label).trim().slice(0, 64) : null;
                const defaultCharge =
                    req.body.default_charge_pct !== undefined
                        ? parseNum(req.body.default_charge_pct)
                        : undefined;
                const sortOrder =
                    req.body.sort_order !== undefined
                        ? parseInt(String(req.body.sort_order), 10) || 0
                        : undefined;
                const isActive = req.body.is_active;
                const sets = [];
                const params = [req.user.id, id];
                if (label) {
                    params.push(label);
                    sets.push(`label = $${params.length}`);
                }
                if (defaultCharge !== undefined) {
                    params.push(defaultCharge);
                    sets.push(`default_charge_pct = $${params.length}`);
                }
                if (sortOrder !== undefined) {
                    params.push(sortOrder);
                    sets.push(`sort_order = $${params.length}`);
                }
                if (typeof isActive === 'boolean') {
                    params.push(isActive);
                    sets.push(`is_active = $${params.length}`);
                }
                if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
                sets.push('updated_at = CURRENT_TIMESTAMP');
                const rows = await query(
                    `UPDATE reseller_erp_metal_purities SET ${sets.join(', ')}
                     WHERE reseller_user_id = $1 AND id = $2 RETURNING *`,
                    params,
                );
                if (!rows.length) return res.status(404).json({ error: 'Purity not found' });
                res.json({ purity: mapPurityRow(rows[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to update purity' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/metal-routing/purities/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                await query(
                    `UPDATE reseller_erp_metal_purities SET is_active = false, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [id, req.user.id],
                );
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete purity' });
            }
        },
    );

    app.get('/api/reseller/erp/metal-routing/lots', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const op = req.erpOperator;
            const metalType = String(req.query.metal_type || '').trim().toLowerCase();
            const counterId = parseInt(String(req.query.counter_id || ''), 10);
            const status = String(req.query.status || 'active').trim().toLowerCase();
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_erp_metal_stock_lots WHERE reseller_user_id = $1`;
            if (metalType === 'gold' || metalType === 'silver') {
                params.push(metalType);
                sql += ` AND metal_type = $${params.length}`;
            }
            if (Number.isFinite(counterId)) {
                params.push(counterId);
                sql += ` AND counter_id = $${params.length}`;
            }
            if (status) {
                params.push(status);
                sql += ` AND status = $${params.length}`;
            }
            const canSeeAll =
                isAdminOp(op) ||
                (await canManageMetalRouting(query, req.user.id, op));
            if (!canSeeAll) {
                const counterIds = await staffCounterIds(query, req.user.id, op.id);
                if (!counterIds.length) {
                    return res.json({ lots: [] });
                }
                params.push(counterIds);
                sql += ` AND counter_id = ANY($${params.length}::int[])`;
            }
            sql += ` ORDER BY move_date DESC, id DESC LIMIT 500`;
            const rows = await query(sql, params);
            const lots = [];
            for (const r of rows) {
                lots.push(await mapLotRow(query, req.user.id, r));
            }
            res.json({ lots });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load lots' });
        }
    });

    app.post(
        '/api/reseller/erp/metal-routing/lots',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const metalType = String(req.body.metal_type || '').toLowerCase();
                if (metalType !== 'gold' && metalType !== 'silver') {
                    return res.status(400).json({ error: 'metal_type must be gold or silver' });
                }
                const purityId = parseInt(String(req.body.purity_id), 10);
                if (!Number.isFinite(purityId)) {
                    return res.status(400).json({ error: 'purity_id required' });
                }
                const grossGm = parseNum(req.body.gross_gm);
                if (grossGm == null || grossGm <= 0) {
                    return res.status(400).json({ error: 'gross_gm required (grams)' });
                }
                let counterId =
                    req.body.counter_id != null
                        ? parseInt(String(req.body.counter_id), 10) || null
                        : null;
                let operatorId =
                    req.body.operator_id != null
                        ? parseInt(String(req.body.operator_id), 10) || null
                        : op.id;
                const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;
                const moveDate = String(req.body.move_date || '').trim() || null;

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll) {
                    const counterIds = await staffCounterIds(query, req.user.id, op.id);
                    if (!counterIds.length) {
                        return res.status(403).json({ error: 'No counter assigned to you' });
                    }
                    if (counterId && !counterIds.includes(counterId)) {
                        return res.status(403).json({ error: 'Not your counter' });
                    }
                    if (!counterId) counterId = counterIds[0];
                    operatorId = op.id;
                }

                const chargePct = await resolveChargePct(
                    query,
                    req.user.id,
                    purityId,
                    req.body.charge_pct,
                );
                const pureGm = computePureGm(grossGm, chargePct);

                const ins = await query(
                    `INSERT INTO reseller_erp_metal_stock_lots (
                        reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                        gross_gm, charge_pct, pure_gm, notes, move_date
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE))
                     RETURNING *`,
                    [
                        req.user.id,
                        metalType,
                        purityId,
                        counterId,
                        operatorId,
                        roundGm(grossGm),
                        chargePct,
                        pureGm,
                        notes,
                        moveDate,
                    ],
                );
                res.json({ lot: await mapLotRow(query, req.user.id, ins[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to receive metal' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/metal-routing/lots/:id/split',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const parentId = parseInt(String(req.params.id), 10);
                const parts = Array.isArray(req.body.parts) ? req.body.parts : [];
                if (!parts.length) return res.status(400).json({ error: 'parts required' });

                const parentRows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [parentId, req.user.id],
                );
                if (!parentRows.length) return res.status(404).json({ error: 'Lot not found' });
                const parent = parentRows[0];
                if (parent.status !== 'active') {
                    return res.status(400).json({ error: 'Lot is not active' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll && parent.counter_id) {
                    const counterIds = await staffCounterIds(query, req.user.id, op.id);
                    if (!counterIds.includes(parent.counter_id)) {
                        return res.status(403).json({ error: 'Not your counter lot' });
                    }
                }

                const parentChargePct = await resolveChargePct(
                    query,
                    req.user.id,
                    parent.purity_id,
                    parent.charge_pct,
                );
                const childSpecs = [];
                let totalGross = 0;
                for (const part of parts) {
                    const chargePct = await resolveChargePct(
                        query,
                        req.user.id,
                        parent.purity_id,
                        part.charge_pct ?? parent.charge_pct,
                    );
                    let grossGm = parseNum(part.gross_gm);
                    let pureGm = parseNum(part.pure_gm);
                    if (grossGm == null && pureGm != null) {
                        grossGm = chargePct
                            ? roundGm((pureGm * 100) / chargePct)
                            : roundGm(pureGm);
                    }
                    if (grossGm == null || grossGm <= 0) {
                        return res.status(400).json({ error: 'Each part needs gross_gm (grams)' });
                    }
                    if (pureGm == null) {
                        pureGm = computePureGm(grossGm, chargePct);
                    }
                    totalGross += grossGm;
                    childSpecs.push({
                        pureGm: roundGm(pureGm),
                        grossGm: roundGm(grossGm),
                        chargePct,
                        counterId:
                            part.counter_id != null
                                ? parseInt(String(part.counter_id), 10) || parent.counter_id
                                : parent.counter_id,
                        operatorId:
                            part.operator_id != null
                                ? parseInt(String(part.operator_id), 10) || op.id
                                : op.id,
                    });
                }

                const parentGross = Number(parent.gross_gm) || 0;
                totalGross = roundGm(totalGross);
                if (totalGross > parentGross + 0.001) {
                    return res.status(400).json({
                        error: `Split total (${totalGross} g) cannot exceed lot gross (${roundGm(parentGross)} g)`,
                    });
                }

                const remainingGross = roundGm(parentGross - totalGross);
                if (remainingGross > 0.001) {
                    const remPure = computePureGm(remainingGross, parentChargePct);
                    await query(
                        `UPDATE reseller_erp_metal_stock_lots SET
                            gross_gm = $2,
                            pure_gm = $3,
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [parentId, remainingGross, remPure],
                    );
                } else {
                    await query(
                        `UPDATE reseller_erp_metal_stock_lots
                         SET status = 'closed', updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1`,
                        [parentId],
                    );
                }

                const children = [];
                for (const spec of childSpecs) {
                    const ins = await query(
                        `INSERT INTO reseller_erp_metal_stock_lots (
                            reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                            parent_lot_id, gross_gm, charge_pct, pure_gm, move_date
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE)
                         RETURNING *`,
                        [
                            req.user.id,
                            parent.metal_type,
                            parent.purity_id,
                            spec.counterId,
                            spec.operatorId,
                            parentId,
                            spec.grossGm,
                            spec.chargePct,
                            spec.pureGm,
                        ],
                    );
                    children.push(await mapLotRow(query, req.user.id, ins[0]));
                }

                const parentRow =
                    remainingGross > 0.001
                        ? (
                              await query(
                                  `SELECT * FROM reseller_erp_metal_stock_lots WHERE id = $1 LIMIT 1`,
                                  [parentId],
                              )
                          )[0]
                        : null;
                res.json({
                    parent_id: parentId,
                    parent: parentRow ? await mapLotRow(query, req.user.id, parentRow) : null,
                    children,
                    remaining_gross_gm: remainingGross > 0.001 ? remainingGross : 0,
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to split lot' });
            }
        },
    );

    app.patch(
        '/api/reseller/erp/metal-routing/lots/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                const rows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [id, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Lot not found' });
                const lot = rows[0];
                if (lot.status !== 'active') {
                    return res.status(400).json({ error: 'Only active lots can be edited' });
                }
                const purityId =
                    req.body.purity_id != null
                        ? parseInt(String(req.body.purity_id), 10)
                        : lot.purity_id;
                if (!Number.isFinite(purityId)) {
                    return res.status(400).json({ error: 'purity_id required' });
                }
                const chargePct = await resolveChargePct(
                    query,
                    req.user.id,
                    purityId,
                    req.body.charge_pct ?? lot.charge_pct,
                );
                const grossGm = Number(lot.gross_gm) || 0;
                const pureGm = computePureGm(grossGm, chargePct);
                const updated = await query(
                    `UPDATE reseller_erp_metal_stock_lots SET
                        purity_id = $3,
                        charge_pct = $4,
                        pure_gm = $5,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2
                     RETURNING *`,
                    [id, req.user.id, purityId, chargePct, pureGm],
                );
                res.json({ lot: await mapLotRow(query, req.user.id, updated[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to update lot' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/metal-routing/lots/:id/transfer',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const lotId = parseInt(String(req.params.id), 10);
                const targetCounterId = parseInt(String(req.body.counter_id), 10);
                if (!Number.isFinite(targetCounterId)) {
                    return res.status(400).json({ error: 'counter_id required' });
                }
                const parentRows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!parentRows.length) return res.status(404).json({ error: 'Lot not found' });
                const parent = parentRows[0];
                if (parent.status !== 'active') {
                    return res.status(400).json({ error: 'Lot is not active' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll && parent.counter_id) {
                    const counterIds = await staffCounterIds(query, req.user.id, op.id);
                    if (!counterIds.includes(parent.counter_id)) {
                        return res.status(403).json({ error: 'Not your counter lot' });
                    }
                }

                const counterOk = await query(
                    `SELECT id FROM reseller_erp_metal_routing_counters
                     WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
                    [targetCounterId, req.user.id],
                );
                if (!counterOk.length) return res.status(400).json({ error: 'Invalid counter' });

                const parentGross = Number(parent.gross_gm) || 0;
                let moveGross = parseNum(req.body.gross_gm);
                if (moveGross == null || moveGross <= 0) moveGross = parentGross;
                moveGross = roundGm(Math.min(moveGross, parentGross));
                if (moveGross <= 0) {
                    return res.status(400).json({ error: 'Nothing to transfer' });
                }

                const operatorId =
                    req.body.operator_id != null
                        ? parseInt(String(req.body.operator_id), 10) || op.id
                        : op.id;
                const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;

                if (Math.abs(moveGross - parentGross) <= 0.001) {
                    const updated = await query(
                        `UPDATE reseller_erp_metal_stock_lots SET
                            counter_id = $3,
                            operator_id = $4,
                            notes = COALESCE($5, notes),
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1 AND reseller_user_id = $2
                         RETURNING *`,
                        [lotId, req.user.id, targetCounterId, operatorId, notes],
                    );
                    return res.json({
                        mode: 'full',
                        lot: await mapLotRow(query, req.user.id, updated[0]),
                    });
                }

                const chargePct = await resolveChargePct(
                    query,
                    req.user.id,
                    parent.purity_id,
                    parent.charge_pct,
                );
                const movePure = computePureGm(moveGross, chargePct);
                const remainingGross = roundGm(parentGross - moveGross);
                const remPure = computePureGm(remainingGross, chargePct);

                await query(
                    `UPDATE reseller_erp_metal_stock_lots SET
                        gross_gm = $2,
                        pure_gm = $3,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [lotId, remainingGross, remPure],
                );

                const ins = await query(
                    `INSERT INTO reseller_erp_metal_stock_lots (
                        reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                        parent_lot_id, gross_gm, charge_pct, pure_gm, notes, move_date
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE)
                     RETURNING *`,
                    [
                        req.user.id,
                        parent.metal_type,
                        parent.purity_id,
                        targetCounterId,
                        operatorId,
                        lotId,
                        moveGross,
                        chargePct,
                        movePure,
                        notes,
                    ],
                );

                const parentRow = (
                    await query(`SELECT * FROM reseller_erp_metal_stock_lots WHERE id = $1`, [lotId])
                )[0];

                res.json({
                    mode: 'partial',
                    lot: await mapLotRow(query, req.user.id, parentRow),
                    transferred: await mapLotRow(query, req.user.id, ins[0]),
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to transfer metal' });
            }
        },
    );

    app.get(
        '/api/reseller/erp/metal-routing/reports/stock',
        checkAuth,
        erpGate,
        gate,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const metalType = String(req.query.metal_type || '').trim().toLowerCase();
                const from = String(req.query.from || '').trim() || null;
                const to = String(req.query.to || '').trim() || null;
                if (!from || !to) {
                    return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                let counterFilter = null;
                if (!canSeeAll) {
                    counterFilter = await staffCounterIds(query, req.user.id, op.id);
                    if (!counterFilter.length) {
                        return res.json({
                            from,
                            to,
                            metal_type: metalType || 'all',
                            rows: [],
                        });
                    }
                }

                const openFilters = appendMetalRoutingReportFilters(metalType, counterFilter, 3);
                const openingParams = [req.user.id, from, ...openFilters.extraParams];

                const closeFilters = appendMetalRoutingReportFilters(metalType, counterFilter, 3);
                const closingParams = [req.user.id, to, ...closeFilters.extraParams];

                const recvFilters = appendMetalRoutingReportFilters(metalType, counterFilter, 4);
                const receivedParams = [req.user.id, from, to, ...recvFilters.extraParams];

                const openingSql = `
                    SELECT l.counter_id, c.name AS counter_name, l.purity_id, p.label AS purity_label,
                           COALESCE(SUM(l.gross_gm), 0)::numeric AS pure_gm
                    FROM reseller_erp_metal_stock_lots l
                    LEFT JOIN reseller_erp_metal_routing_counters c ON c.id = l.counter_id
                    LEFT JOIN reseller_erp_metal_purities p ON p.id = l.purity_id
                    WHERE l.reseller_user_id = $1
                      AND l.move_date < $2::date
                      AND (
                        l.status = 'active'
                        OR (l.status = 'closed' AND l.updated_at >= $2::timestamptz)
                      )
                      ${openFilters.metalClause}${openFilters.counterClause}
                    GROUP BY l.counter_id, c.name, l.purity_id, p.label
                `;

                const closingSql = `
                    SELECT l.counter_id, c.name AS counter_name, l.purity_id, p.label AS purity_label,
                           COALESCE(SUM(l.gross_gm), 0)::numeric AS pure_gm
                    FROM reseller_erp_metal_stock_lots l
                    LEFT JOIN reseller_erp_metal_routing_counters c ON c.id = l.counter_id
                    LEFT JOIN reseller_erp_metal_purities p ON p.id = l.purity_id
                    WHERE l.reseller_user_id = $1
                      AND l.status = 'active'
                      AND l.move_date <= $2::date
                      ${closeFilters.metalClause}${closeFilters.counterClause}
                    GROUP BY l.counter_id, c.name, l.purity_id, p.label
                `;

                const receivedSql = `
                    SELECT l.counter_id, c.name AS counter_name, l.purity_id, p.label AS purity_label,
                           COALESCE(SUM(l.gross_gm), 0)::numeric AS pure_gm
                    FROM reseller_erp_metal_stock_lots l
                    LEFT JOIN reseller_erp_metal_routing_counters c ON c.id = l.counter_id
                    LEFT JOIN reseller_erp_metal_purities p ON p.id = l.purity_id
                    WHERE l.reseller_user_id = $1
                      AND l.parent_lot_id IS NULL
                      AND l.move_date >= $2::date AND l.move_date <= $3::date
                      ${recvFilters.metalClause}${recvFilters.counterClause}
                    GROUP BY l.counter_id, c.name, l.purity_id, p.label
                `;

                const [openingRows, closingRows, receivedRows] = await Promise.all([
                    query(openingSql, openingParams),
                    query(closingSql, closingParams),
                    query(receivedSql, receivedParams),
                ]);

                const key = (r) =>
                    `${r.counter_id ?? 'null'}:${r.purity_id ?? 'null'}`;
                const map = new Map();

                for (const r of openingRows) {
                    map.set(key(r), {
                        counter_id: r.counter_id,
                        counter_name: r.counter_name || '—',
                        purity_id: r.purity_id,
                        purity_label: r.purity_label || '—',
                        opening_pure_gm: Number(r.pure_gm),
                        received_pure_gm: 0,
                        closing_pure_gm: 0,
                    });
                }
                for (const r of receivedRows) {
                    const k = key(r);
                    const row = map.get(k) || {
                        counter_id: r.counter_id,
                        counter_name: r.counter_name || '—',
                        purity_id: r.purity_id,
                        purity_label: r.purity_label || '—',
                        opening_pure_gm: 0,
                        received_pure_gm: 0,
                        closing_pure_gm: 0,
                    };
                    row.received_pure_gm = Number(r.pure_gm);
                    map.set(k, row);
                }
                for (const r of closingRows) {
                    const k = key(r);
                    const row = map.get(k) || {
                        counter_id: r.counter_id,
                        counter_name: r.counter_name || '—',
                        purity_id: r.purity_id,
                        purity_label: r.purity_label || '—',
                        opening_pure_gm: 0,
                        received_pure_gm: 0,
                        closing_pure_gm: 0,
                    };
                    row.closing_pure_gm = Number(r.pure_gm);
                    map.set(k, row);
                }

                res.json({
                    from,
                    to,
                    metal_type: metalType || 'all',
                    rows: Array.from(map.values()).sort((a, b) =>
                        String(a.counter_name).localeCompare(String(b.counter_name)),
                    ),
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to load stock report' });
            }
        },
    );

    app.get(
        '/api/reseller/erp/metal-routing/reports/staff/:operatorId',
        checkAuth,
        erpGate,
        gate,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const operatorId = parseInt(String(req.params.operatorId), 10);
                const from = String(req.query.from || '').trim() || null;
                const to = String(req.query.to || '').trim() || null;
                if (!Number.isFinite(operatorId)) {
                    return res.status(400).json({ error: 'operatorId required' });
                }
                if (!from || !to) {
                    return res.status(400).json({ error: 'from and to dates required' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll && operatorId !== op.id) {
                    return res.status(403).json({ error: 'Can only view your own staff report' });
                }

                const summary = await query(
                    `SELECT
                        COUNT(*)::int AS movement_count,
                        COALESCE(SUM(pure_gm), 0)::numeric AS total_pure_gm,
                        COALESCE(SUM(CASE WHEN parent_lot_id IS NULL THEN pure_gm ELSE 0 END), 0)::numeric AS received_pure_gm,
                        COALESCE(SUM(CASE WHEN parent_lot_id IS NOT NULL THEN pure_gm ELSE 0 END), 0)::numeric AS split_pure_gm
                     FROM reseller_erp_metal_stock_lots
                     WHERE reseller_user_id = $1 AND operator_id = $2
                       AND move_date >= $3::date AND move_date <= $4::date`,
                    [req.user.id, operatorId, from, to],
                );

                const movements = await query(
                    `SELECT l.*, p.label AS purity_label, c.name AS counter_name
                     FROM reseller_erp_metal_stock_lots l
                     LEFT JOIN reseller_erp_metal_purities p ON p.id = l.purity_id
                     LEFT JOIN reseller_erp_metal_routing_counters c ON c.id = l.counter_id
                     WHERE l.reseller_user_id = $1 AND l.operator_id = $2
                       AND l.move_date >= $3::date AND l.move_date <= $4::date
                     ORDER BY l.move_date DESC, l.id DESC
                     LIMIT 200`,
                    [req.user.id, operatorId, from, to],
                );

                const mapped = [];
                for (const r of movements) {
                    mapped.push(await mapLotRow(query, req.user.id, r));
                }

                const opRow = await query(
                    `SELECT display_name, username FROM reseller_erp_operators
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [operatorId, req.user.id],
                );

                res.json({
                    from,
                    to,
                    operator: {
                        id: operatorId,
                        displayName:
                            opRow[0]?.display_name || opRow[0]?.username || `#${operatorId}`,
                    },
                    summary: {
                        movement_count: summary[0]?.movement_count ?? 0,
                        total_pure_gm: Number(summary[0]?.total_pure_gm ?? 0),
                        received_pure_gm: Number(summary[0]?.received_pure_gm ?? 0),
                        split_pure_gm: Number(summary[0]?.split_pure_gm ?? 0),
                    },
                    movements: mapped,
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to load staff report' });
            }
        },
    );
}

module.exports = {
    registerResellerErpMetalRoutingRoutes,
    ensureMetalRoutingSchema,
};

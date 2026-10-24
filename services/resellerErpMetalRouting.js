/**
 * Metal routing — counters, purities, stock lots (grams), reports.
 */

const {
    getSessionOperator,
    operatorCanAccessModule,
    requireErpOperatorAdmin,
} = require('./resellerErpOperators');
const { parseDateOrNull } = require('./erpDateNormalize');

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
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS from_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL;
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS held_by_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL;

        CREATE TABLE IF NOT EXISTS reseller_erp_metal_lot_events (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            lot_id INTEGER NOT NULL REFERENCES reseller_erp_metal_stock_lots(id) ON DELETE CASCADE,
            event_type VARCHAR(32) NOT NULL,
            gross_gm NUMERIC(14, 3),
            from_counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
            to_counter_id INTEGER REFERENCES reseller_erp_metal_routing_counters(id) ON DELETE SET NULL,
            from_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            to_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            from_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
            to_customer_id INTEGER REFERENCES reseller_erp_customers(id) ON DELETE SET NULL,
            notes TEXT,
            created_by_operator_id INTEGER REFERENCES reseller_erp_operators(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_metal_lot_events_lot
            ON reseller_erp_metal_lot_events (reseller_user_id, lot_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS reseller_erp_metal_routing_categories (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(128) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_routing_categories_name
            ON reseller_erp_metal_routing_categories (reseller_user_id, lower(trim(name)));

        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS lot_number INTEGER;
        ALTER TABLE reseller_erp_metal_stock_lots
            ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES reseller_erp_metal_routing_categories(id) ON DELETE SET NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_metal_stock_lots_lot_number
            ON reseller_erp_metal_stock_lots (reseller_user_id, lot_number)
            WHERE lot_number IS NOT NULL;

        ALTER TABLE reseller_erp_metal_lot_events
            ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES reseller_erp_metal_routing_categories(id) ON DELETE SET NULL;
    `);
}

async function allocateMetalLotNumber(query, userId) {
    const rows = await query(
        `SELECT lot_number FROM reseller_erp_metal_stock_lots
         WHERE reseller_user_id = $1 AND lot_number IS NOT NULL
         ORDER BY lot_number ASC`,
        [userId],
    );
    let expected = 1;
    for (const r of rows) {
        const n = Number(r.lot_number);
        if (!Number.isFinite(n)) continue;
        if (n > expected) return expected;
        if (n === expected) expected += 1;
    }
    return expected;
}

async function counterLabelWithIncharge(query, userId, counterId) {
    if (!counterId) return null;
    const rows = await query(
        `SELECT c.name, c.incharge_operator_id, o.display_name, o.username
         FROM reseller_erp_metal_routing_counters c
         LEFT JOIN reseller_erp_operators o
           ON o.id = c.incharge_operator_id AND o.reseller_user_id = c.reseller_user_id
         WHERE c.id = $1 AND c.reseller_user_id = $2 LIMIT 1`,
        [counterId, userId],
    );
    if (!rows.length) return null;
    const name = String(rows[0].name || '').trim();
    const staff = String(rows[0].display_name || rows[0].username || '').trim();
    return staff ? `${name} (${staff})` : name;
}

function lotWithCustomerBlock(lot) {
    return !!(lot && lot.held_by_customer_id);
}

async function assertLotActionsAllowed(lot) {
    if (lotWithCustomerBlock(lot)) {
        const err = new Error(
            'This lot is with a customer. A manager must take it back before transfer, split, or another handover.',
        );
        err.status = 400;
        throw err;
    }
}

async function mapCategoryBrief(query, userId, categoryId) {
    if (!categoryId) return null;
    const rows = await query(
        `SELECT id, name FROM reseller_erp_metal_routing_categories
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [categoryId, userId],
    );
    return rows.length ? { id: rows[0].id, name: rows[0].name } : null;
}

function grossExceedsMax(requestedGm, maxGm) {
    return roundGm(requestedGm) > roundGm(maxGm);
}

async function mapCustomerBrief(query, userId, customerId) {
    if (!customerId) return null;
    const rows = await query(
        `SELECT id, name, mobile FROM reseller_erp_customers
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [customerId, userId],
    );
    if (!rows.length) return null;
    return { id: rows[0].id, name: rows[0].name, mobile: rows[0].mobile };
}

async function logMetalLotEvent(query, payload) {
    await query(
        `INSERT INTO reseller_erp_metal_lot_events (
            reseller_user_id, lot_id, event_type, gross_gm,
            from_counter_id, to_counter_id, from_operator_id, to_operator_id,
            from_customer_id, to_customer_id, notes, created_by_operator_id, category_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
            payload.resellerUserId,
            payload.lotId,
            payload.eventType,
            payload.grossGm != null ? roundGm(payload.grossGm) : null,
            payload.fromCounterId ?? null,
            payload.toCounterId ?? null,
            payload.fromOperatorId ?? null,
            payload.toOperatorId ?? null,
            payload.fromCustomerId ?? null,
            payload.toCustomerId ?? null,
            payload.notes ?? null,
            payload.createdByOperatorId ?? null,
            payload.categoryId ?? null,
        ],
    );
}

async function collectLotTreeIds(query, userId, rootId) {
    const rows = await query(
        `WITH RECURSIVE tree AS (
            SELECT id FROM reseller_erp_metal_stock_lots
             WHERE id = $1 AND reseller_user_id = $2
            UNION ALL
            SELECT l.id FROM reseller_erp_metal_stock_lots l
            INNER JOIN tree t ON l.parent_lot_id = t.id
            WHERE l.reseller_user_id = $2
         )
         SELECT id FROM tree`,
        [rootId, userId],
    );
    return rows.map((r) => r.id);
}

async function findLotRootId(query, userId, lotId) {
    let current = lotId;
    for (let i = 0; i < 64; i++) {
        const rows = await query(
            `SELECT id, parent_lot_id FROM reseller_erp_metal_stock_lots
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [current, userId],
        );
        if (!rows.length) return lotId;
        if (!rows[0].parent_lot_id) return rows[0].id;
        current = rows[0].parent_lot_id;
    }
    return current;
}

async function mapLotEventRow(query, userId, row) {
    const counterName = async (id) => counterLabelWithIncharge(query, userId, id);
    const operatorName = async (id) => {
        if (!id) return null;
        const o = await query(
            `SELECT display_name, username FROM reseller_erp_operators WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [id, userId],
        );
        return o.length ? o[0].display_name || o[0].username : null;
    };
    return {
        id: row.id,
        lot_id: row.lot_id,
        event_type: row.event_type,
        gross_gm: row.gross_gm != null ? Number(row.gross_gm) : null,
        from_counter_id: row.from_counter_id,
        to_counter_id: row.to_counter_id,
        from_counter_name: await counterName(row.from_counter_id),
        to_counter_name: await counterName(row.to_counter_id),
        from_operator_id: row.from_operator_id,
        to_operator_id: row.to_operator_id,
        from_operator_name: await operatorName(row.from_operator_id),
        to_operator_name: await operatorName(row.to_operator_id),
        from_customer: await mapCustomerBrief(query, userId, row.from_customer_id),
        to_customer: await mapCustomerBrief(query, userId, row.to_customer_id),
        category: await mapCategoryBrief(query, userId, row.category_id),
        notes: row.notes,
        created_at: row.created_at,
    };
}

/** Append optional metal / counter / operator filters; startIdx is the next $n placeholder index. */
function appendMetalRoutingReportFilters(metalType, counterFilter, startIdx, operatorId) {
    let idx = startIdx;
    const extraParams = [];
    let metalClause = '';
    let counterClause = '';
    let operatorClause = '';
    if (metalType === 'gold' || metalType === 'silver') {
        extraParams.push(metalType);
        metalClause = ` AND l.metal_type = $${idx}`;
        idx += 1;
    }
    if (operatorId) {
        extraParams.push(operatorId);
        operatorClause = ` AND l.operator_id = $${idx}`;
        idx += 1;
    } else if (counterFilter && counterFilter.length) {
        extraParams.push(counterFilter);
        counterClause = ` AND l.counter_id = ANY($${idx}::int[])`;
        idx += 1;
    }
    return { metalClause, counterClause, operatorClause, extraParams };
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
    const name = row.name;
    const staff = incharge?.displayName ? String(incharge.displayName).trim() : '';
    return {
        id: row.id,
        name,
        label_with_incharge: staff ? `${name} (${staff})` : name,
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
        const label = await counterLabelWithIncharge(query, userId, row.counter_id);
        const c = await query(
            `SELECT id, name, incharge_operator_id FROM reseller_erp_metal_routing_counters
             WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
            [row.counter_id, userId],
        );
        if (c.length) {
            counter = {
                id: c[0].id,
                name: c[0].name,
                label_with_incharge: label || c[0].name,
            };
        }
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
    const fromCustomer = await mapCustomerBrief(query, userId, row.from_customer_id);
    const heldByCustomer = await mapCustomerBrief(query, userId, row.held_by_customer_id);
    const category = await mapCategoryBrief(query, userId, row.category_id);
    return {
        id: row.id,
        lot_number: row.lot_number != null ? Number(row.lot_number) : null,
        metal_type: row.metal_type,
        category_id: row.category_id ?? null,
        category,
        purity_id: row.purity_id,
        purity,
        counter_id: row.counter_id,
        counter,
        operator_id: row.operator_id,
        operator,
        parent_lot_id: row.parent_lot_id,
        from_customer_id: row.from_customer_id ?? null,
        from_customer: fromCustomer,
        held_by_customer_id: row.held_by_customer_id ?? null,
        held_by_customer: heldByCustomer,
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

async function counterInchargeOperatorId(query, userId, counterId) {
    if (!counterId) return null;
    const rows = await query(
        `SELECT incharge_operator_id FROM reseller_erp_metal_routing_counters
         WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
        [counterId, userId],
    );
    const id = rows[0]?.incharge_operator_id;
    return id != null ? Number(id) : null;
}

async function resolveLotOperatorId(query, userId, { operatorId, counterId, fallbackOpId }) {
    if (operatorId) return operatorId;
    const incharge = await counterInchargeOperatorId(query, userId, counterId);
    if (incharge) return incharge;
    return fallbackOpId || null;
}

async function staffCanAccessLot(query, userId, op, lot) {
    if (!op || !lot) return false;
    if (isAdminOp(op) || (await canManageMetalRouting(query, userId, op))) return true;
    if (lot.operator_id && Number(lot.operator_id) === Number(op.id)) return true;
    if (!lot.operator_id && lot.counter_id) {
        const ids = await staffCounterIds(query, userId, op.id);
        return ids.includes(lot.counter_id);
    }
    return false;
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

    app.get('/api/reseller/erp/metal-routing/categories', checkAuth, erpGate, gate, async (req, res) => {
        try {
            const rows = await query(
                `SELECT * FROM reseller_erp_metal_routing_categories
                 WHERE reseller_user_id = $1
                 ORDER BY sort_order, name`,
                [req.user.id],
            );
            res.json({
                categories: rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    sort_order: r.sort_order,
                    is_active: !!r.is_active,
                })),
            });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load categories' });
        }
    });

    app.post(
        '/api/reseller/erp/metal-routing/categories',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const name = String(req.body.name || '').trim().slice(0, 128);
                if (!name) return res.status(400).json({ error: 'Category name required' });
                const sortOrder = parseInt(String(req.body.sort_order ?? 0), 10) || 0;
                const existing = await query(
                    `SELECT * FROM reseller_erp_metal_routing_categories
                     WHERE reseller_user_id = $1 AND lower(trim(name)) = lower(trim($2)) LIMIT 1`,
                    [req.user.id, name],
                );
                if (existing.length) {
                    if (!existing[0].is_active) {
                        const revived = await query(
                            `UPDATE reseller_erp_metal_routing_categories SET is_active = true, updated_at = CURRENT_TIMESTAMP
                             WHERE id = $1 RETURNING *`,
                            [existing[0].id],
                        );
                        return res.json({
                            category: {
                                id: revived[0].id,
                                name: revived[0].name,
                                sort_order: revived[0].sort_order,
                                is_active: true,
                            },
                        });
                    }
                    return res.json({
                        category: {
                            id: existing[0].id,
                            name: existing[0].name,
                            sort_order: existing[0].sort_order,
                            is_active: !!existing[0].is_active,
                        },
                    });
                }
                const ins = await query(
                    `INSERT INTO reseller_erp_metal_routing_categories (reseller_user_id, name, sort_order)
                     VALUES ($1, $2, $3)
                     RETURNING *`,
                    [req.user.id, name, sortOrder],
                );
                res.json({
                    category: {
                        id: ins[0].id,
                        name: ins[0].name,
                        sort_order: ins[0].sort_order,
                        is_active: !!ins[0].is_active,
                    },
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to create category' });
            }
        },
    );

    app.patch(
        '/api/reseller/erp/metal-routing/categories/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                const name =
                    req.body.name != null ? String(req.body.name).trim().slice(0, 128) : null;
                const sortOrder =
                    req.body.sort_order != null
                        ? parseInt(String(req.body.sort_order), 10) || 0
                        : undefined;
                const isActive = req.body.is_active;
                const sets = [];
                const params = [req.user.id, id];
                if (name) {
                    params.push(name);
                    sets.push(`name = $${params.length}`);
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
                    `UPDATE reseller_erp_metal_routing_categories SET ${sets.join(', ')}
                     WHERE reseller_user_id = $1 AND id = $2 RETURNING *`,
                    params,
                );
                if (!rows.length) return res.status(404).json({ error: 'Category not found' });
                res.json({
                    category: {
                        id: rows[0].id,
                        name: rows[0].name,
                        sort_order: rows[0].sort_order,
                        is_active: !!rows[0].is_active,
                    },
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to update category' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/metal-routing/categories/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        async (req, res) => {
            try {
                const id = parseInt(String(req.params.id), 10);
                await query(
                    `UPDATE reseller_erp_metal_routing_categories
                     SET is_active = false, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [id, req.user.id],
                );
                res.json({ success: true });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete category' });
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
                params.push(op.id);
                sql += ` AND (
                    operator_id = $${params.length}
                    OR (
                        operator_id IS NULL
                        AND counter_id IN (
                            SELECT id FROM reseller_erp_metal_routing_counters
                            WHERE reseller_user_id = $1
                              AND is_active = true
                              AND incharge_operator_id = $${params.length}
                        )
                    )
                )`;
            }
            sql += ` ORDER BY COALESCE(lot_number, id) DESC, id DESC LIMIT 500`;
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
                const fromCustomerId =
                    req.body.from_customer_id != null
                        ? parseInt(String(req.body.from_customer_id), 10) || null
                        : null;
                if (fromCustomerId) {
                    const ok = await query(
                        `SELECT id FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                        [fromCustomerId, req.user.id],
                    );
                    if (!ok.length) return res.status(400).json({ error: 'Invalid from customer' });
                }

                const purityRow = await query(
                    `SELECT metal_type FROM reseller_erp_metal_purities
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [purityId, req.user.id],
                );
                if (!purityRow.length) return res.status(400).json({ error: 'Invalid purity' });
                if (String(purityRow[0].metal_type).toLowerCase() !== metalType) {
                    return res.status(400).json({ error: 'Purity does not match selected metal type' });
                }

                const categoryId = parseInt(String(req.body.category_id), 10);
                if (!Number.isFinite(categoryId)) {
                    return res.status(400).json({ error: 'category_id required' });
                }
                const catOk = await query(
                    `SELECT id FROM reseller_erp_metal_routing_categories
                     WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
                    [categoryId, req.user.id],
                );
                if (!catOk.length) return res.status(400).json({ error: 'Invalid category' });

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll) {
                    const counterIds = await staffCounterIds(query, req.user.id, op.id);
                    if (counterId && counterIds.length && !counterIds.includes(counterId)) {
                        return res.status(403).json({ error: 'Not your counter' });
                    }
                    if (!counterId && counterIds.length) counterId = counterIds[0];
                    operatorId = op.id;
                } else if (req.body.operator_id == null || String(req.body.operator_id).trim() === '') {
                    operatorId = await resolveLotOperatorId(query, req.user.id, {
                        operatorId: null,
                        counterId,
                        fallbackOpId: op.id,
                    });
                }

                const chargePct = await resolveChargePct(
                    query,
                    req.user.id,
                    purityId,
                    req.body.charge_pct,
                );
                const pureGm = computePureGm(grossGm, chargePct);
                const lotNumber = await allocateMetalLotNumber(query, req.user.id);

                const ins = await query(
                    `INSERT INTO reseller_erp_metal_stock_lots (
                        reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                        gross_gm, charge_pct, pure_gm, notes, move_date, from_customer_id,
                        category_id, lot_number
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::date, CURRENT_DATE), $11, $12, $13)
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
                        fromCustomerId,
                        categoryId,
                        lotNumber,
                    ],
                );
                await logMetalLotEvent(query, {
                    resellerUserId: req.user.id,
                    lotId: ins[0].id,
                    eventType: 'receive',
                    grossGm: roundGm(grossGm),
                    toCounterId: counterId,
                    toOperatorId: operatorId,
                    fromCustomerId,
                    notes,
                    categoryId,
                    createdByOperatorId: op.id,
                });
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
                try {
                    await assertLotActionsAllowed(parent);
                } catch (e) {
                    return res.status(e.status || 400).json({ error: e.message });
                }

                if (!(await staffCanAccessLot(query, req.user.id, op, parent))) {
                    return res.status(403).json({ error: 'Not your lot' });
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
                    const destCounterId =
                        part.counter_id != null
                            ? parseInt(String(part.counter_id), 10) || parent.counter_id
                            : parent.counter_id;
                    const specifiedOp =
                        part.operator_id != null
                            ? parseInt(String(part.operator_id), 10) || null
                            : null;
                    const destOperatorId = await resolveLotOperatorId(query, req.user.id, {
                        operatorId: specifiedOp,
                        counterId:
                            destCounterId && destCounterId !== parent.counter_id
                                ? destCounterId
                                : null,
                        fallbackOpId: parent.operator_id || op.id,
                    });
                    childSpecs.push({
                        pureGm: roundGm(pureGm),
                        grossGm: roundGm(grossGm),
                        chargePct,
                        counterId: destCounterId,
                        operatorId: destOperatorId,
                    });
                }

                const parentGross = Number(parent.gross_gm) || 0;
                totalGross = roundGm(totalGross);
                if (grossExceedsMax(totalGross, parentGross)) {
                    return res.status(400).json({
                        error: `Split total (${totalGross.toFixed(3)} g) cannot exceed lot gross (${roundGm(parentGross).toFixed(3)} g)`,
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
                    const childLotNumber = await allocateMetalLotNumber(query, req.user.id);
                    const ins = await query(
                        `INSERT INTO reseller_erp_metal_stock_lots (
                            reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                            parent_lot_id, gross_gm, charge_pct, pure_gm, move_date,
                            category_id, lot_number
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, $10, $11)
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
                            parent.category_id,
                            childLotNumber,
                        ],
                    );
                    const childRow = ins[0];
                    await logMetalLotEvent(query, {
                        resellerUserId: req.user.id,
                        lotId: parentId,
                        eventType: 'split',
                        grossGm: spec.grossGm,
                        fromCounterId: parent.counter_id,
                        toCounterId: spec.counterId,
                        fromOperatorId: parent.operator_id,
                        toOperatorId: spec.operatorId,
                        categoryId: parent.category_id,
                        createdByOperatorId: op.id,
                    });
                    children.push(await mapLotRow(query, req.user.id, childRow));
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
                try {
                    await assertLotActionsAllowed(parent);
                } catch (e) {
                    return res.status(e.status || 400).json({ error: e.message });
                }

                if (!(await staffCanAccessLot(query, req.user.id, op, parent))) {
                    return res.status(403).json({ error: 'Not your lot' });
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
                moveGross = roundGm(moveGross);
                if (grossExceedsMax(moveGross, parentGross)) {
                    return res.status(400).json({
                        error: `Cannot transfer ${moveGross.toFixed(3)} g — lot has only ${roundGm(parentGross).toFixed(3)} g gross`,
                    });
                }
                if (moveGross <= 0) {
                    return res.status(400).json({ error: 'Nothing to transfer' });
                }

                const specifiedOp =
                    req.body.operator_id != null && String(req.body.operator_id).trim() !== ''
                        ? parseInt(String(req.body.operator_id), 10) || null
                        : null;
                const operatorId = await resolveLotOperatorId(query, req.user.id, {
                    operatorId: specifiedOp,
                    counterId: targetCounterId,
                    fallbackOpId: op.id,
                });
                const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;

                if (Math.abs(moveGross - parentGross) <= 0.001) {
                    const updated = await query(
                        `UPDATE reseller_erp_metal_stock_lots SET
                            counter_id = $3,
                            operator_id = $4,
                            held_by_customer_id = NULL,
                            notes = COALESCE($5, notes),
                            updated_at = CURRENT_TIMESTAMP
                         WHERE id = $1 AND reseller_user_id = $2
                         RETURNING *`,
                        [lotId, req.user.id, targetCounterId, operatorId, notes],
                    );
                    await logMetalLotEvent(query, {
                        resellerUserId: req.user.id,
                        lotId,
                        eventType: 'transfer',
                        grossGm: moveGross,
                        fromCounterId: parent.counter_id,
                        toCounterId: targetCounterId,
                        fromOperatorId: parent.operator_id,
                        toOperatorId: operatorId,
                        notes,
                        categoryId: parent.category_id,
                        createdByOperatorId: op.id,
                    });
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

                const transferLotNumber = await allocateMetalLotNumber(query, req.user.id);
                const ins = await query(
                    `INSERT INTO reseller_erp_metal_stock_lots (
                        reseller_user_id, metal_type, purity_id, counter_id, operator_id,
                        parent_lot_id, gross_gm, charge_pct, pure_gm, notes, move_date,
                        category_id, lot_number
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11, $12)
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
                        parent.category_id,
                        transferLotNumber,
                    ],
                );

                const parentRow = (
                    await query(`SELECT * FROM reseller_erp_metal_stock_lots WHERE id = $1`, [lotId])
                )[0];

                await logMetalLotEvent(query, {
                    resellerUserId: req.user.id,
                    lotId,
                    eventType: 'transfer',
                    grossGm: moveGross,
                    fromCounterId: parent.counter_id,
                    toCounterId: targetCounterId,
                    fromOperatorId: parent.operator_id,
                    toOperatorId: operatorId,
                    notes,
                    categoryId: parent.category_id,
                    createdByOperatorId: op.id,
                });

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

    app.post(
        '/api/reseller/erp/metal-routing/lots/:id/handover',
        checkAuth,
        erpGate,
        gate,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const lotId = parseInt(String(req.params.id), 10);
                const toCustomerId =
                    req.body.to_customer_id != null
                        ? parseInt(String(req.body.to_customer_id), 10) || null
                        : null;
                const toOperatorId =
                    req.body.to_operator_id != null
                        ? parseInt(String(req.body.to_operator_id), 10) || null
                        : null;
                if (!toCustomerId && !toOperatorId) {
                    return res.status(400).json({ error: 'to_customer_id or to_operator_id required' });
                }
                const rows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Lot not found' });
                const lot = rows[0];
                if (lot.status !== 'active') {
                    return res.status(400).json({ error: 'Lot is not active' });
                }
                if (lot.held_by_customer_id) {
                    return res.status(400).json({
                        error: 'Lot is with a customer. Manager must take it back before another handover.',
                    });
                }

                if (!(await staffCanAccessLot(query, req.user.id, op, lot))) {
                    return res.status(403).json({ error: 'Not your lot' });
                }

                if (toCustomerId) {
                    const ok = await query(
                        `SELECT id FROM reseller_erp_customers WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                        [toCustomerId, req.user.id],
                    );
                    if (!ok.length) return res.status(400).json({ error: 'Invalid customer' });
                }
                if (toOperatorId) {
                    const ok = await query(
                        `SELECT id FROM reseller_erp_operators
                         WHERE id = $1 AND reseller_user_id = $2 AND is_active = true LIMIT 1`,
                        [toOperatorId, req.user.id],
                    );
                    if (!ok.length) return res.status(400).json({ error: 'Invalid staff operator' });
                }

                const targetCounterId =
                    req.body.counter_id != null
                        ? parseInt(String(req.body.counter_id), 10) || lot.counter_id
                        : lot.counter_id;
                const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;

                const updated = await query(
                    `UPDATE reseller_erp_metal_stock_lots SET
                        operator_id = COALESCE($3, operator_id),
                        counter_id = COALESCE($4, counter_id),
                        held_by_customer_id = $5,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2
                     RETURNING *`,
                    [
                        lotId,
                        req.user.id,
                        toOperatorId || op.id,
                        targetCounterId,
                        toCustomerId || null,
                    ],
                );

                await logMetalLotEvent(query, {
                    resellerUserId: req.user.id,
                    lotId,
                    eventType: toCustomerId ? 'handover_customer' : 'handover_staff',
                    grossGm: lot.gross_gm,
                    fromCounterId: lot.counter_id,
                    toCounterId: targetCounterId,
                    fromOperatorId: lot.operator_id,
                    toOperatorId: toOperatorId || op.id,
                    fromCustomerId: lot.held_by_customer_id,
                    toCustomerId,
                    notes,
                    categoryId: lot.category_id,
                    createdByOperatorId: op.id,
                });

                res.json({ lot: await mapLotRow(query, req.user.id, updated[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Handover failed' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/metal-routing/lots/:id/recall-from-customer',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const lotId = parseInt(String(req.params.id), 10);
                const rows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Lot not found' });
                const lot = rows[0];
                if (lot.status !== 'active') {
                    return res.status(400).json({ error: 'Lot is not active' });
                }
                if (!lot.held_by_customer_id) {
                    return res.status(400).json({ error: 'Lot is not with a customer' });
                }
                const notes = String(req.body.notes || '').trim().slice(0, 2000) || null;
                const fromCustomerId = lot.held_by_customer_id;
                const updated = await query(
                    `UPDATE reseller_erp_metal_stock_lots SET
                        held_by_customer_id = NULL,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2
                     RETURNING *`,
                    [lotId, req.user.id],
                );
                await logMetalLotEvent(query, {
                    resellerUserId: req.user.id,
                    lotId,
                    eventType: 'recall_from_customer',
                    grossGm: lot.gross_gm,
                    fromCounterId: lot.counter_id,
                    fromOperatorId: lot.operator_id,
                    fromCustomerId,
                    notes,
                    categoryId: lot.category_id,
                    createdByOperatorId: op.id,
                });
                res.json({ lot: await mapLotRow(query, req.user.id, updated[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Recall failed' });
            }
        },
    );

    app.post(
        '/api/reseller/erp/metal-routing/lots/:id/close',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        requireJson,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const lotId = parseInt(String(req.params.id), 10);
                const rows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!rows.length) return res.status(404).json({ error: 'Lot not found' });
                const lot = rows[0];
                if (lot.status === 'closed') {
                    return res.status(400).json({ error: 'Lot already closed' });
                }
                const updated = await query(
                    `UPDATE reseller_erp_metal_stock_lots SET
                        status = 'closed',
                        held_by_customer_id = NULL,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = $1 AND reseller_user_id = $2
                     RETURNING *`,
                    [lotId, req.user.id],
                );
                await logMetalLotEvent(query, {
                    resellerUserId: req.user.id,
                    lotId,
                    eventType: 'close',
                    grossGm: lot.gross_gm,
                    fromCounterId: lot.counter_id,
                    fromOperatorId: lot.operator_id,
                    fromCustomerId: lot.held_by_customer_id,
                    notes: String(req.body.notes || '').trim().slice(0, 2000) || null,
                    createdByOperatorId: op.id,
                });
                res.json({ lot: await mapLotRow(query, req.user.id, updated[0]) });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to close lot' });
            }
        },
    );

    app.delete(
        '/api/reseller/erp/metal-routing/lots/:id',
        checkAuth,
        erpGate,
        gate,
        managerOrAdmin,
        async (req, res) => {
            try {
                const lotId = parseInt(String(req.params.id), 10);
                const exists = await query(
                    `SELECT id FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!exists.length) return res.status(404).json({ error: 'Lot not found' });
                const treeIds = await collectLotTreeIds(query, req.user.id, lotId);
                await query(
                    `DELETE FROM reseller_erp_metal_lot_events
                     WHERE reseller_user_id = $1 AND lot_id = ANY($2::int[])`,
                    [req.user.id, treeIds],
                );
                await query(
                    `DELETE FROM reseller_erp_metal_stock_lots
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[])`,
                    [req.user.id, treeIds],
                );
                res.json({ success: true, deleted_ids: treeIds });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to delete lot' });
            }
        },
    );

    app.get(
        '/api/reseller/erp/metal-routing/lots/:id/journey',
        checkAuth,
        erpGate,
        gate,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const lotId = parseInt(String(req.params.id), 10);
                const lotRows = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                    [lotId, req.user.id],
                );
                if (!lotRows.length) return res.status(404).json({ error: 'Lot not found' });
                const lot = lotRows[0];

                if (!(await staffCanAccessLot(query, req.user.id, op, lot))) {
                    return res.status(403).json({ error: 'Not your lot' });
                }

                const rootId = await findLotRootId(query, req.user.id, lotId);
                const treeIds = await collectLotTreeIds(query, req.user.id, rootId);
                const relatedLots = await query(
                    `SELECT * FROM reseller_erp_metal_stock_lots
                     WHERE reseller_user_id = $1 AND id = ANY($2::int[])
                     ORDER BY created_at ASC, id ASC`,
                    [req.user.id, treeIds],
                );
                const eventRows = await query(
                    `SELECT * FROM reseller_erp_metal_lot_events
                     WHERE reseller_user_id = $1 AND lot_id = ANY($2::int[])
                     ORDER BY created_at ASC, id ASC`,
                    [req.user.id, treeIds],
                );
                const events = [];
                for (const ev of eventRows) {
                    events.push(await mapLotEventRow(query, req.user.id, ev));
                }
                const lots = [];
                for (const r of relatedLots) {
                    lots.push(await mapLotRow(query, req.user.id, r));
                }
                res.json({
                    root_lot_id: rootId,
                    lot: await mapLotRow(query, req.user.id, lot),
                    lots,
                    events,
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to load lot journey' });
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
                const onDate = parseDateOrNull(req.query.on);
                const from =
                    onDate || parseDateOrNull(req.query.from) || String(req.query.from || '').trim() || null;
                const to =
                    onDate || parseDateOrNull(req.query.to) || String(req.query.to || '').trim() || null;
                if (!from || !to) {
                    return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                let counterFilter = null;
                let operatorIdFilter = null;
                if (!canSeeAll) {
                    operatorIdFilter = op.id;
                }

                const openFilters = appendMetalRoutingReportFilters(
                    metalType,
                    counterFilter,
                    3,
                    operatorIdFilter,
                );
                const openingParams = [req.user.id, from, ...openFilters.extraParams];

                const closeFilters = appendMetalRoutingReportFilters(
                    metalType,
                    counterFilter,
                    3,
                    operatorIdFilter,
                );
                const closingParams = [req.user.id, to, ...closeFilters.extraParams];

                const recvFilters = appendMetalRoutingReportFilters(
                    metalType,
                    counterFilter,
                    4,
                    operatorIdFilter,
                );
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
                      ${openFilters.metalClause}${openFilters.counterClause}${openFilters.operatorClause}
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
                      ${closeFilters.metalClause}${closeFilters.counterClause}${closeFilters.operatorClause}
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
                      ${recvFilters.metalClause}${recvFilters.counterClause}${recvFilters.operatorClause}
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
        '/api/reseller/erp/metal-routing/reports/lots-ledger',
        checkAuth,
        erpGate,
        gate,
        async (req, res) => {
            try {
                const op = req.erpOperator;
                const onDate = parseDateOrNull(req.query.on);
                const from =
                    onDate || parseDateOrNull(req.query.from) || String(req.query.from || '').trim() || null;
                const to =
                    onDate || parseDateOrNull(req.query.to) || String(req.query.to || '').trim() || null;
                const metalType = String(req.query.metal_type || '').trim().toLowerCase();
                const lotStatus = String(req.query.lot_status || 'all').trim().toLowerCase();
                const view = String(req.query.view || 'summary').trim().toLowerCase();
                if (!from || !to) {
                    return res.status(400).json({ error: 'from and to dates required (YYYY-MM-DD)' });
                }

                const canSeeAll =
                    isAdminOp(op) ||
                    (await canManageMetalRouting(query, req.user.id, op));
                if (!canSeeAll) {
                    return res.status(403).json({ error: 'Lots ledger report requires manager or admin' });
                }

                if (view === 'detail') {
                    const params = [req.user.id, from, to];
                    let sql = `
                        SELECT e.*, l.lot_number, l.metal_type, l.status AS lot_status
                        FROM reseller_erp_metal_lot_events e
                        JOIN reseller_erp_metal_stock_lots l ON l.id = e.lot_id
                        WHERE e.reseller_user_id = $1
                          AND e.created_at::date >= $2::date
                          AND e.created_at::date <= $3::date`;
                    if (metalType === 'gold' || metalType === 'silver') {
                        params.push(metalType);
                        sql += ` AND l.metal_type = $${params.length}`;
                    }
                    if (lotStatus === 'active' || lotStatus === 'closed') {
                        params.push(lotStatus);
                        sql += ` AND l.status = $${params.length}`;
                    }
                    sql += ` ORDER BY e.created_at ASC, e.id ASC LIMIT 5000`;
                    const eventRows = await query(sql, params);
                    const rows = [];
                    for (const ev of eventRows) {
                        const mapped = await mapLotEventRow(query, req.user.id, ev);
                        rows.push({
                            ...mapped,
                            lot_number: ev.lot_number != null ? Number(ev.lot_number) : null,
                            metal_type: ev.metal_type,
                            lot_status: ev.lot_status,
                        });
                    }
                    return res.json({ from, to, view: 'detail', lot_status: lotStatus, rows });
                }

                const lotParams = [req.user.id];
                let lotSql = `SELECT * FROM reseller_erp_metal_stock_lots WHERE reseller_user_id = $1`;
                if (metalType === 'gold' || metalType === 'silver') {
                    lotParams.push(metalType);
                    lotSql += ` AND metal_type = $${lotParams.length}`;
                }
                if (lotStatus === 'active' || lotStatus === 'closed') {
                    lotParams.push(lotStatus);
                    lotSql += ` AND status = $${lotParams.length}`;
                }
                lotSql += ` ORDER BY COALESCE(lot_number, id) ASC LIMIT 2000`;
                const lotRows = await query(lotSql, lotParams);
                const summary = [];
                for (const lot of lotRows) {
                    const evRows = await query(
                        `SELECT event_type, gross_gm FROM reseller_erp_metal_lot_events
                         WHERE reseller_user_id = $1 AND lot_id = $2
                           AND created_at::date >= $3::date AND created_at::date <= $4::date`,
                        [req.user.id, lot.id, from, to],
                    );
                    let receivedGm = 0;
                    let issuedGm = 0;
                    for (const ev of evRows) {
                        const g = Number(ev.gross_gm) || 0;
                        if (ev.event_type === 'receive') receivedGm += g;
                        else if (
                            ev.event_type === 'transfer' ||
                            ev.event_type === 'handover_customer' ||
                            ev.event_type === 'close' ||
                            ev.event_type === 'split'
                        ) {
                            issuedGm += g;
                        }
                    }
                    receivedGm = roundGm(receivedGm);
                    issuedGm = roundGm(issuedGm);
                    const closingGm =
                        lot.status === 'active' ? roundGm(Number(lot.gross_gm) || 0) : 0;
                    const openingGm = roundGm(Math.max(0, closingGm - receivedGm + issuedGm));
                    const mapped = await mapLotRow(query, req.user.id, lot);
                    summary.push({
                        lot_id: lot.id,
                        lot_number: lot.lot_number != null ? Number(lot.lot_number) : lot.id,
                        metal_type: lot.metal_type,
                        status: lot.status,
                        category: mapped.category,
                        counter: mapped.counter,
                        purity: mapped.purity,
                        from_customer: mapped.from_customer,
                        held_by_customer: mapped.held_by_customer,
                        opening_gross_gm: openingGm,
                        received_gross_gm: receivedGm,
                        issued_gross_gm: issuedGm,
                        closing_gross_gm: closingGm,
                    });
                }
                res.json({
                    from,
                    to,
                    view: 'summary',
                    lot_status: lotStatus,
                    rows: summary,
                });
            } catch (e) {
                res.status(500).json({ error: e.message || 'Failed to load lots ledger' });
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
                const onDate = parseDateOrNull(req.query.on);
                const from =
                    onDate || parseDateOrNull(req.query.from) || String(req.query.from || '').trim() || null;
                const to =
                    onDate || parseDateOrNull(req.query.to) || String(req.query.to || '').trim() || null;
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

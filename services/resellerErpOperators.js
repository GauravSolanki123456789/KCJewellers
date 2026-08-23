/**
 * Reseller ERP operator accounts — username/password login, module permissions.
 */

const bcrypt = require('bcrypt');
const { isAdminStrict } = require('../middleware/auth');

const OPERATOR_PUBLIC_SUFFIXES = ['/operators/login', '/operators/logout', '/operators/me'];
const ALL_MODULE_IDS = [
    'billing', 'sales-bills', 'credit-bills', 'orders', 'estimations',
    'customers', 'ledger', 'products', 'design-master', 'floors', 'stock', 'rol',
    'rate-uncut', 'slabs', 'sales-reports', 'sales-percentages',
    'gst', 'e-invoice', 'e-way', 'tally', 'integrations',
    'barcoding', 'tag-splitting', 'scanner', 'hardware', 'print-formats', 'erp-users',
];

const DEFAULT_SHADOW_SEQUENCE = 'F9Rs*';

async function ensureOperatorsSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_erp_operators (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            username VARCHAR(64) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            display_name VARCHAR(255),
            role VARCHAR(16) NOT NULL DEFAULT 'staff',
            allowed_modules TEXT[] NOT NULL DEFAULT '{}',
            full_access BOOLEAN NOT NULL DEFAULT false,
            shadow_access BOOLEAN NOT NULL DEFAULT false,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            last_login_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_erp_operators_username
            ON reseller_erp_operators (reseller_user_id, LOWER(username));
    `);
}

function isOperatorPublicPath(path) {
    const p = String(path || '');
    return OPERATOR_PUBLIC_SUFFIXES.some((s) => p.endsWith(s));
}

function mapOperator(row, { includeMeta = false } = {}) {
    if (!row) return null;
    const base = {
        id: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        role: row.role || 'staff',
        allowedModules: Array.isArray(row.allowed_modules) ? row.allowed_modules : [],
        fullAccess: !!row.full_access,
        shadowAccess: !!row.shadow_access,
        isActive: !!row.is_active,
    };
    if (includeMeta) {
        base.lastLoginAt = row.last_login_at || null;
        base.createdAt = row.created_at || null;
        base.updatedAt = row.updated_at || null;
    }
    return base;
}

function getSessionOperator(req) {
    const op = req.session?.erpOperator;
    if (!op?.id || !op?.resellerUserId) return null;
    if (String(op.resellerUserId) !== String(req.user?.id)) return null;
    return op;
}

function operatorCanAccessModule(op, moduleId) {
    if (!op) return false;
    if (op.role === 'admin' || op.fullAccess) return true;
    if (moduleId === 'erp-users') return op.role === 'admin';
    return (op.allowedModules || []).includes(moduleId);
}

function requireErpOperatorSession() {
    return (req, res, next) => {
        if (isOperatorPublicPath(req.path)) return next();
        const op = getSessionOperator(req);
        if (!op) {
            return res.status(401).json({
                error: 'ERP sign-in required',
                code: 'ERP_OPERATOR_REQUIRED',
            });
        }
        req.erpOperator = op;
        next();
    };
}

function requireErpOperatorAdmin() {
    return (req, res, next) => {
        const op = getSessionOperator(req);
        if (!op || op.role !== 'admin') {
            return res.status(403).json({ error: 'ERP admin access required' });
        }
        req.erpOperator = op;
        next();
    };
}

function requireErpModule(moduleId) {
    return (req, res, next) => {
        const op = getSessionOperator(req);
        if (!op) {
            return res.status(401).json({ error: 'ERP sign-in required', code: 'ERP_OPERATOR_REQUIRED' });
        }
        if (!operatorCanAccessModule(op, moduleId)) {
            return res.status(403).json({
                error: 'You do not have access to this module',
                module: moduleId,
            });
        }
        req.erpOperator = op;
        next();
    };
}

function erpGateWithOperator(baseErpGate) {
    const opGate = requireErpOperatorSession();
    return (req, res, next) => {
        baseErpGate(req, res, () => {
            if (isOperatorPublicPath(req.path)) return next();
            opGate(req, res, next);
        });
    };
}

function trimUsername(v) {
    return String(v || '')
        .trim()
        .toLowerCase()
        .slice(0, 64);
}

function normalizeModules(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((m) => String(m || '').trim()).filter((m) => ALL_MODULE_IDS.includes(m)))];
}

async function hashPassword(password) {
    return bcrypt.hash(String(password), 12);
}

async function verifyPassword(password, hash) {
    return bcrypt.compare(String(password), hash);
}

function registerOperatorRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, erpGate, requireResellerErp } = deps;

    ensureOperatorsSchema(pool).catch((e) => console.warn('erp operators schema:', e.message));

    // ——— Operator session (reseller ERP) ———
    app.post('/api/reseller/erp/operators/login', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const username = trimUsername(req.body.username);
            const password = String(req.body.password || '');
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }
            const rows = await query(
                `SELECT * FROM reseller_erp_operators
                 WHERE reseller_user_id = $1 AND LOWER(username) = $2 AND is_active = true
                 LIMIT 1`,
                [req.user.id, username],
            );
            if (!rows.length) return res.status(401).json({ error: 'Invalid username or password' });
            const row = rows[0];
            const ok = await verifyPassword(password, row.password_hash);
            if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

            const operator = mapOperator(row);
            req.session.erpOperator = {
                id: operator.id,
                resellerUserId: req.user.id,
                username: operator.username,
                displayName: operator.displayName,
                role: operator.role,
                allowedModules: operator.allowedModules,
                fullAccess: operator.fullAccess,
                shadowAccess: operator.shadowAccess,
            };
            req.session.shadowUnlocked = false;

            await query(
                `UPDATE reseller_erp_operators SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [row.id],
            );

            res.json({ success: true, operator });
        } catch (e) {
            console.error('erp operator login:', e);
            res.status(500).json({ error: e.message || 'Login failed' });
        }
    });

    app.post('/api/reseller/erp/operators/logout', checkAuth, erpGate, async (req, res) => {
        req.session.erpOperator = null;
        req.session.shadowUnlocked = false;
        res.json({ success: true });
    });

    app.get('/api/reseller/erp/operators/me', checkAuth, erpGate, async (req, res) => {
        const op = getSessionOperator(req);
        res.json({
            operator: op ? mapOperator({
                id: op.id,
                username: op.username,
                display_name: op.displayName,
                role: op.role,
                allowed_modules: op.allowedModules,
                full_access: op.fullAccess,
                shadow_access: op.shadowAccess,
                is_active: true,
            }) : null,
            shadowUnlocked: !!req.session?.shadowUnlocked,
        });
    });

    // ——— Operator CRUD (ERP admin) ———
    app.get('/api/reseller/erp/operators', checkAuth, erpGate, requireErpOperatorAdmin(), async (req, res) => {
        try {
            const rows = await query(
                `SELECT id, username, display_name, role, allowed_modules, full_access,
                        shadow_access, is_active, last_login_at, created_at, updated_at
                 FROM reseller_erp_operators
                 WHERE reseller_user_id = $1
                 ORDER BY role DESC, username ASC`,
                [req.user.id],
            );
            res.json({
                operators: rows.map((r) => mapOperator(r, { includeMeta: true })),
                moduleIds: ALL_MODULE_IDS,
            });
        } catch (e) {
            console.error('erp operators list:', e);
            res.status(500).json({ error: e.message || 'Failed to list operators' });
        }
    });

    app.post('/api/reseller/erp/operators', checkAuth, erpGate, requireErpOperatorAdmin(), requireJson, async (req, res) => {
        try {
            const username = trimUsername(req.body.username);
            const password = String(req.body.password || '');
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }
            const role = String(req.body.role || 'staff').toLowerCase() === 'admin' ? 'admin' : 'staff';
            const displayName = String(req.body.display_name || req.body.displayName || username).trim().slice(0, 255);
            const fullAccess = !!req.body.full_access || !!req.body.fullAccess;
            const shadowAccess = role === 'admin';
            const allowedModules = fullAccess ? ALL_MODULE_IDS : normalizeModules(req.body.allowed_modules || req.body.allowedModules);
            const passwordHash = await hashPassword(password);

            const rows = await query(
                `INSERT INTO reseller_erp_operators (
                    reseller_user_id, username, password_hash, display_name, role,
                    allowed_modules, full_access, shadow_access, is_active, created_by
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
                 RETURNING id, username, display_name, role, allowed_modules, full_access, shadow_access, is_active`,
                [
                    req.user.id,
                    username,
                    passwordHash,
                    displayName,
                    role,
                    allowedModules,
                    fullAccess,
                    shadowAccess,
                    req.user.id,
                ],
            );
            res.json({ success: true, operator: mapOperator(rows[0]) });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_operators_username')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            console.error('erp operator create:', e);
            res.status(500).json({ error: e.message || 'Failed to create operator' });
        }
    });

    app.put('/api/reseller/erp/operators/:id', checkAuth, erpGate, requireErpOperatorAdmin(), requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

            const existing = await query(
                `SELECT id FROM reseller_erp_operators WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Operator not found' });

            const role = req.body.role != null
                ? (String(req.body.role).toLowerCase() === 'admin' ? 'admin' : 'staff')
                : null;
            const fullAccess = req.body.full_access != null ? !!req.body.full_access : req.body.fullAccess != null ? !!req.body.fullAccess : null;
            const isActive = req.body.is_active != null ? !!req.body.is_active : req.body.isActive != null ? !!req.body.isActive : null;
            const displayName = req.body.display_name != null || req.body.displayName != null
                ? String(req.body.display_name || req.body.displayName || '').trim().slice(0, 255)
                : null;
            const allowedModules = req.body.allowed_modules != null || req.body.allowedModules != null
                ? normalizeModules(req.body.allowed_modules || req.body.allowedModules)
                : null;

            const sets = [];
            const params = [];
            let idx = 1;

            if (displayName != null) {
                sets.push(`display_name = $${idx++}`);
                params.push(displayName);
            }
            if (role != null) {
                sets.push(`role = $${idx++}`);
                params.push(role);
                sets.push(`shadow_access = $${idx++}`);
                params.push(role === 'admin');
            }
            if (fullAccess != null) {
                sets.push(`full_access = $${idx++}`);
                params.push(fullAccess);
                if (fullAccess && allowedModules == null) {
                    sets.push(`allowed_modules = $${idx++}`);
                    params.push(ALL_MODULE_IDS);
                }
            }
            if (isActive != null) {
                sets.push(`is_active = $${idx++}`);
                params.push(isActive);
            }
            if (allowedModules != null && !fullAccess) {
                sets.push(`allowed_modules = $${idx++}`);
                params.push(allowedModules);
            }
            if (req.body.password) {
                sets.push(`password_hash = $${idx++}`);
                params.push(await hashPassword(String(req.body.password)));
            }

            if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

            sets.push('updated_at = NOW()');
            params.push(id, req.user.id);

            const rows = await query(
                `UPDATE reseller_erp_operators SET ${sets.join(', ')}
                 WHERE id = $${idx++} AND reseller_user_id = $${idx}
                 RETURNING id, username, display_name, role, allowed_modules, full_access, shadow_access, is_active`,
                params,
            );
            res.json({ success: true, operator: mapOperator(rows[0]) });
        } catch (e) {
            console.error('erp operator update:', e);
            res.status(500).json({ error: e.message || 'Failed to update operator' });
        }
    });

    app.delete('/api/reseller/erp/operators/:id', checkAuth, erpGate, requireErpOperatorAdmin(), async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const op = getSessionOperator(req);
            if (op && op.id === id) {
                return res.status(400).json({ error: 'Cannot delete your own account while signed in' });
            }
            const result = await query(
                `DELETE FROM reseller_erp_operators WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!result.length) return res.status(404).json({ error: 'Operator not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('erp operator delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete operator' });
        }
    });

    // ——— KC admin manages operators for any reseller ———
    app.get('/api/admin/users/:userId/erp/operators', isAdminStrict, async (req, res) => {
        try {
            const resellerUserId = parseInt(String(req.params.userId), 10);
            if (!Number.isFinite(resellerUserId)) return res.status(400).json({ error: 'Invalid user id' });
            await ensureOperatorsSchema(pool);
            const rows = await query(
                `SELECT id, username, display_name, role, allowed_modules, full_access,
                        shadow_access, is_active, last_login_at, created_at
                 FROM reseller_erp_operators
                 WHERE reseller_user_id = $1
                 ORDER BY role DESC, username ASC`,
                [resellerUserId],
            );
            res.json({
                operators: rows.map((r) => mapOperator(r, { includeMeta: true })),
                moduleIds: ALL_MODULE_IDS,
            });
        } catch (e) {
            console.error('admin erp operators list:', e);
            res.status(500).json({ error: e.message || 'Failed to list operators' });
        }
    });

    app.post('/api/admin/users/:userId/erp/operators', isAdminStrict, requireJson, async (req, res) => {
        try {
            const resellerUserId = parseInt(String(req.params.userId), 10);
            if (!Number.isFinite(resellerUserId)) return res.status(400).json({ error: 'Invalid user id' });
            await ensureOperatorsSchema(pool);

            const username = trimUsername(req.body.username);
            const password = String(req.body.password || '');
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }
            const role = String(req.body.role || 'staff').toLowerCase() === 'admin' ? 'admin' : 'staff';
            const displayName = String(req.body.display_name || req.body.displayName || username).trim().slice(0, 255);
            const fullAccess = !!req.body.full_access || !!req.body.fullAccess;
            const shadowAccess = role === 'admin';
            const allowedModules = fullAccess ? ALL_MODULE_IDS : normalizeModules(req.body.allowed_modules || req.body.allowedModules);
            const passwordHash = await hashPassword(password);

            const rows = await query(
                `INSERT INTO reseller_erp_operators (
                    reseller_user_id, username, password_hash, display_name, role,
                    allowed_modules, full_access, shadow_access, is_active, created_by
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
                 RETURNING id, username, display_name, role, allowed_modules, full_access, shadow_access, is_active`,
                [resellerUserId, username, passwordHash, displayName, role, allowedModules, fullAccess, shadowAccess, req.user?.id || null],
            );
            res.json({ success: true, operator: mapOperator(rows[0]) });
        } catch (e) {
            if (String(e.message || '').includes('idx_reseller_erp_operators_username')) {
                return res.status(409).json({ error: 'Username already exists' });
            }
            console.error('admin erp operator create:', e);
            res.status(500).json({ error: e.message || 'Failed to create operator' });
        }
    });

    app.put('/api/admin/users/:userId/erp/operators/:id', isAdminStrict, requireJson, async (req, res) => {
        try {
            const resellerUserId = parseInt(String(req.params.userId), 10);
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(resellerUserId) || !Number.isFinite(id)) {
                return res.status(400).json({ error: 'Invalid id' });
            }
            await ensureOperatorsSchema(pool);

            const existing = await query(
                `SELECT id FROM reseller_erp_operators WHERE id = $1 AND reseller_user_id = $2 LIMIT 1`,
                [id, resellerUserId],
            );
            if (!existing.length) return res.status(404).json({ error: 'Operator not found' });

            const role = req.body.role != null
                ? (String(req.body.role).toLowerCase() === 'admin' ? 'admin' : 'staff')
                : null;
            const fullAccess = req.body.full_access != null ? !!req.body.full_access : null;
            const isActive = req.body.is_active != null ? !!req.body.is_active : null;
            const displayName = req.body.display_name != null
                ? String(req.body.display_name).trim().slice(0, 255)
                : null;
            const allowedModules = req.body.allowed_modules != null
                ? normalizeModules(req.body.allowed_modules)
                : null;

            const sets = [];
            const params = [];
            let idx = 1;
            if (displayName != null) { sets.push(`display_name = $${idx++}`); params.push(displayName); }
            if (role != null) {
                sets.push(`role = $${idx++}`);
                params.push(role);
                sets.push(`shadow_access = $${idx++}`);
                params.push(role === 'admin');
            }
            if (fullAccess != null) {
                sets.push(`full_access = $${idx++}`);
                params.push(fullAccess);
                if (fullAccess && allowedModules == null) {
                    sets.push(`allowed_modules = $${idx++}`);
                    params.push(ALL_MODULE_IDS);
                }
            }
            if (isActive != null) { sets.push(`is_active = $${idx++}`); params.push(isActive); }
            if (allowedModules != null && !fullAccess) {
                sets.push(`allowed_modules = $${idx++}`);
                params.push(allowedModules);
            }
            if (req.body.password) {
                sets.push(`password_hash = $${idx++}`);
                params.push(await hashPassword(String(req.body.password)));
            }
            if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
            sets.push('updated_at = NOW()');
            params.push(id, resellerUserId);

            const rows = await query(
                `UPDATE reseller_erp_operators SET ${sets.join(', ')}
                 WHERE id = $${idx++} AND reseller_user_id = $${idx}
                 RETURNING id, username, display_name, role, allowed_modules, full_access, shadow_access, is_active`,
                params,
            );
            res.json({ success: true, operator: mapOperator(rows[0]) });
        } catch (e) {
            console.error('admin erp operator update:', e);
            res.status(500).json({ error: e.message || 'Failed to update operator' });
        }
    });

    app.delete('/api/admin/users/:userId/erp/operators/:id', isAdminStrict, async (req, res) => {
        try {
            const resellerUserId = parseInt(String(req.params.userId), 10);
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(resellerUserId) || !Number.isFinite(id)) {
                return res.status(400).json({ error: 'Invalid id' });
            }
            await ensureOperatorsSchema(pool);
            const result = await query(
                `DELETE FROM reseller_erp_operators WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, resellerUserId],
            );
            if (!result.length) return res.status(404).json({ error: 'Operator not found' });
            res.json({ success: true });
        } catch (e) {
            console.error('admin erp operator delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete operator' });
        }
    });
}

module.exports = {
    ALL_MODULE_IDS,
    DEFAULT_SHADOW_SEQUENCE,
    ensureOperatorsSchema,
    erpGateWithOperator,
    getSessionOperator,
    mapOperator,
    operatorCanAccessModule,
    registerOperatorRoutes,
    requireErpModule,
    requireErpOperatorAdmin,
    requireErpOperatorSession,
};

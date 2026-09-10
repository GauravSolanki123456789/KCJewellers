/**
 * Reseller ERP data backup — JSON dump of this shop's ERP tables only.
 */

const BACKUP_TABLES = [
    'reseller_erp_customers',
    'reseller_erp_settings',
    'reseller_erp_bills',
    'reseller_erp_stock_alerts',
    'reseller_erp_karigars',
    'reseller_erp_order_jobs',
    'reseller_erp_ledger_entries',
    'reseller_erp_ledger_import_batches',
    'reseller_erp_shadow_bills',
    'reseller_erp_purchase_vouchers',
    'reseller_erp_employees',
    'reseller_erp_stock_batches',
    'reseller_erp_stock_pieces',
    'reseller_erp_stock_import_batches',
    'reseller_erp_design_styles',
    'reseller_erp_design_skus',
    'reseller_erp_design_sku_sizes',
    'reseller_erp_floors',
    'reseller_erp_boxes',
    'reseller_erp_rol_weight_ranges',
    'reseller_erp_tag_operations',
];

const ROW_LIMIT = 50000;

function slugPart(s) {
    return String(s || 'shop')
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 40)
        .replace(/-+$/g, '')
        .toLowerCase() || 'shop';
}

async function dumpTable(query, table, userId) {
    try {
        const rows = await query(
            `SELECT * FROM ${table} WHERE reseller_user_id = $1 LIMIT ${ROW_LIMIT}`,
            [userId],
        );
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        const code = e && e.code;
        if (code === '42P01' || code === '42703') return [];
        const msg = String(e.message || '');
        if (msg.includes('does not exist')) return [];
        throw e;
    }
}

async function dumpOperatorsSafe(query, userId) {
    try {
        const rows = await query(
            `SELECT id, username, display_name, role, allowed_modules, full_access,
                    shadow_access, is_active, last_login_at, created_at, updated_at
             FROM reseller_erp_operators
             WHERE reseller_user_id = $1
             LIMIT 500`,
            [userId],
        );
        return Array.isArray(rows) ? rows : [];
    } catch (e) {
        if (e && (e.code === '42P01' || e.code === '42703')) return [];
        if (String(e.message || '').includes('does not exist')) return [];
        throw e;
    }
}

async function buildErpBackup(query, userId) {
    const tables = {};
    let rowCount = 0;
    for (const table of BACKUP_TABLES) {
        const rows = await dumpTable(query, table, userId);
        tables[table] = rows;
        rowCount += rows.length;
    }
    tables.reseller_erp_operators = await dumpOperatorsSafe(query, userId);
    rowCount += tables.reseller_erp_operators.length;

    let businessName = '';
    try {
        const u = await query(
            `SELECT business_name FROM users WHERE id = $1 LIMIT 1`,
            [userId],
        );
        businessName = (u[0] && u[0].business_name) || '';
    } catch {
        /* ignore */
    }

    return {
        format: 'kc-erp-backup',
        version: 1,
        exported_at: new Date().toISOString(),
        reseller_user_id: userId,
        business_name: businessName || null,
        row_count: rowCount,
        tables,
    };
}

const { getSessionOperator, operatorCanAccessModule } = require('./resellerErpOperators');

function registerResellerErpBackupRoutes(app, deps) {
    const { query, checkAuth, erpGate } = deps;

    app.get('/api/reseller/erp/backup', checkAuth, erpGate, async (req, res) => {
        try {
            const op = getSessionOperator(req);
            if (!operatorCanAccessModule(op, 'backup')) {
                return res.status(403).json({
                    error: 'You do not have access to this module',
                    module: 'backup',
                });
            }
            const payload = await buildErpBackup(query, req.user.id);
            const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const fname = `erp-backup-${slugPart(payload.business_name)}-${day}.json`;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
            res.setHeader('Cache-Control', 'no-store');
            res.send(JSON.stringify(payload, null, 2));
        } catch (e) {
            console.error('erp backup:', e);
            res.status(500).json({ error: e.message || 'Backup failed' });
        }
    });
}

module.exports = {
    registerResellerErpBackupRoutes,
    buildErpBackup,
};

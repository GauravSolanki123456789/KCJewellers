// ============================================
// B2B whitelist: auto-assign B2B_WHOLESALE on login
// ============================================

const { pool } = require('../config/database');
const { resolveUserRole, ERP_ROLES } = require('./authService');

/**
 * If email/mobile matches b2b_whitelist, set role B2B_WHOLESALE and default tiers.
 * Does not downgrade ERP staff or super_admin.
 * @param {object} user - row from users
 * @returns {Promise<object>} refreshed user (resolveUserRole applied)
 */
async function applyB2BWhitelistOnLogin(user) {
    if (!user || !user.id) return user;
    const email = user.email ? String(user.email).toLowerCase().trim() : null;
    const mobile = user.mobile_number
        ? String(user.mobile_number).replace(/\D/g, '').slice(-10)
        : null;
    if (!email && !mobile) return resolveUserRole(user);

    const r0 = String(user.role || '').trim();
    if (ERP_ROLES.has(r0) || r0 === 'super_admin') return resolveUserRole(user);

    try {
        const { rows } = await pool.query(
            `SELECT * FROM b2b_whitelist
             WHERE ($1::text IS NOT NULL AND LOWER(TRIM(email_norm)) = $1)
                OR ($2::text IS NOT NULL AND mobile_last10 = $2)
             LIMIT 1`,
            [email, mobile],
        );
        if (rows.length === 0) return resolveUserRole(user);

        const w = rows[0];
        const mc = w.default_mc_discount_percent != null ? Number(w.default_mc_discount_percent) : null;
        const mm = w.default_metal_markup_percent != null ? Number(w.default_metal_markup_percent) : null;

        await pool.query(
            `UPDATE users SET
                role = 'B2B_WHOLESALE',
                mc_discount_percent = CASE WHEN $2::numeric IS NOT NULL THEN $2 ELSE COALESCE(mc_discount_percent, 0) END,
                metal_markup_percent = CASE WHEN $3::numeric IS NOT NULL THEN $3 ELSE COALESCE(metal_markup_percent, 0) END,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND role NOT IN ('super_admin', 'admin', 'employee')`,
            [user.id, mc, mm],
        );

        const refreshed = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
        if (refreshed.rows.length === 0) return resolveUserRole(user);
        return resolveUserRole(refreshed.rows[0]);
    } catch (e) {
        console.warn('applyB2BWhitelistOnLogin:', e?.message || e);
        return resolveUserRole(user);
    }
}

module.exports = { applyB2BWhitelistOnLogin };

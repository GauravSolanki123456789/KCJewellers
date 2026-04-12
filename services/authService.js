// ============================================
// AUTH SERVICE — Super Admin, ERP roles, B2B wholesale
// ============================================

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com';

/** ERP / staff roles that must never be forced to retail customer. */
const ERP_ROLES = new Set(['super_admin', 'admin', 'employee']);

/** Commerce storefront roles */
const COMMERCE_ROLES = new Set(['B2C_CUSTOMER', 'B2B_WHOLESALE']);

function normalizeLegacyRole(role) {
    const r = String(role || '').trim();
    if (r === 'customer') return 'B2C_CUSTOMER';
    return r;
}

/**
 * Resolve user role: super-admin email always wins; otherwise preserve DB role
 * (B2B wholesale, ERP admin, etc.). Legacy `customer` → B2C_CUSTOMER.
 * @param {Object|null} user
 * @returns {Object|null}
 */
function resolveUserRole(user) {
    if (!user) return null;
    const email = String(user.email || '').toLowerCase().trim();
    const superAdminEmail = String(SUPER_ADMIN_EMAIL).toLowerCase().trim();

    if (email && email === superAdminEmail) {
        return {
            ...user,
            role: 'super_admin',
            allowed_tabs: ['all'],
            account_status: user.account_status || 'active',
        };
    }

    const role = normalizeLegacyRole(user.role);
    return { ...user, role };
}

function isSuperAdmin(email) {
    return String(email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

/** True if user gets B2B wholesale pricing on the Next.js storefront. */
function isB2BWholesaleRole(user) {
    if (!user) return false;
    const r = normalizeLegacyRole(user.role);
    return r === 'B2B_WHOLESALE';
}

/** True if user is ERP staff (dashboard / admin.html), not a retail-only account. */
function isErpStaffRole(user) {
    if (!user) return false;
    const r = String(user.role || '').trim();
    return ERP_ROLES.has(r);
}

module.exports = {
    SUPER_ADMIN_EMAIL,
    ERP_ROLES,
    COMMERCE_ROLES,
    normalizeLegacyRole,
    resolveUserRole,
    isSuperAdmin,
    isB2BWholesaleRole,
    isErpStaffRole,
};

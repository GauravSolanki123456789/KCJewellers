// ============================================
// AUTH SERVICE - Super Admin & Role Enforcement
// Gaurav Softwares - Jewelry Estimation
// ============================================

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com';

/**
 * Resolve user role based on hardcoded Super Admin check.
 * - jaigaurav56789@gmail.com → always 'super_admin' with ['all'] allowed_tabs
 * - All others → always 'customer' (admin access denied)
 * @param {Object} user - User object from DB
 * @returns {Object} User with role forced
 */
function resolveUserRole(user) {
    if (!user) return null;
    const email = String(user.email || '').toLowerCase().trim();
    const superAdminEmail = String(SUPER_ADMIN_EMAIL).toLowerCase().trim();
    // OTP-only users have no email; always customer
    if (!email) {
        return { ...user, role: 'customer', allowed_tabs: user.allowed_tabs || [] };
    }
    
    if (email === superAdminEmail) {
        // Strict override: Force super_admin role and all tabs access
        return { 
            ...user, 
            role: 'super_admin',
            allowed_tabs: ['all'],
            account_status: user.account_status || 'active'
        };
    }
    // Deny admin access to everyone else - force customer role
    return { 
        ...user, 
        role: 'customer',
        allowed_tabs: user.allowed_tabs || []
    };
}

/**
 * Check if email is the Super Admin
 * @param {string} email
 * @returns {boolean}
 */
function isSuperAdmin(email) {
    return String(email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

/** Customer tier values — consistent with DB `users.customer_tier` and Prisma `CustomerTier`. */
const CUSTOMER_TIER = {
    ADMIN: 'ADMIN',
    B2C_CUSTOMER: 'B2C_CUSTOMER',
    B2B_WHOLESALE: 'B2B_WHOLESALE',
    RESELLER: 'RESELLER',
};

/**
 * Wholesale catalogue, quick order, and ledger (Khata) — super admin or B2B / ADMIN tier.
 * @param {Object|null} user - user row or session user
 */
function hasWholesaleCatalogAccess(user) {
    if (!user) return false;
    const email = String(user.email || '').toLowerCase().trim();
    if (email === SUPER_ADMIN_EMAIL.toLowerCase().trim()) return true;
    const tier = String(user.customer_tier || CUSTOMER_TIER.B2C_CUSTOMER).toUpperCase();
    return (
        tier === CUSTOMER_TIER.B2B_WHOLESALE ||
        tier === CUSTOMER_TIER.ADMIN ||
        tier === CUSTOMER_TIER.RESELLER
    );
}

module.exports = {
    SUPER_ADMIN_EMAIL,
    resolveUserRole,
    isSuperAdmin,
    CUSTOMER_TIER,
    hasWholesaleCatalogAccess,
};

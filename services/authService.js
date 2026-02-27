// ============================================
// AUTH SERVICE - Super Admin & Role Enforcement
// Gaurav Softwares - Jewelry Estimation
// ============================================

const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com';

/**
 * Resolve user role based on hardcoded Super Admin check.
 * - jaigaurav56789@gmail.com → always 'admin'
 * - All others → always 'customer'
 * @param {Object} user - User object from DB
 * @returns {Object} User with role forced
 */
function resolveUserRole(user) {
    if (!user) return null;
    const email = String(user.email || '').toLowerCase().trim();
    const forcedRole = email === SUPER_ADMIN_EMAIL ? 'admin' : 'customer';
    return { ...user, role: forcedRole };
}

/**
 * Check if email is the Super Admin
 * @param {string} email
 * @returns {boolean}
 */
function isSuperAdmin(email) {
    return String(email || '').toLowerCase().trim() === SUPER_ADMIN_EMAIL;
}

module.exports = {
    SUPER_ADMIN_EMAIL,
    resolveUserRole,
    isSuperAdmin
};

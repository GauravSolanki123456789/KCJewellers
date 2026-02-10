// Role-Based Access Control Middleware
// This file is kept for backward compatibility
// All functions are now in middleware/auth.js

const {
    checkAuth,
    checkAdmin,
    checkRole,
    noCache,
    securityHeaders,
    requireActiveAccount,
    getUserPermissions,
    verifyTenantAccess
} = require('./auth');

module.exports = {
    checkRole,
    checkAuth,
    checkAdmin,
    noCache,
    securityHeaders,
    requireActiveAccount,
    getUserPermissions,
    verifyTenantAccess
};

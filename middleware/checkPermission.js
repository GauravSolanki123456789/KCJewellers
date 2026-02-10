// ============================================
// GRANULAR PERMISSION ENFORCEMENT MIDDLEWARE
// Module-Based Access Control
// ============================================

/**
 * Permission Module Mapping
 * Maps route categories to permission module names
 */
const MODULE_MAPPING = {
    // Sales & Billing
    'billing': ['billing'],
    'salesbill': ['salesbill', 'billing'],
    'salesreturn': ['salesreturn', 'billing'],
    'quotations': ['quotations', 'billing'],
    'billhistory': ['billhistory', 'billing'],
    
    // Inventory
    'inventory': ['products', 'pv', 'tagsplit', 'tagsearch', 'floor'],
    'products': ['products'],
    'pv': ['pv', 'products'],
    'stock-in': ['pv', 'products'],
    'tagsplit': ['tagsplit'],
    'tagsearch': ['tagsearch'],
    'floor': ['floor'],
    
    // CRM & Finance
    'customers': ['customers'],
    'crm': ['customers'],
    'ledger': ['ledger'],
    
    // Management
    'reports': ['reports'],
    'rol': ['rol'],
    'styles': ['styles'],
    
    // Admin only (handled by role check)
    'admin': ['admin']
};

/**
 * Check if user has permission for a specific module
 * @param {Object} user - The user object from req.user
 * @param {string} requiredModule - The module permission to check
 * @returns {boolean}
 */
function userHasPermission(user, requiredModule) {
    if (!user) return false;
    
    // Super Admin always has access
    if (user.email === 'jaigaurav56789@gmail.com') {
        return true;
    }
    
    // Admin role has full access
    if (user.role === 'admin' || user.role === 'super_admin') {
        return true;
    }
    
    // Check if account is active
    if (user.account_status !== 'active') {
        return false;
    }
    
    // Get user's allowed modules
    const allowedTabs = user.allowed_tabs || [];
    const permissions = user.permissions || {};
    
    // Check for full access
    if (allowedTabs.includes('all') || allowedTabs.includes('*')) {
        return true;
    }
    if (permissions.all === true) {
        return true;
    }
    if (permissions.modules && (permissions.modules.includes('*') || permissions.modules.includes('all'))) {
        return true;
    }
    
    // Check for no2_access permission (Shadow Mode access)
    // This is checked separately and doesn't wipe existing permissions
    if (permissions.no2_access === true) {
        // no2_access grants access to internal estimates mode
        // This is a special permission that doesn't affect other module access
    }
    
    // Get acceptable modules for this permission
    const acceptableModules = MODULE_MAPPING[requiredModule] || [requiredModule];
    
    // Check allowed_tabs array
    for (const mod of acceptableModules) {
        if (allowedTabs.includes(mod)) {
            return true;
        }
    }
    
    // Check permissions.modules array
    if (permissions.modules && Array.isArray(permissions.modules)) {
        for (const mod of acceptableModules) {
            if (permissions.modules.includes(mod)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Middleware Factory: hasPermission
 * Creates middleware that checks for specific module permission
 * 
 * @param {string|string[]} requiredModules - Module(s) required for access
 * @returns {Function} Express middleware
 * 
 * @example
 * // Single module
 * app.get('/api/reports', hasPermission('reports'), handler);
 * 
 * // Multiple modules (user needs at least one)
 * app.get('/api/inventory', hasPermission(['products', 'pv']), handler);
 */
const hasPermission = (requiredModules) => {
    return (req, res, next) => {
        // Must be authenticated first
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const user = req.user;
        
        if (!user) {
            return res.status(401).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        // Check account status
        if (user.account_status !== 'active') {
            return res.status(403).json({
                error: `Account status: ${user.account_status}`,
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        // Convert to array if string
        const modules = Array.isArray(requiredModules) ? requiredModules : [requiredModules];
        
        // Check if user has permission for ANY of the required modules
        const hasAccess = modules.some(mod => userHasPermission(user, mod));
        
        if (!hasAccess) {
            console.warn(`🚫 Permission denied: User ${user.email} tried to access [${modules.join(', ')}]`);
            
            return res.status(403).json({
                error: 'Access denied. You do not have permission for this module.',
                code: 'PERMISSION_DENIED',
                required: modules,
                user_permissions: user.allowed_tabs || []
            });
        }
        
        // Permission granted
        next();
    };
};

/**
 * Middleware: requireAnyPermission
 * User must have at least one of the specified permissions
 */
const requireAnyPermission = hasPermission;

/**
 * Middleware: requireAllPermissions
 * User must have ALL specified permissions
 * 
 * @param {string[]} requiredModules - All modules required for access
 */
const requireAllPermissions = (requiredModules) => {
    return (req, res, next) => {
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'AUTH_REQUIRED'
            });
        }
        
        const user = req.user;
        
        if (!user || user.account_status !== 'active') {
            return res.status(403).json({
                error: 'Account not active',
                code: 'ACCOUNT_INACTIVE'
            });
        }
        
        const modules = Array.isArray(requiredModules) ? requiredModules : [requiredModules];
        
        // Check if user has permission for ALL required modules
        const hasAllAccess = modules.every(mod => userHasPermission(user, mod));
        
        if (!hasAllAccess) {
            return res.status(403).json({
                error: 'Access denied. You need all required permissions.',
                code: 'PERMISSION_DENIED',
                required: modules
            });
        }
        
        next();
    };
};

/**
 * Helper: Get full permission context for a user
 * Returns detailed permission object for frontend use
 */
const getPermissionContext = (user) => {
    if (!user) {
        return {
            isAuthenticated: false,
            isAdmin: false,
            isSuperAdmin: false,
            hasFullAccess: false,
            modules: [],
            allowedTabs: [],
            canAccess: {}
        };
    }
    
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isSuperAdmin = user.email === 'jaigaurav56789@gmail.com';
    const allowedTabs = user.allowed_tabs || [];
    const permissions = user.permissions || {};
    const hasFullAccess = isAdmin || isSuperAdmin || allowedTabs.includes('all') || permissions.all === true;
    
    // Build module access map
    const allModules = ['billing', 'salesbill', 'salesreturn', 'quotations', 'billhistory',
                       'products', 'pv', 'tagsplit', 'tagsearch', 'floor',
                       'customers', 'ledger', 'reports', 'rol', 'styles'];
    
    const canAccess = {};
    allModules.forEach(mod => {
        canAccess[mod] = hasFullAccess || userHasPermission(user, mod);
    });
    
    // Special admin permissions
    canAccess.admin = isAdmin;
    canAccess.userManagement = isAdmin;
    canAccess.settings = isAdmin;
    canAccess.softwareUpdate = isAdmin;
    
    // Shadow Mode (Number 2) access - check no2_access permission
    // This is preserved in permissions object and doesn't wipe existing permissions
    const no2Access = permissions.no2_access === true || isAdmin || isSuperAdmin;
    
    return {
        isAuthenticated: true,
        isAdmin,
        isSuperAdmin,
        hasFullAccess,
        role: user.role,
        accountStatus: user.account_status,
        modules: hasFullAccess ? ['*'] : allowedTabs.filter(t => t !== 'all'),
        allowedTabs,
        permissions: {
            ...permissions,
            no2_access: no2Access
        },
        canAccess,
        no2_access: no2Access
    };
};

module.exports = {
    hasPermission,
    requireAnyPermission,
    requireAllPermissions,
    userHasPermission,
    getPermissionContext,
    MODULE_MAPPING
};

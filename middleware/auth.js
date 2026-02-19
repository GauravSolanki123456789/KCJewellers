// ============================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// Security-First Single-Tenant Architecture
// ============================================

/**
 * Middleware: checkAuth
 * Verifies user is logged in with an active account
 */
const checkAuth = (req, res, next) => {
    if (!req.isAuthenticated()) {
        // For API requests, return JSON error
        if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                error: 'Not authenticated',
                code: 'AUTH_REQUIRED',
                redirect: '/login'
            });
        }
        // For page requests, redirect to login
        return res.redirect('/');
    }
    
    // Check if account is active
    if (req.user.account_status !== 'active') {
        if (req.user.account_status === 'pending') {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ 
                    error: 'Account pending approval',
                    code: 'ACCOUNT_PENDING'
                });
            }
            return res.redirect('/complete-profile.html');
        }
        
        // Account is rejected/suspended
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                error: 'Account suspended',
                code: 'ACCOUNT_SUSPENDED'
            });
        }
        return res.redirect('/unauth.html?reason=suspended');
    }
    
    next();
};

/**
 * Middleware: checkAdmin
 * Verifies user is an admin
 */
const checkAdmin = (req, res, next) => {
    if (!req.isAuthenticated()) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        return res.redirect('/');
    }
    
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                error: 'Admin access required',
                code: 'ADMIN_REQUIRED'
            });
        }
        return res.redirect('/unauth.html?reason=admin_required');
    }
    
    if (req.user.account_status !== 'active') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Account not active' });
        }
        return res.redirect('/unauth.html?reason=not_active');
    }
    
    next();
};

/**
 * Middleware: checkRole
 * Verifies user has one of the specified roles
 * @param {string|string[]} roles - Role(s) allowed to access
 */
const checkRole = (roles) => {
    return (req, res, next) => {
        // Convert string to array
        if (typeof roles === 'string') {
            roles = [roles];
        }

        if (!req.isAuthenticated()) {
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            return res.redirect('/');
        }
        
        // Admin always has access
        if (req.user.role === 'admin' || req.user.role === 'super_admin') {
            return next();
        }

        if (req.user.account_status !== 'active') {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Account is not active' });
            }
            return res.redirect('/unauth.html?reason=not_active');
        }

        if (roles.includes(req.user.role)) {
            next();
        } else {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
            }
            return res.redirect('/unauth.html?reason=insufficient_permissions');
        }
    };
};

/**
 * Middleware: noCache
 * Prevents browser from caching protected pages (fixes back button bug)
 */
const noCache = (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
};

/**
 * Middleware: securityHeaders
 * Adds security headers to all responses
 */
const securityHeaders = (req, res, next) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Enable XSS filter
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // Referrer policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
};

/**
 * Middleware: requireActiveAccount
 * Just checks if account is active (for routes that need it)
 */
const requireActiveAccount = (req, res, next) => {
    if (!req.isAuthenticated()) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        return res.redirect('/');
    }
    
    if (req.user.account_status !== 'active') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                error: `Account status: ${req.user.account_status}. Access denied.`
            });
        }
        return res.redirect('/unauth.html?reason=' + req.user.account_status);
    }
    
    next();
};

/**
 * Helper: Get user permissions for frontend
 * Returns object describing what user can access
 */
const getUserPermissions = (user) => {
    if (!user) {
        return {
            isLoggedIn: false,
            isAdmin: false,
            canManageUsers: false,
            canUpdateSoftware: false,
            canAccessBilling: false,
            canAccessProducts: false,
            allowedTabs: []
        };
    }
    
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const allowedTabs = user.allowed_tabs || [];
    const hasAllAccess = allowedTabs.includes('all');
    
    const permissions = user.permissions || {};
    const no2Access = permissions.no2_access === true || isAdmin;
    
    return {
        isLoggedIn: true,
        isAdmin: isAdmin,
        role: user.role,
        accountStatus: user.account_status,
        canManageUsers: isAdmin,
        canUpdateSoftware: isAdmin,
        canAccessBilling: isAdmin || hasAllAccess || allowedTabs.includes('billing'),
        canAccessProducts: isAdmin || hasAllAccess || allowedTabs.includes('products'),
        canAccessCustomers: isAdmin || hasAllAccess || allowedTabs.includes('customers'),
        canAccessReports: isAdmin || hasAllAccess || allowedTabs.includes('reports'),
        canAccessSettings: isAdmin,
        allowedTabs: hasAllAccess ? ['all'] : allowedTabs,
        no2_access: no2Access,
        permissions: {
            ...permissions,
            no2_access: no2Access
        }
    };
};

// For backward compatibility
const verifyTenantAccess = checkAuth;

module.exports = {
    checkAuth,
    checkAdmin,
    checkRole,
    noCache,
    securityHeaders,
    requireActiveAccount,
    getUserPermissions,
    verifyTenantAccess,
    /**
     * Strict admin guard: only allow the whitelisted super admin email
     */
    isAdminStrict: (req, res, next) => {
        try {
            if (!req.isAuthenticated || !req.isAuthenticated()) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const email = String(req.user?.email || '').toLowerCase().trim();
            if (email !== 'jaigaurav56789@gmail.com') {
                return res.status(403).json({ error: 'Admin access restricted to whitelisted email' });
            }
            if (req.user?.account_status && req.user.account_status !== 'active') {
                return res.status(403).json({ error: 'Account not active' });
            }
            next();
        } catch (e) {
            return res.status(500).json({ error: 'Access check failed' });
        }
    }
};

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const session = require('express-session');
const passport = require('./config/passport');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const { 
    pool, 
    initDatabase, 
    query,
    getPool
} = require('./config/database');
const { checkRole, checkAuth, checkAdmin, noCache, securityHeaders, getUserPermissions, isAdminStrict } = require('./middleware/auth');
const { resolveUserRole } = require('./services/authService');
const { sanitizeMiddleware, validateNumbers } = require('./middleware/sanitize');
const { globalLimiter, authLimiter, adminLimiter, requireJson } = require('./middleware/rateLimit');
const { hasPermission, getPermissionContext } = require('./middleware/checkPermission');
const TallyIntegration = require('./config/tally-integration');
const TallySyncService = require('./config/tally-sync-service');
const { calculateBillTotals, calculatePurchaseCost } = require('./services/pricingService');
const liveRateService = require('./services/liveRateService');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3001", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});
const PORT = process.env.PORT || 3000;

// Middleware - CORS must allow credentials for cookie sharing (Next.js client on 3001)
app.use(cors({ 
    origin: 'http://localhost:3001', 
    credentials: true 
}));
app.use(express.json());

// Session and Passport MUST run before /api/admin so req.user is populated
app.use(session({
    secret: process.env.SESSION_SECRET || 'jewelry_estimation_secret_change_me',
    resave: false,
    saveUninitialized: true,
    name: 'jp.sid',
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        ...(process.env.NODE_ENV !== 'production' && { domain: 'localhost' })
    }
}));
app.use(passport.initialize());
app.use(passport.session());

function strictAdminOrigin(req, res, next) {
    const list = String(process.env.ADMIN_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return next();
    const origin = String(req.headers.origin || '');
    const referer = String(req.headers.referer || '');
    const ok = list.some(a => (origin && origin.startsWith(a)) || (referer && referer.startsWith(a)));
    if (!ok) return res.status(403).json({ error: 'Forbidden origin' });
    next();
}
app.use('/api/admin', adminLimiter, requireJson, strictAdminOrigin, isAdminStrict);

// SECURITY: Apply security headers to all requests
app.use(securityHeaders);

// SECURITY: Global input sanitation and baseline rate limit
app.use(sanitizeMiddleware());
app.use(globalLimiter);

// SECURITY: Middleware to sanitize password fields from logging
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        const sanitizedBody = { ...req.body };
        if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
        if (sanitizedBody.masterPassword) sanitizedBody.masterPassword = '[REDACTED]';
        if (sanitizedBody.adminPassword) sanitizedBody.adminPassword = '[REDACTED]';
        req.sanitizedBody = sanitizedBody;
    }
    next();
});

// Store admin sessions
const adminSessions = new Map();

// Admin panel protection
app.use('/admin.html', async (req, res, next) => {
    const sessionToken = req.query.session || req.headers['x-admin-session'];
    const authQuery = req.query.auth;
    
    if (sessionToken && adminSessions.has(sessionToken)) {
        const session = adminSessions.get(sessionToken);
        if (session.expires > Date.now()) {
            return next();
        } else {
            adminSessions.delete(sessionToken);
        }
    }
    
    if (authQuery) {
        try {
            const credentials = Buffer.from(authQuery, 'base64').toString('utf-8');
            const [username, password] = credentials.split(':');
            
            const admin = await pool.query(
                'SELECT * FROM admin_users WHERE username = $1',
                [username]
            );
            
            if (admin.rows.length > 0) {
                const isValid = await bcrypt.compare(password, admin.rows[0].password_hash);
                if (isValid && admin.rows[0].is_super_admin) {
                    const sessionId = require('crypto').randomBytes(32).toString('hex');
                    adminSessions.set(sessionId, {
                        username,
                        expires: Date.now() + (24 * 60 * 60 * 1000)
                    });
                    return res.redirect(`/admin.html?session=${sessionId}`);
                }
            }
        } catch (error) {
            console.error('Admin auth error:', error);
        }
    }
    
    return res.redirect('/admin-login.html');
});

// Clean expired sessions (every hour)
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of adminSessions.entries()) {
        if (session.expires < now) {
            adminSessions.delete(token);
        }
    }
}, 60 * 60 * 1000);

// ==========================================
// GOOGLE OAUTH ROUTES
// ==========================================

// Bypass Login (localhost development only) - explicit route for "Bypass Login" button
app.get('/auth/bypass', authLimiter, async (req, res, next) => {
    const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || process.env.NODE_ENV === 'development';
    if (!isLocalhost) {
        return res.status(403).json({ error: 'Bypass login only available on localhost' });
    }
    const email = 'jaigaurav56789@gmail.com';
    try {
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        let user = result.rows[0];
        if (!user) {
            const newUser = await pool.query(`
                INSERT INTO users (email, name, role, account_status, allowed_tabs, permissions)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `, [email, 'Local Admin', 'admin', 'active', ['all'], JSON.stringify({ all: true, modules: ['*'] })]);
            user = newUser.rows[0];
        }
        const resolvedUser = resolveUserRole(user);
        req.login(resolvedUser, (err) => {
            if (err) return next(err);
            const redirect = req.query.redirect && typeof req.query.redirect === 'string' ? req.query.redirect : '/';
            res.redirect(redirect);
        });
    } catch (error) {
        console.error('Bypass Error:', error);
        res.status(500).send('Local login failed: ' + error.message);
    }
});

app.get('/auth/google', authLimiter, async (req, res, next) => {
    // 🛠️ LOCAL DEV BYPASS
    if (process.env.NODE_ENV === 'development') {
        console.log("🛠️ Local Dev Detected: Attempting Bypass...");
        
        try {
            const email = 'jaigaurav56789@gmail.com'; // Your admin email
            
            // 1. Try to find the user in your LOCAL database
            let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            let user = result.rows[0];

            // 2. If user doesn't exist locally, create a temporary one so you don't crash
            if (!user) {
                console.log("⚠️ Admin not found locally. Creating one...");
                // Note: We let PostgreSQL generate the UUID automatically to avoid syntax errors
                const newUser = await pool.query(`
                    INSERT INTO users (email, name, role, account_status, allowed_tabs, permissions)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING *
                `, [
                    email, 
                    'Local Admin', 
                    'super_admin', 
                    'active', 
                    ['all'], 
                    JSON.stringify({ all: true, modules: ["*"] })
                ]);
                user = newUser.rows[0];
            }

            // 3. Force role via authService, then log in
            const resolvedUser = resolveUserRole(user);
            req.login(resolvedUser, (err) => {
                if (err) { 
                    console.error("Login Error:", err);
                    return next(err); 
                }
                return res.redirect('/'); // Success! Go to dashboard
            });

        } catch (error) {
            console.error("Bypass Error:", error);
            res.status(500).send("Local login failed: " + error.message);
        }
    } else {
        // 🔒 PRODUCTION: Strict Google Auth
        passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
    }
});


// Google OAuth Callback - Handle whitelist denial
app.get('/auth/google/callback', authLimiter, 
    passport.authenticate('google', { 
        failureRedirect: (process.env.CLIENT_URL || 'http://localhost:3001') + '/?auth=failed&reason=ACCESS_DENIED',
        failureMessage: true
    }),
    (req, res) => {
        // User passed whitelist check - session/cookie is set by passport before this handler
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
        if (!req.user) {
            return res.redirect(clientUrl + '/?auth=failed&reason=ACCESS_DENIED');
        }
        
        if (req.user.account_status === 'pending') {
            res.redirect(clientUrl + '/complete-profile');
        } else if (req.user.account_status === 'active') {
            res.redirect(clientUrl);
        } else if (req.user.account_status === 'rejected' || req.user.account_status === 'suspended') {
            // Destroy session for suspended users
            req.logout((err) => {
                if (err) { console.error('Logout error:', err); }
                req.session.destroy((err) => {
                    if (err) { console.error('Session destroy error:', err); }
                    res.clearCookie('jp.sid');
                    res.redirect(clientUrl + '/?auth=suspended&email=' + encodeURIComponent(req.user?.email || ''));
                });
            });
        } else {
            res.redirect(clientUrl);
        }
    }
);  

// Current user endpoint - include full permissions context
app.get('/api/auth/current_user', (req, res) => {
    if (req.isAuthenticated()) {
        // Get both legacy and new permission formats
        const legacyPermissions = getUserPermissions(req.user);
        const permissionContext = getPermissionContext(req.user);
        
        res.json({ 
            isAuthenticated: true, 
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                role: req.user.role,
                account_status: req.user.account_status,
                allowed_tabs: req.user.allowed_tabs || [],
                permissions: req.user.permissions || {}
            },
            // Legacy format for backward compatibility
            permissions: legacyPermissions,
            // New granular permission context
            permissionContext: permissionContext
        });
    } else {
        res.json({ 
            isAuthenticated: false,
            permissions: getUserPermissions(null),
            permissionContext: getPermissionContext(null)
        });
    }
});

// Complete Profile (Update user details after first login)
app.post('/api/users/complete-profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { phone, dob, companyName } = req.body;

    try {
        await pool.query(
            'UPDATE users SET phone_number = $1, dob = $2, company_name = $3, account_status = $4 WHERE id = $5',
            [phone, dob, companyName, 'pending', req.user.id]
        );
        
        req.user.phone_number = phone;
        req.user.dob = dob;
        req.user.company_name = companyName;
        req.user.account_status = 'pending';

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SECURE LOGOUT (Fixes back button bug)
// ==========================================

app.get('/api/auth/logout', (req, res) => {
    const performLogout = () => {
        req.logout((err) => {
            if (err) { console.error('Logout error:', err); }
            
            // Destroy the session completely
            req.session.destroy((sessionErr) => {
                if (sessionErr) { console.error('Session destroy error:', sessionErr); }
                
                // Clear all cookies
                res.clearCookie('jp.sid', { path: '/' });
                res.clearCookie('connect.sid', { path: '/' }); // Legacy fallback
                
                // Set cache control to prevent back button access
                res.set({
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                
                res.redirect('/');
            });
        });
    };
    
    performLogout();
});

app.post('/api/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) { 
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' }); 
        }
        
        // Destroy the session completely
        req.session.destroy((sessionErr) => {
            if (sessionErr) { console.error('Session destroy error:', sessionErr); }
            
            // Clear all cookies
            res.clearCookie('jp.sid', { path: '/' });
            res.clearCookie('connect.sid', { path: '/' });
            
            // Set cache control headers
            res.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            
            res.json({ success: true, message: 'Logged out successfully' });
        });
    });
});

// Static files
app.use(express.static('public'));

// ==========================================
// SCHEMA CHECK FUNCTION - Ensures products table has required columns
// ==========================================
async function checkAndUpdateProductsSchema() {
    try {
        console.log('🔍 Checking products table schema...');
        
        const dbPool = getPool();
        
        // Check and add 'status' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'status'
                ) THEN
                    ALTER TABLE products ADD COLUMN status VARCHAR(50) DEFAULT 'available';
                    UPDATE products SET status = 'available' WHERE status IS NULL;
                    UPDATE products SET status = 'sold' WHERE is_sold = true;
                    RAISE NOTICE 'Added status column';
                END IF;
            END $$;
        `);
        
        // Check and add 'sold_bill_no' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'sold_bill_no'
                ) THEN
                    ALTER TABLE products ADD COLUMN sold_bill_no VARCHAR(50);
                    RAISE NOTICE 'Added sold_bill_no column';
                END IF;
            END $$;
        `);
        
        // Check and add 'sold_customer_name' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'sold_customer_name'
                ) THEN
                    ALTER TABLE products ADD COLUMN sold_customer_name VARCHAR(255);
                    RAISE NOTICE 'Added sold_customer_name column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'products' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE products ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE products SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column to quotations table
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'quotations' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE quotations ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE quotations SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column to quotations';
                END IF;
            END $$;
        `);
        
        console.log('✅ Products table schema verified and updated');
        return true;
    } catch (error) {
        console.error('❌ Schema check failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Check and create styles table if it doesn't exist
async function checkAndCreateStylesTable() {
    try {
        console.log('🔍 Checking styles table...');
        
        const dbPool = getPool();
        
        // Create styles table if it doesn't exist
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS styles (
                id SERIAL PRIMARY KEY,
                style_code VARCHAR(100) NOT NULL,
                sku_code VARCHAR(100) NOT NULL,
                item_name VARCHAR(255),
                category VARCHAR(100),
                metal_type VARCHAR(50),
                purity VARCHAR(50),
                mc_type VARCHAR(50),
                mc_value NUMERIC(10,2),
                hsn_code VARCHAR(50),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(style_code, sku_code)
            )
        `);
        
        // Create indexes if they don't exist
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_styles_style_code ON styles(style_code)
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_styles_sku_code ON styles(sku_code)
        `);
        
        // Add missing columns if they don't exist (for existing tables)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'purity'
                ) THEN
                    ALTER TABLE styles ADD COLUMN purity VARCHAR(50);
                    RAISE NOTICE 'Added purity column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'metal_type'
                ) THEN
                    ALTER TABLE styles ADD COLUMN metal_type VARCHAR(50);
                    RAISE NOTICE 'Added metal_type column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'item_name'
                ) THEN
                    ALTER TABLE styles ADD COLUMN item_name VARCHAR(255);
                    RAISE NOTICE 'Added item_name column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'mc_type'
                ) THEN
                    ALTER TABLE styles ADD COLUMN mc_type VARCHAR(50);
                    RAISE NOTICE 'Added mc_type column';
                END IF;
            END $$;
        `);
        
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'styles' AND column_name = 'mc_value'
                ) THEN
                    ALTER TABLE styles ADD COLUMN mc_value NUMERIC(10,2);
                    RAISE NOTICE 'Added mc_value column';
                END IF;
            END $$;
        `);
        
        console.log('✅ Styles table verified and ready');
        return true;
    } catch (error) {
        console.error('❌ Styles table check failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Check and migrate users table schema (add missing columns)
async function checkAndMigrateUsersTable() {
    try {
        console.log('🔍 Checking users table schema...');
        
        const dbPool = getPool();
        
        // Check and add 'permissions' column (JSONB)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'permissions'
                ) THEN
                    ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '{}';
                    RAISE NOTICE 'Added permissions column';
                END IF;
            END $$;
        `);
        
        // Check and add 'allowed_tabs' column (TEXT[])
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'allowed_tabs'
                ) THEN
                    ALTER TABLE users ADD COLUMN allowed_tabs TEXT[];
                    RAISE NOTICE 'Added allowed_tabs column';
                END IF;
            END $$;
        `);
        
        // Check and add 'account_status' column (VARCHAR)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'account_status'
                ) THEN
                    ALTER TABLE users ADD COLUMN account_status VARCHAR(50) DEFAULT 'pending';
                    UPDATE users SET account_status = 'pending' WHERE account_status IS NULL;
                    RAISE NOTICE 'Added account_status column';
                END IF;
            END $$;
        `);
        
        // Check and add 'role' column (VARCHAR)
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'role'
                ) THEN
                    ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'employee';
                    UPDATE users SET role = 'employee' WHERE role IS NULL;
                    RAISE NOTICE 'Added role column';
                END IF;
            END $$;
        `);
        
        // Check and add 'is_deleted' column (BOOLEAN) for soft deletes
        await dbPool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'users' AND column_name = 'is_deleted'
                ) THEN
                    ALTER TABLE users ADD COLUMN is_deleted BOOLEAN DEFAULT false;
                    UPDATE users SET is_deleted = false WHERE is_deleted IS NULL;
                    RAISE NOTICE 'Added is_deleted column';
                END IF;
            END $$;
        `);
        
        // Create indexes for performance (if they don't exist)
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_permissions ON users USING gin(permissions);
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        `);
        
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);
        `);
        
        // Update existing users with default permissions if needed
        await dbPool.query(`
            UPDATE users 
            SET permissions = COALESCE(permissions, '{}'::jsonb)
            WHERE permissions IS NULL;
        `);
        
        // Set default permissions for super admin
        await dbPool.query(`
            UPDATE users 
            SET permissions = '{"all": true, "modules": ["*"]}'::jsonb,
                allowed_tabs = COALESCE(allowed_tabs, ARRAY['all']),
                role = COALESCE(role, 'admin')
            WHERE email = 'jaigaurav56789@gmail.com'
            AND (permissions IS NULL OR permissions = '{}'::jsonb);
        `);
        
        console.log('✅ Users table schema verified and migrated');
        return true;
    } catch (error) {
        console.error('❌ Users table migration failed:', error.message);
        console.error('   Full error:', error);
        return false;
    }
}

// Initialize database on startup
initDatabase().then(async success => {
    if (success) {
        console.log('✅ Database ready');
        // Run schema check after database initialization
        await checkAndUpdateProductsSchema();
        await checkAndCreateStylesTable();
        await checkAndMigrateUsersTable();
    } else {
        console.log('⚠️ Server started but database initialization failed.');
        console.log('💡 Please check your PostgreSQL connection and restart the server.');
    }
}).catch(err => {
    console.error('❌ Unexpected error during database initialization:', err);
});

// ==========================================
// LOGIN API (Email/Password - No Tenant Code)
// ==========================================

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check admin_users table first (super admin)
        const adminResult = await pool.query(
            'SELECT * FROM admin_users WHERE username = $1',
            [username]
        );
        
        if (adminResult.rows.length > 0) {
            const admin = adminResult.rows[0];
            const isValid = await bcrypt.compare(password, admin.password_hash);
            if (isValid) {
                return res.json({
                    success: true,
                    username: admin.username,
                    role: 'super_admin',
                    allowedTabs: ['all'],
                    isMasterAdmin: true
                });
            }
        }
        
        // Check regular users table
        const userResult = await pool.query(
            'SELECT * FROM users WHERE (username = $1 OR email = $1)',
            [username]
        );
        
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            
            // Check if password field exists and is hashed
            if (user.password) {
                let passwordValid = false;
                if (user.password.startsWith('$2')) {
                    passwordValid = await bcrypt.compare(password, user.password);
                } else {
                    // Legacy plain text - migrate to hashed
                    if (password === user.password) {
                        const hashedPassword = await bcrypt.hash(password, 10);
                        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);
                        passwordValid = true;
                    }
                }
                
                if (passwordValid) {
                    let allowedTabs = user.allowed_tabs || ['all'];
                    if (typeof allowedTabs === 'string') {
                        try {
                            allowedTabs = JSON.parse(allowedTabs);
                        } catch (e) {
                            allowedTabs = allowedTabs.split(',').map(t => t.trim()).filter(t => t);
                        }
                    }
                    
                    return res.json({
                        success: true,
                        username: user.username || user.email,
                        role: user.role || 'employee',
                        allowedTabs: allowedTabs,
                        isMasterAdmin: false
                    });
                }
            }
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SOFTWARE UPDATE API
// ==========================================

app.post('/api/update-software', checkAuth, async (req, res) => {
    console.log("🔄 Update triggered by user...");
    
    // Only allow admin/super_admin to update
    if (req.user && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Admin access required', output: 'Access denied: Admin privileges required' });
    }
    
    // Execute the shell script with extended timeout (5 minutes) and capture all output
    exec('bash update.sh 2>&1', { 
        cwd: __dirname, 
        timeout: 300000, // 5 minute timeout
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer for output
    }, (error, stdout, stderr) => {
        const fullOutput = stdout + (stderr ? '\n--- STDERR ---\n' + stderr : '');
        
        if (error) {
            console.error(`❌ Update error: ${error.message}`);
            console.error(`Output: ${fullOutput}`);
            
            // Return error but include the output for debugging
            return res.status(500).json({ 
                success: false, 
                message: 'Update failed: ' + (error.message || 'Unknown error'),
                output: fullOutput,
                error: error.message
            });
        }
        
        console.log(`✅ Update Output:\n${fullOutput}`);
        
        // Return success with full output
        res.json({ 
            success: true, 
            message: 'Server updated & restarted successfully!',
            output: fullOutput
        });
    });
});

// Check for updates (version check)
app.get('/api/update/check', async (req, res) => {
    try {
        const packageJson = require('./package.json');
        const currentVersion = packageJson.version;
        
        const githubRepo = process.env.GITHUB_REPO;
        
        if (githubRepo) {
            try {
                const https = require('https');
                const githubUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
                
                const githubResponse = await new Promise((resolve, reject) => {
                    https.get(githubUrl, {
                        headers: { 'User-Agent': 'JP-Jewellery-Estimations' }
                    }, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                resolve(JSON.parse(data));
                            } else {
                                reject(new Error(`GitHub API returned ${res.statusCode}`));
                            }
                        });
                    }).on('error', reject);
                });
                
                const latestVersion = githubResponse.tag_name.replace(/^v/i, '');
                const updateAvailable = latestVersion !== currentVersion;
                
                return res.json({
                    available: updateAvailable,
                    version: latestVersion,
                    currentVersion: currentVersion,
                    releaseNotes: githubResponse.body || 'Latest update with improvements',
                    mandatory: false
                });
            } catch (githubError) {
                console.error('GitHub check failed:', githubError);
            }
        }
        
        res.json({
            available: false,
            version: currentVersion,
            currentVersion: currentVersion,
            releaseNotes: 'No updates available',
            mandatory: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PRODUCTS API (Single Tenant - No :tenant prefix)
// GET: Public access (no auth required)
// POST/PUT/DELETE: Protected by: hasPermission('products')
// ==========================================

// STEP 3: Public GET access for products (read-only)
app.get('/api/products', async (req, res) => {
    try {
        const { barcode, styleCode, search, includeDeleted, limit, offset, recent, metal_type, category_id } = req.query;
        
        let queryText = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        // Filter out deleted items by default (unless includeDeleted=true)
        if (includeDeleted !== 'true') {
            queryText += ` AND (is_deleted IS NULL OR is_deleted = false)`;
            queryText += ` AND (status IS NULL OR status != 'deleted')`;
        }
        
        if (barcode) {
            queryText += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            queryText += ` AND style_code = $${paramCount++}`;
            params.push(styleCode);
        }
        if (metal_type) {
            queryText += ` AND LOWER(metal_type) = $${paramCount++}`;
            params.push(String(metal_type).toLowerCase());
        }
        if (category_id) {
            queryText += ` AND category_id = $${paramCount++}`;
            params.push(parseInt(category_id));
        }
        if (search) {
            queryText += ` AND (short_name ILIKE $${paramCount} OR item_name ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR sku ILIKE $${paramCount} OR style_code ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        // Order by created_at DESC (most recent first)
        queryText += ' ORDER BY created_at DESC';
        
        // Apply limit (default 50 for search, 5 for recent, no limit if not specified and no search)
        const limitValue = recent === 'true' ? 5 : (limit ? Math.min(parseInt(limit), 50) : (search ? 50 : null));
        if (limitValue) {
            queryText += ` LIMIT $${paramCount++}`;
            params.push(limitValue);
        }
        
        // Apply offset for pagination
        if (offset) {
            queryText += ` OFFSET $${paramCount++}`;
            params.push(parseInt(offset));
        }
        
        const result = await query(queryText, params);
        
        // Get total count for pagination (only if limit is applied)
        let totalCount = null;
        if (limitValue || search) {
            let countQuery = 'SELECT COUNT(*) as total FROM products WHERE 1=1';
            const countParams = [];
            let countParamCount = 1;
            
            if (includeDeleted !== 'true') {
                countQuery += ` AND (is_deleted IS NULL OR is_deleted = false)`;
                countQuery += ` AND (status IS NULL OR status != 'deleted')`;
            }
            
            if (barcode) {
                countQuery += ` AND barcode = $${countParamCount++}`;
                countParams.push(barcode);
            }
            if (styleCode) {
                countQuery += ` AND style_code = $${countParamCount++}`;
                countParams.push(styleCode);
            }
            if (metal_type) {
                countQuery += ` AND LOWER(metal_type) = $${countParamCount++}`;
                countParams.push(String(metal_type).toLowerCase());
            }
            if (search) {
                countQuery += ` AND (short_name ILIKE $${countParamCount} OR item_name ILIKE $${countParamCount} OR barcode ILIKE $${countParamCount} OR sku ILIKE $${countParamCount} OR style_code ILIKE $${countParamCount++})`;
                countParams.push(`%${search}%`);
            }
            if (category_id) {
                countQuery += ` AND category_id = $${countParamCount++}`;
                countParams.push(parseInt(category_id));
            }
            
            const countResult = await query(countQuery, countParams);
            totalCount = parseInt(countResult[0].total);
        }
        
        // Return results with metadata (include both 'items' and 'products' for compatibility)
        res.json({
            products: result,
            items: result, // Frontend compatibility
            total: totalCount,
            limit: limitValue,
            offset: offset ? parseInt(offset) : 0,
            hasMore: totalCount !== null && (limitValue + (offset ? parseInt(offset) : 0)) < totalCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CATEGORIES API (Nested Catalog)
// ==========================================

// Admin: Create category
app.post('/api/categories', isAdminStrict, async (req, res) => {
    try {
        const { name, slug, parent_id } = req.body || {};
        if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
        const row = await query(
            `INSERT INTO categories (name, slug, parent_id) VALUES ($1, LOWER($2), $3) RETURNING *`,
            [name, slug, parent_id ? parseInt(parent_id) : null]
        );
        res.json(row[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Update category
app.put('/api/categories/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, slug, parent_id } = req.body || {};
        const updates = [];
        const params = [];
        let i = 1;
        if (name !== undefined) { updates.push(`name = $${i++}`); params.push(name); }
        if (slug !== undefined) { updates.push(`slug = LOWER($${i++})`); params.push(slug); }
        if (parent_id !== undefined) { updates.push(`parent_id = $${i++}`); params.push(parent_id ? parseInt(parent_id) : null); }
        if (updates.length === 0) return res.status(400).json({ error: 'no fields to update' });
        const row = await query(`UPDATE categories SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i} RETURNING *`, [...params, parseInt(id)]);
        if (row.length === 0) return res.status(404).json({ error: 'not found' });
        res.json(row[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Delete category (cascades to children)
app.delete('/api/categories/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM categories WHERE id = $1', [parseInt(id)]);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get full category tree
app.get('/api/categories/tree', checkAuth, async (req, res) => {
    try {
        const rows = await query('SELECT * FROM categories ORDER BY name ASC');
        const byId = new Map(rows.map(r => [r.id, { ...r, children: [] }]));
        const roots = [];
        for (const r of byId.values()) {
            if (r.parent_id) {
                const p = byId.get(r.parent_id);
                if (p) p.children.push(r);
                else roots.push(r);
            } else {
                roots.push(r);
            }
        }
        res.json(roots);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get direct children of a category (or roots if no id)
app.get('/api/categories/:id/children', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query('SELECT * FROM categories WHERE parent_id = $1 ORDER BY name ASC', [parseInt(id)]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Products for a category if it is a leaf (no children)
app.get('/api/categories/:id/products', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const kids = await query('SELECT 1 FROM categories WHERE parent_id = $1 LIMIT 1', [parseInt(id)]);
        if (kids.length > 0) return res.json({ products: [], leaf: false });
        const rows = await query('SELECT * FROM products WHERE category_id = $1 AND (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != \'deleted\') ORDER BY created_at DESC LIMIT 100', [parseInt(id)]);
        res.json({ products: rows, leaf: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products', checkAuth, hasPermission('products'), async (req, res) => {
    const product = req.body;
    
    try {
        if (product.barcode) {
            const existingCheck = await query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
            if (existingCheck.length > 0) {
                return res.status(409).json({ error: `Barcode ${product.barcode} already exists` });
            }
        }
        
        const queryText = `INSERT INTO products (
            barcode, sku, style_code, short_name, item_name, metal_type, size, weight,
            purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt, status,
            category_id, net_weight, gross_weight, making_charges, making_charges_type, gst_percentage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                  $20, $21, $22, $23, $24)
        RETURNING *`;
        
        const params = [
            product.barcode, product.sku, product.styleCode, product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight,
            product.status || 'available',
            product.category_id || null,
            product.net_weight || null,
            product.gross_weight || null,
            product.making_charges || null,
            product.making_charges_type || null,
            product.gst_percentage || null
        ];
        
        const result = await query(queryText, params);
        broadcast('product-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: `Barcode ${product.barcode} already exists` });
        }
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/products/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        const product = req.body;
        
        const queryText = `UPDATE products SET
            barcode = $1, sku = $2, style_code = $3, short_name = $4, item_name = $5,
            metal_type = $6, size = $7, weight = $8, purity = $9, rate = $10,
            mc_rate = $11, mc_type = $12, pcs = $13, box_charges = $14, stone_charges = $15,
            floor = $16, avg_wt = $17, status = COALESCE($18, status),
            category_id = COALESCE($19, category_id),
            net_weight = COALESCE($20, net_weight),
            gross_weight = COALESCE($21, gross_weight),
            making_charges = COALESCE($22, making_charges),
            making_charges_type = COALESCE($23, making_charges_type),
            gst_percentage = COALESCE($24, gst_percentage),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $25 RETURNING *`;
        
        const params = [
            product.barcode, product.sku, product.styleCode, product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight,
            product.status || 'available',
            product.category_id || null,
            product.net_weight || null,
            product.gross_weight || null,
            product.making_charges || null,
            product.making_charges_type || null,
            product.gst_percentage || null,
            id
        ];
        
        const result = await query(queryText, params);
        broadcast('product-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/products/bulk', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { products: productsArray } = req.body;
        
        if (!Array.isArray(productsArray) || productsArray.length === 0) {
            return res.status(400).json({ error: 'Products array is required' });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            
            const insertedProducts = [];
            const errors = [];
            
            const insertQuery = `INSERT INTO products (
                barcode, sku, style_code, short_name, item_name, metal_type, size, weight,
                purity, rate, mc_rate, mc_type, pcs, box_charges, stone_charges, floor, avg_wt, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *`;
            
            for (const product of productsArray) {
                try {
                    const existingCheck = await client.query('SELECT id FROM products WHERE barcode = $1', [product.barcode]);
                    
                    if (existingCheck.rows.length > 0) {
                        errors.push({ barcode: product.barcode, error: 'Barcode already exists' });
                        continue;
                    }
                    
                    const params = [
                        product.barcode, product.sku || '', product.styleCode || '', 
                        product.shortName, product.itemName || product.shortName,
                        product.metalType || 'gold', product.size || '', 
                        product.weight || 0, product.purity || 100, 
                        product.rate || 0, product.mcRate || 0,
                        product.mcType || 'MC/GM', product.pcs || 1, 
                        product.boxCharges || 0, product.stoneCharges || 0,
                        product.floor || 'Main Floor', product.avgWt || product.weight || 0,
                        product.status || 'available'
                    ];
                    
                    const result = await client.query(insertQuery, params);
                    insertedProducts.push(result.rows[0]);
                } catch (error) {
                    if (error.message.includes('unique') || error.message.includes('duplicate')) {
                        errors.push({ barcode: product.barcode, error: 'Barcode already exists' });
                    } else {
                        errors.push({ barcode: product.barcode, error: error.message });
                    }
                }
            }
            
            await client.query('COMMIT');
            
            insertedProducts.forEach(product => {
                broadcast('product-created', product);
            });
            
            res.json({
                success: true,
                inserted: insertedProducts.length,
                errors: errors.length,
                errorDetails: errors.slice(0, 10)
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/products/:id', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { id } = req.params;
        // Set status to 'deleted' instead of hard delete
        await query('UPDATE products SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', ['deleted', id]);
        broadcast('product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Mark products as sold (used when bill is saved)
app.post('/api/products/mark-sold', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { barcodes, billNo, customerName } = req.body;
        
        if (!Array.isArray(barcodes) || barcodes.length === 0) {
            return res.status(400).json({ error: 'Barcodes array is required' });
        }
        
        const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
        const queryText = `UPDATE products 
            SET status = 'sold', 
                sold_bill_no = $${barcodes.length + 1},
                sold_customer_name = $${barcodes.length + 2},
                is_sold = true,
                updated_at = CURRENT_TIMESTAMP 
            WHERE barcode IN (${placeholders}) AND (status IS NULL OR status = 'available')`;
        
        const params = [...barcodes, billNo || null, customerName || null];
        await query(queryText, params);
        
        broadcast('products-sold', { barcodes, billNo });
        res.json({ success: true, updated: barcodes.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// STYLES API (Product Hierarchy)
// ==========================================

// Get all styles (with optional category filter)
app.get('/api/styles', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { category, styleCode } = req.query;
        let queryText = 'SELECT DISTINCT style_code, category FROM styles WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (category) {
            queryText += ` AND category = $${paramIndex++}`;
            params.push(category);
        }
        
        if (styleCode) {
            queryText += ` AND style_code = $${paramIndex++}`;
            params.push(styleCode);
        }
        
        queryText += ' ORDER BY category, style_code';
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all unique categories
app.get('/api/styles/categories', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const result = await query('SELECT DISTINCT category FROM styles WHERE category IS NOT NULL ORDER BY category');
        res.json(result.map(r => r.category));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all styles (full list with all fields)
app.get('/api/styles/all', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const result = await query('SELECT * FROM styles ORDER BY style_code, sku_code');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get SKUs for a specific style code
app.get('/api/styles/:styleCode/skus', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode } = req.params;
        const result = await query(
            'SELECT sku_code, item_name, metal_type, purity, mc_type, mc_value, hsn_code FROM styles WHERE style_code = $1 ORDER BY sku_code',
            [styleCode]
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get style details by style_code and sku_code
app.get('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const result = await query(
            'SELECT * FROM styles WHERE style_code = $1 AND sku_code = $2',
            [styleCode, skuCode]
        );
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update style by style_code and sku_code
app.put('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const { item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description } = req.body;
        
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (item_name !== undefined) {
            updates.push(`item_name = $${paramIndex++}`);
            params.push(item_name);
        }
        if (category !== undefined) {
            updates.push(`category = $${paramIndex++}`);
            params.push(category);
        }
        if (metal_type !== undefined) {
            updates.push(`metal_type = $${paramIndex++}`);
            params.push(metal_type);
        }
        if (purity !== undefined) {
            updates.push(`purity = $${paramIndex++}`);
            params.push(purity);
        }
        if (mc_type !== undefined) {
            updates.push(`mc_type = $${paramIndex++}`);
            params.push(mc_type);
        }
        if (mc_value !== undefined) {
            updates.push(`mc_value = $${paramIndex++}`);
            params.push(mc_value);
        }
        if (hsn_code !== undefined) {
            updates.push(`hsn_code = $${paramIndex++}`);
            params.push(hsn_code);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(styleCode, skuCode);
        
        const queryText = `UPDATE styles SET ${updates.join(', ')} WHERE style_code = $${paramIndex} AND sku_code = $${paramIndex + 1} RETURNING *`;
        const result = await query(queryText, params);
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete style by style_code and sku_code
app.delete('/api/styles/:styleCode/:skuCode', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { styleCode, skuCode } = req.params;
        const result = await query(
            'DELETE FROM styles WHERE style_code = $1 AND sku_code = $2 RETURNING *',
            [styleCode, skuCode]
        );
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        
        res.json({ success: true, deleted: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new style
app.post('/api/styles', checkAuth, hasPermission('products'), async (req, res) => {
    try {
        const { style_code, sku_code, item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description } = req.body;
        
        if (!style_code || !sku_code) {
            return res.status(400).json({ error: 'style_code and sku_code are required' });
        }
        
        const queryText = `INSERT INTO styles (
            style_code, sku_code, item_name, category, metal_type, purity, mc_type, mc_value, hsn_code, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`;
        
        const params = [
            style_code, sku_code, item_name || null, category || null, metal_type || null,
            purity || null, mc_type || null, mc_value || null, hsn_code || null, description || null
        ];
        
        const result = await query(queryText, params);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: 'Style with this style_code and sku_code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CUSTOMERS API
// ==========================================

app.get('/api/customers', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { mobile, search } = req.query;
        
        let queryText = 'SELECT * FROM customers WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (mobile) {
            queryText += ` AND mobile = $${paramCount++}`;
            params.push(mobile);
        }
        if (search) {
            queryText += ` AND (name ILIKE $${paramCount} OR mobile ILIKE $${paramCount++})`;
            params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY name';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/customers', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const customer = req.body;
        
        const queryText = `INSERT INTO customers (name, mobile, address1, address2, city, state, pincode, gstin)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin
        ];
        
        const result = await query(queryText, params);
        broadcast('customer-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/customers/:id', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { id } = req.params;
        const customer = req.body;
        
        const queryText = `UPDATE customers SET
            name = $1, mobile = $2, address1 = $3, address2 = $4, city = $5,
            state = $6, pincode = $7, gstin = $8, updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 RETURNING *`;
        
        const params = [
            customer.name, customer.mobile, customer.address1, customer.address2,
            customer.city, customer.state, customer.pincode, customer.gstin, id
        ];
        
        const result = await query(queryText, params);
        broadcast('customer-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/customers/:id', checkAuth, hasPermission('customers'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM customers WHERE id = $1', [id]);
        broadcast('customer-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// QUOTATIONS API
// ==========================================

app.get('/api/quotations', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { type } = req.query;
        
        let queryText = 'SELECT * FROM quotations WHERE (is_deleted = false OR is_deleted IS NULL)';
        const params = [];
        
        // Filter by bill_type if provided
        if (type) {
            queryText += ' AND bill_type = $1';
            params.push(type);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/quotations', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const quotation = req.body;
        const billType = quotation.bill_type || 'TAX'; // Default to 'TAX' if not provided
        
        const queryText = `INSERT INTO quotations (
            quotation_no, customer_id, customer_name, customer_mobile, items, total, gst, net_total,
            discount, advance, final_amount, payment_status, remarks, bill_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`;
        
        const params = [
            quotation.quotationNo, quotation.customerId, quotation.customerName,
            quotation.customerMobile, JSON.stringify(quotation.items), quotation.total,
            quotation.gst, quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks, billType
        ];
        
        const result = await query(queryText, params);
        
        // CRUCIAL: When quotation is saved, mark products as 'sold' in products table
        // This ensures physical stock decreases regardless of bill type
        if (quotation.items && Array.isArray(quotation.items)) {
            const barcodes = quotation.items
                .map(item => item.barcode)
                .filter(barcode => barcode); // Filter out null/undefined barcodes
            
            if (barcodes.length > 0) {
                try {
                    const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
                    const markSoldQuery = `UPDATE products 
                        SET status = 'sold', 
                            sold_bill_no = $${barcodes.length + 1},
                            sold_customer_name = $${barcodes.length + 2},
                            is_sold = true,
                            updated_at = CURRENT_TIMESTAMP 
                        WHERE barcode IN (${placeholders}) AND (status IS NULL OR status = 'available')`;
                    
                    const markSoldParams = [...barcodes, quotation.quotationNo || null, quotation.customerName || null];
                    await query(markSoldQuery, markSoldParams);
                    
                    broadcast('products-sold', { barcodes, billNo: quotation.quotationNo });
                } catch (markSoldError) {
                    // Log error but don't fail the quotation creation
                    console.error('Error marking products as sold:', markSoldError);
                }
            }
        }
        
        broadcast('quotation-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/quotations/:id', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { id } = req.params;
        const quotation = req.body;
        
        const queryText = `UPDATE quotations SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, net_total = $7, discount = $8, advance = $9,
            final_amount = $10, payment_status = $11, remarks = $12, bill_type = COALESCE($13, bill_type)
        WHERE id = $14 RETURNING *`;
        
        const params = [
            quotation.customerId, quotation.customerName, quotation.customerMobile,
            JSON.stringify(quotation.items), quotation.total, quotation.gst,
            quotation.netTotal, quotation.discount || 0, quotation.advance || 0,
            quotation.finalAmount, quotation.paymentStatus, quotation.remarks, 
            quotation.bill_type || null, id
        ];
        
        const result = await query(queryText, params);
        broadcast('quotation-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/quotations/:id', checkAuth, hasPermission('quotations'), async (req, res) => {
    try {
        const { id } = req.params;
        // Soft delete: Set is_deleted = true instead of hard delete
        await query('UPDATE quotations SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        broadcast('quotation-deleted', { id: parseInt(id) });
        res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// RECYCLE QUOTATION (Professional Version with Audit Timestamp)
// ==========================================
app.post('/api/quotations/:id/recycle', checkAuth, hasPermission('quotations'), async (req, res) => {
    const dbPool = getPool(); 
    const client = await dbPool.connect(); 
    
    try {
        const { id } = req.params;
        await client.query('BEGIN'); // Start Transaction

        // 1. Get current items
        const quotationResult = await client.query('SELECT items FROM quotations WHERE id = $1', [id]);
        if (quotationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Quotation not found' });
        }

        const quotation = quotationResult.rows[0];
        let items = [];
        try {
            items = typeof quotation.items === 'string' ? JSON.parse(quotation.items) : quotation.items;
        } catch (e) { items = []; }

        // 2. Revert Stock (Un-sell products)
        if (items && Array.isArray(items) && items.length > 0) {
            const barcodes = items.map(item => item.barcode).filter(b => b);
            if (barcodes.length > 0) {
                const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
                
                // Keep updated_at here for audit trail
                await client.query(
                    `UPDATE products SET 
                        status = 'available', 
                        sold_bill_no = NULL, 
                        sold_customer_name = NULL, 
                        is_sold = false,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE barcode IN (${placeholders})`,
                    barcodes
                );
            }
        }

        // 3. Reset Quotation Record
        // Keep updated_at here for audit trail
        const resetResult = await client.query(
            `UPDATE quotations SET 
                customer_id = NULL, customer_name = '', customer_mobile = '', 
                items = '[]', total = 0, gst = 0, net_total = 0, 
                discount = 0, advance = 0, final_amount = 0, 
                payment_status = NULL, remarks = NULL, is_deleted = false,
                updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 RETURNING *`,
            [id]
        );

        await client.query('COMMIT'); 
        
        if (items.length > 0) {
             const barcodes = items.map(item => item.barcode).filter(b => b);
             if(typeof broadcast === 'function') broadcast('products-reverted', { barcodes, quotationId: id });
        }
        if(typeof broadcast === 'function') broadcast('quotation-recycled', resetResult.rows[0]);

        res.json({ success: true, message: 'Quotation reset successfully', quotation: resetResult.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recycling quotation:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// ==========================================
// BILLS API
// Protected by: hasPermission('billing')
// ==========================================

app.get('/api/bills', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { billNo, date } = req.query;
        
        let queryText = 'SELECT * FROM bills WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (billNo) {
            queryText += ` AND bill_no = $${paramCount++}`;
            params.push(billNo);
        }
        if (date) {
            queryText += ` AND DATE(date) = $${paramCount++}`;
            params.push(date);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/bills/by-number/:billNo', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { billNo } = req.params;
        const result = await query('SELECT * FROM bills WHERE bill_no = $1', [billNo]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/bills', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const bill = req.body;
        const ratesResult = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        const liveRates = ratesResult[0] || { gold: 0, silver: 0, platinum: 0 };
        const totals = calculateBillTotals(bill.items || [], liveRates, bill.gstRate || 0);
        
        const queryText = `INSERT INTO bills (
            bill_no, quotation_id, customer_id, customer_name, customer_mobile, items,
            total, gst, cgst, sgst, net_total, payment_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
        
        const params = [
            bill.billNo, bill.quotationId || null, bill.customerId, bill.customerName,
            bill.customerMobile, JSON.stringify(bill.items), totals.taxable,
            totals.total_gst, totals.cgst, totals.sgst, totals.net_total, bill.paymentMethod || 'cash'
        ];
        
        const result = await query(queryText, params);
        broadcast('bill-created', result[0]);
        
        // Update quotation to mark as billed
        if (bill.quotationId) {
            await query(
                `UPDATE quotations SET is_billed = true, bill_no = $1, bill_date = CURRENT_TIMESTAMP WHERE id = $2`,
                [bill.billNo, bill.quotationId]
            );
        }
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncSalesBill(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/bills/:id', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { id } = req.params;
        const bill = req.body;
        const ratesResult = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        const liveRates = ratesResult[0] || { gold: 0, silver: 0, platinum: 0 };
        const totals = calculateBillTotals(bill.items || [], liveRates, bill.gstRate || 0);
        
        const queryText = `UPDATE bills SET
            customer_id = $1, customer_name = $2, customer_mobile = $3, items = $4,
            total = $5, gst = $6, cgst = $7, sgst = $8, net_total = $9, payment_method = $10
        WHERE id = $11 RETURNING *`;
        
        const params = [
            bill.customerId, bill.customerName, bill.customerMobile, JSON.stringify(bill.items),
            totals.taxable, totals.total_gst, totals.cgst, totals.sgst,
            totals.net_total, bill.paymentMethod || 'cash', id
        ];
        
        const result = await query(queryText, params);
        broadcast('bill-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/bills/:id', checkAuth, hasPermission('billing'), async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM bills WHERE id = $1', [id]);
        broadcast('bill-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ADMIN PANEL API
// ==========================================

// Get all users (for admin panel)
app.get('/api/admin/users', isAdminStrict, async (req, res) => {
    try {
        // Try query with is_deleted filter first, fallback to query without it if column doesn't exist
        let result;
        try {
            result = await query(`
                SELECT id, google_id, email, name, role, allowed_tabs, permissions, 
                       account_status, phone_number, created_at, updated_at 
                FROM users 
                WHERE COALESCE(is_deleted, false) = false
                ORDER BY 
                    CASE WHEN email = 'jaigaurav56789@gmail.com' THEN 0 ELSE 1 END,
                    role ASC,
                    created_at DESC
            `);
        } catch (colError) {
            // If is_deleted column doesn't exist, query without it
            if (colError.message && colError.message.includes('is_deleted')) {
                console.warn('is_deleted column not found, querying all users');
                result = await query(`
                    SELECT id, google_id, email, name, role, allowed_tabs, permissions, 
                           account_status, phone_number, created_at, updated_at 
                    FROM users 
                    ORDER BY 
                        CASE WHEN email = 'jaigaurav56789@gmail.com' THEN 0 ELSE 1 END,
                        role ASC,
                        created_at DESC
                `);
            } else {
                throw colError;
            }
        }
        
        // Handle NULL or undefined result - return empty array instead of crashing
        if (!result || !Array.isArray(result)) {
            return res.json([]);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error fetching users:', error);
        // Return empty array on error instead of crashing (prevents 500 error)
        res.json([]);
    }
});

// Update user status/role (for admin panel)
app.post('/api/admin/users/:id/status', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, role } = req.body;
        
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (status) {
            updates.push(`account_status = $${paramIndex++}`);
            params.push(status);
        }
        if (role) {
            updates.push(`role = $${paramIndex++}`);
            params.push(role);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }
        
        params.push(id);
        const result = await query(
            `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
            params
        );
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin SQL query endpoint (SELECT only)
app.post('/api/admin/query', isAdminStrict, async (req, res) => {
    try {
        const { query: sqlQuery } = req.body;
        
        if (!sqlQuery || typeof sqlQuery !== 'string') {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Security: Only allow SELECT statements
        const trimmedQuery = sqlQuery.trim().toUpperCase();
        if (!trimmedQuery.startsWith('SELECT')) {
            return res.status(403).json({ error: 'Only SELECT queries are allowed' });
        }
        
        // Block dangerous keywords
        const dangerousKeywords = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
        for (const keyword of dangerousKeywords) {
            if (trimmedQuery.includes(keyword)) {
                return res.status(403).json({ error: `Query contains forbidden keyword: ${keyword}` });
            }
        }
        
        const result = await pool.query(sqlQuery);
        res.json({ rows: result.rows, rowCount: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Change admin password
app.post('/api/admin/change-password', isAdminStrict, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const bcrypt = require('bcrypt');
        
        // Get current admin user
        const adminUser = await query('SELECT * FROM admin_users WHERE username = $1', ['Gaurav']);
        
        if (adminUser.length === 0) {
            return res.status(404).json({ error: 'Admin user not found' });
        }
        
        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, adminUser[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        // Hash and save new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await query('UPDATE admin_users SET password_hash = $1 WHERE username = $2', [hashedPassword, 'Gaurav']);
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// USER WHITELIST MANAGEMENT (Admin Only)
// Granular Permissions System v2.0
// ==========================================

// Available permission modules
const PERMISSION_MODULES = [
    'billing',      // Billing tab
    'products',     // Products & Stock tab
    'customers',    // CRM / Customers tab
    'rol',          // ROL Management tab
    'quotations',   // Quotations tab
    'salesbill',    // Sales Bill tab
    'salesreturn',  // Sales Return tab
    'billhistory',  // Bill History tab
    'ledger',       // Ledger tab
    'styles',       // Style Master tab
    'pv',           // Purchase Voucher / Stock-In tab
    'tagsplit',     // Tag Split/Merge tab
    'tagsearch',    // Tag Search tab
    'floor',        // Floor Management tab
    'reports'       // Reports tab
];

// Get available permission modules (for frontend)
app.get('/api/admin/permission-modules', isAdminStrict, (req, res) => {
    res.json({
        modules: PERMISSION_MODULES,
        moduleGroups: {
            'Sales & Billing': ['billing', 'salesbill', 'salesreturn', 'quotations', 'billhistory'],
            'Inventory': ['products', 'pv', 'tagsplit', 'tagsearch', 'floor'],
            'CRM & Finance': ['customers', 'ledger'],
            'Management': ['rol', 'styles', 'reports']
        }
    });
});

// Add user to whitelist (pre-approve email) with permissions
app.post('/api/admin/add-user', isAdminStrict, async (req, res) => {
    try {
        const { email, name, role, allowed_tabs, permissions: requestPermissions } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Check if user already exists
        const existingUser = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        
        // Validate role
        const validRoles = ['employee', 'admin'];
        const userRole = validRoles.includes(role) ? role : 'employee';
        
        // Set default permissions based on role
        let userAllowedTabs = allowed_tabs;
        if (!userAllowedTabs || !Array.isArray(userAllowedTabs) || userAllowedTabs.length === 0) {
            // Default: Admin gets all, Employee gets billing only
            userAllowedTabs = userRole === 'admin' ? ['all'] : ['billing'];
        }
        
        // Validate allowed_tabs values
        const validTabs = ['all', ...PERMISSION_MODULES];
        userAllowedTabs = userAllowedTabs.filter(tab => validTabs.includes(tab));
        if (userAllowedTabs.length === 0) {
            userAllowedTabs = ['billing']; // Fallback to billing
        }
        
        // Build permissions JSON - merge with request permissions (for no2_access)
        const permissions = {
            all: userAllowedTabs.includes('all'),
            modules: userAllowedTabs.includes('all') ? ['*'] : userAllowedTabs,
            ...(requestPermissions || {}) // Merge custom permissions like no2_access
        };
        
        // Insert new user with permissions
        const result = await query(
            `INSERT INTO users (email, name, role, account_status, allowed_tabs, permissions, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) RETURNING *`,
            [email.toLowerCase(), name || 'New User', userRole, 'active', userAllowedTabs, JSON.stringify(permissions)]
        );
        
        console.log(`✅ User whitelisted by admin: ${email} (Role: ${userRole}, Tabs: ${userAllowedTabs.join(', ')})`);
        
        res.json({ 
            success: true, 
            message: `User ${email} added to whitelist successfully`,
            user: result[0]
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update existing user (full edit)
app.put('/api/admin/users/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, role, account_status, allowed_tabs, permissions } = req.body;
        
        // Check if user exists
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = existingUser[0];
        
        // Prevent modifying super admin's role or permissions
        if (user.email === 'jaigaurav56789@gmail.com') {
            // Only allow name update for super admin
            if (role && role !== 'admin') {
                return res.status(403).json({ error: 'Cannot change Super Admin role' });
            }
            if (allowed_tabs && !allowed_tabs.includes('all')) {
                return res.status(403).json({ error: 'Cannot restrict Super Admin permissions' });
            }
        }
        
        // Build update query dynamically
        const updates = [];
        const params = [];
        let paramIndex = 1;
        
        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        
        if (role !== undefined) {
            const validRoles = ['employee', 'admin'];
            if (validRoles.includes(role)) {
                updates.push(`role = $${paramIndex++}`);
                params.push(role);
            }
        }
        
        if (account_status !== undefined) {
            const validStatuses = ['active', 'pending', 'suspended', 'rejected'];
            if (validStatuses.includes(account_status)) {
                updates.push(`account_status = $${paramIndex++}`);
                params.push(account_status);
            }
        }
        
        // Handle permissions update - merge logic to avoid duplicate column assignment
        let finalPermissions = user.permissions || {};
        
        if (allowed_tabs !== undefined && Array.isArray(allowed_tabs)) {
            // Validate allowed_tabs values
            const validTabs = ['all', ...PERMISSION_MODULES];
            const cleanTabs = allowed_tabs.filter(tab => validTabs.includes(tab));
            
            if (cleanTabs.length > 0) {
                updates.push(`allowed_tabs = $${paramIndex++}`);
                params.push(cleanTabs);
                
                // Merge permissions instead of overwriting (preserve no2_access and other custom permissions)
                finalPermissions = {
                    ...finalPermissions, // Preserve existing permissions (like no2_access)
                    all: cleanTabs.includes('all'),
                    modules: cleanTabs.includes('all') ? ['*'] : cleanTabs
                };
            }
        }
        
        // Handle explicit permissions update separately (for no2_access and other custom permissions)
        if (permissions !== undefined && typeof permissions === 'object') {
            // Merge with existing permissions instead of overwriting
            finalPermissions = {
                ...finalPermissions,
                ...permissions // Merge new permissions (preserves no2_access if sent)
            };
        }
        
        // Only add permissions to SET clause once if it was modified
        if (allowed_tabs !== undefined || (permissions !== undefined && typeof permissions === 'object')) {
            updates.push(`permissions = $${paramIndex++}`);
            params.push(JSON.stringify(finalPermissions));
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);
        
        const queryText = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
        const result = await query(queryText, params);
        
        console.log(`📝 User updated: ${user.email} (ID: ${id})`);
        
        res.json({ success: true, user: result[0] });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Remove user from whitelist (revoke access)
app.delete('/api/admin/users/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Validate ID is a number
        const userId = parseInt(id);
        if (isNaN(userId)) {
            return res.status(400).json({ error: 'Invalid user ID' });
        }
        
        // Check if user exists and get details
        const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
        
        if (userResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult[0];
        
        // Prevent deleting super admin
        if (user.email === 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot delete Super Admin account' });
        }
        
        // Prevent admin from deleting themselves
        if (req.user && req.user.id === userId) {
            return res.status(403).json({ error: 'Cannot delete your own account' });
        }
        
        // Delete the user
        await query('DELETE FROM users WHERE id = $1', [userId]);
        
        console.log(`🗑️ User removed from whitelist: ${user.email} (ID: ${userId})`);
        res.json({ success: true, message: `User ${user.email} removed successfully` });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user allowed tabs (legacy endpoint, kept for compatibility)
app.put('/api/admin/users/:id/tabs', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { allowedTabs } = req.body;
        
        if (!Array.isArray(allowedTabs)) {
            return res.status(400).json({ error: 'allowedTabs must be an array' });
        }
        
        // Check if user exists
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Prevent restricting super admin
        if (existingUser[0].email === 'jaigaurav56789@gmail.com' && !allowedTabs.includes('all')) {
            return res.status(403).json({ error: 'Cannot restrict Super Admin permissions' });
        }
        
        // Validate and clean tabs
        const validTabs = ['all', ...PERMISSION_MODULES];
        const cleanTabs = allowedTabs.filter(tab => validTabs.includes(tab));
        
        // Build permissions JSON
        const permissions = {
            all: cleanTabs.includes('all'),
            modules: cleanTabs.includes('all') ? ['*'] : cleanTabs
        };
        
        const result = await query(
            'UPDATE users SET allowed_tabs = $1, permissions = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [cleanTabs, JSON.stringify(permissions), id]
        );
        
        res.json({ success: true, user: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// RATES API
// ==========================================

app.get('/api/rates', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        res.json(result[0] || { gold: 7500, silver: 156, platinum: 3500 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rates', checkAuth, async (req, res) => {
    try {
        const { gold, silver, platinum } = req.body;
        
        const queryText = `UPDATE rates SET gold = $1, silver = $2, platinum = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM rates ORDER BY updated_at DESC LIMIT 1)
        RETURNING *`;
        
        const result = await query(queryText, [gold, silver, platinum]);
        broadcast('rates-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT route for rates (same as POST, for RESTful API compatibility)
app.put('/api/rates', checkAuth, async (req, res) => {
    try {
        const { gold, silver, platinum } = req.body;
        
        const queryText = `UPDATE rates SET gold = $1, silver = $2, platinum = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = (SELECT id FROM rates ORDER BY updated_at DESC LIMIT 1)
        RETURNING *`;
        
        const result = await query(queryText, [gold, silver, platinum]);
        broadcast('rates-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// LEDGER TRANSACTIONS API
// ==========================================

app.get('/api/ledger/transactions', checkAuth, hasPermission('ledger'), async (req, res) => {
    try {
        const { customerId, type, startDate, endDate } = req.query;
        
        let queryText = 'SELECT * FROM ledger_transactions WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (customerId) {
            queryText += ` AND customer_id = $${paramCount++}`;
            params.push(customerId);
        }
        if (type) {
            queryText += ` AND transaction_type = $${paramCount++}`;
            params.push(type);
        }
        if (startDate) {
            queryText += ` AND DATE(date) >= $${paramCount++}`;
            params.push(startDate);
        }
        if (endDate) {
            queryText += ` AND DATE(date) <= $${paramCount++}`;
            params.push(endDate);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/ledger/transactions', checkAuth, hasPermission('ledger'), async (req, res) => {
    try {
        const transaction = req.body;
        
        const queryText = `INSERT INTO ledger_transactions (
            customer_id, transaction_type, amount, description, date, cash_type, is_restricted, payment_method, reference, customer_name, customer_mobile, bill_no
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`;
        
        const params = [
            transaction.customerId || null, transaction.transactionType,
            transaction.amount, transaction.description, transaction.date || new Date(),
            transaction.cashType || null, transaction.isRestricted || false,
            transaction.paymentMethod || 'Cash', transaction.reference || '',
            transaction.customerName || '', transaction.customerMobile || '',
            transaction.billNo || ''
        ];
        
        const result = await query(queryText, params);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                const transactionType = transaction.transactionType;
                if (['Cash Received', 'Cash Paid', 'Cash Transfer'].includes(transactionType)) {
                    await tallyService.syncCashEntry(result[0], true);
                } else if (['Payment Received', 'Payment Made', 'Receipt', 'Payment'].includes(transactionType)) {
                    await tallyService.syncPaymentReceipt(result[0], true);
                }
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PURCHASE VOUCHERS API
// ==========================================

app.get('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { pvNo } = req.query;
        
        let queryText = 'SELECT * FROM purchase_vouchers WHERE 1=1';
        const params = [];
        
        if (pvNo) {
            queryText += ' AND pv_no = $1';
            params.push(pvNo);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const pv = req.body;
        
        const queryText = `INSERT INTO purchase_vouchers (
            pv_no, supplier_name, items, total
        ) VALUES ($1, $2, $3, $4) RETURNING *`;
        
        const params = [
            pv.pvNo, pv.supplierName || '', JSON.stringify(pv.items), pv.total || 0
        ];
        
        const result = await query(queryText, params);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncPurchaseVoucher(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ROL DATA API
// ==========================================

app.get('/api/rol', checkAuth, async (req, res) => {
    try {
        const { barcode, styleCode } = req.query;
        
        let queryText = 'SELECT * FROM rol_data WHERE 1=1';
        const params = [];
        let paramCount = 1;
        
        if (barcode) {
            queryText += ` AND barcode = $${paramCount++}`;
            params.push(barcode);
        }
        if (styleCode) {
            queryText += ` AND barcode IN (SELECT barcode FROM products WHERE style_code = $${paramCount++})`;
            params.push(styleCode);
        }
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rol', checkAuth, async (req, res) => {
    try {
        const rolData = req.body;
        
        const queryText = `INSERT INTO rol_data (barcode, rol, available)
        VALUES ($1, $2, $3)
        ON CONFLICT (barcode) DO UPDATE SET
            rol = EXCLUDED.rol,
            available = EXCLUDED.available,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`;
        
        const params = [rolData.barcode, rolData.rol || 0, rolData.available || 0];
        
        const result = await query(queryText, params);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/rol/:barcode', checkAuth, async (req, res) => {
    try {
        const { barcode } = req.params;
        const { rol, available } = req.body;
        
        const queryText = `UPDATE rol_data SET
            rol = $1, available = $2, updated_at = CURRENT_TIMESTAMP
        WHERE barcode = $3 RETURNING *`;
        
        const result = await query(queryText, [rol, available, barcode]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SALES RETURNS API
// ==========================================

app.get('/api/sales-returns', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT * FROM sales_returns ORDER BY date DESC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sales-returns/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM sales_returns WHERE id = $1', [id]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Sales return not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sales-returns', checkAuth, async (req, res) => {
    try {
        const salesReturn = req.body;
        
        const queryText = `INSERT INTO sales_returns (
            ssr_no, bill_id, bill_no, quotation_id, customer_id, customer_name, customer_mobile,
            items, total, gst, cgst, sgst, net_total, reason, remarks
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`;
        
        const params = [
            salesReturn.ssrNo, salesReturn.billId, salesReturn.billNo, salesReturn.quotationId,
            salesReturn.customerId, salesReturn.customerName, salesReturn.customerMobile,
            JSON.stringify(salesReturn.items), salesReturn.total,
            salesReturn.gst || 0, salesReturn.cgst || 0, salesReturn.sgst || 0,
            salesReturn.netTotal, salesReturn.reason || '', salesReturn.remarks || ''
        ];
        
        const result = await query(queryText, params);
        broadcast('sales-return-created', result[0]);
        
        // Add to ledger as negative transaction
        await query(`
            INSERT INTO ledger_transactions (
                customer_id, transaction_type, amount, description, date,
                customer_name, customer_mobile, reference, bill_no
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7, $8)
        `, [
            salesReturn.customerId,
            'Sales Return',
            -Math.abs(salesReturn.netTotal),
            `Sales Return ${salesReturn.ssrNo} - ${salesReturn.reason || 'Product Return'}`,
            salesReturn.customerName,
            salesReturn.customerMobile,
            salesReturn.ssrNo,
            salesReturn.billNo
        ]);
        
        // Sync to Tally if enabled
        try {
            const tallyService = new TallySyncService();
            await tallyService.initialize();
            if (tallyService.shouldAutoSync()) {
                await tallyService.syncSalesReturn(result[0], true);
            }
        } catch (tallyError) {
            console.error('Tally sync error (non-blocking):', tallyError);
        }
        
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// USER MANAGEMENT API (Whitelist-Based - No Passwords)
// Users authenticate via Google OAuth only
// ==========================================

// Get all whitelisted users
app.get('/api/users', isAdminStrict, async (req, res) => {
    try {
        const result = await query(`
            SELECT id, email, name, role, allowed_tabs, account_status, created_at, updated_at 
            FROM users 
            ORDER BY created_at DESC
        `);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add user to whitelist (Google OAuth - no password)
app.post('/api/users', isAdminStrict, async (req, res) => {
    try {
        const { email, name, role, allowedTabs } = req.body;
        
        // Validate email
        if (!email || !email.trim()) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const emailLower = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailLower)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Check if user already exists
        const existing = await query('SELECT * FROM users WHERE email = $1', [emailLower]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'User with this email already exists' });
        }
        
        // Validate role
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'employee';
        
        // Insert new whitelisted user (no password - Google OAuth only)
        const result = await query(`
            INSERT INTO users (email, name, role, allowed_tabs, account_status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
            RETURNING id, email, name, role, allowed_tabs, account_status, created_at
        `, [emailLower, name || 'New User', userRole, allowedTabs || ['all']]);
        
        console.log(`✅ User whitelisted: ${emailLower} (Role: ${userRole})`);
        broadcast('user-created', result[0]);
        res.json({ success: true, user: result[0] });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user (role, name, tabs, status)
app.put('/api/users/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, name, role, allowedTabs, accountStatus } = req.body;
        
        // Prevent editing super admin email
        const existingUser = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (existingUser.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (existingUser[0].email === 'jaigaurav56789@gmail.com' && email && email !== 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot change super admin email' });
        }
        
        // Validate role
        const validRoles = ['admin', 'employee'];
        const userRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : existingUser[0].role;
        
        const result = await query(`
            UPDATE users SET 
                name = COALESCE($1, name),
                role = $2,
                allowed_tabs = COALESCE($3, allowed_tabs),
                account_status = COALESCE($4, account_status),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 
            RETURNING id, email, name, role, allowed_tabs, account_status
        `, [name, userRole, allowedTabs, accountStatus, id]);
        
        broadcast('user-updated', result[0]);
        res.json({ success: true, user: result[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Remove user from whitelist
app.delete('/api/users/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting super admin
        const user = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (user.length > 0 && user[0].email === 'jaigaurav56789@gmail.com') {
            return res.status(403).json({ error: 'Cannot delete super admin' });
        }
        
        await query('DELETE FROM users WHERE id = $1', [id]);
        console.log(`🗑️ User removed from whitelist: ID ${id}`);
        broadcast('user-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// TALLY INTEGRATION API
// ==========================================

app.get('/api/tally/config', checkAuth, async (req, res) => {
    try {
        const tallyService = new TallySyncService();
        const result = await tallyService.getConfig();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/tally/config', checkAuth, async (req, res) => {
    try {
        const config = req.body;
        const tallyService = new TallySyncService();
        const result = await tallyService.updateConfig(config);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/tally/test', checkAuth, async (req, res) => {
    try {
        const tallyService = new TallySyncService();
        const result = await tallyService.testConnection();
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/tally/sync-logs', checkAuth, async (req, res) => {
    try {
        const { limit = 100, status } = req.query;
        const tallyService = new TallySyncService();
        const logs = await tallyService.getSyncLogs(parseInt(limit), status || null);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ADMIN ALIASES
app.get('/api/admin/ledger', isAdminStrict, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const result = await query('SELECT * FROM ledger_transactions ORDER BY date DESC LIMIT $1', [parseInt(limit)]);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/stock', isAdminStrict, async (req, res) => {
    try {
        const { limit = 1000 } = req.query;
        const result = await query(`
            SELECT * FROM products 
            WHERE COALESCE(is_deleted, false) = false AND COALESCE(is_sold, false) = false
            ORDER BY updated_at DESC
            LIMIT $1
        `, [parseInt(limit)]);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/tally', isAdminStrict, async (req, res) => {
    try {
        const tallyService = new TallySyncService();
        const config = await tallyService.getConfig();
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/live-rates', async (req, res) => {
    try {
        const rows = await query('SELECT metal_type, buy_rate, sell_rate, admin_margin, updated_at FROM live_rates ORDER BY metal_type');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/live-rates', adminLimiter, requireJson, isAdminStrict, async (req, res) => {
    try {
        const list = Array.isArray(req.body) ? req.body : [req.body];
        const results = [];
        for (const r of list) {
            const metal = (r.metal_type || r.metalType || '').toLowerCase();
            if (!metal) continue;
            const buy = Number(r.buy_rate || r.buyRate || 0);
            const sell = Number(r.sell_rate || r.sellRate || 0);
            const margin = Number(r.admin_margin || r.adminMargin || 0);
            const up = await query(`
                INSERT INTO live_rates (metal_type, buy_rate, sell_rate, admin_margin, updated_at)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (metal_type) DO UPDATE SET 
                    buy_rate = EXCLUDED.buy_rate,
                    sell_rate = EXCLUDED.sell_rate,
                    admin_margin = EXCLUDED.admin_margin,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING *
            `, [metal, buy, sell, margin]);
            results.push(up[0]);
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/rates/set-margin', isAdminStrict, async (req, res) => {
    try {
        const list = Array.isArray(req.body) ? req.body : [req.body];
        const results = [];
        for (const r of list) {
            const metal = r.metal_type || r.metalType;
            const margin = r.admin_margin ?? r.margin ?? r.adminMargin;
            if (!metal) continue;
            const row = await liveRateService.setMargin(metal, Number(margin || 0), io);
            results.push(row);
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rates/display', async (req, res) => {
    try {
        const payload = await liveRateService.getCurrentPayload();
        res.json(payload);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rates/live', async (req, res) => {
    try {
        const result = await liveRateService.fetchLiveRates();
        res.json({
            success: result.success,
            rates: result.rates,
            source: result.source,
            timestamp: result.timestamp
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/rate-lock', async (req, res) => {
    try {
        const { metals } = req.body || {};
        const payload = await liveRateService.getCurrentPayload();
        const list = Array.isArray(metals) && metals.length > 0 ? metals : ['gold', 'silver', 'gold_22k'];
        const now = Date.now();
        const ttl = 5 * 60 * 1000;
        req.session.rateLocks = req.session.rateLocks || {};
        for (const m of list) {
            const r = (payload?.rates || []).find(x => (x.metal_type || '').toLowerCase() === String(m).toLowerCase());
            if (!r) continue;
            const display = Number(r.display_rate || r.sell_rate || r.buy_rate || 0);
            req.session.rateLocks[String(m).toLowerCase()] = { rate: display, expiresAt: now + ttl };
        }
        await new Promise(resolve => req.session.save(resolve));
        res.json({ ok: true, locks: req.session.rateLocks });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/rate-lock', async (req, res) => {
    try {
        const locks = req.session.rateLocks || {};
        const now = Date.now();
        const pruned = {};
        for (const [k, v] of Object.entries(locks)) {
            if (v && v.expiresAt > now) pruned[k] = v;
        }
        req.session.rateLocks = pruned;
        res.json(pruned);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BOOKING ADVANCE - Settings & Advance Payment
// ==========================================
app.get('/api/settings/booking-advance', async (req, res) => {
    try {
        const rows = await query('SELECT value FROM app_settings WHERE key = $1', ['booking_advance_amount']);
        const amount = rows.length ? Math.max(0, parseInt(rows[0].value || '5000', 10)) : 5000;
        res.json({ advanceAmount: amount });
    } catch (error) {
        res.json({ advanceAmount: 5000 });
    }
});

app.put('/api/admin/settings/booking-advance', requireJson, isAdminStrict, async (req, res) => {
    try {
        const { advanceAmount } = req.body || {};
        const amount = Math.max(0, parseInt(advanceAmount, 10));
        await query(`
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('booking_advance_amount', $1, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP
        `, [String(amount)]);
        res.json({ success: true, advanceAmount: amount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: Get all margin/settings (for Rates & Margins page)
app.get('/api/admin/settings/margins', isAdminStrict, async (req, res) => {
    try {
        const rows = await query('SELECT key, value FROM app_settings WHERE key IN ($1, $2, $3, $4, $5)', [
            'gold_import_duty_percent', 'silver_premium_percent', 'default_mc_22k_per_gram', 'default_mc_18k_per_gram', 'booking_advance_amount'
        ]);
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        res.json({
            goldImportDutyPercent: parseFloat(map.gold_import_duty_percent || '15') || 15,
            silverPremiumPercent: parseFloat(map.silver_premium_percent || '12') || 12,
            defaultMc22kPerGram: parseFloat(map.default_mc_22k_per_gram || '500') || 500,
            defaultMc18kPerGram: parseFloat(map.default_mc_18k_per_gram || '450') || 450,
            advanceAmount: parseInt(map.booking_advance_amount || '5000', 10) || 5000
        });
    } catch (error) {
        res.json({ goldImportDutyPercent: 15, silverPremiumPercent: 12, defaultMc22kPerGram: 500, defaultMc18kPerGram: 450, advanceAmount: 5000 });
    }
});

// Admin: Save all margin/settings
app.put('/api/admin/settings/margins', requireJson, isAdminStrict, async (req, res) => {
    try {
        const { goldImportDutyPercent, silverPremiumPercent, defaultMc22kPerGram, defaultMc18kPerGram, advanceAmount } = req.body || {};
        const upsert = async (key, val) => {
            await query(`
                INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, String(val)]);
        };
        await upsert('gold_import_duty_percent', Math.max(0, parseFloat(goldImportDutyPercent) || 0));
        await upsert('silver_premium_percent', Math.max(0, parseFloat(silverPremiumPercent) || 0));
        await upsert('default_mc_22k_per_gram', Math.max(0, parseFloat(defaultMc22kPerGram) || 0));
        await upsert('default_mc_18k_per_gram', Math.max(0, parseFloat(defaultMc18kPerGram) || 0));
        await upsert('booking_advance_amount', Math.max(0, parseInt(advanceAmount, 10) || 0));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/bookings/advance', requireJson, async (req, res) => {
    try {
        const { metalType, lockedRate, mobileNumber, advancePaid } = req.body || {};
        if (!mobileNumber || String(mobileNumber).trim().length < 10) {
            return res.status(400).json({ error: 'Valid mobile number required' });
        }
        const mobile = String(mobileNumber).replace(/\D/g, '').slice(0, 10);
        if (mobile.length !== 10) return res.status(400).json({ error: 'Valid 10-digit mobile number required' });
        const metal = String(metalType || 'gold').toLowerCase();
        const rate = Math.max(0, Number(lockedRate) || 0);
        const amount = Math.max(0, Number(advancePaid) || 0);
        const rows = await query(`
            INSERT INTO bookings (user_id, status, locked_gold_rate, advance_amount, metal_type, mobile_number, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id, status, metal_type, mobile_number, advance_amount, locked_gold_rate, created_at
        `, [null, 'pending_payment', rate, amount, metal, mobile]);
        res.json({ success: true, message: 'Booking created. Payment integration coming soon.', booking: rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// QUOTATIONS - ISSUE SERVER NUMBER
// ==========================================
app.post('/api/quotations/issue', requireJson, async (req, res) => {
    try {
        const { customer_name, customer_mobile, items, totals } = req.body || {};
        const year = new Date().getFullYear();
        const seqRes = await query(`SELECT nextval('quotation_seq') AS seq`);
        const seq = seqRes[0].seq;
        const quotation_no = `Q${year}${String(seq).padStart(5, '0')}`;
        const rows = await query(`
            INSERT INTO quotations (quotation_no, customer_name, customer_mobile, items, total, gst, net_total, final_amount, payment_status, created_at)
            VALUES ($1, $2, $3, $4, COALESCE($5,0), COALESCE($6,0), COALESCE($7,0), COALESCE($8,0), 'PENDING', CURRENT_TIMESTAMP)
            RETURNING *
        `, [quotation_no, customer_name || null, customer_mobile || null, JSON.stringify(items || []), totals?.total, totals?.gst, totals?.net_total, totals?.final_amount]);
        res.json({ quotation_no: rows[0].quotation_no, quotation: rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BOOKING LOCK (Cut Rate)
// ==========================================
app.post('/api/booking/lock', requireJson, validateNumbers(['quantity_kg']), async (req, res) => {
    try {
        const { metal_type, quantity_kg } = req.body || {};
        if (!metal_type || !quantity_kg) return res.status(400).json({ error: 'metal_type and quantity_kg required' });
        const payload = await liveRateService.getCurrentPayload();
        const rateEntry = (payload?.rates || []).find(r => (r.metal_type || '').toLowerCase() === String(metal_type).toLowerCase());
        if (!rateEntry) return res.status(404).json({ error: 'Rate not found' });
        const displayRate = Number(rateEntry.display_rate || rateEntry.sell_rate || 0);
        const totalAmount = Math.round(displayRate * Number(quantity_kg) * 100) / 100;
        const expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        const insert = await query(`
            INSERT INTO booking_locks (user_id, metal_type, quantity_kg, lock_rate, total_amount, status, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, 'LOCKED', $6, CURRENT_TIMESTAMP) RETURNING *
        `, [null, metal_type, Number(quantity_kg), displayRate, totalAmount, expires_at]);
        const lock = insert[0];
        let orderId = `order_${lock.id}`;
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        try {
            if (keyId && keySecret) {
                const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
                const resp = await fetch('https://api.razorpay.com/v1/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${auth}`
                    },
                    body: JSON.stringify({
                        amount: Math.round(totalAmount * 100),
                        currency: 'INR',
                        receipt: `lock_${lock.id}`,
                        payment_capture: 1,
                        notes: { metal_type, quantity_kg: String(quantity_kg), lock_id: String(lock.id) }
                    })
                });
                const data = await resp.json();
                if (resp.ok && data && data.id) {
                    orderId = data.id;
                } else {
                    console.warn('Razorpay order creation failed:', data);
                }
            }
        } catch (e) {
            console.warn('Razorpay order error:', e.message);
        }
        await query(`UPDATE booking_locks SET razorpay_order_id = $1 WHERE id = $2`, [orderId, lock.id]);
        res.json({ lock_id: lock.id, razorpay_order_id: orderId, amount: totalAmount, currency: 'INR', expires_at });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Razorpay Webhook (Verification)
// ==========================================
const crypto = require('crypto');
app.post('/api/payment/razorpay/webhook', require('express').raw({ type: '*/*' }), async (req, res) => {
    try {
        const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body || {});
        const headerSig = (req.headers['x-razorpay-signature'] || req.headers['X-Razorpay-Signature'] || '').toString();
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (webhookSecret) {
            const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
            if (!headerSig || expected !== headerSig) {
                return res.status(401).json({ error: 'invalid_signature' });
            }
        }
        const body = rawBody ? JSON.parse(rawBody) : {};
        const event = body.event || body.payload?.payment?.entity?.status || 'payment.captured';
        const orderId = body.payload?.payment?.entity?.order_id || body.payload?.order?.entity?.id || body.order_id || body.razorpay_order_id;
        if (!orderId) return res.status(400).json({ error: 'order_id required' });
        const rows = await query(`SELECT * FROM booking_locks WHERE razorpay_order_id = $1`, [orderId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
        const lock = rows[0];
        const payTs = new Date(body.payload?.payment?.entity?.created_at ? body.payload.payment.entity.created_at * 1000 : Date.now());
        const withinWindow = payTs.getTime() <= new Date(lock.expires_at).getTime();
        if (event === 'payment.captured' && withinWindow) {
            await query(`UPDATE booking_locks SET status = 'CONFIRMED' WHERE id = $1`, [lock.id]);
            await query(`
                INSERT INTO orders (user_id, total_amount, payment_status, payment_method, razorpay_order_id, delivery_status, items_snapshot_json, created_at)
                VALUES ($1, $2, 'PAID', 'RAZORPAY', $3, 'PENDING', $4, CURRENT_TIMESTAMP)
            `, [null, Number(lock.total_amount || 0), orderId, JSON.stringify([{ type: 'bullion', metal_type: lock.metal_type, qty_kg: lock.quantity_kg, rate: lock.lock_rate }])]);
            // Decrement bullion inventory
            await query(`INSERT INTO bullion_inventory (metal_type, available_kg, updated_at) VALUES ($1, 0, CURRENT_TIMESTAMP) ON CONFLICT (metal_type) DO NOTHING`, [String(lock.metal_type).toLowerCase()]);
            await query(`UPDATE bullion_inventory SET available_kg = GREATEST(0, available_kg - $2), updated_at = CURRENT_TIMESTAMP WHERE metal_type = $1`, [String(lock.metal_type).toLowerCase(), Number(lock.quantity_kg || 0)]);
            return res.json({ status: 'CONFIRMED' });
        } else {
            await query(`UPDATE booking_locks SET status = 'RATE_MISMATCH' WHERE id = $1`, [lock.id]);
            return res.json({ status: 'RATE_MISMATCH' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SIP Subscribe
// ==========================================
app.post('/api/sip/subscribe', checkAuth, async (req, res) => {
    try {
        const { user_id, amount, frequency } = req.body || {};
        if (!user_id || !amount || !frequency) return res.status(400).json({ error: 'user_id, amount, frequency required' });
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        let planId = null;
        let subscriptionId = null;
        try {
            if (keyId && keySecret) {
                const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
                const interval = frequency === 'DAILY' ? 1 : 1;
                const period = frequency === 'DAILY' ? 'daily' : 'monthly';
                const planResp = await fetch('https://api.razorpay.com/v1/plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                    body: JSON.stringify({
                        period, interval,
                        item: { name: `Gold SIP ${period}`, amount: Math.round(Number(amount) * 100), currency: 'INR' }
                    })
                });
                const planData = await planResp.json();
                if (planResp.ok && planData.id) planId = planData.id;
                const subResp = await fetch('https://api.razorpay.com/v1/subscriptions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
                    body: JSON.stringify({ plan_id: planId, total_count: 0, customer_notify: 1, notes: { user_id: String(user_id) } })
                });
                const subData = await subResp.json();
                if (subResp.ok && subData.id) subscriptionId = subData.id;
            }
        } catch (e) {
            console.warn('Razorpay subscription error:', e.message);
        }
        const rows = await query(`
            INSERT INTO sip_subscriptions (user_id, amount, frequency, razorpay_subscription_id, status, created_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *
        `, [user_id, Number(amount), frequency, subscriptionId, subscriptionId ? 'ACTIVE' : 'PENDING']);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SIP Wallet and Withdraw
// ==========================================
app.get('/api/sip/wallet', checkAuth, async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        const users = await query('SELECT wallet_gold_balance FROM users WHERE id = $1', [user_id]);
        const wallet = await query('SELECT balance_grams FROM user_gold_wallet WHERE user_id = $1', [user_id]).catch(() => []);
        const txs = await query('SELECT * FROM sip_transactions WHERE user_id = $1 ORDER BY transaction_date DESC LIMIT 50', [user_id]).catch(() => []);
        res.json({ wallet_gold_balance: users[0]?.wallet_gold_balance || 0, balance_grams: wallet[0]?.balance_grams || 0, transactions: txs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sip/withdraw', checkAuth, async (req, res) => {
    try {
        const { user_id, grams: reqGrams } = req.body || {};
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        const u = await query('SELECT wallet_gold_balance FROM users WHERE id = $1', [user_id]);
        const currentGrams = Number(u[0]?.wallet_gold_balance || 0);
        const grams = reqGrams ? Math.min(Number(reqGrams), currentGrams) : currentGrams;
        const payload = await liveRateService.getCurrentPayload();
        const gold = (payload?.rates || []).find(r => (r.metal_type || '').toLowerCase() === 'gold');
        const sell = Number(gold?.display_rate || gold?.sell_rate || 0);
        const amount = Math.round(grams * sell * 100) / 100;
        const row = await query(`
            INSERT INTO sip_payout_requests (user_id, grams, amount, status, created_at)
            VALUES ($1, $2, $3, 'PENDING_ADMIN_APPROVAL', CURRENT_TIMESTAMP) RETURNING *
        `, [user_id, grams, amount]);
        res.json(row[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/sip/withdraw/approve', requireJson, isAdminStrict, async (req, res) => {
    try {
        const { request_id } = req.body || {};
        if (!request_id) return res.status(400).json({ error: 'request_id required' });
        const rows = await query('SELECT * FROM sip_payout_requests WHERE id = $1', [request_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const r = rows[0];
        const u = await query('SELECT wallet_gold_balance FROM users WHERE id = $1', [r.user_id]);
        const bal = Number(u[0]?.wallet_gold_balance || 0);
        if (bal < Number(r.grams)) return res.status(409).json({ error: 'insufficient_balance' });
        await query('UPDATE users SET wallet_gold_balance = wallet_gold_balance - $2 WHERE id = $1', [r.user_id, Number(r.grams)]);
        await query('UPDATE sip_payout_requests SET status = $2 WHERE id = $1', [request_id, 'APPROVED']);
        await query('INSERT INTO gold_lot_movements (user_id, direction, grams, reference, created_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)', [r.user_id, 'DEBIT', Number(r.grams), 'WITHDRAW']);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/admin/sip/payout_requests', isAdminStrict, async (req, res) => {
    try {
        const rows = await query('SELECT * FROM sip_payout_requests ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/admin/gold_lot_movements', isAdminStrict, async (req, res) => {
    try {
        const { limit, start, end, user_id, direction, format } = req.query;
        const l = Math.min(parseInt(limit || '100'), 2000);
        let q = 'SELECT * FROM gold_lot_movements WHERE 1=1';
        const params = [];
        let pc = 1;
        if (user_id) {
            q += ` AND user_id = $${pc++}`;
            params.push(parseInt(user_id));
        }
        if (direction) {
            q += ` AND direction = $${pc++}`;
            params.push(direction);
        }
        if (start) {
            q += ` AND created_at >= $${pc++}`;
            params.push(new Date(start));
        }
        if (end) {
            q += ` AND created_at <= $${pc++}`;
            params.push(new Date(end));
        }
        q += ' ORDER BY created_at DESC';
        q += ` LIMIT $${pc++}`;
        params.push(l);
        const rows = await query(q, params);
        if (String(format).toLowerCase() === 'csv') {
            const header = ['id','user_id','direction','grams','reference','created_at'].join(',');
            const lines = rows.map(r => [
                r.id,
                r.user_id,
                r.direction,
                Number(r.grams),
                (r.reference || '').replace(/,/g, ' '),
                r.created_at?.toISOString?.() || r.created_at
            ].join(','));
            const csv = [header, ...lines].join('\n');
            res.set('Content-Type', 'text/csv');
            return res.send(csv);
        }
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Alias: hyphenated URL for frontend compatibility
app.get('/api/admin/gold-lot-movements', isAdminStrict, async (req, res) => {
    try {
        const { limit, start, end, user_id, direction, format } = req.query;
        const l = Math.min(parseInt(limit || '100'), 2000);
        let q = 'SELECT * FROM gold_lot_movements WHERE 1=1';
        const params = [];
        let pc = 1;
        if (user_id) { q += ` AND user_id = $${pc++}`; params.push(parseInt(user_id)); }
        if (direction) { q += ` AND direction = $${pc++}`; params.push(direction); }
        if (start) { q += ` AND created_at >= $${pc++}`; params.push(new Date(start)); }
        if (end) { q += ` AND created_at <= $${pc++}`; params.push(new Date(end)); }
        q += ' ORDER BY created_at DESC';
        q += ` LIMIT $${pc++}`;
        params.push(l);
        const rows = await query(q, params);
        if (String(format).toLowerCase() === 'csv') {
            const header = ['id','user_id','direction','grams','reference','created_at'].join(',');
            const lines = rows.map(r => [r.id, r.user_id, r.direction, Number(r.grams), (r.reference || '').replace(/,/g, ' '), r.created_at?.toISOString?.() || r.created_at].join(','));
            res.set('Content-Type', 'text/csv');
            return res.send([header, ...lines].join('\n'));
        }
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Placeholder endpoints (return 200 OK with empty data)
app.get('/api/admin/rates', isAdminStrict, (req, res) => res.json({ success: true, data: [] }));
app.get('/api/admin/sip-payouts', isAdminStrict, (req, res) => res.json({ success: true, data: [] }));

// Admin Orders - who ordered what, when, rate, delivery
app.get('/api/admin/orders', isAdminStrict, async (req, res) => {
    try {
        const rows = await query(`
            SELECT o.id, o.user_id, o.total_amount, o.payment_status, o.payment_method,
                   o.delivery_status, o.items_snapshot_json, o.razorpay_order_id, o.created_at,
                   u.name as customer_name, u.email as customer_email, u.mobile_number as customer_mobile
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
            LIMIT 500
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin ERP Sync - sync products from main products table to web catalogue
app.post('/api/admin/sync/products', isAdminStrict, async (req, res) => {
    try {
        const products = await query(`
            SELECT barcode, sku, style_code, short_name, item_name, metal_type, net_weight, gross_weight, weight, purity, mc_rate, mc_type
            FROM products
            WHERE (is_deleted IS NULL OR is_deleted = false) AND (status IS NULL OR status != 'deleted')
        `);
        let categoriesCreated = 0, subcategoriesCreated = 0, productsSynced = 0;
        const styleSlugs = new Set();
        const skuSlugs = new Set();
        for (const p of products) {
            const styleCode = p.style_code || 'Uncategorized';
            const styleSlug = String(styleCode).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'uncategorized';
            if (!styleSlugs.has(styleSlug)) {
                await query(`
                    INSERT INTO web_categories (name, slug, updated_at)
                    VALUES ($1, $2, CURRENT_TIMESTAMP)
                    ON CONFLICT (slug) DO UPDATE SET name = $1, updated_at = CURRENT_TIMESTAMP
                `, [styleCode, styleSlug]);
                styleSlugs.add(styleSlug);
                categoriesCreated++;
            }
            const cat = await query('SELECT id FROM web_categories WHERE slug = $1', [styleSlug]);
            const catId = cat[0]?.id;
            if (!catId) continue;
            const skuCode = p.sku || p.barcode || 'N/A';
            const skuSlug = `${styleSlug}-${String(skuCode).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'na'}`;
            const skuKey = `${styleSlug}::${skuSlug}`;
            if (!skuSlugs.has(skuKey)) {
                await query(`
                    INSERT INTO web_subcategories (category_id, name, slug, updated_at)
                    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                    ON CONFLICT (slug) DO UPDATE SET name = $2, category_id = $1, updated_at = CURRENT_TIMESTAMP
                `, [catId, skuCode, skuSlug]);
                skuSlugs.add(skuKey);
                subcategoriesCreated++;
            }
            const sub = await query('SELECT id FROM web_subcategories WHERE slug = $1', [skuSlug]);
            const subId = sub[0]?.id;
            if (!subId) continue;
            const prodSku = p.barcode || p.sku || `p-${p.id || Date.now()}-${productsSynced}`;
            await query(`
                INSERT INTO web_products (subcategory_id, sku, name, gross_weight, net_weight, purity, last_synced_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (sku) DO UPDATE SET
                    name = EXCLUDED.name, gross_weight = EXCLUDED.gross_weight, net_weight = EXCLUDED.net_weight, purity = EXCLUDED.purity, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            `, [subId, prodSku, p.item_name || p.short_name, p.gross_weight, p.net_weight || p.weight, p.purity]);
            productsSynced++;
        }
        res.json({ success: true, categoriesCreated, subcategoriesCreated, productsSynced });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Public catalog - published categories only (Style → SKU → Products)
app.get('/api/catalog', async (req, res) => {
    try {
        const cats = await query(`
            SELECT id, name, slug, image_url FROM web_categories
            WHERE is_published = true
            ORDER BY name
        `);
        const categories = [];
        for (const c of cats) {
            const subs = await query(`
                SELECT id, name, slug FROM web_subcategories
                WHERE category_id = $1 ORDER BY name
            `, [c.id]);
            const subcategories = [];
            for (const s of subs) {
                const wpRows = await query(`
                    SELECT wp.sku, wp.name, wp.net_weight, wp.gross_weight, wp.purity
                    FROM web_products wp
                    WHERE wp.subcategory_id = $1 AND (wp.is_active IS NULL OR wp.is_active = true)
                `, [s.id]);
                const barcodes = wpRows.map(r => r.sku).filter(Boolean);
                let products = [];
                if (barcodes.length > 0) {
                    const placeholders = barcodes.map((_, i) => `$${i + 1}`).join(',');
                    const prodRows = await query(`
                        SELECT * FROM products
                        WHERE barcode IN (${placeholders})
                        AND (is_deleted IS NULL OR is_deleted = false)
                        AND (status IS NULL OR status != 'deleted')
                    `, barcodes);
                    products = prodRows;
                }
                subcategories.push({ id: s.id, name: s.name, slug: s.slug, products });
            }
            categories.push({ id: c.id, name: c.name, slug: c.slug, image_url: c.image_url, subcategories });
        }
        res.json({ categories });
    } catch (error) {
        console.error('Catalog error:', error);
        res.json({ categories: [] });
    }
});

// Admin: list all catalog categories with publish status
app.get('/api/admin/catalog', isAdminStrict, async (req, res) => {
    try {
        const rows = await query(`
            SELECT id, name, slug, image_url, COALESCE(is_published, false) as is_published
            FROM web_categories ORDER BY name
        `);
        res.json({ categories: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin: toggle publish for categories
app.put('/api/admin/catalog/publish', requireJson, isAdminStrict, async (req, res) => {
    try {
        const { categoryIds, publish } = req.body || {};
        const ids = Array.isArray(categoryIds) ? categoryIds.map(id => parseInt(id)).filter(n => !isNaN(n)) : [];
        if (ids.length === 0) {
            return res.status(400).json({ error: 'categoryIds array required' });
        }
        const val = publish === true || publish === 'true' ? true : false;
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
        await query(`
            UPDATE web_categories SET is_published = $${ids.length + 1}, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
        `, [...ids, val]);
        res.json({ success: true, updated: ids.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Bookings - real data from bookings table
app.get('/api/admin/bookings', isAdminStrict, async (req, res) => {
    try {
        const { metal } = req.query;
        let q = `SELECT id, user_id, status, locked_gold_rate, advance_amount, metal_type, mobile_number, weight_booked, created_at FROM bookings WHERE 1=1`;
        const params = [];
        if (metal && String(metal).trim()) {
            q += ` AND LOWER(COALESCE(metal_type, '')) = $1`;
            params.push(String(metal).toLowerCase());
        }
        q += ` ORDER BY created_at DESC LIMIT 500`;
        const rows = await query(q, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Extend webhook: subscription invoice paid -> credit gold
// ==========================================
async function creditGoldFromPayment(userId, amountInr) {
    const payload = await liveRateService.getCurrentPayload();
    const gold = (payload?.rates || []).find(r => (r.metal_type || '').toLowerCase() === 'gold');
    const rate = Number(gold?.display_rate || gold?.sell_rate || 0);
    if (!rate || rate <= 0) return;
    const grams = Number(amountInr) / rate;
    await query('UPDATE users SET wallet_gold_balance = COALESCE(wallet_gold_balance,0) + $2 WHERE id = $1', [userId, grams]);
    try {
        await query(`
            INSERT INTO sip_transactions (user_id, plan_id, transaction_date, amount, grams, status, created_at)
            VALUES ($1, NULL, CURRENT_TIMESTAMP, $2, $3, 'SUCCESS', CURRENT_TIMESTAMP)
        `, [userId, Number(amountInr), grams]);
        await query(`INSERT INTO gold_lot_movements (user_id, direction, grams, reference, created_at) VALUES ($1, 'CREDIT', $2, 'SIP', CURRENT_TIMESTAMP)`, [userId, grams]);
    } catch {}
}

app.post('/api/payment/razorpay/webhook/subscription', require('express').raw({ type: '*/*' }), async (req, res) => {
    try {
        const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body || {});
        const headerSig = (req.headers['x-razorpay-signature'] || '').toString();
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (webhookSecret) {
            const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
            if (!headerSig || expected !== headerSig) {
                return res.status(401).json({ error: 'invalid_signature' });
            }
        }
        const body = rawBody ? JSON.parse(rawBody) : {};
        const event = body.event;
        if (event === 'invoice.paid') {
            const subscription_id = body.payload?.invoice?.entity?.subscription_id;
            const amount = Number(body.payload?.invoice?.entity?.amount || 0) / 100;
            if (!subscription_id || !amount) return res.json({ ok: true });
            const subs = await query('SELECT * FROM sip_subscriptions WHERE razorpay_subscription_id = $1', [subscription_id]);
            if (subs.length) {
                await creditGoldFromPayment(subs[0].user_id, amount);
            }
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// Cron: reconcile daily subscription payments
// ==========================================
try {
    const cron = require('node-cron');
    cron.schedule('0 0 * * *', async () => {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keyId || !keySecret) return;
        const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
        const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        try {
            const resp = await fetch(`https://api.razorpay.com/v1/payments?from=${since}&count=100`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });
            const data = await resp.json();
            if (resp.ok && Array.isArray(data.items)) {
                for (const p of data.items) {
                    if (p.status === 'captured' && p.method === 'upi' && p.subscription_id) {
                        const subs = await query('SELECT * FROM sip_subscriptions WHERE razorpay_subscription_id = $1', [p.subscription_id]).catch(() => []);
                        if (subs.length) {
                            await creditGoldFromPayment(subs[0].user_id, Number(p.amount) / 100);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Cron reconcile error:', e.message);
        }
    });
} catch {}
app.get('/api/orders', checkAuth, async (req, res) => {
    try {
        const { user_id } = req.query;
        let q = 'SELECT * FROM orders';
        const params = [];
        if (user_id) {
            q += ' WHERE user_id = $1';
            params.push(user_id);
        }
        q += ' ORDER BY created_at DESC';
        const rows = await query(q, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/orders/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query('SELECT * FROM orders WHERE id = $1', [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/orders', checkAuth, async (req, res) => {
    try {
        const body = req.body;
        let total = Number(body.total_amount || 0);
        if (!total && body.items_snapshot_json && Array.isArray(body.items_snapshot_json)) {
            const lr = await query('SELECT metal_type, sell_rate, admin_margin FROM live_rates');
            const map = {};
            for (const r of lr) map[(r.metal_type || '').toLowerCase()] = { sell_rate: r.sell_rate, admin_margin: r.admin_margin };
            const totals = calculateBillTotals(body.items_snapshot_json, map, body.gstRate || 0);
            total = totals.net_total;
        }
        const rows = await query(`
            INSERT INTO orders (user_id, total_amount, payment_status, payment_method, razorpay_order_id, delivery_status, items_snapshot_json, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *
        `, [body.user_id || null, total || 0, body.payment_status || 'PENDING', body.payment_method || null, body.razorpay_order_id || null, body.delivery_status || 'PENDING', JSON.stringify(body.items_snapshot_json || [])]);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/addresses', checkAuth, async (req, res) => {
    try {
        const { user_id } = req.query;
        if (!user_id) return res.json([]);
        const rows = await query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC', [user_id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/addresses', checkAuth, async (req, res) => {
    try {
        const a = req.body;
        const rows = await query(`
            INSERT INTO addresses (user_id, line1, city, pincode, type, created_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP) RETURNING *
        `, [a.user_id, a.line1, a.city || null, a.pincode || null, a.type || 'HOME']);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sip/plans', async (req, res) => {
    try {
        const rows = await query('SELECT * FROM sip_plans WHERE is_active = true ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sip/plans', isAdminStrict, async (req, res) => {
    try {
        const p = req.body;
        const rows = await query(`
            INSERT INTO sip_plans (name, type, min_amount, duration_months, is_active, created_at)
            VALUES ($1, $2, $3, $4, COALESCE($5, true), CURRENT_TIMESTAMP) RETURNING *
        `, [p.name, p.type, Number(p.min_amount || 0), parseInt(p.duration_months), p.is_active]);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sip/transactions', checkAuth, async (req, res) => {
    try {
        const { user_id } = req.query;
        let q = 'SELECT * FROM sip_transactions';
        const params = [];
        if (user_id) {
            q += ' WHERE user_id = $1';
            params.push(user_id);
        }
        q += ' ORDER BY transaction_date DESC';
        const rows = await query(q, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sip/transactions', checkAuth, async (req, res) => {
    try {
        const t = req.body;
        const lr = await query('SELECT metal_type, sell_rate, admin_margin FROM live_rates WHERE LOWER(metal_type) = $1', ['gold']);
        const rate = lr.length > 0 ? Number(lr[0].sell_rate || 0) + Number(lr[0].admin_margin || 0) : 0;
        const credited = rate > 0 ? Number(t.amount || 0) / rate : 0;
        const rows = await query(`
            INSERT INTO sip_transactions (user_id, plan_id, amount, gold_rate_at_time, gold_credited, status, transaction_date)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'SUCCESS'), CURRENT_TIMESTAMP) RETURNING *
        `, [t.user_id || null, t.plan_id || null, Number(t.amount || 0), rate, credited, t.status]);
        // Update wallet balances
        if (t.user_id && credited > 0) {
            await query(`
                INSERT INTO user_gold_wallet (user_id, balance_grams, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO UPDATE SET balance_grams = user_gold_wallet.balance_grams + EXCLUDED.balance_grams, updated_at = CURRENT_TIMESTAMP
            `, [t.user_id, credited]);
            await query(`UPDATE users SET wallet_gold_balance = COALESCE(wallet_gold_balance, 0) + $2 WHERE id = $1`, [t.user_id, credited]).catch(() => {});
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sip/redeemables', async (req, res) => {
    try {
        const rows = await query(`
            SELECT id, item_name, short_name, COALESCE(net_weight, weight) AS grams, purity
            FROM products
            WHERE LOWER(COALESCE(metal_type,'gold')) = 'gold'
              AND (
                LOWER(COALESCE(item_name,'')) LIKE '%coin%' OR
                LOWER(COALESCE(short_name,'')) LIKE '%coin%' OR
                LOWER(COALESCE(item_name,'')) LIKE '%biscuit%' OR
                LOWER(COALESCE(short_name,'')) LIKE '%biscuit%'
              )
              AND COALESCE(is_sold, false) = false
              AND (status IS NULL OR status = 'available')
            ORDER BY grams NULLS LAST, item_name
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sip/redeem', checkAuth, async (req, res) => {
    try {
        const { user_id, product_id } = req.body || {};
        if (!user_id || !product_id) return res.status(400).json({ error: 'user_id and product_id required' });
        const users = await query('SELECT wallet_gold_balance FROM users WHERE id = $1', [user_id]);
        if (users.length === 0) return res.status(404).json({ error: 'user_not_found' });
        const bal = Number(users[0]?.wallet_gold_balance || 0);
        const prows = await query('SELECT id, item_name, short_name, COALESCE(net_weight, weight) AS grams FROM products WHERE id = $1', [product_id]);
        if (prows.length === 0) return res.status(404).json({ error: 'product_not_found' });
        const p = prows[0];
        const grams = Number(p.grams || 0);
        if (!grams || grams <= 0) return res.status(400).json({ error: 'invalid_product_weight' });
        if (bal + 1e-6 < grams) return res.status(409).json({ error: 'insufficient_grams' });
        await query('UPDATE users SET wallet_gold_balance = wallet_gold_balance - $2 WHERE id = $1', [user_id, grams]);
        await query(`
            INSERT INTO user_gold_wallet (user_id, balance_grams, updated_at)
            VALUES ($1, 0, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET balance_grams = GREATEST(0, user_gold_wallet.balance_grams - $2), updated_at = CURRENT_TIMESTAMP
        `, [user_id, grams]);
        await query(`INSERT INTO gold_lot_movements (user_id, direction, grams, reference, created_at) VALUES ($1, 'DEBIT', $2, 'REDEEM', CURRENT_TIMESTAMP)`, [user_id, grams]);
        const rows = await query(`
            INSERT INTO orders (user_id, total_amount, payment_status, payment_method, razorpay_order_id, delivery_status, items_snapshot_json, created_at)
            VALUES ($1, 0, 'PAID', 'SIP', NULL, 'PENDING', $2, CURRENT_TIMESTAMP) RETURNING *
        `, [user_id, JSON.stringify([{ type: 'sip_redeem', product_id: p.id, name: p.item_name || p.short_name, grams_used: grams }])]);
        res.json({ order: rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ADMIN: SIP MANAGEMENT (Strict Admin Email Guard)
// ==========================================

// List all SIP plans (including inactive)
app.get('/api/admin/sip/plans', isAdminStrict, async (req, res) => {
    try {
        const rows = await query('SELECT * FROM sip_plans ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create SIP plan
app.post('/api/admin/sip/plans', requireJson, isAdminStrict, validateNumbers(['min_amount','duration_months']), async (req, res) => {
    try {
        const p = req.body || {};
        if (!p.name || !p.type || !p.duration_months) {
            return res.status(400).json({ error: 'name, type, duration_months required' });
        }
        const rows = await query(`
            INSERT INTO sip_plans (name, type, min_amount, duration_months, is_active, created_at)
            VALUES ($1, $2, COALESCE($3,0), $4, COALESCE($5, true), CURRENT_TIMESTAMP) RETURNING *
        `, [p.name, p.type, Number(p.min_amount || 0), parseInt(p.duration_months), p.is_active]);
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update SIP plan (partial)
app.put('/api/admin/sip/plans/:id', requireJson, isAdminStrict, validateNumbers(['min_amount','duration_months']), async (req, res) => {
    try {
        const { id } = req.params;
        const p = req.body || {};
        const updates = [];
        const params = [];
        let i = 1;
        if (p.name !== undefined) { updates.push(`name = $${i++}`); params.push(p.name); }
        if (p.type !== undefined) { updates.push(`type = $${i++}`); params.push(p.type); }
        if (p.min_amount !== undefined) { updates.push(`min_amount = $${i++}`); params.push(Number(p.min_amount)); }
        if (p.duration_months !== undefined) { updates.push(`duration_months = $${i++}`); params.push(parseInt(p.duration_months)); }
        if (p.is_active !== undefined) { updates.push(`is_active = $${i++}`); params.push(Boolean(p.is_active)); }
        if (updates.length === 0) return res.status(400).json({ error: 'no fields to update' });
        const rows = await query(`UPDATE sip_plans SET ${updates.join(', ')}, created_at = created_at WHERE id = $${i} RETURNING *`, [...params, parseInt(id)]);
        if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Soft delete (deactivate) SIP plan
app.delete('/api/admin/sip/plans/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await query(`UPDATE sip_plans SET is_active = false WHERE id = $1 RETURNING *`, [parseInt(id)]);
        if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List products with redeemable flags
app.get('/api/admin/redeemables', isAdminStrict, async (req, res) => {
    try {
        const { search } = req.query || {};
        let q = `
            SELECT id, item_name, short_name, COALESCE(net_weight, weight) AS grams,
                   purity, is_redeemable, redeem_grams, status
            FROM products
            WHERE (is_deleted IS NULL OR is_deleted = false)
              AND (status IS NULL OR status != 'deleted')
              AND LOWER(COALESCE(metal_type,'gold')) = 'gold'
        `;
        const params = [];
        if (search) {
            q += ` AND (item_name ILIKE $1 OR short_name ILIKE $1)`;
            params.push(`%${search}%`);
        }
        q += ` ORDER BY is_redeemable DESC, redeem_grams NULLS LAST, item_name`;
        const rows = await query(q, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update redeemable flags for a product
app.put('/api/admin/products/:id/redeem', requireJson, isAdminStrict, validateNumbers(['redeem_grams']), async (req, res) => {
    try {
        const { id } = req.params;
        const { is_redeemable, redeem_grams } = req.body || {};
        const updates = ['updated_at = CURRENT_TIMESTAMP'];
        const params = [];
        let i = 1;
        if (is_redeemable !== undefined) {
            updates.push(`is_redeemable = $${i++}`);
            params.push(Boolean(is_redeemable));
        }
        if (redeem_grams !== undefined) {
            const g = redeem_grams === null || redeem_grams === '' ? null : Number(redeem_grams);
            updates.push(`redeem_grams = $${i++}`);
            params.push(g);
        }
        if (updates.length === 1) return res.status(400).json({ error: 'no fields to update' });
        const rows = await query(`UPDATE products SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, [...params, parseInt(id)]);
        if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Viewer: SIP subscriptions and wallet balances
app.get('/api/admin/sip/subscriptions', isAdminStrict, async (req, res) => {
    try {
        const rows = await query(`
            SELECT s.id, s.user_id, s.amount, s.frequency, s.status, s.created_at,
                   u.email, u.name,
                   COALESCE(w.balance_grams, 0) AS wallet_balance
            FROM sip_subscriptions s
            LEFT JOIN users u ON u.id = s.user_id
            LEFT JOIN user_gold_wallet w ON w.user_id = s.user_id
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ==========================================
// STYLES MASTER API (Enterprise Feature)
// ==========================================

app.get('/api/styles', checkAuth, async (req, res) => {
    try {
        const { search, category, active_only } = req.query;
        let queryText = 'SELECT * FROM styles WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (search) {
            queryText += ` AND (style_code ILIKE $${idx} OR item_name ILIKE $${idx++})`;
            params.push(`%${search}%`);
        }
        if (category) {
            queryText += ` AND category = $${idx++}`;
            params.push(category);
        }
        if (active_only === 'true') {
            queryText += ' AND is_active = true';
        }
        queryText += ' ORDER BY style_code';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/styles/:code', checkAuth, async (req, res) => {
    try {
        const { code } = req.params;
        const result = await query('SELECT * FROM styles WHERE style_code = $1', [code.toUpperCase()]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/styles', isAdminStrict, async (req, res) => {
    try {
        const { style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description } = req.body;
        
        if (!style_code || !item_name) {
            return res.status(400).json({ error: 'style_code and item_name are required' });
        }
        
        const result = await query(`
            INSERT INTO styles (style_code, item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [
            style_code.toUpperCase().trim(),
            item_name,
            category || '',
            metal_type || 'gold',
            parseFloat(default_purity) || 91.6,
            default_mc_type || 'PER_GRAM',
            parseFloat(default_mc_value) || 0,
            hsn_code || '7113',
            description || ''
        ]);
        
        broadcast('style-created', result[0]);
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
            return res.status(409).json({ error: 'Style code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/styles/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        const { item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description, is_active } = req.body;
        
        const result = await query(`
            UPDATE styles SET
                item_name = COALESCE($1, item_name),
                category = COALESCE($2, category),
                metal_type = COALESCE($3, metal_type),
                default_purity = COALESCE($4, default_purity),
                default_mc_type = COALESCE($5, default_mc_type),
                default_mc_value = COALESCE($6, default_mc_value),
                hsn_code = COALESCE($7, hsn_code),
                description = COALESCE($8, description),
                is_active = COALESCE($9, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10 RETURNING *
        `, [item_name, category, metal_type, default_purity, default_mc_type, default_mc_value, hsn_code, description, is_active, id]);
        
        if (result.length === 0) {
            return res.status(404).json({ error: 'Style not found' });
        }
        broadcast('style-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/styles/:id', isAdminStrict, async (req, res) => {
    try {
        const { id } = req.params;
        await query('UPDATE styles SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get style categories
app.get('/api/styles/meta/categories', checkAuth, async (req, res) => {
    try {
        const result = await query('SELECT DISTINCT category FROM styles WHERE category IS NOT NULL AND category != \'\' ORDER BY category');
        res.json(result.map(r => r.category));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// VENDORS MASTER API
// ==========================================

app.get('/api/vendors', checkAuth, async (req, res) => {
    try {
        const { search, active_only } = req.query;
        let queryText = 'SELECT * FROM vendors WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (search) {
            queryText += ` AND (vendor_code ILIKE $${idx} OR name ILIKE $${idx++})`;
            params.push(`%${search}%`);
        }
        if (active_only === 'true') {
            queryText += ' AND is_active = true';
        }
        queryText += ' ORDER BY name';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/vendors', isAdminStrict, async (req, res) => {
    try {
        const { vendor_code, name, contact_person, mobile, email, address, city, state, pincode, gstin } = req.body;
        
        if (!vendor_code || !name) {
            return res.status(400).json({ error: 'vendor_code and name are required' });
        }
        
        const result = await query(`
            INSERT INTO vendors (vendor_code, name, contact_person, mobile, email, address, city, state, pincode, gstin)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `, [vendor_code.toUpperCase(), name, contact_person, mobile, email, address, city, state, pincode, gstin]);
        
        res.json(result[0]);
    } catch (error) {
        if (error.message.includes('unique')) {
            return res.status(409).json({ error: 'Vendor code already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// PURCHASE VOUCHER API (Stock-In)
// ==========================================

app.get('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { status, vendor_code, from_date, to_date } = req.query;
        let queryText = 'SELECT * FROM purchase_vouchers WHERE 1=1';
        const params = [];
        let idx = 1;
        
        if (status) {
            queryText += ` AND status = $${idx++}`;
            params.push(status);
        }
        if (vendor_code) {
            queryText += ` AND vendor_code = $${idx++}`;
            params.push(vendor_code);
        }
        if (from_date) {
            queryText += ` AND DATE(date) >= $${idx++}`;
            params.push(from_date);
        }
        if (to_date) {
            queryText += ` AND DATE(date) <= $${idx++}`;
            params.push(to_date);
        }
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Validate PV rows before saving
app.post('/api/purchase-vouchers/validate', checkAuth, async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows)) {
            return res.status(400).json({ error: 'rows array required' });
        }
        
        // Get current rates
        const ratesResult = await query('SELECT * FROM rates ORDER BY updated_at DESC LIMIT 1');
        const rates = ratesResult[0] || { gold: 7500, silver: 156 };
        
        // Get existing styles
        const stylesResult = await query('SELECT style_code FROM styles WHERE is_active = true');
        const validStyles = new Set(stylesResult.map(s => s.style_code.toUpperCase()));
        
        // Get existing tags
        const tagsResult = await query('SELECT tag_no FROM products WHERE tag_no IS NOT NULL');
        const existingTags = new Set(tagsResult.map(t => t.tag_no?.toUpperCase()));
        
        const batchTags = new Set();
        
        const validatedRows = rows.map((row, index) => {
            const errors = [];
            let status = 'VALID';
            
            const styleCode = (row.style_code || '').toUpperCase().trim();
            const tagNo = (row.tag_no || '').toUpperCase().trim();
            const grossWt = parseFloat(row.gross_wt) || 0;
            const netWt = parseFloat(row.net_wt) || grossWt;
            const purity = parseFloat(row.purity) || 91.6;
            const mcValue = parseFloat(row.mc_value) || 0;
            const cost = parseFloat(row.cost) || 0;
            const metalType = (row.metal_type || 'gold').toLowerCase();
            
            // Style validation
            if (styleCode && !validStyles.has(styleCode)) {
                errors.push(`Style '${styleCode}' not found`);
                status = 'STYLE_NOT_FOUND';
            }
            
            // Tag duplicate check
            if (tagNo) {
                if (existingTags.has(tagNo)) {
                    errors.push(`Tag '${tagNo}' already exists`);
                    status = 'DUPLICATE_TAG';
                } else if (batchTags.has(tagNo)) {
                    errors.push(`Tag '${tagNo}' duplicated in batch`);
                    status = 'DUPLICATE_TAG';
                }
                batchTags.add(tagNo);
            }
            
            // Weight validation
            if (grossWt <= 0) {
                errors.push('Gross weight must be > 0');
                if (status === 'VALID') status = 'INVALID_DATA';
            }
            if (netWt > grossWt) {
                errors.push('Net weight cannot exceed gross weight');
                if (status === 'VALID') status = 'INVALID_DATA';
            }
            
            // Cost mismatch check
            if (cost > 0 && grossWt > 0) {
                const expectedCost = calculatePurchaseCost(
                    { metal_type: metalType, net_wt: netWt, purity, mc_type: row.mc_type, mc_value: mcValue },
                    rates
                );
                
                if (cost < expectedCost * 0.8 || cost > expectedCost * 1.3) {
                    errors.push(`Cost mismatch (Expected ~₹${Math.round(expectedCost)})`);
                    if (status === 'VALID') status = 'COST_MISMATCH';
                }
            }
            
            return {
                row_index: index,
                status,
                errors,
                style_found: validStyles.has(styleCode),
                data: { ...row, style_code: styleCode, tag_no: tagNo, gross_wt: grossWt, net_wt: netWt, purity, mc_value: mcValue, cost }
            };
        });
        
        res.json({
            valid: validatedRows.filter(r => r.status === 'VALID').length,
            invalid: validatedRows.filter(r => r.status !== 'VALID').length,
            rows: validatedRows,
            rates
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save Purchase Voucher with items
app.post('/api/purchase-vouchers', checkAuth, async (req, res) => {
    try {
        const { pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, items, total } = req.body;
        
        if (!pv_no || !items || items.length === 0) {
            return res.status(400).json({ error: 'PV number and items required' });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Calculate totals
            const totalGrossWt = items.reduce((sum, i) => sum + (parseFloat(i.gross_wt) || 0), 0);
            const totalNetWt = items.reduce((sum, i) => sum + (parseFloat(i.net_wt) || 0), 0);
            const totalPcs = items.length;
            
            // Insert PV
            const pvResult = await client.query(`
                INSERT INTO purchase_vouchers (pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, items, total, total_gross_wt, total_net_wt, total_pcs, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'completed') RETURNING *
            `, [pv_no, supplier_name, vendor_code, vendor_bill_no, vendor_bill_date, JSON.stringify(items), total || 0, totalGrossWt, totalNetWt, totalPcs]);
            
            const pvId = pvResult.rows[0].id;
            
            // Insert products
            for (const item of items) {
                const tagNo = item.tag_no || `${pv_no}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`.toUpperCase();
                const barcode = item.barcode || tagNo;
                
                await client.query(`
                    INSERT INTO products (barcode, tag_no, style_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, purchase_cost, vendor_code, pv_id, bin_location)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                `, [
                    barcode, tagNo, item.style_code, item.item_name || item.style_code, item.item_name || item.style_code,
                    item.metal_type || 'gold', item.gross_wt, item.net_wt || item.gross_wt, item.net_wt || item.gross_wt,
                    item.purity || 91.6, item.rate || 0, item.mc_value || 0, item.mc_type || 'PER_GRAM',
                    item.cost || 0, vendor_code, pvId, item.bin_location || ''
                ]);
            }
            
            await client.query('COMMIT');
            
            broadcast('pv-created', pvResult.rows[0]);
            res.json({ success: true, pv: pvResult.rows[0], products_created: items.length });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// TAG SPLIT / MERGE OPERATIONS
// ==========================================

// Split a tag into multiple
app.post('/api/tags/split', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { source_tag, split_into, weights, notes } = req.body;
        
        if (!source_tag || !split_into || split_into < 2) {
            return res.status(400).json({ error: 'source_tag and split_into (min 2) required' });
        }
        
        // Get source product
        const sourceResult = await query('SELECT * FROM products WHERE tag_no = $1 AND tag_status = $2', [source_tag.toUpperCase(), 'active']);
        if (sourceResult.length === 0) {
            return res.status(404).json({ error: 'Source tag not found or not active' });
        }
        
        const source = sourceResult[0];
        const sourceWt = parseFloat(source.net_wt || source.weight);
        
        // Validate weights sum
        let splitWeights = weights;
        if (!Array.isArray(weights) || weights.length !== split_into) {
            // Auto-split equally
            const equalWt = Math.round((sourceWt / split_into) * 1000) / 1000;
            splitWeights = Array(split_into).fill(equalWt);
            splitWeights[split_into - 1] = Math.round((sourceWt - (equalWt * (split_into - 1))) * 1000) / 1000;
        }
        
        const totalSplitWt = splitWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(totalSplitWt - sourceWt) > 0.001) {
            return res.status(400).json({ error: `Split weights (${totalSplitWt}g) must equal source weight (${sourceWt}g)` });
        }
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            const newTags = [];
            
            for (let i = 0; i < split_into; i++) {
                const newTag = `${source_tag}-${String.fromCharCode(65 + i)}`;
                const newWt = splitWeights[i];
                
                await client.query(`
                    INSERT INTO products (barcode, tag_no, style_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, floor, split_from_tag, tag_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active')
                `, [
                    newTag, newTag, source.style_code, source.short_name, source.item_name, source.metal_type,
                    newWt, newWt, newWt, source.purity, source.rate, source.mc_rate, source.mc_type, source.floor, source_tag
                ]);
                
                newTags.push(newTag);
            }
            
            // Deactivate source tag
            await client.query('UPDATE products SET tag_status = $1, updated_at = CURRENT_TIMESTAMP WHERE tag_no = $2', ['split', source_tag.toUpperCase()]);
            
            // Log operation
            await client.query(`
                INSERT INTO tag_operations (operation_type, source_tags, result_tags, source_total_wt, result_total_wt, notes, performed_by)
                VALUES ('SPLIT', $1, $2, $3, $4, $5, $6)
            `, [[source_tag], newTags, sourceWt, totalSplitWt, notes || '', req.user?.email || 'system']);
            
            await client.query('COMMIT');
            
            res.json({ success: true, source_tag, new_tags: newTags, weights: splitWeights });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Merge multiple tags into one
app.post('/api/tags/merge', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { source_tags, new_tag_prefix, notes } = req.body;
        
        if (!Array.isArray(source_tags) || source_tags.length < 2) {
            return res.status(400).json({ error: 'At least 2 source_tags required' });
        }
        
        // Get source products
        const placeholders = source_tags.map((_, i) => `$${i + 1}`).join(',');
        const sourceResult = await query(`SELECT * FROM products WHERE tag_no IN (${placeholders}) AND tag_status = 'active'`, source_tags.map(t => t.toUpperCase()));
        
        if (sourceResult.length !== source_tags.length) {
            return res.status(400).json({ error: 'Some tags not found or not active' });
        }
        
        // Validate same metal type
        const metalTypes = [...new Set(sourceResult.map(p => p.metal_type))];
        if (metalTypes.length > 1) {
            return res.status(400).json({ error: 'Cannot merge different metal types' });
        }
        
        const totalWt = sourceResult.reduce((sum, p) => sum + parseFloat(p.net_wt || p.weight || 0), 0);
        const avgPurity = sourceResult.reduce((sum, p) => sum + parseFloat(p.purity || 0), 0) / sourceResult.length;
        const first = sourceResult[0];
        
        const dbPool = getPool();
        const client = await dbPool.connect();
        
        try {
            await client.query('BEGIN');
            
            const newTag = new_tag_prefix ? `${new_tag_prefix}-MERGED-${Date.now()}` : `MERGED-${Date.now()}`;
            
            // Create merged product
            await client.query(`
                INSERT INTO products (barcode, tag_no, style_code, short_name, item_name, metal_type, gross_wt, net_wt, weight, purity, rate, mc_rate, mc_type, floor, tag_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active')
            `, [
                newTag, newTag, first.style_code, `Merged (${source_tags.length} items)`, `Merged Stock`,
                first.metal_type, totalWt, totalWt, totalWt, avgPurity, first.rate, first.mc_rate, first.mc_type, first.floor
            ]);
            
            // Deactivate source tags
            await client.query(`UPDATE products SET tag_status = 'merged', merged_into_tag = $1, updated_at = CURRENT_TIMESTAMP WHERE tag_no IN (${placeholders})`, [newTag, ...source_tags.map(t => t.toUpperCase())]);
            
            // Log operation
            await client.query(`
                INSERT INTO tag_operations (operation_type, source_tags, result_tags, source_total_wt, result_total_wt, notes, performed_by)
                VALUES ('MERGE', $1, $2, $3, $4, $5, $6)
            `, [source_tags, [newTag], totalWt, totalWt, notes || '', req.user?.email || 'system']);
            
            await client.query('COMMIT');
            
            res.json({ success: true, source_tags, new_tag: newTag, total_weight: totalWt });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get tag operations history
app.get('/api/tags/operations', checkAuth, hasPermission('tagsplit'), async (req, res) => {
    try {
        const { limit = 50, type } = req.query;
        let queryText = 'SELECT * FROM tag_operations WHERE 1=1';
        const params = [];
        
        if (type) {
            queryText += ' AND operation_type = $1';
            params.push(type.toUpperCase());
        }
        queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(parseInt(limit));
        
        const result = await query(queryText, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// ENTERPRISE REPORTS API
// ==========================================

// ROL Analysis Report
app.get('/api/reports/rol-analysis', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { category, show_all } = req.query;
        
        let queryText = `
            SELECT p.*, s.category, s.item_name as style_name,
                   COALESCE(p.rol_limit, 0) as rol_limit,
                   1 as current_stock,
                   CASE WHEN COALESCE(p.rol_limit, 0) > 1 THEN COALESCE(p.rol_limit, 0) - 1 ELSE 0 END as shortage
            FROM products p
            LEFT JOIN styles s ON p.style_code = s.style_code
            WHERE p.tag_status = 'active' 
              AND p.is_sold = false
              AND COALESCE(p.is_deleted, false) = false
        `;
        const params = [];
        
        if (!show_all) {
            queryText += ' AND COALESCE(p.rol_limit, 0) > 1';
        }
        if (category) {
            queryText += ` AND s.category = $${params.length + 1}`;
            params.push(category);
        }
        
        queryText += ' ORDER BY shortage DESC, s.category, p.style_code';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json({
                summary: {
                    total_styles: 0,
                    total_shortage: 0
                },
                data: []
            });
        }
        
        // Group by style_code for aggregation
        const grouped = {};
        result.forEach(row => {
            const key = row.style_code || 'UNKNOWN';
            if (!grouped[key]) {
                grouped[key] = {
                    style_code: key,
                    style_name: row.style_name || row.short_name,
                    category: row.category || '',
                    current_stock: 0,
                    rol_limit: row.rol_limit,
                    shortage: 0,
                    items: []
                };
            }
            grouped[key].current_stock += 1;
            grouped[key].items.push(row);
        });
        
        // Calculate shortage
        const analysis = Object.values(grouped).map(g => ({
            ...g,
            shortage: Math.max(0, g.rol_limit - g.current_stock)
        })).filter(g => show_all || g.shortage > 0);
        
        res.json({
            summary: {
                total_styles: analysis.length,
                total_shortage: analysis.reduce((sum, a) => sum + a.shortage, 0)
            },
            data: analysis
        });
    } catch (error) {
        console.error('ROL Analysis Report Error:', error);
        // Return empty result instead of 500 error
        res.json({
            summary: {
                total_styles: 0,
                total_shortage: 0
            },
            data: []
        });
    }
});

// GST Tax Report
app.get('/api/reports/gst', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { from_date, to_date, gst_rate } = req.query;
        
        let queryText = `
            SELECT 
                bill_no, 
                DATE(date) as bill_date,
                customer_name,
                COALESCE(taxable_value, total) as taxable_value,
                COALESCE(cgst, ROUND(COALESCE(taxable_value, total) * 0.015, 2)) as cgst_amount,
                COALESCE(sgst, ROUND(COALESCE(taxable_value, total) * 0.015, 2)) as sgst_amount,
                COALESCE(gst, ROUND(COALESCE(taxable_value, total) * 0.03, 2)) as total_tax,
                net_total as total_amount,
                gst_rate
            FROM bills 
            WHERE COALESCE(is_deleted, false) = false
        `;
        const params = [];
        let idx = 1;
        
        if (from_date) {
            queryText += ` AND DATE(date) >= $${idx++}`;
            params.push(from_date);
        }
        if (to_date) {
            queryText += ` AND DATE(date) <= $${idx++}`;
            params.push(to_date);
        }
        if (gst_rate) {
            queryText += ` AND gst_rate = $${idx++}`;
            params.push(gst_rate);
        }
        
        queryText += ' ORDER BY date DESC';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json({
                bills: [],
                totals: {
                    taxable_value: 0,
                    cgst_amount: 0,
                    sgst_amount: 0,
                    total_tax: 0,
                    total_amount: 0
                },
                count: 0
            });
        }
        
        // Calculate totals
        const totals = {
            taxable_value: 0,
            cgst_amount: 0,
            sgst_amount: 0,
            total_tax: 0,
            total_amount: 0
        };
        
        result.forEach(row => {
            totals.taxable_value += parseFloat(row.taxable_value) || 0;
            totals.cgst_amount += parseFloat(row.cgst_amount) || 0;
            totals.sgst_amount += parseFloat(row.sgst_amount) || 0;
            totals.total_tax += parseFloat(row.total_tax) || 0;
            totals.total_amount += parseFloat(row.total_amount) || 0;
        });
        
        res.json({
            bills: result,
            totals: {
                taxable_value: Math.round(totals.taxable_value * 100) / 100,
                cgst_amount: Math.round(totals.cgst_amount * 100) / 100,
                sgst_amount: Math.round(totals.sgst_amount * 100) / 100,
                total_tax: Math.round(totals.total_tax * 100) / 100,
                total_amount: Math.round(totals.total_amount * 100) / 100
            },
            count: result.length
        });
    } catch (error) {
        console.error('GST Report Error:', error);
        // Return empty result instead of 500 error
        res.json({
            bills: [],
            totals: {
                taxable_value: 0,
                cgst_amount: 0,
                sgst_amount: 0,
                total_tax: 0,
                total_amount: 0
            },
            count: 0
        });
    }
});

// Stock Summary Report
app.get('/api/reports/stock-summary', checkAuth, hasPermission('reports'), async (req, res) => {
    try {
        const { category, metal_type } = req.query;
        
        let queryText = `
            SELECT 
                COALESCE(s.category, 'Uncategorized') as category,
                p.metal_type,
                COUNT(*) as total_items,
                SUM(COALESCE(p.net_wt, p.weight, 0)) as total_weight,
                SUM(COALESCE(p.purchase_cost, 0)) as total_cost,
                AVG(COALESCE(p.purity, 91.6)) as avg_purity
            FROM products p
            LEFT JOIN styles s ON p.style_code = s.style_code
            WHERE p.tag_status = 'active' 
              AND p.is_sold = false
              AND COALESCE(p.is_deleted, false) = false
        `;
        const params = [];
        let idx = 1;
        
        if (category) {
            queryText += ` AND s.category = $${idx++}`;
            params.push(category);
        }
        if (metal_type) {
            queryText += ` AND p.metal_type = $${idx++}`;
            params.push(metal_type);
        }
        
        queryText += ' GROUP BY COALESCE(s.category, \'Uncategorized\'), p.metal_type ORDER BY category, metal_type';
        
        const result = await query(queryText, params);
        
        // Handle empty result
        if (!result || result.length === 0) {
            return res.json([]);
        }
        
        res.json(result);
    } catch (error) {
        console.error('Stock Summary Report Error:', error);
        // Return empty result instead of 500 error
        res.json([]);
    }
});

// ==========================================
// LABEL PRINTING API
// ==========================================

const labelPrinter = require('./scripts/label-printer');

app.post('/api/print/label', async (req, res) => {
    try {
        const { itemData, printerConfig } = req.body;
        
        if (!itemData) {
            return res.status(400).json({ error: 'itemData is required' });
        }
        
        if (!printerConfig) {
            return res.status(400).json({ error: 'printerConfig is required' });
        }
        
        if (!printerConfig.type || !printerConfig.address) {
            return res.status(400).json({ error: 'printerConfig must have type and address' });
        }
        
        const success = await labelPrinter.printLabel(itemData, printerConfig);
        
        if (success) {
            res.json({ 
                success: true, 
                message: 'Label printed successfully',
                tspl: labelPrinter.generateTSPLLabel(itemData)
            });
        } else {
            res.status(500).json({ error: 'Failed to print label' });
        }
    } catch (error) {
        console.error('Label printing error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/print/label/tspl', async (req, res) => {
    try {
        const { itemData } = req.body;
        
        if (!itemData) {
            return res.status(400).json({ error: 'itemData is required' });
        }
        
        const tspl = labelPrinter.generateTSPLLabel(itemData);
        res.json({ tspl, itemData });
    } catch (error) {
        console.error('TSPL generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// BACKWARD COMPATIBLE ROUTES (for existing frontend)
// These routes accept :tenant param but ignore it
// ==========================================

// Redirect old tenant routes to new routes
const oldRoutes = [
    'products', 'customers', 'quotations', 'bills', 'rates',
    'ledger/transactions', 'purchase-vouchers', 'rol', 'sales-returns',
    'users', 'tally/config', 'tally/test', 'tally/sync-logs'
];

oldRoutes.forEach(route => {
    // GET with tenant prefix
    app.get(`/api/:tenant/${route}`, (req, res, next) => {
        req.url = `/api/${route}`;
        next('route');
    });
    
    // POST with tenant prefix
    app.post(`/api/:tenant/${route}`, (req, res, next) => {
        req.url = `/api/${route}`;
        next('route');
    });
});

// Also handle individual resource routes
app.get('/api/:tenant/products/:id', (req, res) => res.redirect(`/api/products/${req.params.id}`));
app.put('/api/:tenant/products/:id', checkAuth, async (req, res) => {
    req.params.tenant = undefined;
    // Forward to main route handler
    const { id } = req.params;
    const product = req.body;
    try {
        const queryText = `UPDATE products SET
            barcode = $1, sku = $2, style_code = $3, short_name = $4, item_name = $5,
            metal_type = $6, size = $7, weight = $8, purity = $9, rate = $10,
            mc_rate = $11, mc_type = $12, pcs = $13, box_charges = $14, stone_charges = $15,
            floor = $16, avg_wt = $17, updated_at = CURRENT_TIMESTAMP
        WHERE id = $18 RETURNING *`;
        const params = [
            product.barcode, product.sku, product.styleCode, product.shortName, product.itemName,
            product.metalType, product.size, product.weight, product.purity, product.rate,
            product.mcRate, product.mcType, product.pcs || 1, product.boxCharges || 0,
            product.stoneCharges || 0, product.floor, product.avgWt || product.weight, id
        ];
        const result = await query(queryText, params);
        broadcast('product-updated', result[0]);
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/:tenant/products/:id', checkAuth, async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM products WHERE id = $1', [id]);
        broadcast('product-deleted', { id: parseInt(id) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/:tenant/bills/by-number/:billNo', checkAuth, async (req, res) => {
    try {
        const { billNo } = req.params;
        const result = await query('SELECT * FROM bills WHERE bill_no = $1', [billNo]);
        if (result.length === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        res.json(result[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SOCKET.IO FOR REAL-TIME SYNC
// ==========================================

const connectedClients = new Set();

io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);
    connectedClients.add(socket.id);
    
    socket.on('join-tenant', (tenantCode) => {
        // In single-tenant mode, all clients join the same room
        socket.join('main');
        console.log(`📱 Client ${socket.id} joined main room`);
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
        connectedClients.delete(socket.id);
    });
    
    socket.on('barcode-print-request', (data) => {
        const { barcode, product } = data;
        socket.to('main').emit('barcode-printed', { barcode, product });
        console.log(`📡 Barcode print sync: ${barcode}`);
    });
});

function broadcast(event, data) {
    io.to('main').emit(event, data);
    console.log(`📡 Broadcasted ${event}`);
}

global.broadcast = broadcast;

liveRateService.start(io);

// 5-minute poller: keep live rates cache fresh
setInterval(() => {
    liveRateService.fetchLiveRates().catch(err => console.error('Rate poller error:', err.message));
}, 5 * 60 * 1000);

// ==========================================
// ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.error('API Error:', err);
        res.status(err.status || 500).json({ 
            error: err.message || 'Internal server error',
            success: false 
        });
    } else {
        next(err);
    }
});

// Catch-all route (MUST BE LAST)
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found', success: false });
    }
    res.status(404).json({ error: 'Not found' });
});

// ==========================================
// START SERVER
// ==========================================

const DOMAIN = process.env.DOMAIN || 'localhost';
const PROTOCOL = process.env.NODE_ENV === 'production' ? 'https' : 'http';
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? `${PROTOCOL}://${DOMAIN}` 
  : `http://localhost:${PORT}`;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 URL: ${BASE_URL}`);
    console.log(`📊 API available at ${BASE_URL}/api`);
    console.log(`🔄 Self-Update API: ${BASE_URL}/api/update-software`);
    console.log(`🔌 Real-time sync enabled (Socket.IO)`);
    if (process.env.NODE_ENV === 'production') {
        console.log(`☁️ Production mode active`);
    }
});

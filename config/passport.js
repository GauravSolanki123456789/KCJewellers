// Passport Configuration (Single-Tenant Version)
// SECURITY: Role enforced via authService - Super Admin = admin, others = customer
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./database');
const { resolveUserRole, SUPER_ADMIN_EMAIL } = require('../services/authService');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            const user = resolveUserRole(result.rows[0]);
            done(null, user);
        } else {
            done(null, null);
        }
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    const googleId = profile.id;
    const displayName = profile.displayName;

    if (!email) {
        return done(new Error('No email found in Google profile'), null);
    }

    try {
        // ============================================
        // SECURITY: Strict admin access control
        // jaigaurav56789@gmail.com → super_admin with ['all'] tabs
        // All others → customer (admin access denied)
        // ============================================
        const emailLower = String(email || '').toLowerCase().trim();
        const isSuperAdmin = emailLower === SUPER_ADMIN_EMAIL;
        
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            if (user.account_status === 'rejected' || user.account_status === 'suspended') {
                console.log(`🚫 Login denied for ${email}: Account ${user.account_status}`);
                return done(null, false, { message: 'Your account has been suspended. Contact admin.' });
            }
            
            // Strict override: Force super_admin role and ['all'] allowed_tabs for super admin
            // Deny admin access to everyone else
            if (isSuperAdmin) {
                // Force super_admin role and ['all'] tabs in database
                await pool.query(
                    'UPDATE users SET role = $1, allowed_tabs = $2, updated_at = CURRENT_TIMESTAMP WHERE email = $3',
                    ['super_admin', ['all'], email]
                );
                user.role = 'super_admin';
                user.allowed_tabs = ['all'];
            } else {
                // Deny admin access - force customer role
                await pool.query(
                    'UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
                    ['customer', email]
                );
                user.role = 'customer';
            }
            
            if (!user.google_id) {
                await pool.query('UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2', [googleId, email]);
                user.google_id = googleId;
            }
            
            if (user.name !== displayName && displayName) {
                const safeName = String(displayName || '').slice(0, 255);
                await pool.query('UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2', [safeName, email]);
                user.name = safeName;
            }
            
            // Resolve user role (will enforce super_admin or customer)
            const resolvedUser = resolveUserRole(user);
            console.log(`✅ Login successful: ${email} (Role: ${resolvedUser.role}, AllowedTabs: ${JSON.stringify(resolvedUser.allowed_tabs)})`);
            return done(null, resolvedUser);
            
        } else {
            // New user: create account
            // Super Admin → super_admin with ['all'], others → customer
            const role = isSuperAdmin ? 'super_admin' : 'customer';
            const allowedTabs = isSuperAdmin ? ['all'] : [];
            
            if (isSuperAdmin) {
                console.log(`🔐 Super Admin login detected. Auto-creating account for ${email}`);
            } else {
                console.log(`📝 New customer sign-up: ${email}`);
            }
            
            const safeName = String(displayName || (isSuperAdmin ? 'Super Admin' : 'Customer')).slice(0, 255);
            const newUserResult = await pool.query(
                `INSERT INTO users (google_id, email, name, role, account_status, allowed_tabs) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [googleId, email, safeName, role, 'active', allowedTabs]
            );
            
            // Resolve user role (will enforce super_admin or customer)
            const resolvedUser = resolveUserRole(newUserResult.rows[0]);
            console.log(`✅ New user created: ${email} (Role: ${resolvedUser.role}, AllowedTabs: ${JSON.stringify(resolvedUser.allowed_tabs)})`);
            return done(null, resolvedUser);
        }
    } catch (err) {
        console.error('Passport authentication error:', err);
        return done(err, null);
    }
}));

module.exports = passport;

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
        // SECURITY: Explicit admin assignment
        // jaigaurav56789@gmail.com → always admin
        // ============================================
        const isAdmin = profile.emails && profile.emails[0] && profile.emails[0].value === 'jaigaurav56789@gmail.com';
        
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            if (user.account_status === 'rejected' || user.account_status === 'suspended') {
                console.log(`🚫 Login denied for ${email}: Account ${user.account_status}`);
                return done(null, false, { message: 'Your account has been suspended. Contact admin.' });
            }
            
            // Explicit admin assignment - ensure role is persisted
            if (isAdmin) {
                user.role = 'admin';
                await pool.query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2', ['admin', email]);
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
            
            const resolvedUser = resolveUserRole(user);
            console.log(`✅ Login successful: ${email} (Role: ${resolvedUser.role})`);
            return done(null, resolvedUser);
            
        } else {
            // New user: create account. Super Admin → admin, others → customer
            const role = isAdmin ? 'admin' : 'customer';
            const allowedTabs = isAdmin ? ['all'] : [];
            
            if (isAdmin) {
                console.log(`🔐 Super Admin login detected. Auto-creating account for ${email}`);
            } else {
                console.log(`📝 New customer sign-up: ${email}`);
            }
            
            const safeName = String(displayName || (isAdmin ? 'Super Admin' : 'Customer')).slice(0, 255);
            const newUserResult = await pool.query(
                `INSERT INTO users (google_id, email, name, role, account_status, allowed_tabs) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [googleId, email, safeName, role, 'active', allowedTabs]
            );
            
            const resolvedUser = resolveUserRole(newUserResult.rows[0]);
            return done(null, resolvedUser);
        }
    } catch (err) {
        console.error('Passport authentication error:', err);
        return done(err, null);
    }
}));

module.exports = passport;

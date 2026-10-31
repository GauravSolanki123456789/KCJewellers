// Passport Configuration (Single-Tenant Version)
// SECURITY: Role enforced via authService - Super Admin = admin, others = customer
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./database');
const { resolveUserRole, SUPER_ADMIN_EMAIL } = require('../services/authService');
const { findOrCreateGoogleUser } = require('../services/storefrontTenantAuth');

passport.serializeUser((user, done) => {
    done(null, {
        id: user.id,
        loginEmail: user.loginEmail || user.email || null,
        loginName: user.loginName || user.name || null,
    });
});

passport.deserializeUser(async (payload, done) => {
    try {
        const id = payload && typeof payload === 'object' ? payload.id : payload;
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            const user = resolveUserRole(result.rows[0]);
            if (payload && typeof payload === 'object') {
                user.loginEmail = payload.loginEmail || user.email;
                user.loginName = payload.loginName || user.name;
            }
            done(null, user);
        } else {
            done(null, null);
        }
    } catch (error) {
        console.error('Deserialize user error:', error);
        done(error, null);
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
        // Normalize email for comparison
        const emailLower = String(email || '').toLowerCase().trim();
        const isSuperAdmin = emailLower === SUPER_ADMIN_EMAIL.toLowerCase().trim();
        
        const { user: lookedUp, storefrontResellerId, created } = await findOrCreateGoogleUser({
            req,
            email: emailLower,
            googleId,
            displayName,
        });
        let result = { rows: lookedUp ? [lookedUp] : [] };
        if (created && lookedUp) {
            result = { rows: [lookedUp] };
        }

        if (result.rows.length > 0) {
            // Existing user (primary email, reseller alias, or storefront-bound customer)
            const user = result.rows[0];
            if (storefrontResellerId) {
                console.log(`🏬 Storefront Google login ${emailLower} on reseller #${storefrontResellerId} → user #${user.id}`);
            }
            
            // Check account status
            if (user.account_status === 'rejected' || user.account_status === 'suspended') {
                console.log(`🚫 Login denied for ${emailLower}: Account ${user.account_status}`);
                return done(null, false, { message: 'Your account has been suspended. Contact admin.' });
            }
            
            // CRITICAL: Force correct role based on email
            if (isSuperAdmin) {
                // Super admin: force super_admin role and ['all'] tabs
                await pool.query(
                    `UPDATE users 
                     SET role = 'super_admin', 
                         allowed_tabs = ARRAY['all']::text[], 
                         account_status = 'active',
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $1`,
                    [user.id]
                );
                user.role = 'super_admin';
                user.allowed_tabs = ['all'];
                user.account_status = 'active';
                console.log(`🔐 Super Admin login: ${emailLower} - Role set to super_admin`);
            } else {
                // All others: force customer role
                await pool.query(
                    `UPDATE users 
                     SET role = 'customer', 
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $1`,
                    [user.id]
                );
                user.role = 'customer';
            }
            
            const ownerEmail = String(user.email || '').toLowerCase().trim();
            const isAliasLogin = ownerEmail && ownerEmail !== emailLower;

            // Alias Google logins share the reseller owner row — never overwrite owner name / google_id.
            if (!isAliasLogin) {
                if (!user.google_id) {
                    try {
                        await pool.query(
                            'UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                            [googleId, user.id]
                        );
                        user.google_id = googleId;
                    } catch (gidErr) {
                        console.warn('google_id update skipped:', gidErr.message);
                    }
                }
                if (user.name !== displayName && displayName) {
                    const safeName = String(displayName || '').slice(0, 255);
                    await pool.query(
                        'UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                        [safeName, user.id]
                    );
                    user.name = safeName;
                }
            }

            user.loginEmail = emailLower;
            user.loginName = displayName || user.name;
            
            // CRITICAL: Always resolve role to ensure correct role is returned
            const resolvedUser = resolveUserRole(user);
            resolvedUser.loginEmail = emailLower;
            resolvedUser.loginName = displayName || resolvedUser.name;
            console.log(`✅ Login successful: ${emailLower} (Role: ${resolvedUser.role}, AllowedTabs: ${JSON.stringify(resolvedUser.allowed_tabs)})`);
            return done(null, resolvedUser);
            
        } else {
            // New user: create account
            const role = isSuperAdmin ? 'super_admin' : 'customer';
            const allowedTabs = isSuperAdmin ? ['all'] : [];
            
            if (isSuperAdmin) {
                console.log(`🔐 Super Admin first login detected. Creating account for ${emailLower}`);
            } else {
                console.log(`📝 New customer sign-up: ${emailLower}`);
            }
            
            const safeName = String(displayName || (isSuperAdmin ? 'Super Admin' : 'Customer')).slice(0, 255);
            const newUserResult = await pool.query(
                `INSERT INTO users (google_id, email, name, role, account_status, allowed_tabs, storefront_reseller_id, customer_tier)
                 VALUES ($1, $2, $3, $4, 'active', $5, $6, $7) RETURNING *`,
                [googleId, emailLower, safeName, role, allowedTabs, storefrontResellerId || null, 'B2C_CUSTOMER']
            );
            
            // CRITICAL: Always resolve role to ensure correct role is returned
            const resolvedUser = resolveUserRole(newUserResult.rows[0]);
            resolvedUser.loginEmail = emailLower;
            resolvedUser.loginName = displayName || resolvedUser.name;
            console.log(`✅ New user created: ${emailLower} (Role: ${resolvedUser.role}, AllowedTabs: ${JSON.stringify(resolvedUser.allowed_tabs)})`);
            return done(null, resolvedUser);
        }
    } catch (error) {
        console.error('Passport authentication error:', error);
        return done(error, null);
    }
}));

module.exports = passport;

// Passport Configuration (Single-Tenant Version)
// SECURITY: Whitelist-based Google OAuth - Only pre-approved emails can login
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./database');

// Super Admin email - ALWAYS allowed, auto-created if not exists
const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com';

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
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
        // SECURITY: WHITELIST-BASED LOGIN
        // ============================================
        
        // Step 1: Check if user exists in the whitelist (users table)
        let result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            // ✅ User is in whitelist - allow login
            const user = result.rows[0];
            
            // Check if account is active
            if (user.account_status === 'rejected' || user.account_status === 'suspended') {
                console.log(`🚫 Login denied for ${email}: Account ${user.account_status}`);
                return done(null, false, { message: 'Your account has been suspended. Contact admin.' });
            }
            
            // Update Google ID if missing
            if (!user.google_id) {
                await pool.query('UPDATE users SET google_id = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2', [googleId, email]);
                user.google_id = googleId;
            }
            
            // Update name if changed
            if (user.name !== displayName && displayName) {
                await pool.query('UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2', [displayName, email]);
                user.name = displayName;
            }
            
            console.log(`✅ Login successful: ${email} (Role: ${user.role})`);
            return done(null, user);
            
        } else {
            // ============================================
            // EXCEPTION: Super Admin - Auto-create if not exists
            // ============================================
            if (email === SUPER_ADMIN_EMAIL) {
                console.log(`🔐 Super Admin login detected. Auto-creating account for ${email}`);
                
                const newUserResult = await pool.query(
                    `INSERT INTO users (google_id, email, name, role, account_status, allowed_tabs) 
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    [googleId, email, displayName || 'Super Admin', 'admin', 'active', ['all']]
                );
                
                console.log(`✅ Super Admin account created: ${email}`);
                return done(null, newUserResult.rows[0]);
            }
            
            // ============================================
            // 🚫 DENY ACCESS - Email not in whitelist
            // ============================================
            console.log(`🚫 ACCESS DENIED: ${email} is NOT in the whitelist`);
            
            // Return false with a message - this will trigger failure redirect
            return done(null, false, { 
                message: 'ACCESS_DENIED',
                email: email
            });
        }
    } catch (err) {
        console.error('Passport authentication error:', err);
        return done(err, null);
    }
}));

module.exports = passport;

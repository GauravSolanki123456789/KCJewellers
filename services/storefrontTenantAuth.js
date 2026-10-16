/**
 * Vanity-domain tenant login: customers who sign in on a reseller host stay
 * bound to that reseller. Reseller owner / alias emails still open reseller access.
 */
const { query, pool } = require('../config/database');
const { findResellerByDomain, normalizeDomain } = require('./resellerMetalRates');
const { findResellerOwnerByLoginEmail } = require('./resellerLoginEmails');
const { SUPER_ADMIN_EMAIL } = require('./authService');

let schemaReady = false;

async function ensureStorefrontTenantSchema() {
    if (schemaReady) return;
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS storefront_reseller_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_users_storefront_reseller_id
            ON users (storefront_reseller_id)
            WHERE storefront_reseller_id IS NOT NULL
    `);
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key`);
    await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_id_key`);
    await pool.query(`DROP INDEX IF EXISTS users_email_key`);
    await pool.query(`DROP INDEX IF EXISTS users_google_id_key`);
    await pool.query(`DROP INDEX IF EXISTS idx_users_email_unique`);
    await pool.query(`DROP INDEX IF EXISTS idx_users_google_id_unique`);
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_per_storefront
                ON users (LOWER(TRIM(email)), COALESCE(storefront_reseller_id, 0))
                WHERE email IS NOT NULL AND TRIM(email) <> ''
        `);
    } catch (e) {
        console.warn('storefront email unique index:', e.message);
    }
    try {
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id_per_storefront
                ON users (google_id, COALESCE(storefront_reseller_id, 0))
                WHERE google_id IS NOT NULL AND TRIM(google_id) <> ''
        `);
    } catch (e) {
        console.warn('storefront google_id unique index:', e.message);
    }
    schemaReady = true;
}

function last10(raw) {
    return String(raw || '').replace(/\D/g, '').slice(-10);
}

function mobilesMatch(a, b) {
    const x = last10(a);
    const y = last10(b);
    return x.length === 10 && x === y;
}

function originHostname(originRaw) {
    try {
        return normalizeDomain(new URL(String(originRaw || '')).hostname);
    } catch {
        return '';
    }
}

async function resolveStorefrontResellerIdFromReq(req) {
    await ensureStorefrontTenantSchema();
    const headerHost = normalizeDomain(
        req?.headers?.['x-storefront-domain'] || req?.headers?.['x-custom-domain'] || '',
    );
    if (headerHost) {
        const row = await findResellerByDomain(headerHost);
        if (row?.id) return Number(row.id);
    }
    const sessionOrigin = req?.session?.redirect_after_login_origin;
    const fromSession = originHostname(sessionOrigin);
    if (fromSession) {
        const row = await findResellerByDomain(fromSession);
        if (row?.id) return Number(row.id);
    }
    const originHost = originHostname(req?.headers?.origin);
    if (originHost) {
        const row = await findResellerByDomain(originHost);
        if (row?.id) return Number(row.id);
    }
    const refererHost = originHostname(req?.headers?.referer);
    if (refererHost) {
        const row = await findResellerByDomain(refererHost);
        if (row?.id) return Number(row.id);
    }
    return null;
}

async function getUserById(id) {
    const uid = parseInt(String(id), 10);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    const rows = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [uid]);
    return rows[0] || null;
}

async function findUserByEmailOnTenant(emailLower, storefrontResellerId) {
    const email = String(emailLower || '').toLowerCase().trim();
    if (!email) return null;
    if (storefrontResellerId) {
        const owner = await getUserById(storefrontResellerId);
        if (owner && String(owner.email || '').toLowerCase().trim() === email) return owner;
        const bound = await query(
            `SELECT * FROM users
             WHERE LOWER(TRIM(email)) = $1 AND storefront_reseller_id = $2
             LIMIT 1`,
            [email, storefrontResellerId],
        );
        return bound[0] || null;
    }
    const rows = await query(
        `SELECT * FROM users
         WHERE LOWER(TRIM(email)) = $1 AND storefront_reseller_id IS NULL
         ORDER BY id ASC
         LIMIT 1`,
        [email],
    );
    return rows[0] || null;
}

async function findLoginUserByEmail(emailRaw, storefrontResellerId) {
    await ensureStorefrontTenantSchema();
    const email = String(emailRaw || '').toLowerCase().trim();
    if (!email) return null;

    if (email === String(SUPER_ADMIN_EMAIL || '').toLowerCase().trim()) {
        const admin = await query(
            `SELECT * FROM users WHERE LOWER(TRIM(email)) = $1 ORDER BY id ASC LIMIT 1`,
            [email],
        );
        return admin[0] || null;
    }

    const aliasOwner = await findResellerOwnerByLoginEmail(email);
    if (aliasOwner) {
        if (!storefrontResellerId || Number(aliasOwner.id) === Number(storefrontResellerId)) {
            return aliasOwner;
        }
    }

    return findUserByEmailOnTenant(email, storefrontResellerId);
}

async function findLoginUserByMobile(storedMobile, storefrontResellerId) {
    await ensureStorefrontTenantSchema();
    const stored = String(storedMobile || '').replace(/\D/g, '');
    if (stored.length < 8) return null;

    if (storefrontResellerId) {
        const owner = await getUserById(storefrontResellerId);
        if (owner && mobilesMatch(owner.mobile_number, stored)) return owner;
        const bound = await query(
            `SELECT * FROM users
             WHERE storefront_reseller_id = $1 AND mobile_number IS NOT NULL`,
            [storefrontResellerId],
        );
        return bound.find((row) => mobilesMatch(row.mobile_number, stored)) || null;
    }

    const candidates = await query(
        `SELECT * FROM users
         WHERE mobile_number IS NOT NULL
           AND storefront_reseller_id IS NULL
           AND LENGTH(TRIM(mobile_number)) >= 8
         LIMIT 8000`,
    );
    return candidates.find((row) => mobilesMatch(row.mobile_number, stored)) || null;
}

async function createStorefrontCustomer({
    email,
    googleId,
    name,
    mobileNumber,
    storefrontResellerId,
}) {
    await ensureStorefrontTenantSchema();
    const emailLower = email ? String(email).toLowerCase().trim() : null;
    const safeName = String(name || (mobileNumber ? `Customer ${String(mobileNumber).slice(-4)}` : 'Customer')).slice(
        0,
        255,
    );
    const values = [
        googleId || null,
        emailLower,
        safeName,
        'customer',
        'active',
        [],
        mobileNumber || null,
        storefrontResellerId || null,
        'B2C_CUSTOMER',
    ];
    try {
        const inserted = await query(
            `INSERT INTO users (
                google_id, email, name, role, account_status, allowed_tabs,
                mobile_number, storefront_reseller_id, customer_tier
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            values,
        );
        return inserted[0];
    } catch (err) {
        const msg = String(err?.message || '');
        if (googleId && (err?.code === '23505' || msg.includes('google_id'))) {
            values[0] = null;
            const retry = await query(
                `INSERT INTO users (
                    google_id, email, name, role, account_status, allowed_tabs,
                    mobile_number, storefront_reseller_id, customer_tier
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                values,
            );
            return retry[0];
        }
        throw err;
    }
}

async function findOrCreateGoogleUser({ req, email, googleId, displayName }) {
    await ensureStorefrontTenantSchema();
    const emailLower = String(email || '').toLowerCase().trim();
    const storefrontResellerId = await resolveStorefrontResellerIdFromReq(req);
    let user = await findLoginUserByEmail(emailLower, storefrontResellerId);
    if (!user && storefrontResellerId) {
        user = await createStorefrontCustomer({
            email: emailLower,
            googleId,
            name: displayName,
            storefrontResellerId,
        });
        console.log(
            `📝 Storefront customer (Google) ${emailLower} → reseller #${storefrontResellerId} user #${user.id}`,
        );
        return { user, storefrontResellerId, created: true };
    }
    return { user, storefrontResellerId, created: false };
}

async function findOrCreateMobileUser(req, storedMobile, displayName) {
    await ensureStorefrontTenantSchema();
    const stored = String(storedMobile || '').replace(/\D/g, '');
    const storefrontResellerId = await resolveStorefrontResellerIdFromReq(req);
    let user = await findLoginUserByMobile(stored, storefrontResellerId);
    if (!user) {
        user = await createStorefrontCustomer({
            name: displayName || `Customer ${stored.slice(-4)}`,
            mobileNumber: stored,
            storefrontResellerId,
        });
        if (storefrontResellerId) {
            console.log(`📱 Storefront customer (OTP) ${stored} → reseller #${storefrontResellerId} user #${user.id}`);
        } else {
            console.log(`📱 New OTP user: ${stored}`);
        }
        return { user, storefrontResellerId, created: true };
    }
    return { user, storefrontResellerId, created: false };
}

module.exports = {
    ensureStorefrontTenantSchema,
    resolveStorefrontResellerIdFromReq,
    findLoginUserByEmail,
    findLoginUserByMobile,
    findOrCreateGoogleUser,
    findOrCreateMobileUser,
    createStorefrontCustomer,
    mobilesMatch,
};

/**
 * Alternate Google login emails that map to a reseller brand owner (users.id).
 */
const { query } = require('../config/database');

function normalizeEmail(raw) {
    return String(raw || '').toLowerCase().trim();
}

async function findResellerOwnerByLoginEmail(emailRaw) {
    const email = normalizeEmail(emailRaw);
    if (!email) return null;
    const rows = await query(
        `SELECT u.*
         FROM reseller_login_emails rle
         INNER JOIN users u ON u.id = rle.user_id
         WHERE LOWER(rle.email) = $1
         LIMIT 1`,
        [email],
    );
    return rows[0] || null;
}

async function listResellerLoginEmails(userId) {
    const id = parseInt(String(userId), 10);
    if (Number.isNaN(id) || id <= 0) return [];
    const rows = await query(
        `SELECT id, user_id, email, label, created_at
         FROM reseller_login_emails
         WHERE user_id = $1
         ORDER BY created_at ASC, id ASC`,
        [id],
    );
    return rows;
}

async function emailTakenByOtherAccount(email, excludeUserId = null) {
    const normalized = normalizeEmail(email);
    if (!normalized) return 'Valid email required';

    const userRows = await query(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [normalized],
    );
    if (userRows.length > 0) {
        const uid = userRows[0].id;
        if (excludeUserId == null || uid !== excludeUserId) {
            return 'This email is already registered as a separate account';
        }
    }

    const aliasRows = await query(
        `SELECT user_id FROM reseller_login_emails WHERE LOWER(email) = $1 LIMIT 1`,
        [normalized],
    );
    if (aliasRows.length > 0) {
        const uid = aliasRows[0].user_id;
        if (excludeUserId == null || uid !== excludeUserId) {
            return 'This email is already linked to another reseller brand';
        }
    }

    return null;
}

async function addResellerLoginEmail(userId, emailRaw, labelRaw) {
    const id = parseInt(String(userId), 10);
    if (Number.isNaN(id) || id <= 0) throw new Error('Invalid user');

    const ownerRows = await query(
        `SELECT id, email, customer_tier FROM users WHERE id = $1 LIMIT 1`,
        [id],
    );
    if (ownerRows.length === 0) throw new Error('User not found');
    const owner = ownerRows[0];
    if (String(owner.customer_tier || '').toUpperCase() !== 'RESELLER') {
        throw new Error('Login emails can only be added for RESELLER accounts');
    }

    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) throw new Error('Valid email required');
    if (email === normalizeEmail(owner.email)) {
        throw new Error('Primary account email is already the main login — add a different email here');
    }

    const taken = await emailTakenByOtherAccount(email, id);
    if (taken) throw new Error(taken);

    const label = labelRaw != null && String(labelRaw).trim()
        ? String(labelRaw).trim().slice(0, 120)
        : null;

    const [row] = await query(
        `INSERT INTO reseller_login_emails (user_id, email, label)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, email, label, created_at`,
        [id, email, label],
    );
    return row;
}

async function removeResellerLoginEmail(userId, aliasId) {
    const uid = parseInt(String(userId), 10);
    const aid = parseInt(String(aliasId), 10);
    if (Number.isNaN(uid) || Number.isNaN(aid)) throw new Error('Invalid id');
    const rows = await query(
        `DELETE FROM reseller_login_emails WHERE id = $1 AND user_id = $2 RETURNING id`,
        [aid, uid],
    );
    if (rows.length === 0) throw new Error('Login email not found');
    return { success: true };
}

function registerResellerLoginEmailRoutes(app, { isAdminStrict, requireJson }) {
    app.get('/api/admin/users/:id/login-emails', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });
            const data = await listResellerLoginEmails(id);
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/admin/users/:id/login-emails', isAdminStrict, requireJson, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });
            const row = await addResellerLoginEmail(id, req.body?.email, req.body?.label);
            res.json({ success: true, data: row });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });

    app.delete('/api/admin/users/:id/login-emails/:aliasId', isAdminStrict, async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const aliasId = parseInt(req.params.aliasId, 10);
            if (Number.isNaN(id) || Number.isNaN(aliasId)) {
                return res.status(400).json({ error: 'Invalid id' });
            }
            await removeResellerLoginEmail(id, aliasId);
            res.json({ success: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
}

module.exports = {
    normalizeEmail,
    findResellerOwnerByLoginEmail,
    listResellerLoginEmails,
    addResellerLoginEmail,
    removeResellerLoginEmail,
    registerResellerLoginEmailRoutes,
};

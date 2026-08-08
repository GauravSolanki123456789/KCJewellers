/**
 * Credits, top-up plans, and payment settings for Enhanced Pictures.
 */

const DEFAULT_PLANS = [
    { name: 'Starter', credits: 50, price_inr: 700, sort_order: 1 },
    { name: 'Catalogue', credits: 150, price_inr: 1999, sort_order: 2 },
    { name: 'Wholesale', credits: 500, price_inr: 5999, sort_order: 3 },
];

const FREE_CREDITS = 4;

async function ensureCreditsSchema(pool) {
    await pool.query(`
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS reseller_enhanced_picture_credits INTEGER NOT NULL DEFAULT 4,
            ADD COLUMN IF NOT EXISTS reseller_enhanced_razorpay_enabled BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS reseller_enhanced_payment_qr_url TEXT,
            ADD COLUMN IF NOT EXISTS reseller_enhanced_bank_details TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_enhanced_picture_jobs
            ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(16) NOT NULL DEFAULT '1:1',
            ADD COLUMN IF NOT EXISTS canvas_text TEXT,
            ADD COLUMN IF NOT EXISTS download_filename VARCHAR(255)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_credit_plans (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(120) NOT NULL,
            credits INTEGER NOT NULL,
            price_inr NUMERIC(12, 2) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reseller_enhanced_credit_plans_user
            ON reseller_enhanced_credit_plans (reseller_user_id, sort_order, id)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_enhanced_credit_ledger (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            delta INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            reason VARCHAR(64) NOT NULL,
            note TEXT,
            created_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function getCreditBalance(query, userId) {
    const rows = await query(
        `SELECT COALESCE(reseller_enhanced_picture_credits, 4)::int AS credits,
                COALESCE(reseller_enhanced_razorpay_enabled, false) AS razorpay_enabled,
                reseller_enhanced_payment_qr_url AS payment_qr_url,
                reseller_enhanced_bank_details AS bank_details
         FROM users WHERE id = $1`,
        [userId],
    );
    if (!rows.length) return null;
    return {
        credits: Math.max(0, Number(rows[0].credits) || 0),
        razorpay_enabled: !!rows[0].razorpay_enabled,
        payment_qr_url: rows[0].payment_qr_url || null,
        bank_details: rows[0].bank_details || null,
    };
}

async function ensureDefaultPlans(query, resellerUserId) {
    const existing = await query(
        `SELECT id FROM reseller_enhanced_credit_plans WHERE reseller_user_id = $1 LIMIT 1`,
        [resellerUserId],
    );
    if (existing.length) return;
    for (const p of DEFAULT_PLANS) {
        await query(
            `INSERT INTO reseller_enhanced_credit_plans
                (reseller_user_id, name, credits, price_inr, sort_order, is_active)
             VALUES ($1, $2, $3, $4, $5, true)`,
            [resellerUserId, p.name, p.credits, p.price_inr, p.sort_order],
        );
    }
}

async function listPlans(query, resellerUserId, { activeOnly = false } = {}) {
    await ensureDefaultPlans(query, resellerUserId);
    const sql = activeOnly
        ? `SELECT * FROM reseller_enhanced_credit_plans
           WHERE reseller_user_id = $1 AND is_active = true
           ORDER BY sort_order ASC, id ASC`
        : `SELECT * FROM reseller_enhanced_credit_plans
           WHERE reseller_user_id = $1
           ORDER BY sort_order ASC, id ASC`;
    return query(sql, [resellerUserId]);
}

async function setCreditBalance(query, _pool, { userId, balance, adminId, note, reason }) {
    const next = Math.max(0, Math.floor(Number(balance) || 0));
    const cur = await getCreditBalance(query, userId);
    if (!cur) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    const delta = next - cur.credits;
    await query(
        `UPDATE users SET reseller_enhanced_picture_credits = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [next, userId],
    );
    await query(
        `INSERT INTO reseller_enhanced_credit_ledger
            (reseller_user_id, delta, balance_after, reason, note, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, delta, next, reason || 'admin_set', note || null, adminId || null],
    );
    return next;
}

async function addCredits(query, _pool, { userId, amount, adminId, note, reason }) {
    const add = Math.floor(Number(amount) || 0);
    if (!add) {
        const err = new Error('Credit amount must be non-zero');
        err.status = 400;
        throw err;
    }
    const rows = await query(
        `UPDATE users
         SET reseller_enhanced_picture_credits = GREATEST(0, COALESCE(reseller_enhanced_picture_credits, 0) + $1),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING COALESCE(reseller_enhanced_picture_credits, 0)::int AS credits`,
        [add, userId],
    );
    if (!rows.length) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    const balance = Number(rows[0].credits);
    await query(
        `INSERT INTO reseller_enhanced_credit_ledger
            (reseller_user_id, delta, balance_after, reason, note, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, add, balance, reason || 'admin_add', note || null, adminId || null],
    );
    return balance;
}

/** Deduct 1 credit atomically. Throws 402 if insufficient. */
async function consumeOneCredit(query, _pool, userId) {
    return consumeCredits(query, _pool, userId, 1);
}

/** Deduct N credits atomically. Throws 402 if insufficient. */
async function consumeCredits(query, _pool, userId, amount = 1) {
    const n = Math.max(1, Math.min(10, Math.floor(Number(amount) || 1)));
    const list = await query(
        `UPDATE users
         SET reseller_enhanced_picture_credits = reseller_enhanced_picture_credits - $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND COALESCE(reseller_enhanced_picture_credits, 0) >= $2
         RETURNING COALESCE(reseller_enhanced_picture_credits, 0)::int AS credits`,
        [userId, n],
    );
    if (!list.length) {
        const err = new Error(
            n > 1
                ? `Need ${n} credits for this quality tier. Top up credits to continue.`
                : 'No credits remaining. Top up credits to continue generating studio photos.',
        );
        err.status = 402;
        throw err;
    }
    const balance = Number(list[0].credits);
    await query(
        `INSERT INTO reseller_enhanced_credit_ledger
            (reseller_user_id, delta, balance_after, reason, note)
         VALUES ($1, $2, $3, 'generate', $4)`,
        [userId, -n, balance, `${n} image generation${n > 1 ? 's' : ''}`],
    );
    return balance;
}

module.exports = {
    FREE_CREDITS,
    DEFAULT_PLANS,
    ensureCreditsSchema,
    getCreditBalance,
    ensureDefaultPlans,
    listPlans,
    setCreditBalance,
    addCredits,
    consumeOneCredit,
    consumeCredits,
};

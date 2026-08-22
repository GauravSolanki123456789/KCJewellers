/**
 * DigiGold / DigiSilver — per-reseller digital metal accumulation via Razorpay.
 */
const crypto = require('crypto');
const { maskSecret } = require('./smsConfig');
const { findResellerByDomain, getStoredRates } = require('./resellerMetalRates');
const {
    ensureResellerSmsColumns,
    getResellerSmsConfigForSend,
    getSharedCatalogOtpForCreator,
} = require('./resellerSmsConfig');
const { requireResellerErp } = require('./resellerErp');

const METAL_KEYS = ['silver', 'gold_24k', 'gold_22k', 'gold_18k'];

const RETAIL_RATE_COL = {
    silver: 'silver_per_gram',
    gold_24k: 'gold_24k_per_gram',
    gold_22k: 'gold_22k_per_gram',
    gold_18k: 'gold_18k_per_gram',
};

const DISCOUNT_COL = {
    silver: 'digi_silver_discount_inr',
    gold_24k: 'digi_gold_24k_discount_inr',
    gold_22k: 'digi_gold_22k_discount_inr',
    gold_18k: 'digi_gold_18k_discount_inr',
};

function safeNum(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
}

function toPaise(rupees) {
    return Math.round(safeNum(rupees) * 100);
}

function normalizeInviteCode(raw) {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function normalizeDomain(raw) {
    const d = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split(':')[0]
        .split('/')[0];
    return d.replace(/^www\./, '');
}

function isValidMetalKey(key) {
    return METAL_KEYS.includes(String(key || '').trim());
}

function effectiveRatePerGram(retailRate, discountInr) {
    const retail = safeNum(retailRate);
    const disc = Math.max(0, safeNum(discountInr));
    return Math.max(1, Math.round((retail - disc) * 100) / 100);
}

function gramsFromAmount(amountInr, effectiveRate) {
    const amt = safeNum(amountInr);
    const rate = safeNum(effectiveRate);
    if (amt <= 0 || rate <= 0) return 0;
    return Math.round((amt / rate) * 1_000_000) / 1_000_000;
}

async function ensureDigiSchema(pool) {
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reseller_razorpay_key_id VARCHAR(128),
        ADD COLUMN IF NOT EXISTS reseller_razorpay_key_secret TEXT
    `);
    await pool.query(`
        ALTER TABLE reseller_metal_rates
        ADD COLUMN IF NOT EXISTS digi_silver_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS digi_gold_24k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS digi_gold_22k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS digi_gold_18k_discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_holdings (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metal_key VARCHAR(24) NOT NULL,
            balance_grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (reseller_user_id, customer_user_id, metal_key)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_orders (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metal_key VARCHAR(24) NOT NULL,
            amount_inr NUMERIC(12, 2) NOT NULL,
            retail_rate_per_gram NUMERIC(12, 2) NOT NULL,
            discount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
            effective_rate_per_gram NUMERIC(12, 2) NOT NULL,
            grams NUMERIC(14, 6) NOT NULL,
            razorpay_order_id VARCHAR(64),
            razorpay_payment_id VARCHAR(64),
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP
        )
    `);
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reseller_digigold_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS reseller_digisilver_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await pool.query(`
        ALTER TABLE reseller_digi_orders
        ADD COLUMN IF NOT EXISTS source VARCHAR(24) NOT NULL DEFAULT 'razorpay',
        ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(24),
        ADD COLUMN IF NOT EXISTS reference_no VARCHAR(128),
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS customer_name_manual VARCHAR(255),
        ADD COLUMN IF NOT EXISTS customer_mobile_manual VARCHAR(16)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_chit_schemes (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_line VARCHAR(16) NOT NULL,
            name VARCHAR(255) NOT NULL,
            scheme_type VARCHAR(32) NOT NULL DEFAULT 'monthly_chit',
            description TEXT,
            monthly_amount_inr NUMERIC(12, 2),
            duration_months INTEGER,
            metal_key VARCHAR(24),
            bonus_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_chit_members (
            id SERIAL PRIMARY KEY,
            scheme_id INTEGER NOT NULL REFERENCES reseller_chit_schemes(id) ON DELETE CASCADE,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_name VARCHAR(255) NOT NULL,
            customer_mobile VARCHAR(16),
            customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
            target_amount_inr NUMERIC(12, 2),
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_chit_transactions (
            id SERIAL PRIMARY KEY,
            scheme_id INTEGER NOT NULL REFERENCES reseller_chit_schemes(id) ON DELETE CASCADE,
            member_id INTEGER NOT NULL REFERENCES reseller_chit_members(id) ON DELETE CASCADE,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            txn_type VARCHAR(20) NOT NULL DEFAULT 'payment',
            amount_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
            grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
            metal_key VARCHAR(24),
            rate_per_gram NUMERIC(12, 2),
            payment_mode VARCHAR(24) NOT NULL DEFAULT 'cash',
            reference_no VARCHAR(128),
            notes TEXT,
            txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
            created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

async function findResellerByInviteCode(query, code) {
    const c = normalizeInviteCode(code);
    if (!c) return null;
    const rows = await query(
        `SELECT id, customer_tier, business_name, custom_domain, reseller_invite_code
         FROM users
         WHERE UPPER(TRIM(COALESCE(customer_tier::text, ''))) = 'RESELLER'
           AND UPPER(REGEXP_REPLACE(COALESCE(reseller_invite_code, ''), '[^A-Z0-9]', '', 'g')) = $1
         LIMIT 1`,
        [c],
    );
    return rows[0] || null;
}

async function resolveResellerFromRequest(query, { domain, code }) {
    if (domain) {
        const byDomain = await findResellerByDomain(domain);
        if (byDomain) return byDomain;
    }
    if (code) {
        return findResellerByInviteCode(query, code);
    }
    return null;
}

async function loadResellerPaymentRow(query, userId) {
    const id = parseInt(String(userId), 10);
    if (!Number.isFinite(id) || id <= 0) return null;
    const rows = await query(
        `SELECT id, customer_tier, business_name, custom_domain, reseller_invite_code,
                reseller_razorpay_key_id, reseller_razorpay_key_secret
         FROM users WHERE id = $1`,
        [id],
    );
    return rows[0] || null;
}

function publicPaymentSettings(row) {
    const keyId = String(row?.reseller_razorpay_key_id || '').trim();
    const secret = String(row?.reseller_razorpay_key_secret || '').trim();
    return {
        razorpay_key_id: keyId,
        razorpay_key_id_set: !!keyId,
        razorpay_key_secret: maskSecret(secret),
        razorpay_key_secret_set: !!secret,
        payments_configured: !!(keyId && secret),
    };
}

async function getDigiRateBundle(stored, metalFilter) {
    if (!stored) return null;
    const buildOne = (metalKey) => {
        const retail = safeNum(stored[RETAIL_RATE_COL[metalKey]]);
        const discount = safeNum(stored[DISCOUNT_COL[metalKey]]);
        const effective = effectiveRatePerGram(retail, discount);
        return {
            metal_key: metalKey,
            retail_rate_per_gram: retail,
            discount_inr: discount,
            effective_rate_per_gram: effective,
        };
    };
    if (metalFilter === 'gold') {
        return ['gold_24k', 'gold_22k', 'gold_18k'].map(buildOne);
    }
    if (metalFilter === 'silver') {
        return [buildOne('silver')];
    }
    return METAL_KEYS.map(buildOne);
}

async function buildPublicDigiConfig(query, reseller, metal) {
    const stored = await getStoredRates(reseller.id);
    const paymentRow = await loadResellerPaymentRow(query, reseller.id);
    const payment = publicPaymentSettings(paymentRow);
    const tiers = await getDigiRateBundle(stored, metal);
    if (!tiers?.length || !stored) {
        return { ok: false, error: 'Rates not configured yet. Please ask the jeweller to update today rates.' };
    }
    const hasRates = tiers.some((t) => t.retail_rate_per_gram > 0);
    if (!hasRates) {
        return { ok: false, error: 'Today rates are not set yet.' };
    }
    return {
        ok: true,
        business_name: reseller.business_name || 'Jeweller',
        metal,
        tiers,
        payments_configured: payment.payments_configured,
        razorpay_key_id: payment.razorpay_key_id_set ? payment.razorpay_key_id : null,
        updated_at: stored.updated_at || null,
    };
}

async function saveDigiDiscounts(query, userId, body) {
    const uid = parseInt(String(userId), 10);
    const stored = await getStoredRates(uid);
    if (!stored) {
        return { ok: false, error: 'Save today rates first before setting Digi discounts.' };
    }
    const clampDisc = (raw, retail) => {
        const d = Math.max(0, safeNum(raw));
        const r = safeNum(retail);
        return Math.min(d, Math.max(0, r - 1));
    };
    const discounts = {
        digi_silver_discount_inr: clampDisc(body.digi_silver_discount_inr, stored.silver_per_gram),
        digi_gold_24k_discount_inr: clampDisc(body.digi_gold_24k_discount_inr, stored.gold_24k_per_gram),
        digi_gold_22k_discount_inr: clampDisc(body.digi_gold_22k_discount_inr, stored.gold_22k_per_gram),
        digi_gold_18k_discount_inr: clampDisc(body.digi_gold_18k_discount_inr, stored.gold_18k_per_gram),
    };
    await query(
        `UPDATE reseller_metal_rates SET
            digi_silver_discount_inr = $2,
            digi_gold_24k_discount_inr = $3,
            digi_gold_22k_discount_inr = $4,
            digi_gold_18k_discount_inr = $5,
            updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [
            uid,
            discounts.digi_silver_discount_inr,
            discounts.digi_gold_24k_discount_inr,
            discounts.digi_gold_22k_discount_inr,
            discounts.digi_gold_18k_discount_inr,
        ],
    );
    return { ok: true, discounts };
}

async function createRazorpayOrder(keyId, keySecret, amountInr, notes) {
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
            amount: toPaise(amountInr),
            currency: 'INR',
            notes: notes || {},
        }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.id) {
        throw new Error(data?.error?.description || data?.error || 'Razorpay order creation failed');
    }
    return data.id;
}

function verifyRazorpaySignature(orderId, paymentId, signature, keySecret) {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    return expected === signature;
}

async function creditDigiHolding(query, { resellerUserId, customerUserId, metalKey, grams }) {
    const g = safeNum(grams);
    if (g <= 0) return;
    await query(
        `INSERT INTO reseller_digi_holdings (reseller_user_id, customer_user_id, metal_key, balance_grams, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (reseller_user_id, customer_user_id, metal_key)
         DO UPDATE SET
            balance_grams = reseller_digi_holdings.balance_grams + EXCLUDED.balance_grams,
            updated_at = CURRENT_TIMESTAMP`,
        [resellerUserId, customerUserId, metalKey, g],
    );
}

async function getCustomerHoldings(query, resellerUserId, customerUserId) {
    const rows = await query(
        `SELECT metal_key, balance_grams, updated_at
         FROM reseller_digi_holdings
         WHERE reseller_user_id = $1 AND customer_user_id = $2
         ORDER BY metal_key ASC`,
        [resellerUserId, customerUserId],
    );
    return rows.map((r) => ({
        metal_key: r.metal_key,
        balance_grams: safeNum(r.balance_grams),
        updated_at: r.updated_at,
    }));
}

async function findOrCreateDigiCustomer(query, { name, mobile }) {
    const digits = String(mobile || '')
        .replace(/\D/g, '')
        .slice(-10);
    if (digits.length === 10) {
        const existing = await query(
            `SELECT id FROM users WHERE RIGHT(REGEXP_REPLACE(COALESCE(mobile_number, ''), '[^0-9]', '', 'g'), 10) = $1 LIMIT 1`,
            [digits],
        );
        if (existing.length) return existing[0].id;
    }
    const safeName = String(name || 'Customer').trim().slice(0, 255) || 'Customer';
    const email = `digi.${digits || Date.now()}.${Math.random().toString(36).slice(2, 8)}@kc.local`;
    const ins = await query(
        `INSERT INTO users (email, name, mobile_number, customer_tier, account_status, role)
         VALUES ($1, $2, $3, 'B2C_CUSTOMER', 'active', 'user')
         RETURNING id`,
        [email, safeName, digits.length === 10 ? digits : null],
    );
    return ins[0].id;
}

function requireDigiProduct(query, productLine) {
    const col = productLine === 'silver' ? 'reseller_digisilver_enabled' : 'reseller_digigold_enabled';
    return async (req, res, next) => {
        try {
            const rows = await query(
                `SELECT COALESCE(${col}, false) AS enabled FROM users WHERE id = $1`,
                [req.user.id],
            );
            if (!rows.length || !rows[0].enabled) {
                return res.status(403).json({ error: `${productLine === 'silver' ? 'DigiSilver' : 'DigiGold'} is not enabled for your account.` });
            }
            next();
        } catch (e) {
            res.status(500).json({ error: e.message || 'Access check failed' });
        }
    };
}

async function assertDigiProductEnabled(query, userId, productLine) {
    const col = productLine === 'silver' ? 'reseller_digisilver_enabled' : 'reseller_digigold_enabled';
    const rows = await query(
        `SELECT COALESCE(${col}, false) AS enabled FROM users WHERE id = $1`,
        [userId],
    );
    if (!rows.length || !rows[0].enabled) {
        const err = new Error(`${productLine === 'silver' ? 'DigiSilver' : 'DigiGold'} is not enabled for your account.`);
        err.status = 403;
        throw err;
    }
}

function registerResellerDigiRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, globalLimiter, authLimiter } = deps;
    const erpGate = requireResellerErp(query);
    const requireResellerStaff = deps.requireSharedCatalogCreator;
    const createAndSendOtp = deps.createAndSendOtp;
    const getSharedCatalogOtpEnabled = deps.getSharedCatalogOtpEnabled;
    const parseInternationalMobileInput = deps.parseInternationalMobileInput;

    // ——— Reseller payment settings ———
    app.get('/api/reseller/payment-settings', requireResellerStaff, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const row = await loadResellerPaymentRow(query, req.user.id);
            if (!row) return res.status(404).json({ error: 'Account not found' });
            res.json({
                ...publicPaymentSettings(row),
                business_name: row.business_name || null,
                custom_domain: row.custom_domain || null,
                reseller_invite_code: row.reseller_invite_code || null,
            });
        } catch (e) {
            console.error('payment-settings get:', e);
            res.status(500).json({ error: e.message || 'Failed to load payment settings' });
        }
    });

    app.patch('/api/reseller/payment-settings', requireResellerStaff, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const keyId = req.body.razorpay_key_id != null ? String(req.body.razorpay_key_id).trim() : null;
            const keySecret =
                req.body.razorpay_key_secret != null ? String(req.body.razorpay_key_secret).trim() : null;
            const sets = [];
            const params = [req.user.id];
            if (keyId !== null) {
                params.push(keyId);
                sets.push(`reseller_razorpay_key_id = $${params.length}`);
            }
            if (keySecret) {
                params.push(keySecret);
                sets.push(`reseller_razorpay_key_secret = $${params.length}`);
            }
            if (!sets.length) {
                return res.status(400).json({ error: 'Nothing to update' });
            }
            await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
            const row = await loadResellerPaymentRow(query, req.user.id);
            res.json(publicPaymentSettings(row));
        } catch (e) {
            console.error('payment-settings patch:', e);
            res.status(500).json({ error: e.message || 'Failed to save payment settings' });
        }
    });

    // ——— ERP staff: digi discounts + share meta ———
    app.get('/api/reseller/erp/digi/settings', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const stored = await getStoredRates(req.user.id);
            const paymentRow = await loadResellerPaymentRow(query, req.user.id);
            const metal = String(req.query.metal || 'gold').trim().toLowerCase();
            const tiers = stored ? await getDigiRateBundle(stored, metal) : [];
            res.json({
                rates: stored,
                tiers,
                discounts: stored
                    ? {
                          digi_silver_discount_inr: safeNum(stored.digi_silver_discount_inr),
                          digi_gold_24k_discount_inr: safeNum(stored.digi_gold_24k_discount_inr),
                          digi_gold_22k_discount_inr: safeNum(stored.digi_gold_22k_discount_inr),
                          digi_gold_18k_discount_inr: safeNum(stored.digi_gold_18k_discount_inr),
                      }
                    : null,
                payments: publicPaymentSettings(paymentRow),
                custom_domain: paymentRow?.custom_domain || null,
                reseller_invite_code: paymentRow?.reseller_invite_code || null,
                business_name: paymentRow?.business_name || null,
            });
        } catch (e) {
            console.error('erp digi settings get:', e);
            res.status(500).json({ error: e.message || 'Failed to load digi settings' });
        }
    });

    app.put('/api/reseller/erp/digi/settings', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const result = await saveDigiDiscounts(query, req.user.id, req.body);
            if (!result.ok) return res.status(400).json({ error: result.error });
            const stored = await getStoredRates(req.user.id);
            const metal = String(req.body.metal || 'gold').trim().toLowerCase();
            res.json({
                ok: true,
                tiers: stored ? await getDigiRateBundle(stored, metal) : [],
                discounts: result.discounts,
            });
        } catch (e) {
            console.error('erp digi settings put:', e);
            res.status(500).json({ error: e.message || 'Failed to save digi settings' });
        }
    });

    app.get('/api/reseller/erp/digi/transactions', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
            const q = String(req.query.q || '').trim().toLowerCase();
            const metal = String(req.query.metal || '').trim().toLowerCase();
            const from = String(req.query.from || '').trim().slice(0, 10);
            const to = String(req.query.to || '').trim().slice(0, 10);
            const params = [req.user.id];
            let sql = `
                SELECT o.id, o.metal_key, o.amount_inr, o.retail_rate_per_gram, o.discount_inr,
                       o.effective_rate_per_gram, o.grams, o.razorpay_order_id, o.razorpay_payment_id,
                       o.status, o.created_at, o.paid_at, o.source, o.payment_mode, o.reference_no,
                       COALESCE(u.name, o.customer_name_manual) AS customer_name,
                       COALESCE(u.mobile_number, o.customer_mobile_manual) AS customer_mobile
                FROM reseller_digi_orders o
                LEFT JOIN users u ON u.id = o.customer_user_id
                WHERE o.reseller_user_id = $1 AND o.status = 'paid'`;
            if (metal === 'gold') {
                params.push('gold_%');
                sql += ` AND o.metal_key LIKE $${params.length}`;
            } else if (metal === 'silver') {
                sql += ` AND o.metal_key = 'silver'`;
            }
            if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
                params.push(from);
                sql += ` AND COALESCE(o.paid_at, o.created_at)::date >= $${params.length}::date`;
            }
            if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
                params.push(to);
                sql += ` AND COALESCE(o.paid_at, o.created_at)::date <= $${params.length}::date`;
            }
            if (q) {
                params.push(`%${q}%`);
                const i = params.length;
                sql += ` AND (
                    LOWER(COALESCE(u.name, '')) LIKE $${i}
                    OR LOWER(COALESCE(u.mobile_number, '')) LIKE $${i}
                    OR LOWER(COALESCE(o.razorpay_payment_id, '')) LIKE $${i}
                    OR LOWER(COALESCE(o.razorpay_order_id, '')) LIKE $${i}
                    OR CAST(o.id AS TEXT) LIKE $${i}
                )`;
            }
            params.push(limit);
            sql += ` ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC LIMIT $${params.length}`;
            const rows = await query(sql, params);

            const holdRows = await query(
                `SELECT h.metal_key, h.balance_grams,
                        COALESCE(u.name, '') AS customer_name,
                        u.mobile_number AS customer_mobile,
                        u.id AS customer_user_id, h.updated_at
                 FROM reseller_digi_holdings h
                 JOIN users u ON u.id = h.customer_user_id
                 WHERE h.reseller_user_id = $1 AND h.balance_grams > 0
                 ORDER BY h.updated_at DESC`,
                [req.user.id],
            );

            res.json({ transactions: rows, holdings: holdRows });
        } catch (e) {
            console.error('erp digi transactions:', e);
            res.status(500).json({ error: e.message || 'Failed to load transactions' });
        }
    });

    // ——— Chit schemes (DigiGold / DigiSilver tab) ———
    app.get('/api/reseller/erp/digi/chit-schemes', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const productLine = String(req.query.product_line || req.query.metal || 'gold').trim().toLowerCase();
            await assertDigiProductEnabled(query, req.user.id, productLine === 'silver' ? 'silver' : 'gold');
            const rows = await query(
                `SELECT s.*,
                    (SELECT COUNT(*)::int FROM reseller_chit_members m WHERE m.scheme_id = s.id AND m.status = 'active') AS member_count,
                    (SELECT COALESCE(SUM(t.amount_inr), 0) FROM reseller_chit_transactions t WHERE t.scheme_id = s.id) AS total_collected_inr
                 FROM reseller_chit_schemes s
                 WHERE s.reseller_user_id = $1 AND s.product_line = $2
                 ORDER BY s.is_active DESC, s.updated_at DESC`,
                [req.user.id, productLine === 'silver' ? 'silver' : 'gold'],
            );
            res.json({ schemes: rows });
        } catch (e) {
            console.error('chit schemes list:', e);
            res.status(e.status || 500).json({ error: e.message || 'Failed to load schemes' });
        }
    });

    app.post('/api/reseller/erp/digi/chit-schemes', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const productLine = String(req.body.product_line || 'gold').trim().toLowerCase();
            await assertDigiProductEnabled(query, req.user.id, productLine === 'silver' ? 'silver' : 'gold');
            const name = String(req.body.name || '').trim();
            if (!name) return res.status(400).json({ error: 'Scheme name required' });
            const rows = await query(
                `INSERT INTO reseller_chit_schemes (
                    reseller_user_id, product_line, name, scheme_type, description,
                    monthly_amount_inr, duration_months, metal_key, bonus_pct, is_active
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
                [
                    req.user.id,
                    productLine === 'silver' ? 'silver' : 'gold',
                    name.slice(0, 255),
                    String(req.body.scheme_type || 'monthly_chit').trim().slice(0, 32),
                    req.body.description ? String(req.body.description).trim().slice(0, 2000) : null,
                    req.body.monthly_amount_inr != null ? safeNum(req.body.monthly_amount_inr) : null,
                    req.body.duration_months != null ? parseInt(String(req.body.duration_months), 10) || null : null,
                    req.body.metal_key ? String(req.body.metal_key).trim().slice(0, 24) : null,
                    safeNum(req.body.bonus_pct),
                    req.body.is_active !== false,
                ],
            );
            res.json({ scheme: rows[0] });
        } catch (e) {
            console.error('chit scheme create:', e);
            res.status(500).json({ error: e.message || 'Failed to create scheme' });
        }
    });

    app.put('/api/reseller/erp/digi/chit-schemes/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const existing = await query(
                `SELECT * FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Scheme not found' });
            await assertDigiProductEnabled(
                query,
                req.user.id,
                existing[0].product_line === 'silver' ? 'silver' : 'gold',
            );
            const name = req.body.name != null ? String(req.body.name).trim().slice(0, 255) : existing[0].name;
            const rows = await query(
                `UPDATE reseller_chit_schemes SET
                    name = $1, scheme_type = $2, description = $3,
                    monthly_amount_inr = $4, duration_months = $5, metal_key = $6,
                    bonus_pct = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $9 AND reseller_user_id = $10 RETURNING *`,
                [
                    name,
                    req.body.scheme_type != null
                        ? String(req.body.scheme_type).trim().slice(0, 32)
                        : existing[0].scheme_type,
                    req.body.description != null
                        ? String(req.body.description).trim().slice(0, 2000)
                        : existing[0].description,
                    req.body.monthly_amount_inr != null
                        ? safeNum(req.body.monthly_amount_inr)
                        : existing[0].monthly_amount_inr,
                    req.body.duration_months != null
                        ? parseInt(String(req.body.duration_months), 10) || null
                        : existing[0].duration_months,
                    req.body.metal_key != null
                        ? String(req.body.metal_key).trim().slice(0, 24)
                        : existing[0].metal_key,
                    req.body.bonus_pct != null ? safeNum(req.body.bonus_pct) : existing[0].bonus_pct,
                    req.body.is_active != null ? !!req.body.is_active : existing[0].is_active,
                    id,
                    req.user.id,
                ],
            );
            res.json({ scheme: rows[0] });
        } catch (e) {
            console.error('chit scheme update:', e);
            res.status(500).json({ error: e.message || 'Failed to update scheme' });
        }
    });

    app.delete('/api/reseller/erp/digi/chit-schemes/:id', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const existing = await query(
                `SELECT product_line FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Scheme not found' });
            await assertDigiProductEnabled(
                query,
                req.user.id,
                existing[0].product_line === 'silver' ? 'silver' : 'gold',
            );
            await query(`DELETE FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`, [
                id,
                req.user.id,
            ]);
            res.json({ ok: true });
        } catch (e) {
            console.error('chit scheme delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete scheme' });
        }
    });

    app.get('/api/reseller/erp/digi/chit-schemes/:id/members', checkAuth, erpGate, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const scheme = await query(
                `SELECT * FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!scheme.length) return res.status(404).json({ error: 'Scheme not found' });
            const rows = await query(
                `SELECT m.*,
                    (SELECT COALESCE(SUM(t.amount_inr), 0) FROM reseller_chit_transactions t WHERE t.member_id = m.id) AS paid_inr,
                    (SELECT COALESCE(SUM(t.grams), 0) FROM reseller_chit_transactions t WHERE t.member_id = m.id) AS grams_total
                 FROM reseller_chit_members m
                 WHERE m.scheme_id = $1 AND m.reseller_user_id = $2
                 ORDER BY m.updated_at DESC`,
                [id, req.user.id],
            );
            res.json({ members: rows, scheme: scheme[0] });
        } catch (e) {
            console.error('chit members list:', e);
            res.status(500).json({ error: e.message || 'Failed to load members' });
        }
    });

    app.post('/api/reseller/erp/digi/chit-schemes/:id/members', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const scheme = await query(
                `SELECT * FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!scheme.length) return res.status(404).json({ error: 'Scheme not found' });
            const name = String(req.body.customer_name || '').trim();
            if (!name) return res.status(400).json({ error: 'Customer name required' });
            const mobile = String(req.body.customer_mobile || '').replace(/\D/g, '').slice(-10) || null;
            let customerUserId = null;
            if (mobile) {
                customerUserId = await findOrCreateDigiCustomer(query, { name, mobile });
            }
            const rows = await query(
                `INSERT INTO reseller_chit_members (
                    scheme_id, reseller_user_id, customer_name, customer_mobile, customer_user_id,
                    status, target_amount_inr, notes
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [
                    id,
                    req.user.id,
                    name.slice(0, 255),
                    mobile,
                    customerUserId,
                    String(req.body.status || 'active').slice(0, 20),
                    req.body.target_amount_inr != null ? safeNum(req.body.target_amount_inr) : null,
                    req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
                ],
            );
            res.json({ member: rows[0] });
        } catch (e) {
            console.error('chit member create:', e);
            res.status(500).json({ error: e.message || 'Failed to add member' });
        }
    });

    app.post('/api/reseller/erp/digi/chit-transactions', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const schemeId = parseInt(String(req.body.scheme_id), 10);
            const memberId = parseInt(String(req.body.member_id), 10);
            const scheme = await query(
                `SELECT * FROM reseller_chit_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [schemeId, req.user.id],
            );
            if (!scheme.length) return res.status(404).json({ error: 'Scheme not found' });
            const member = await query(
                `SELECT * FROM reseller_chit_members WHERE id = $1 AND scheme_id = $2 AND reseller_user_id = $3`,
                [memberId, schemeId, req.user.id],
            );
            if (!member.length) return res.status(404).json({ error: 'Member not found' });
            const amountInr = safeNum(req.body.amount_inr);
            const grams = safeNum(req.body.grams);
            if (amountInr <= 0 && grams <= 0) {
                return res.status(400).json({ error: 'Enter amount or grams' });
            }
            const metalKey = req.body.metal_key
                ? String(req.body.metal_key).trim()
                : scheme[0].metal_key || (scheme[0].product_line === 'silver' ? 'silver' : 'gold_22k');
            const rate = safeNum(req.body.rate_per_gram);
            let finalGrams = grams;
            if (finalGrams <= 0 && amountInr > 0 && rate > 0) {
                finalGrams = gramsFromAmount(amountInr, rate);
            }
            const rows = await query(
                `INSERT INTO reseller_chit_transactions (
                    scheme_id, member_id, reseller_user_id, txn_type, amount_inr, grams, metal_key,
                    rate_per_gram, payment_mode, reference_no, notes, txn_date, created_by_user_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::date, CURRENT_DATE), $13)
                 RETURNING *`,
                [
                    schemeId,
                    memberId,
                    req.user.id,
                    String(req.body.txn_type || 'payment').slice(0, 20),
                    amountInr,
                    finalGrams,
                    metalKey,
                    rate || null,
                    String(req.body.payment_mode || 'cash').slice(0, 24),
                    req.body.reference_no ? String(req.body.reference_no).trim().slice(0, 128) : null,
                    req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
                    req.body.txn_date || null,
                    req.user.id,
                ],
            );
            if (finalGrams > 0 && member[0].customer_user_id && isValidMetalKey(metalKey)) {
                await creditDigiHolding(query, {
                    resellerUserId: req.user.id,
                    customerUserId: member[0].customer_user_id,
                    metalKey,
                    grams: finalGrams,
                });
            }
            res.json({ transaction: rows[0] });
        } catch (e) {
            console.error('chit transaction create:', e);
            res.status(500).json({ error: e.message || 'Failed to record transaction' });
        }
    });

    app.post('/api/reseller/erp/digi/manual-transaction', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const metalKey = String(req.body.metal_key || '').trim();
            if (!isValidMetalKey(metalKey)) {
                return res.status(400).json({ error: 'Valid metal_key required' });
            }
            const productLine = metalKey === 'silver' ? 'silver' : 'gold';
            await assertDigiProductEnabled(query, req.user.id, productLine);
            const name = String(req.body.customer_name || '').trim();
            const mobile = String(req.body.customer_mobile || '').replace(/\D/g, '').slice(-10);
            if (!name) return res.status(400).json({ error: 'Customer name required' });
            const amountInr = safeNum(req.body.amount_inr);
            if (amountInr <= 0) return res.status(400).json({ error: 'Amount must be positive' });
            const stored = await getStoredRates(req.user.id);
            if (!stored) return res.status(400).json({ error: 'Save today rates first' });
            const retail = safeNum(stored[RETAIL_RATE_COL[metalKey]]);
            const discount = safeNum(stored[DISCOUNT_COL[metalKey]]);
            const effective = effectiveRatePerGram(retail, discount);
            const grams = gramsFromAmount(amountInr, effective);
            const customerUserId = await findOrCreateDigiCustomer(query, { name, mobile });
            const orderRows = await query(
                `INSERT INTO reseller_digi_orders (
                    reseller_user_id, customer_user_id, metal_key, amount_inr, retail_rate_per_gram,
                    discount_inr, effective_rate_per_gram, grams, status, paid_at, source,
                    payment_mode, reference_no, notes, customer_name_manual, customer_mobile_manual
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', CURRENT_TIMESTAMP, 'manual',
                    $9, $10, $11, $12, $13)
                 RETURNING *`,
                [
                    req.user.id,
                    customerUserId,
                    metalKey,
                    amountInr,
                    retail,
                    discount,
                    effective,
                    grams,
                    String(req.body.payment_mode || 'cash').slice(0, 24),
                    req.body.reference_no ? String(req.body.reference_no).trim().slice(0, 128) : null,
                    req.body.notes ? String(req.body.notes).trim().slice(0, 2000) : null,
                    name.slice(0, 255),
                    mobile || null,
                ],
            );
            await creditDigiHolding(query, {
                resellerUserId: req.user.id,
                customerUserId,
                metalKey,
                grams,
            });
            res.json({ order: orderRows[0], grams });
        } catch (e) {
            console.error('digi manual transaction:', e);
            res.status(500).json({ error: e.message || 'Failed to record transaction' });
        }
    });

    // ——— Public storefront ———
    app.get('/api/public/digi/config', globalLimiter, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            await ensureResellerSmsColumns(pool);
            const domain = normalizeDomain(req.query.domain || req.query.host || '');
            const code = req.query.code || req.query.invite || '';
            const metal = String(req.query.metal || 'silver').trim().toLowerCase();
            if (metal !== 'gold' && metal !== 'silver') {
                return res.status(400).json({ error: 'metal must be gold or silver' });
            }
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) {
                return res.status(404).json({ error: 'Store not found. Open this link from your jeweller.' });
            }
            const otpMeta = await getSharedCatalogOtpForCreator(
                query,
                reseller.id,
                getSharedCatalogOtpEnabled,
            );
            const config = await buildPublicDigiConfig(query, reseller, metal);
            if (!config.ok) return res.status(503).json({ error: config.error });
            res.json({
                ...config,
                otp_enabled: otpMeta.otpEnabled,
                otp_configured: otpMeta.otpConfigured !== false,
            });
        } catch (e) {
            console.error('public digi config:', e);
            res.status(500).json({ error: e.message || 'Failed to load digi config' });
        }
    });

    app.post('/api/public/digi/send-otp', authLimiter, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            await ensureResellerSmsColumns(pool);
            const domain = normalizeDomain(req.body.domain || req.body.host || '');
            const code = req.body.code || req.body.invite || '';
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) return res.status(404).json({ error: 'Store not found' });

            const countryCode = req.body.country_code ?? req.body.countryCode ?? '91';
            const rawMobile = String(req.body.mobile_number || '').trim();
            const parsed = parseInternationalMobileInput(countryCode, rawMobile);
            if (!parsed.ok) return res.status(400).json({ error: parsed.error });
            if (!parsed.isIndian) {
                return res.status(400).json({
                    error: 'SMS OTP is for Indian (+91) numbers. International numbers can continue without SMS.',
                });
            }
            const mobile_number = parsed.stored;
            const otpMeta = await getSharedCatalogOtpForCreator(
                query,
                reseller.id,
                getSharedCatalogOtpEnabled,
            );
            if (!otpMeta.otpEnabled) {
                return res.status(403).json({ error: 'OTP is not enabled for this store.' });
            }
            const smsConfig = await getResellerSmsConfigForSend(query, reseller.id);
            if (!smsConfig) {
                return res.status(503).json({ error: 'SMS is not configured yet. Use mobile-only sign-in.' });
            }
            const result = await createAndSendOtp(mobile_number, smsConfig);
            res.json(result);
        } catch (e) {
            console.error('public digi send-otp:', e);
            res.status(500).json({ error: e.message || 'Failed to send OTP' });
        }
    });

    app.post('/api/public/digi/create-order', checkAuth, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const domain = normalizeDomain(req.body.domain || req.body.host || '');
            const code = req.body.code || req.body.invite || '';
            const metalKey = String(req.body.metal_key || '').trim();
            const amountInr = safeNum(req.body.amount_inr);
            if (!isValidMetalKey(metalKey)) {
                return res.status(400).json({ error: 'Invalid metal selection' });
            }
            if (amountInr < 100) {
                return res.status(400).json({ error: 'Minimum purchase is ₹100' });
            }
            if (amountInr > 5_000_000) {
                return res.status(400).json({ error: 'Amount too large' });
            }
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) return res.status(404).json({ error: 'Store not found' });

            const paymentRow = await loadResellerPaymentRow(query, reseller.id);
            const keyId = String(paymentRow?.reseller_razorpay_key_id || '').trim();
            const keySecret = String(paymentRow?.reseller_razorpay_key_secret || '').trim();
            if (!keyId || !keySecret) {
                return res.status(503).json({ error: 'Online payments are not configured for this store yet.' });
            }

            const stored = await getStoredRates(reseller.id);
            if (!stored) return res.status(503).json({ error: 'Rates not configured' });
            const retail = safeNum(stored[RETAIL_RATE_COL[metalKey]]);
            const discount = safeNum(stored[DISCOUNT_COL[metalKey]]);
            const effective = effectiveRatePerGram(retail, discount);
            if (retail <= 0) return res.status(503).json({ error: 'Rate not available for this metal' });

            const grams = gramsFromAmount(amountInr, effective);
            if (grams <= 0) return res.status(400).json({ error: 'Amount too small for current rate' });

            const orderRows = await query(
                `INSERT INTO reseller_digi_orders (
                    reseller_user_id, customer_user_id, metal_key, amount_inr,
                    retail_rate_per_gram, discount_inr, effective_rate_per_gram, grams, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
                 RETURNING *`,
                [reseller.id, req.user.id, metalKey, amountInr, retail, discount, effective, grams],
            );
            const digiOrder = orderRows[0];
            const razorpayOrderId = await createRazorpayOrder(keyId, keySecret, amountInr, {
                digi_order_id: String(digiOrder.id),
                metal_key: metalKey,
                reseller_id: String(reseller.id),
            });
            await query(
                `UPDATE reseller_digi_orders SET razorpay_order_id = $2 WHERE id = $1`,
                [digiOrder.id, razorpayOrderId],
            );
            res.json({
                digi_order_id: digiOrder.id,
                razorpay_order_id: razorpayOrderId,
                razorpay_key_id: keyId,
                amount_inr: amountInr,
                grams,
                effective_rate_per_gram: effective,
                metal_key: metalKey,
            });
        } catch (e) {
            console.error('public digi create-order:', e);
            res.status(500).json({ error: e.message || 'Failed to create order' });
        }
    });

    app.post('/api/public/digi/verify-payment', checkAuth, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const digiOrderId = parseInt(String(req.body.digi_order_id), 10);
            const orderId = String(req.body.razorpay_order_id || '').trim();
            const paymentId = String(req.body.razorpay_payment_id || '').trim();
            const signature = String(req.body.razorpay_signature || '').trim();
            if (!Number.isFinite(digiOrderId) || !orderId || !paymentId || !signature) {
                return res.status(400).json({ error: 'Missing payment verification fields' });
            }

            const rows = await query(
                `SELECT * FROM reseller_digi_orders WHERE id = $1 AND customer_user_id = $2 LIMIT 1`,
                [digiOrderId, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Order not found' });
            const order = rows[0];
            if (order.status === 'paid') {
                const holdings = await getCustomerHoldings(query, order.reseller_user_id, req.user.id);
                return res.json({ ok: true, already_paid: true, grams: safeNum(order.grams), holdings });
            }
            if (order.razorpay_order_id !== orderId) {
                return res.status(400).json({ error: 'Order mismatch' });
            }

            const paymentRow = await loadResellerPaymentRow(query, order.reseller_user_id);
            const keySecret = String(paymentRow?.reseller_razorpay_key_secret || '').trim();
            if (!keySecret || !verifyRazorpaySignature(orderId, paymentId, signature, keySecret)) {
                return res.status(400).json({ error: 'Invalid payment signature' });
            }

            await query(
                `UPDATE reseller_digi_orders SET
                    status = 'paid',
                    razorpay_payment_id = $2,
                    paid_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status = 'pending'`,
                [order.id, paymentId],
            );
            await creditDigiHolding(query, {
                resellerUserId: order.reseller_user_id,
                customerUserId: req.user.id,
                metalKey: order.metal_key,
                grams: order.grams,
            });
            const holdings = await getCustomerHoldings(query, order.reseller_user_id, req.user.id);
            res.json({
                ok: true,
                grams: safeNum(order.grams),
                metal_key: order.metal_key,
                amount_inr: safeNum(order.amount_inr),
                holdings,
            });
        } catch (e) {
            console.error('public digi verify-payment:', e);
            res.status(500).json({ error: e.message || 'Payment verification failed' });
        }
    });

    app.get('/api/public/digi/wallet', checkAuth, globalLimiter, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const domain = normalizeDomain(req.query.domain || req.query.host || '');
            const code = req.query.code || req.query.invite || '';
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) return res.status(404).json({ error: 'Store not found' });
            const holdings = await getCustomerHoldings(query, reseller.id, req.user.id);
            const txRows = await query(
                `SELECT id, metal_key, amount_inr, grams, effective_rate_per_gram, paid_at, created_at
                 FROM reseller_digi_orders
                 WHERE reseller_user_id = $1 AND customer_user_id = $2 AND status = 'paid'
                 ORDER BY paid_at DESC NULLS LAST LIMIT 20`,
                [reseller.id, req.user.id],
            );
            res.json({ holdings, transactions: txRows });
        } catch (e) {
            console.error('public digi wallet:', e);
            res.status(500).json({ error: e.message || 'Failed to load wallet' });
        }
    });
}

module.exports = {
    registerResellerDigiRoutes,
    ensureDigiSchema,
    effectiveRatePerGram,
    gramsFromAmount,
    METAL_KEYS,
};

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

async function digiFlagsForUser(query, userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) {
        return { gold: false, silver: false, enabled: false, tier: '' };
    }
    const rows = await query(
        `SELECT COALESCE(reseller_digigold_enabled, false) AS gold,
                COALESCE(reseller_digisilver_enabled, false) AS silver,
                UPPER(TRIM(COALESCE(customer_tier::text, ''))) AS tier
         FROM users WHERE id = $1`,
        [uid],
    );
    if (!rows.length) return { gold: false, silver: false, enabled: false, tier: '' };
    const enabled = !!rows[0].gold || !!rows[0].silver;
    return { gold: enabled, silver: enabled, enabled, tier: rows[0].tier };
}

function requireResellerDigi(query, productType) {
    return async (req, res, next) => {
        try {
            const flags = await digiFlagsForUser(query, req.user.id);
            if (flags.tier !== 'RESELLER') {
                return res.status(403).json({ error: 'DigiGold / DigiSilver is for RESELLER accounts only.' });
            }
            const metal = String(productType || req.query.metal || req.body?.metal || req.body?.product_type || '')
                .trim()
                .toLowerCase();
            if (metal === 'gold' && !flags.gold) {
                return res.status(403).json({ error: 'DigiGold is not enabled for your account. Ask KC admin.' });
            }
            if (metal === 'silver' && !flags.silver) {
                return res.status(403).json({ error: 'DigiSilver is not enabled for your account. Ask KC admin.' });
            }
            if (!flags.enabled) {
                return res.status(403).json({ error: 'DigiGold / DigiSilver is not enabled for your account. Ask KC admin.' });
            }
            if (metal && metal !== 'gold' && metal !== 'silver' && metal !== 'all') {
                return res.status(400).json({ error: 'metal must be gold or silver' });
            }
            req.resellerDigiFlags = flags;
            next();
        } catch (e) {
            res.status(500).json({ error: e.message || 'Digi access check failed' });
        }
    };
}

async function findOrCreateDigiCustomer(query, { name, mobile }) {
    const digits = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) return null;
    const existing = await query(`SELECT id, name FROM users WHERE mobile_number = $1 LIMIT 1`, [digits]);
    if (existing.length) {
        const nm = String(name || '').trim();
        if (nm && nm !== existing[0].name) {
            await query(`UPDATE users SET name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
                existing[0].id,
                nm,
            ]);
        }
        return existing[0].id;
    }
    const email = `digi.${digits}.${Date.now()}@customers.kc.local`;
    const inserted = await query(
        `INSERT INTO users (email, name, mobile_number, customer_tier, account_status, role)
         VALUES ($1, $2, $3, 'B2C_CUSTOMER', 'approved', 'user')
         RETURNING id`,
        [email, String(name || '').trim() || `Customer ${digits}`, digits],
    );
    return inserted[0]?.id || null;
}

async function debitDigiHolding(query, { resellerUserId, customerUserId, metalKey, grams }) {
    const g = safeNum(grams);
    if (g <= 0) return;
    await query(
        `UPDATE reseller_digi_holdings SET
            balance_grams = GREATEST(0, balance_grams - $4),
            updated_at = CURRENT_TIMESTAMP
         WHERE reseller_user_id = $1 AND customer_user_id = $2 AND metal_key = $3`,
        [resellerUserId, customerUserId, metalKey, g],
    );
}

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
        ADD COLUMN IF NOT EXISTS reseller_razorpay_key_secret TEXT,
        ADD COLUMN IF NOT EXISTS reseller_digigold_enabled BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS reseller_digisilver_enabled BOOLEAN NOT NULL DEFAULT false
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
            source VARCHAR(20) NOT NULL DEFAULT 'razorpay',
            scheme_id INTEGER,
            payment_mode VARCHAR(32),
            reference_no VARCHAR(128),
            notes TEXT,
            recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_schemes (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_type VARCHAR(16) NOT NULL CHECK (product_type IN ('gold', 'silver')),
            scheme_name VARCHAR(255) NOT NULL,
            description TEXT,
            installment_inr NUMERIC(12, 2),
            duration_months INTEGER,
            bonus_months INTEGER NOT NULL DEFAULT 0,
            bonus_description TEXT,
            metal_key VARCHAR(24),
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        ALTER TABLE reseller_digi_orders
            ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'razorpay',
            ADD COLUMN IF NOT EXISTS scheme_id INTEGER,
            ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(32),
            ADD COLUMN IF NOT EXISTS reference_no VARCHAR(128),
            ADD COLUMN IF NOT EXISTS notes TEXT,
            ADD COLUMN IF NOT EXISTS recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS enrollment_id INTEGER
    `);
    await pool.query(`
        ALTER TABLE reseller_digi_schemes
            ADD COLUMN IF NOT EXISTS terms_and_conditions TEXT
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_settings (
            reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            standard_discount_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 4,
            standard_making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
            exception_making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 50,
            exception_weight_under_grams NUMERIC(12, 3) NOT NULL DEFAULT 25,
            raw_metal_wastage_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
            shipping_charge_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
            support_whatsapp VARCHAR(32),
            terms_and_conditions TEXT,
            gst_note VARCHAR(120) NOT NULL DEFAULT '+ 3% GST applicable',
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_enrollments (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scheme_id INTEGER NOT NULL REFERENCES reseller_digi_schemes(id) ON DELETE RESTRICT,
            metal_key VARCHAR(24) NOT NULL,
            installment_inr NUMERIC(12, 2) NOT NULL,
            duration_months INTEGER NOT NULL,
            bonus_months INTEGER NOT NULL DEFAULT 0,
            months_paid INTEGER NOT NULL DEFAULT 0,
            bonus_grams NUMERIC(14, 6) NOT NULL DEFAULT 0,
            bonus_credited BOOLEAN NOT NULL DEFAULT false,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_paid_at TIMESTAMP,
            matured_at TIMESTAMP,
            closed_at TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_digi_enroll_active
            ON reseller_digi_enrollments (reseller_user_id, customer_user_id, scheme_id)
            WHERE status = 'active'
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_digi_enroll_reseller
            ON reseller_digi_enrollments (reseller_user_id, status, last_paid_at DESC)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_digi_redemptions (
            id SERIAL PRIMARY KEY,
            reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metal_key VARCHAR(24) NOT NULL,
            grams NUMERIC(14, 6) NOT NULL,
            item_kind VARCHAR(32) NOT NULL,
            making_charge_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
            discount_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 0,
            wastage_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
            shipping_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
            doorstep BOOLEAN NOT NULL DEFAULT false,
            retail_rate_per_gram NUMERIC(12, 2) NOT NULL DEFAULT 0,
            notes TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'requested',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_digi_redeem_reseller
            ON reseller_digi_redemptions (reseller_user_id, status, created_at DESC)
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
                reseller_razorpay_key_id, reseller_razorpay_key_secret, mobile_number, name
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
    const settings = await getOrCreateDigiSettings(query, reseller.id);
    const allTiers = stored ? await getDigiRateBundle(stored, null) : [];
    const filter = metal === 'gold' || metal === 'silver' ? metal : null;
    const tiers = stored ? await getDigiRateBundle(stored, filter) : [];
    if (!tiers?.length || !stored) {
        return { ok: false, error: 'Rates not configured yet. Please ask the jeweller to update today rates.' };
    }
    const hasRates =
        tiers.some((t) => t.retail_rate_per_gram > 0) || allTiers.some((t) => t.retail_rate_per_gram > 0);
    if (!hasRates) {
        return { ok: false, error: 'Today rates are not set yet.' };
    }
    const schemeFilter = metal === 'gold' || metal === 'silver' ? metal : null;
    const schemeParams = [reseller.id];
    let schemeSql = `SELECT id, product_type, scheme_name, description, installment_inr, duration_months,
                            bonus_months, bonus_description, metal_key, terms_and_conditions, is_active, sort_order
                     FROM reseller_digi_schemes
                     WHERE reseller_user_id = $1 AND is_active = true`;
    if (schemeFilter) {
        schemeParams.push(schemeFilter);
        schemeSql += ` AND product_type = $2`;
    }
    schemeSql += ` ORDER BY sort_order ASC, scheme_name ASC`;
    const schemes = await query(schemeSql, schemeParams);
    const supportWhatsapp =
        String(settings.support_whatsapp || '').replace(/\D/g, '').slice(-10) ||
        String(paymentRow?.mobile_number || '').replace(/\D/g, '').slice(-10) ||
        null;
    return {
        ok: true,
        business_name: reseller.business_name || 'Jeweller',
        metal,
        tiers,
        all_tiers: allTiers,
        payments_configured: payment.payments_configured,
        razorpay_key_id: payment.razorpay_key_id_set ? payment.razorpay_key_id : null,
        updated_at: stored.updated_at || null,
        support_whatsapp: supportWhatsapp,
        gst_note: settings.gst_note,
        settings: publicDigiSettings(settings),
        schemes,
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

async function saveDigiRules(query, userId, body) {
    const uid = parseInt(String(userId), 10);
    const current = await getOrCreateDigiSettings(query, uid);
    const next = {
        standard_discount_per_gram:
            body.standard_discount_per_gram != null
                ? Math.max(0, safeNum(body.standard_discount_per_gram))
                : current.standard_discount_per_gram,
        standard_making_charge_pct:
            body.standard_making_charge_pct != null
                ? Math.max(0, Math.min(100, safeNum(body.standard_making_charge_pct)))
                : current.standard_making_charge_pct,
        exception_making_charge_pct:
            body.exception_making_charge_pct != null
                ? Math.max(0, Math.min(100, safeNum(body.exception_making_charge_pct)))
                : current.exception_making_charge_pct,
        exception_weight_under_grams:
            body.exception_weight_under_grams != null
                ? Math.max(0, safeNum(body.exception_weight_under_grams))
                : current.exception_weight_under_grams,
        raw_metal_wastage_pct:
            body.raw_metal_wastage_pct != null
                ? Math.max(0, Math.min(100, safeNum(body.raw_metal_wastage_pct)))
                : current.raw_metal_wastage_pct,
        shipping_charge_inr:
            body.shipping_charge_inr != null ? Math.max(0, safeNum(body.shipping_charge_inr)) : current.shipping_charge_inr,
        support_whatsapp:
            body.support_whatsapp != null
                ? String(body.support_whatsapp || '').replace(/\D/g, '').slice(-10) || null
                : current.support_whatsapp,
        terms_and_conditions:
            body.terms_and_conditions != null
                ? String(body.terms_and_conditions || '').trim() || null
                : current.terms_and_conditions,
        gst_note:
            body.gst_note != null
                ? String(body.gst_note || '').trim().slice(0, 120) || DEFAULT_DIGI_SETTINGS.gst_note
                : current.gst_note,
    };
    await query(
        `INSERT INTO reseller_digi_settings (
            reseller_user_id, standard_discount_per_gram, standard_making_charge_pct,
            exception_making_charge_pct, exception_weight_under_grams, raw_metal_wastage_pct,
            shipping_charge_inr, support_whatsapp, terms_and_conditions, gst_note, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
         ON CONFLICT (reseller_user_id) DO UPDATE SET
            standard_discount_per_gram = EXCLUDED.standard_discount_per_gram,
            standard_making_charge_pct = EXCLUDED.standard_making_charge_pct,
            exception_making_charge_pct = EXCLUDED.exception_making_charge_pct,
            exception_weight_under_grams = EXCLUDED.exception_weight_under_grams,
            raw_metal_wastage_pct = EXCLUDED.raw_metal_wastage_pct,
            shipping_charge_inr = EXCLUDED.shipping_charge_inr,
            support_whatsapp = EXCLUDED.support_whatsapp,
            terms_and_conditions = EXCLUDED.terms_and_conditions,
            gst_note = EXCLUDED.gst_note,
            updated_at = CURRENT_TIMESTAMP`,
        [
            uid,
            next.standard_discount_per_gram,
            next.standard_making_charge_pct,
            next.exception_making_charge_pct,
            next.exception_weight_under_grams,
            next.raw_metal_wastage_pct,
            next.shipping_charge_inr,
            next.support_whatsapp,
            next.terms_and_conditions,
            next.gst_note,
        ],
    );
    return { ok: true, rules: next };
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

const DEFAULT_DIGI_SETTINGS = {
    standard_discount_per_gram: 4,
    standard_making_charge_pct: 0,
    exception_making_charge_pct: 50,
    exception_weight_under_grams: 25,
    raw_metal_wastage_pct: 0,
    shipping_charge_inr: 0,
    support_whatsapp: null,
    terms_and_conditions: null,
    gst_note: '+ 3% GST applicable',
};

const REDEEM_KINDS = ['jewellery_standard', 'antique', 'purity_925', 'under_25g', 'raw_bar', 'coin'];

function publicDigiSettings(row) {
    if (!row) return { ...DEFAULT_DIGI_SETTINGS };
    return {
        standard_discount_per_gram: safeNum(row.standard_discount_per_gram),
        standard_making_charge_pct: safeNum(row.standard_making_charge_pct),
        exception_making_charge_pct: safeNum(row.exception_making_charge_pct),
        exception_weight_under_grams: safeNum(row.exception_weight_under_grams) || 25,
        raw_metal_wastage_pct: safeNum(row.raw_metal_wastage_pct),
        shipping_charge_inr: safeNum(row.shipping_charge_inr),
        support_whatsapp: row.support_whatsapp || null,
        terms_and_conditions: row.terms_and_conditions || null,
        gst_note: String(row.gst_note || DEFAULT_DIGI_SETTINGS.gst_note),
    };
}

async function getOrCreateDigiSettings(query, resellerUserId) {
    const uid = parseInt(String(resellerUserId), 10);
    const rows = await query(`SELECT * FROM reseller_digi_settings WHERE reseller_user_id = $1`, [uid]);
    if (rows.length) return publicDigiSettings(rows[0]);
    await query(
        `INSERT INTO reseller_digi_settings (reseller_user_id) VALUES ($1)
         ON CONFLICT (reseller_user_id) DO NOTHING`,
        [uid],
    );
    const again = await query(`SELECT * FROM reseller_digi_settings WHERE reseller_user_id = $1`, [uid]);
    return publicDigiSettings(again[0] || null);
}

function computeRedemptionQuote({ grams, itemKind, doorstep, settings, retailRate }) {
    const g = Math.max(0, safeNum(grams));
    const retail = Math.max(0, safeNum(retailRate));
    const kind = REDEEM_KINDS.includes(itemKind) ? itemKind : 'jewellery_standard';
    const underG = Math.max(0, safeNum(settings.exception_weight_under_grams) || 25);
    let effectiveKind = kind;
    if (kind === 'jewellery_standard' && g > 0 && g < underG) {
        effectiveKind = 'under_25g';
    }
    let makingPct = safeNum(settings.standard_making_charge_pct);
    let discountPerG = Math.max(0, safeNum(settings.standard_discount_per_gram));
    let wastagePct = 0;
    if (effectiveKind === 'antique' || effectiveKind === 'purity_925' || effectiveKind === 'under_25g') {
        makingPct = safeNum(settings.exception_making_charge_pct);
    }
    if (effectiveKind === 'raw_bar' || effectiveKind === 'coin') {
        makingPct = 0;
        discountPerG = 0;
        wastagePct = Math.max(0, safeNum(settings.raw_metal_wastage_pct));
    }
    const metalValue = Math.round(g * retail * 100) / 100;
    const discount = Math.round(g * discountPerG * 100) / 100;
    const making = Math.round(metalValue * (makingPct / 100) * 100) / 100;
    const wastageAmt = Math.round(metalValue * (wastagePct / 100) * 100) / 100;
    const shipping = doorstep ? Math.max(0, safeNum(settings.shipping_charge_inr)) : 0;
    const netPayable = Math.round((making + wastageAmt + shipping - discount) * 100) / 100;
    return {
        grams: g,
        item_kind: effectiveKind,
        retail_rate_per_gram: retail,
        metal_value_inr: metalValue,
        making_charge_pct: makingPct,
        making_charge_inr: making,
        discount_per_gram: discountPerG,
        discount_inr: discount,
        wastage_pct: wastagePct,
        wastage_inr: wastageAmt,
        shipping_inr: shipping,
        doorstep: !!doorstep,
        net_payable_inr: netPayable,
    };
}

async function applySchemePayment(query, {
    resellerUserId,
    customerUserId,
    schemeId,
    metalKey,
    amountInr,
}) {
    const sid = parseInt(String(schemeId), 10);
    if (!Number.isFinite(sid) || sid <= 0) return null;
    const schemes = await query(
        `SELECT * FROM reseller_digi_schemes WHERE id = $1 AND reseller_user_id = $2`,
        [sid, resellerUserId],
    );
    if (!schemes.length) return null;
    const scheme = schemes[0];
    const metal = metalKey || scheme.metal_key || (scheme.product_type === 'silver' ? 'silver' : 'gold_22k');
    const installment = safeNum(scheme.installment_inr) || safeNum(amountInr);
    const duration = parseInt(String(scheme.duration_months), 10) || 0;
    const bonusMonths = Math.max(0, parseInt(String(scheme.bonus_months), 10) || 0);

    let rows = await query(
        `SELECT * FROM reseller_digi_enrollments
         WHERE reseller_user_id = $1 AND customer_user_id = $2 AND scheme_id = $3 AND status = 'active'
         LIMIT 1`,
        [resellerUserId, customerUserId, sid],
    );
    if (!rows.length) {
        rows = await query(
            `INSERT INTO reseller_digi_enrollments (
                reseller_user_id, customer_user_id, scheme_id, metal_key,
                installment_inr, duration_months, bonus_months, months_paid, status, last_paid_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,'active',CURRENT_TIMESTAMP)
             RETURNING *`,
            [resellerUserId, customerUserId, sid, metal, installment, duration || 1, bonusMonths],
        );
    }
    const enr = rows[0];
    const monthsPaid = Number(enr.months_paid || 0) + 1;
    const dur = Number(enr.duration_months) || duration || 0;
    let status = 'active';
    let bonusGrams = 0;
    let bonusCredited = !!enr.bonus_credited;
    let maturedAt = enr.matured_at;
    if (dur > 0 && monthsPaid >= dur && !bonusCredited) {
        status = 'matured';
        maturedAt = new Date();
        if (bonusMonths > 0 || Number(enr.bonus_months) > 0) {
            const bm = Number(enr.bonus_months) || bonusMonths;
            const stored = await getStoredRates(resellerUserId);
            if (stored) {
                const mk = enr.metal_key || metal;
                const retail = safeNum(stored[RETAIL_RATE_COL[mk]]);
                const discount = safeNum(stored[DISCOUNT_COL[mk]]);
                const effective = effectiveRatePerGram(retail, discount);
                bonusGrams = gramsFromAmount(bm * safeNum(enr.installment_inr), effective);
                if (bonusGrams > 0) {
                    await creditDigiHolding(query, {
                        resellerUserId,
                        customerUserId,
                        metalKey: mk,
                        grams: bonusGrams,
                    });
                    bonusCredited = true;
                }
            }
        }
    }
    const updated = await query(
        `UPDATE reseller_digi_enrollments SET
            months_paid = $2,
            status = $3,
            bonus_grams = bonus_grams + $4,
            bonus_credited = $5,
            last_paid_at = CURRENT_TIMESTAMP,
            matured_at = $6
         WHERE id = $1
         RETURNING *`,
        [enr.id, monthsPaid, status, bonusGrams, bonusCredited, maturedAt],
    );
    return { enrollment: updated[0], bonusGrams, status };
}

function publicEnrollment(row, scheme) {
    if (!row) return null;
    const duration = Number(row.duration_months) || 0;
    const paid = Number(row.months_paid) || 0;
    return {
        id: row.id,
        scheme_id: row.scheme_id,
        scheme_name: scheme?.scheme_name || row.scheme_name || null,
        product_type: scheme?.product_type || row.product_type || null,
        metal_key: row.metal_key,
        installment_inr: safeNum(row.installment_inr),
        duration_months: duration,
        bonus_months: Number(row.bonus_months) || 0,
        months_paid: paid,
        months_remaining: duration > 0 ? Math.max(0, duration - paid) : 0,
        bonus_grams: safeNum(row.bonus_grams),
        bonus_credited: !!row.bonus_credited,
        status: row.status,
        started_at: row.started_at,
        last_paid_at: row.last_paid_at,
        matured_at: row.matured_at,
        closed_at: row.closed_at,
    };
}

function registerResellerDigiRoutes(app, deps) {
    const { query, pool, checkAuth, requireJson, globalLimiter, authLimiter } = deps;
    const digiGateAny = requireResellerDigi(query);
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

    // ——— Reseller staff: digi discounts, schemes, manual entries ———
    app.get('/api/reseller/digi/settings', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const stored = await getStoredRates(req.user.id);
            const paymentRow = await loadResellerPaymentRow(query, req.user.id);
            const metal = String(req.query.metal || 'gold').trim().toLowerCase();
            const flags = await digiFlagsForUser(query, req.user.id);
            const tiers = stored ? await getDigiRateBundle(stored, metal) : [];
            const rules = await getOrCreateDigiSettings(query, req.user.id);
            const supportWhatsapp =
                String(rules.support_whatsapp || '').replace(/\D/g, '').slice(-10) ||
                String(paymentRow?.mobile_number || '').replace(/\D/g, '').slice(-10) ||
                null;
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
                digigold_enabled: flags.gold,
                digisilver_enabled: flags.silver,
                digi_enabled: flags.enabled,
                rules,
                support_whatsapp: supportWhatsapp,
            });
        } catch (e) {
            console.error('digi settings get:', e);
            res.status(500).json({ error: e.message || 'Failed to load digi settings' });
        }
    });

    app.put('/api/reseller/digi/settings', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const metal = String(req.body.metal || 'gold').trim().toLowerCase();
            const flags = await digiFlagsForUser(query, req.user.id);
            if (metal === 'gold' && !flags.gold) return res.status(403).json({ error: 'DigiGold not enabled' });
            if (metal === 'silver' && !flags.silver) return res.status(403).json({ error: 'DigiSilver not enabled' });
            const result = await saveDigiDiscounts(query, req.user.id, req.body);
            if (!result.ok) return res.status(400).json({ error: result.error });
            if (req.body.rules && typeof req.body.rules === 'object') {
                await saveDigiRules(query, req.user.id, req.body.rules);
            } else if (
                req.body.standard_discount_per_gram != null ||
                req.body.support_whatsapp != null ||
                req.body.terms_and_conditions != null ||
                req.body.shipping_charge_inr != null
            ) {
                await saveDigiRules(query, req.user.id, req.body);
            }
            const stored = await getStoredRates(req.user.id);
            res.json({
                ok: true,
                tiers: stored ? await getDigiRateBundle(stored, metal) : [],
                discounts: result.discounts,
                rules: await getOrCreateDigiSettings(query, req.user.id),
            });
        } catch (e) {
            console.error('digi settings put:', e);
            res.status(500).json({ error: e.message || 'Failed to save digi settings' });
        }
    });

    app.get('/api/reseller/digi/transactions', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
            const q = String(req.query.q || '').trim().toLowerCase();
            const metal = String(req.query.metal || '').trim().toLowerCase();
            const from = String(req.query.from || '').trim().slice(0, 10);
            const to = String(req.query.to || '').trim().slice(0, 10);
            const flags = await digiFlagsForUser(query, req.user.id);
            if (metal === 'gold' && !flags.gold) return res.status(403).json({ error: 'DigiGold not enabled' });
            if (metal === 'silver' && !flags.silver) return res.status(403).json({ error: 'DigiSilver not enabled' });
            const params = [req.user.id];
            let sql = `
                SELECT o.id, o.metal_key, o.amount_inr, o.retail_rate_per_gram, o.discount_inr,
                       o.effective_rate_per_gram, o.grams, o.razorpay_order_id, o.razorpay_payment_id,
                       o.status, o.source, o.payment_mode, o.reference_no, o.notes, o.scheme_id,
                       o.created_at, o.paid_at,
                       u.name AS customer_name, u.mobile_number AS customer_mobile
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
                    OR LOWER(COALESCE(o.reference_no, '')) LIKE $${i}
                    OR CAST(o.id AS TEXT) LIKE $${i}
                )`;
            }
            params.push(limit);
            sql += ` ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC LIMIT $${params.length}`;
            const rows = await query(sql, params);
            const holdRows = await query(
                `SELECT h.metal_key, h.balance_grams, u.name AS customer_name, u.mobile_number AS customer_mobile,
                        u.id AS customer_user_id, h.updated_at
                 FROM reseller_digi_holdings h
                 JOIN users u ON u.id = h.customer_user_id
                 WHERE h.reseller_user_id = $1 AND h.balance_grams > 0
                 ORDER BY h.updated_at DESC`,
                [req.user.id],
            );
            res.json({ transactions: rows, holdings: holdRows });
        } catch (e) {
            console.error('digi transactions:', e);
            res.status(500).json({ error: e.message || 'Failed to load transactions' });
        }
    });

    app.get('/api/reseller/digi/schemes', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const productType = String(req.query.product_type || req.query.metal || '').trim().toLowerCase();
            const params = [req.user.id];
            let sql = `SELECT * FROM reseller_digi_schemes WHERE reseller_user_id = $1`;
            if (productType === 'gold' || productType === 'silver') {
                params.push(productType);
                sql += ` AND product_type = $${params.length}`;
            }
            sql += ` ORDER BY sort_order ASC, scheme_name ASC`;
            const rows = await query(sql, params);
            res.json({ schemes: rows });
        } catch (e) {
            console.error('digi schemes list:', e);
            res.status(500).json({ error: e.message || 'Failed to load schemes' });
        }
    });

    app.post('/api/reseller/digi/schemes', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const productType = String(req.body.product_type || '').trim().toLowerCase();
            if (productType !== 'gold' && productType !== 'silver') {
                return res.status(400).json({ error: 'product_type must be gold or silver' });
            }
            const flags = await digiFlagsForUser(query, req.user.id);
            if (productType === 'gold' && !flags.gold) return res.status(403).json({ error: 'DigiGold not enabled' });
            if (productType === 'silver' && !flags.silver) return res.status(403).json({ error: 'DigiSilver not enabled' });
            const schemeName = String(req.body.scheme_name || req.body.name || '').trim();
            if (!schemeName) return res.status(400).json({ error: 'scheme_name is required' });
            const rows = await query(
                `INSERT INTO reseller_digi_schemes (
                    reseller_user_id, product_type, scheme_name, description,
                    installment_inr, duration_months, bonus_months, bonus_description,
                    metal_key, is_active, sort_order, terms_and_conditions
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING *`,
                [
                    req.user.id,
                    productType,
                    schemeName.slice(0, 255),
                    String(req.body.description || '').trim() || null,
                    req.body.installment_inr != null ? safeNum(req.body.installment_inr) : null,
                    req.body.duration_months != null ? parseInt(String(req.body.duration_months), 10) || null : null,
                    Math.max(0, parseInt(String(req.body.bonus_months ?? 1), 10) || 0),
                    String(req.body.bonus_description || '').trim() || null,
                    req.body.metal_key ? String(req.body.metal_key).trim() : productType === 'silver' ? 'silver' : 'gold_22k',
                    req.body.is_active !== false,
                    parseInt(String(req.body.sort_order || 0), 10) || 0,
                    String(req.body.terms_and_conditions || '').trim() || null,
                ],
            );
            res.status(201).json({ scheme: rows[0] });
        } catch (e) {
            console.error('digi scheme create:', e);
            res.status(500).json({ error: e.message || 'Failed to create scheme' });
        }
    });

    app.put('/api/reseller/digi/schemes/:id', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid scheme id' });
            const existing = await query(
                `SELECT * FROM reseller_digi_schemes WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Scheme not found' });
            const schemeName =
                req.body.scheme_name != null
                    ? String(req.body.scheme_name || req.body.name || '').trim()
                    : existing[0].scheme_name;
            if (!schemeName) return res.status(400).json({ error: 'scheme_name cannot be empty' });
            const rows = await query(
                `UPDATE reseller_digi_schemes SET
                    scheme_name = $3,
                    description = COALESCE($4, description),
                    installment_inr = COALESCE($5, installment_inr),
                    duration_months = COALESCE($6, duration_months),
                    bonus_months = COALESCE($7, bonus_months),
                    bonus_description = COALESCE($8, bonus_description),
                    metal_key = COALESCE($9, metal_key),
                    is_active = COALESCE($10, is_active),
                    sort_order = COALESCE($11, sort_order),
                    terms_and_conditions = COALESCE($12, terms_and_conditions),
                    updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING *`,
                [
                    id,
                    req.user.id,
                    schemeName.slice(0, 255),
                    req.body.description != null ? String(req.body.description || '').trim() || null : null,
                    req.body.installment_inr != null ? safeNum(req.body.installment_inr) : null,
                    req.body.duration_months != null ? parseInt(String(req.body.duration_months), 10) || null : null,
                    req.body.bonus_months != null ? Math.max(0, parseInt(String(req.body.bonus_months), 10) || 0) : null,
                    req.body.bonus_description != null ? String(req.body.bonus_description || '').trim() || null : null,
                    req.body.metal_key != null ? String(req.body.metal_key || '').trim() || null : null,
                    req.body.is_active != null ? !!req.body.is_active : null,
                    req.body.sort_order != null ? parseInt(String(req.body.sort_order), 10) || 0 : null,
                    req.body.terms_and_conditions != null
                        ? String(req.body.terms_and_conditions || '').trim() || null
                        : null,
                ],
            );
            res.json({ scheme: rows[0] });
        } catch (e) {
            console.error('digi scheme update:', e);
            res.status(500).json({ error: e.message || 'Failed to update scheme' });
        }
    });

    app.delete('/api/reseller/digi/schemes/:id', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid scheme id' });
            const rows = await query(
                `DELETE FROM reseller_digi_schemes WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Scheme not found' });
            res.json({ ok: true, deleted_id: id });
        } catch (e) {
            console.error('digi scheme delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete scheme' });
        }
    });

    app.post('/api/reseller/digi/manual-transactions', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const metalKey = String(req.body.metal_key || '').trim();
            if (!isValidMetalKey(metalKey)) return res.status(400).json({ error: 'Invalid metal_key' });
            const productType = metalKey === 'silver' ? 'silver' : 'gold';
            const flags = await digiFlagsForUser(query, req.user.id);
            if (productType === 'gold' && !flags.gold) return res.status(403).json({ error: 'DigiGold not enabled' });
            if (productType === 'silver' && !flags.silver) return res.status(403).json({ error: 'DigiSilver not enabled' });

            const customerName = String(req.body.customer_name || '').trim();
            const customerMobile = String(req.body.customer_mobile || req.body.mobile || '').trim();
            const customerUserId = await findOrCreateDigiCustomer(query, {
                name: customerName,
                mobile: customerMobile,
            });
            if (!customerUserId) return res.status(400).json({ error: 'Valid 10-digit customer mobile is required' });

            const amountInr = safeNum(req.body.amount_inr);
            let grams = safeNum(req.body.grams);
            const stored = await getStoredRates(req.user.id);
            if (!stored) return res.status(400).json({ error: 'Save today rates first' });
            const retail = safeNum(stored[RETAIL_RATE_COL[metalKey]]);
            const discount = safeNum(stored[DISCOUNT_COL[metalKey]]);
            const effective = effectiveRatePerGram(retail, discount);
            if (retail <= 0) return res.status(400).json({ error: 'Rate not available for this metal' });

            if (amountInr > 0 && grams <= 0) {
                grams = gramsFromAmount(amountInr, effective);
            } else if (amountInr <= 0 && grams <= 0) {
                return res.status(400).json({ error: 'amount_inr or grams is required' });
            }
            const finalAmount = amountInr > 0 ? amountInr : Math.round(grams * effective * 100) / 100;
            if (grams <= 0) return res.status(400).json({ error: 'Could not compute grams' });

            const schemeId = req.body.scheme_id ? parseInt(String(req.body.scheme_id), 10) : null;
            const paymentMode = String(req.body.payment_mode || 'cash').trim().slice(0, 32);
            const referenceNo = String(req.body.reference_no || '').trim().slice(0, 128) || null;
            const notes = String(req.body.notes || '').trim() || null;

            const orderRows = await query(
                `INSERT INTO reseller_digi_orders (
                    reseller_user_id, customer_user_id, metal_key, amount_inr,
                    retail_rate_per_gram, discount_inr, effective_rate_per_gram, grams,
                    status, source, scheme_id, payment_mode, reference_no, notes, recorded_by, paid_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'paid','manual',$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)
                 RETURNING *`,
                [
                    req.user.id,
                    customerUserId,
                    metalKey,
                    finalAmount,
                    retail,
                    discount,
                    effective,
                    grams,
                    Number.isFinite(schemeId) && schemeId > 0 ? schemeId : null,
                    paymentMode,
                    referenceNo,
                    notes,
                    req.user.id,
                ],
            );
            await creditDigiHolding(query, {
                resellerUserId: req.user.id,
                customerUserId,
                metalKey,
                grams,
            });
            let enrollmentId = null;
            if (Number.isFinite(schemeId) && schemeId > 0) {
                const applied = await applySchemePayment(query, {
                    resellerUserId: req.user.id,
                    customerUserId,
                    schemeId,
                    metalKey,
                    amountInr: finalAmount,
                });
                enrollmentId = applied?.enrollment?.id || null;
                if (enrollmentId) {
                    await query(`UPDATE reseller_digi_orders SET enrollment_id = $2 WHERE id = $1`, [
                        orderRows[0].id,
                        enrollmentId,
                    ]);
                }
            }
            res.status(201).json({ ok: true, order: { ...orderRows[0], enrollment_id: enrollmentId } });
        } catch (e) {
            console.error('digi manual transaction:', e);
            res.status(500).json({ error: e.message || 'Failed to record transaction' });
        }
    });

    app.delete('/api/reseller/digi/manual-transactions/:id', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const rows = await query(
                `SELECT * FROM reseller_digi_orders
                 WHERE id = $1 AND reseller_user_id = $2 AND source = 'manual' AND status = 'paid'`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Manual transaction not found' });
            const order = rows[0];
            await debitDigiHolding(query, {
                resellerUserId: order.reseller_user_id,
                customerUserId: order.customer_user_id,
                metalKey: order.metal_key,
                grams: order.grams,
            });
            await query(`UPDATE reseller_digi_orders SET status = 'cancelled' WHERE id = $1`, [id]);
            res.json({ ok: true, deleted_id: id });
        } catch (e) {
            console.error('digi manual delete:', e);
            res.status(500).json({ error: e.message || 'Failed to delete transaction' });
        }
    });

    // ——— Public storefront ———
    app.get('/api/public/digi/config', globalLimiter, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            await ensureResellerSmsColumns(pool);
            const domain = normalizeDomain(req.query.domain || req.query.host || '');
            const code = req.query.code || req.query.invite || '';
            const metal = String(req.query.metal || 'all').trim().toLowerCase();
            if (metal !== 'gold' && metal !== 'silver' && metal !== 'all') {
                return res.status(400).json({ error: 'metal must be gold or silver' });
            }
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) {
                return res.status(404).json({ error: 'Store not found. Open this link from your jeweller.' });
            }
            const flags = await digiFlagsForUser(query, reseller.id);
            if (!flags.enabled) {
                return res.status(404).json({ error: 'DigiGold & DigiSilver is not enabled for this store.' });
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
            const flags = await digiFlagsForUser(query, reseller.id);
            if (!flags.enabled) {
                return res.status(403).json({ error: 'DigiGold & DigiSilver is not enabled for this store.' });
            }

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

            const schemeIdRaw = req.body.scheme_id != null ? parseInt(String(req.body.scheme_id), 10) : null;
            const schemeId = Number.isFinite(schemeIdRaw) && schemeIdRaw > 0 ? schemeIdRaw : null;
            if (schemeId) {
                const sch = await query(
                    `SELECT id, installment_inr, is_active FROM reseller_digi_schemes
                     WHERE id = $1 AND reseller_user_id = $2`,
                    [schemeId, reseller.id],
                );
                if (!sch.length || sch[0].is_active === false) {
                    return res.status(400).json({ error: 'Scheme not found or inactive' });
                }
            }

            const orderRows = await query(
                `INSERT INTO reseller_digi_orders (
                    reseller_user_id, customer_user_id, metal_key, amount_inr,
                    retail_rate_per_gram, discount_inr, effective_rate_per_gram, grams, status, scheme_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
                 RETURNING *`,
                [reseller.id, req.user.id, metalKey, amountInr, retail, discount, effective, grams, schemeId],
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
            let bonusGrams = 0;
            if (order.scheme_id) {
                const applied = await applySchemePayment(query, {
                    resellerUserId: order.reseller_user_id,
                    customerUserId: req.user.id,
                    schemeId: order.scheme_id,
                    metalKey: order.metal_key,
                    amountInr: order.amount_inr,
                });
                bonusGrams = applied?.bonusGrams || 0;
                if (applied?.enrollment?.id) {
                    await query(`UPDATE reseller_digi_orders SET enrollment_id = $2 WHERE id = $1`, [
                        order.id,
                        applied.enrollment.id,
                    ]);
                }
            }
            const holdings = await getCustomerHoldings(query, order.reseller_user_id, req.user.id);
            res.json({
                ok: true,
                grams: safeNum(order.grams),
                bonus_grams: bonusGrams,
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
                `SELECT id, metal_key, amount_inr, grams, effective_rate_per_gram, discount_inr,
                        source, payment_mode, scheme_id, paid_at, created_at
                 FROM reseller_digi_orders
                 WHERE reseller_user_id = $1 AND customer_user_id = $2 AND status = 'paid'
                 ORDER BY paid_at DESC NULLS LAST LIMIT 50`,
                [reseller.id, req.user.id],
            );
            const enrollRows = await query(
                `SELECT e.*, s.scheme_name, s.product_type, s.description, s.terms_and_conditions
                 FROM reseller_digi_enrollments e
                 LEFT JOIN reseller_digi_schemes s ON s.id = e.scheme_id
                 WHERE e.reseller_user_id = $1 AND e.customer_user_id = $2
                 ORDER BY e.started_at DESC`,
                [reseller.id, req.user.id],
            );
            const redeemRows = await query(
                `SELECT * FROM reseller_digi_redemptions
                 WHERE reseller_user_id = $1 AND customer_user_id = $2
                 ORDER BY created_at DESC LIMIT 30`,
                [reseller.id, req.user.id],
            );
            const userRows = await query(`SELECT name, mobile_number FROM users WHERE id = $1`, [req.user.id]);
            res.json({
                profile: {
                    name: userRows[0]?.name || req.user.name || '',
                    mobile: userRows[0]?.mobile_number || req.user.mobile_number || '',
                },
                holdings,
                transactions: txRows,
                enrollments: enrollRows.map((r) => publicEnrollment(r, r)),
                redemptions: redeemRows,
            });
        } catch (e) {
            console.error('public digi wallet:', e);
            res.status(500).json({ error: e.message || 'Failed to load wallet' });
        }
    });

    app.post('/api/public/digi/redeem-quote', checkAuth, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const domain = normalizeDomain(req.body.domain || req.body.host || '');
            const code = req.body.code || req.body.invite || '';
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) return res.status(404).json({ error: 'Store not found' });
            const flags = await digiFlagsForUser(query, reseller.id);
            if (!flags.enabled) return res.status(403).json({ error: 'Not enabled' });
            const metalKey = String(req.body.metal_key || '').trim();
            if (!isValidMetalKey(metalKey)) return res.status(400).json({ error: 'Invalid metal' });
            const stored = await getStoredRates(reseller.id);
            if (!stored) return res.status(503).json({ error: 'Rates not configured' });
            const settings = await getOrCreateDigiSettings(query, reseller.id);
            const quote = computeRedemptionQuote({
                grams: req.body.grams,
                itemKind: req.body.item_kind,
                doorstep: !!req.body.doorstep,
                settings,
                retailRate: stored[RETAIL_RATE_COL[metalKey]],
            });
            res.json({ quote });
        } catch (e) {
            console.error('public digi redeem-quote:', e);
            res.status(500).json({ error: e.message || 'Failed to quote redemption' });
        }
    });

    app.post('/api/public/digi/redeem', checkAuth, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const domain = normalizeDomain(req.body.domain || req.body.host || '');
            const code = req.body.code || req.body.invite || '';
            const reseller = await resolveResellerFromRequest(query, { domain, code });
            if (!reseller) return res.status(404).json({ error: 'Store not found' });
            const flags = await digiFlagsForUser(query, reseller.id);
            if (!flags.enabled) return res.status(403).json({ error: 'Not enabled' });
            const metalKey = String(req.body.metal_key || '').trim();
            if (!isValidMetalKey(metalKey)) return res.status(400).json({ error: 'Invalid metal' });
            const grams = safeNum(req.body.grams);
            if (grams <= 0) return res.status(400).json({ error: 'Enter grams to redeem' });
            const holdings = await getCustomerHoldings(query, reseller.id, req.user.id);
            const bal = holdings.find((h) => h.metal_key === metalKey)?.balance_grams || 0;
            if (grams > bal + 1e-9) {
                return res.status(400).json({ error: `Available balance is ${bal.toFixed(3)} g` });
            }
            const stored = await getStoredRates(reseller.id);
            if (!stored) return res.status(503).json({ error: 'Rates not configured' });
            const settings = await getOrCreateDigiSettings(query, reseller.id);
            const quote = computeRedemptionQuote({
                grams,
                itemKind: req.body.item_kind,
                doorstep: !!req.body.doorstep,
                settings,
                retailRate: stored[RETAIL_RATE_COL[metalKey]],
            });
            await debitDigiHolding(query, {
                resellerUserId: reseller.id,
                customerUserId: req.user.id,
                metalKey,
                grams,
            });
            const rows = await query(
                `INSERT INTO reseller_digi_redemptions (
                    reseller_user_id, customer_user_id, metal_key, grams, item_kind,
                    making_charge_pct, discount_per_gram, wastage_pct, shipping_inr, doorstep,
                    retail_rate_per_gram, notes, status
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'requested')
                 RETURNING *`,
                [
                    reseller.id,
                    req.user.id,
                    metalKey,
                    grams,
                    quote.item_kind,
                    quote.making_charge_pct,
                    quote.discount_per_gram,
                    quote.wastage_pct,
                    quote.shipping_inr,
                    quote.doorstep,
                    quote.retail_rate_per_gram,
                    String(req.body.notes || '').trim() || null,
                ],
            );
            const nextHoldings = await getCustomerHoldings(query, reseller.id, req.user.id);
            res.status(201).json({ ok: true, redemption: rows[0], quote, holdings: nextHoldings });
        } catch (e) {
            console.error('public digi redeem:', e);
            res.status(500).json({ error: e.message || 'Failed to submit redemption' });
        }
    });

    app.put('/api/reseller/digi/rules', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const result = await saveDigiRules(query, req.user.id, req.body.rules || req.body);
            res.json(result);
        } catch (e) {
            console.error('digi rules put:', e);
            res.status(500).json({ error: e.message || 'Failed to save rules' });
        }
    });

    app.get('/api/reseller/digi/enrollments', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const status = String(req.query.status || '').trim().toLowerCase();
            const metal = String(req.query.metal || req.query.product_type || '').trim().toLowerCase();
            const params = [req.user.id];
            let sql = `
                SELECT e.*, s.scheme_name, s.product_type, s.description,
                       u.name AS customer_name, u.mobile_number AS customer_mobile
                FROM reseller_digi_enrollments e
                LEFT JOIN reseller_digi_schemes s ON s.id = e.scheme_id
                LEFT JOIN users u ON u.id = e.customer_user_id
                WHERE e.reseller_user_id = $1`;
            if (status === 'active') {
                sql += ` AND e.status = 'active'`;
            } else if (status === 'closed') {
                sql += ` AND e.status IN ('matured','closed')`;
            }
            if (metal === 'gold') {
                sql += ` AND e.metal_key LIKE 'gold_%'`;
            } else if (metal === 'silver') {
                sql += ` AND e.metal_key = 'silver'`;
            }
            sql += ` ORDER BY e.last_paid_at DESC NULLS LAST, e.started_at DESC`;
            const rows = await query(sql, params);
            res.json({
                enrollments: rows.map((r) => ({
                    ...publicEnrollment(r, r),
                    customer_name: r.customer_name,
                    customer_mobile: r.customer_mobile,
                })),
            });
        } catch (e) {
            console.error('digi enrollments:', e);
            res.status(500).json({ error: e.message || 'Failed to load enrollments' });
        }
    });

    app.post('/api/reseller/digi/enrollments/:id/close', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const rows = await query(
                `UPDATE reseller_digi_enrollments
                 SET status = 'closed', closed_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING *`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Enrollment not found' });
            res.json({ enrollment: publicEnrollment(rows[0]) });
        } catch (e) {
            console.error('digi enrollment close:', e);
            res.status(500).json({ error: e.message || 'Failed to close account' });
        }
    });

    app.get('/api/reseller/digi/redemptions', checkAuth, digiGateAny, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const rows = await query(
                `SELECT r.*, u.name AS customer_name, u.mobile_number AS customer_mobile
                 FROM reseller_digi_redemptions r
                 LEFT JOIN users u ON u.id = r.customer_user_id
                 WHERE r.reseller_user_id = $1
                 ORDER BY r.created_at DESC
                 LIMIT 200`,
                [req.user.id],
            );
            res.json({ redemptions: rows });
        } catch (e) {
            console.error('digi redemptions:', e);
            res.status(500).json({ error: e.message || 'Failed to load redemptions' });
        }
    });

    app.post('/api/reseller/digi/redemptions/:id/status', checkAuth, digiGateAny, requireJson, async (req, res) => {
        try {
            await ensureDigiSchema(pool);
            const id = parseInt(String(req.params.id), 10);
            const status = String(req.body.status || '').trim().toLowerCase();
            if (!['requested', 'confirmed', 'dispatched', 'cancelled'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }
            const existing = await query(
                `SELECT * FROM reseller_digi_redemptions WHERE id = $1 AND reseller_user_id = $2`,
                [id, req.user.id],
            );
            if (!existing.length) return res.status(404).json({ error: 'Redemption not found' });
            const prev = existing[0];
            if (status === 'cancelled' && prev.status !== 'cancelled') {
                await creditDigiHolding(query, {
                    resellerUserId: prev.reseller_user_id,
                    customerUserId: prev.customer_user_id,
                    metalKey: prev.metal_key,
                    grams: prev.grams,
                });
            }
            const rows = await query(
                `UPDATE reseller_digi_redemptions
                 SET status = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING *`,
                [id, req.user.id, status],
            );
            res.json({ redemption: rows[0] });
        } catch (e) {
            console.error('digi redemption status:', e);
            res.status(500).json({ error: e.message || 'Failed to update redemption' });
        }
    });
}

module.exports = {
    registerResellerDigiRoutes,
    ensureDigiSchema,
    effectiveRatePerGram,
    gramsFromAmount,
    METAL_KEYS,
    requireResellerDigi,
    digiFlagsForUser,
};

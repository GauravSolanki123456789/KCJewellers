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
    const payment = publicPaymentSettings(reseller);
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
            const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
            const rows = await query(
                `SELECT o.*, u.name AS customer_name, u.mobile_number AS customer_mobile
                 FROM reseller_digi_orders o
                 LEFT JOIN users u ON u.id = o.customer_user_id
                 WHERE o.reseller_user_id = $1 AND o.status = 'paid'
                 ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC
                 LIMIT $2`,
                [req.user.id, limit],
            );
            res.json({ transactions: rows });
        } catch (e) {
            console.error('erp digi transactions:', e);
            res.status(500).json({ error: e.message || 'Failed to load transactions' });
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

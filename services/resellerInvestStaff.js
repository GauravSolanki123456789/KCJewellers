/**
 * Reseller staff — record offline SIP / DigiGold / DigiSilver installment payments.
 * Requires users.reseller_invest_manage_enabled (RESELLER tier).
 */
const { query } = require('../config/database');
const { resolveSipMetalRatePerGram, gramsFromInstallment } = require('./digiInvestRates');

async function investManageEnabled(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    const rows = await query(
        `SELECT COALESCE(reseller_invest_manage_enabled, false) AS enabled,
                UPPER(TRIM(COALESCE(customer_tier::text, ''))) AS tier
         FROM users WHERE id = $1`,
        [uid],
    );
    if (!rows.length) return false;
    return rows[0].tier === 'RESELLER' && !!rows[0].enabled;
}

async function searchCustomerSips(mobileRaw) {
    const digits = String(mobileRaw || '').replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) {
        const err = new Error('Enter a valid 10-digit mobile number');
        err.status = 400;
        throw err;
    }
    const users = await query(
        `SELECT id, name, email, mobile_number FROM users WHERE mobile_number = $1 LIMIT 1`,
        [digits],
    );
    if (!users.length) return { customer: null, sips: [] };
    const userId = users[0].id;
    const sips = await query(
        `SELECT us.id, us.status, us.start_date, us.maturity_date,
                sp.name AS plan_name, sp.metal_type, sp.duration_months, sp.installment_amount,
                COALESCE(SUM(CASE WHEN st.amount_paid IS NOT NULL THEN st.amount_paid ELSE st.amount END), 0) AS total_paid,
                COALESCE(SUM(CASE WHEN st.accumulated_grams IS NOT NULL THEN st.accumulated_grams ELSE st.gold_credited END), 0) AS total_grams
         FROM user_sips us
         JOIN sip_plans sp ON sp.id = us.plan_id
         LEFT JOIN sip_transactions st ON st.user_sip_id = us.id AND st.status = 'SUCCESS'
         WHERE us.user_id = $1
         GROUP BY us.id, sp.name, sp.metal_type, sp.duration_months, sp.installment_amount
         ORDER BY us.start_date DESC`,
        [userId],
    );
    return {
        customer: {
            id: users[0].id,
            name: users[0].name,
            email: users[0].email,
            mobile_number: users[0].mobile_number,
        },
        sips,
    };
}

async function recordInstallmentPayment(staffUserId, body, liveRateService) {
    const enabled = await investManageEnabled(staffUserId);
    if (!enabled) {
        const err = new Error('Invest payment recording is not enabled for this account');
        err.status = 403;
        throw err;
    }
    const userSipId = parseInt(String(body.user_sip_id || ''), 10);
    const amount = Number(body.amount);
    const reference = String(body.payment_reference || body.reference || '').trim().slice(0, 128) || null;
    if (!Number.isFinite(userSipId) || userSipId <= 0) {
        const err = new Error('user_sip_id is required');
        err.status = 400;
        throw err;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        const err = new Error('amount must be a positive number');
        err.status = 400;
        throw err;
    }

    const rows = await query(
        `SELECT us.id, us.user_id, us.status, sp.metal_type, sp.id AS plan_id
         FROM user_sips us
         JOIN sip_plans sp ON sp.id = us.plan_id
         WHERE us.id = $1`,
        [userSipId],
    );
    if (!rows.length) {
        const err = new Error('SIP not found');
        err.status = 404;
        throw err;
    }
    const sip = rows[0];
    const st = String(sip.status || '').toLowerCase();
    if (st !== 'active' && st !== 'completed') {
        const err = new Error('This SIP is not active');
        err.status = 400;
        throw err;
    }

    const metalType = (sip.metal_type || '').toLowerCase();
    let accumulatedGrams = null;
    let metalRateOnDate = null;

    if (metalType === 'gold' || metalType === 'silver') {
        const rateInfo = await resolveSipMetalRatePerGram(metalType, liveRateService);
        if (rateInfo) {
            metalRateOnDate = rateInfo.displayRate;
            accumulatedGrams = gramsFromInstallment(amount, metalType, rateInfo);
        }
    }

    await query(
        `INSERT INTO sip_transactions (
            user_id, plan_id, user_sip_id, amount, amount_paid, metal_rate_on_date,
            accumulated_grams, payment_date, type, status, transaction_date
         ) VALUES ($1, $2, $3, $4, $4, $5, $6, CURRENT_TIMESTAMP, 'installment', 'SUCCESS', CURRENT_TIMESTAMP)`,
        [sip.user_id, sip.plan_id, userSipId, amount, metalRateOnDate, accumulatedGrams],
    );

    if (metalType === 'gold' && accumulatedGrams != null && accumulatedGrams > 0) {
        await query(
            'UPDATE users SET wallet_gold_balance = COALESCE(wallet_gold_balance,0) + $2 WHERE id = $1',
            [sip.user_id, accumulatedGrams],
        ).catch(() => {});
    }
    if (metalType === 'silver' && accumulatedGrams != null && accumulatedGrams > 0) {
        await query(
            'UPDATE users SET wallet_silver_balance = COALESCE(wallet_silver_balance,0) + $2 WHERE id = $1',
            [sip.user_id, accumulatedGrams],
        ).catch(() => {});
    }

    return {
        user_sip_id: userSipId,
        amount,
        accumulated_grams: accumulatedGrams,
        metal_rate_on_date: metalRateOnDate,
        payment_reference: reference,
        recorded_by_user_id: staffUserId,
    };
}

function registerResellerInvestRoutes(app, { checkAuth, liveRateService }) {
    app.get('/api/reseller/invest/enabled', checkAuth, async (req, res) => {
        try {
            if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
            const tier = String(req.user.customer_tier || '').toUpperCase();
            if (tier !== 'RESELLER') return res.status(403).json({ error: 'RESELLER tier required' });
            const enabled = await investManageEnabled(req.user.id);
            res.json({ enabled });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/reseller/invest/search', checkAuth, async (req, res) => {
        try {
            if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
            if (!(await investManageEnabled(req.user.id))) {
                return res.status(403).json({ error: 'Invest payment recording is not enabled' });
            }
            const result = await searchCustomerSips(req.query.mobile);
            res.json(result);
        } catch (error) {
            const status = error.status || 500;
            res.status(status).json({ error: error.message });
        }
    });

    app.post('/api/reseller/invest/record-payment', checkAuth, async (req, res) => {
        try {
            if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
            const result = await recordInstallmentPayment(req.user.id, req.body || {}, liveRateService);
            res.json({ success: true, ...result });
        } catch (error) {
            const status = error.status || 500;
            if (status >= 500) console.error('POST /api/reseller/invest/record-payment:', error);
            res.status(status).json({ error: error.message });
        }
    });
}

module.exports = {
    investManageEnabled,
    searchCustomerSips,
    recordInstallmentPayment,
    registerResellerInvestRoutes,
};

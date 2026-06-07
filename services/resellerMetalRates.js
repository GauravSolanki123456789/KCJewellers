/**
 * Per-reseller metal rates — silver + gold 18K/22K/24K (₹ per gram).
 * When an enabled reseller saves rates, the latest update applies site-wide
 * (kcjewellers.co.in + custom domains + all product pricing).
 */
const { query, pool } = require('../config/database');

const SILVER_G_MIN = 50;
const SILVER_G_MAX = 5000;
const GOLD_G_MIN = 3000;
const GOLD_G_MAX = 35000;

function safeNum(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
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

function validatePerGramRates(body) {
    const silver = safeNum(body.silver_per_gram);
    const g24 = safeNum(body.gold_24k_per_gram);
    const g22 = safeNum(body.gold_22k_per_gram);
    const g18 = safeNum(body.gold_18k_per_gram);
    if (silver < SILVER_G_MIN || silver > SILVER_G_MAX) {
        return { ok: false, error: `Silver rate must be between ₹${SILVER_G_MIN} and ₹${SILVER_G_MAX} per gram` };
    }
    for (const [label, v] of [
        ['24K gold', g24],
        ['22K gold', g22],
        ['18K gold', g18],
    ]) {
        if (v < GOLD_G_MIN || v > GOLD_G_MAX) {
            return { ok: false, error: `${label} rate must be between ₹${GOLD_G_MIN} and ₹${GOLD_G_MAX} per gram` };
        }
    }
    return {
        ok: true,
        rates: {
            silver_per_gram: Math.round(silver * 100) / 100,
            gold_24k_per_gram: Math.round(g24 * 100) / 100,
            gold_22k_per_gram: Math.round(g22 * 100) / 100,
            gold_18k_per_gram: Math.round(g18 * 100) / 100,
        },
    };
}

async function ensureSchema() {
    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reseller_rates_update_enabled BOOLEAN NOT NULL DEFAULT false
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS reseller_metal_rates (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            silver_per_gram NUMERIC(12, 2) NOT NULL,
            gold_24k_per_gram NUMERIC(12, 2) NOT NULL,
            gold_22k_per_gram NUMERIC(12, 2) NOT NULL,
            gold_18k_per_gram NUMERIC(12, 2) NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        )
    `);
}

async function findResellerByDomain(domain) {
    const d = normalizeDomain(domain);
    if (!d) return null;
    const rows = await query(
        `SELECT id, customer_tier, business_name,
                COALESCE(reseller_rates_update_enabled, false) AS reseller_rates_update_enabled,
                custom_domain, allowed_category_ids
         FROM users
         WHERE UPPER(TRIM(COALESCE(customer_tier::text, ''))) = 'RESELLER'
           AND NULLIF(TRIM(custom_domain), '') IS NOT NULL
           AND LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(custom_domain), '^https?://', '', 'i'), '/.*$', ''), '^www\\.', '', 'i'))) = $1
         LIMIT 1`,
        [d],
    );
    return rows[0] || null;
}

async function getStoredRates(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    try {
        const rows = await query(
            `SELECT user_id, silver_per_gram, gold_24k_per_gram, gold_22k_per_gram, gold_18k_per_gram,
                    updated_at, updated_by_user_id
             FROM reseller_metal_rates WHERE user_id = $1`,
            [uid],
        );
        return rows[0] || null;
    } catch (e) {
        if (String(e.message || '').includes('reseller_metal_rates')) {
            await ensureSchema();
            return getStoredRates(userId);
        }
        throw e;
    }
}

async function resellerRatesEnabled(userId) {
    const uid = parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid <= 0) return false;
    try {
        const rows = await query(
            'SELECT COALESCE(reseller_rates_update_enabled, false) AS enabled FROM users WHERE id = $1',
            [uid],
        );
        return !!rows[0]?.enabled;
    } catch (e) {
        if (String(e.message || '').includes('reseller_rates_update_enabled')) {
            await ensureSchema();
            return resellerRatesEnabled(userId);
        }
        throw e;
    }
}

/** Build GET /api/rates/display payload from per-gram reseller rates. */
function buildDisplayPayloadFromStored(row, source = 'reseller') {
    const silverG = safeNum(row.silver_per_gram);
    const g24 = safeNum(row.gold_24k_per_gram);
    const g22 = safeNum(row.gold_22k_per_gram);
    const g18 = safeNum(row.gold_18k_per_gram);
    return {
        ts: Date.now(),
        source,
        rates: [
            {
                metal_type: 'gold',
                buy_rate: Math.round(g24 * 10),
                sell_rate: Math.round(g24 * 10),
                admin_margin: 0,
                display_rate: Math.round(g24 * 10),
            },
            {
                metal_type: 'gold_22k',
                buy_rate: Math.round(g22 * 10),
                sell_rate: Math.round(g22 * 10),
                admin_margin: 0,
                display_rate: Math.round(g22 * 10),
            },
            {
                metal_type: 'gold_18k',
                buy_rate: Math.round(g18 * 10),
                sell_rate: Math.round(g18 * 10),
                admin_margin: 0,
                display_rate: Math.round(g18 * 10),
            },
            {
                metal_type: 'silver',
                buy_rate: Math.round(silverG * 1000),
                sell_rate: Math.round(silverG * 1000),
                admin_margin: 0,
                display_rate: Math.round(silverG * 1000),
            },
        ],
    };
}

/** Live rates page shape (gold24k_10g, etc.) from stored per-gram row. */
function buildLiveRatesFromStored(row) {
    const silverG = safeNum(row.silver_per_gram);
    const g24 = safeNum(row.gold_24k_per_gram);
    const g22 = safeNum(row.gold_22k_per_gram);
    const g18 = safeNum(row.gold_18k_per_gram);
    return {
        gold24k_10g: Math.round(g24 * 10),
        gold22k_10g: Math.round(g22 * 10),
        gold18k_10g: Math.round(g18 * 10),
        silver_1kg: Math.round(silverG * 1000),
    };
}

async function getResellerRatesPayloadForUserId(userId) {
    const enabled = await resellerRatesEnabled(userId);
    if (!enabled) return null;
    const stored = await getStoredRates(userId);
    if (!stored) return null;
    return buildDisplayPayloadFromStored(stored);
}

/**
 * Active site-wide override: most recently saved rates among enabled RESELLER accounts.
 * All visitors on kcjewellers.co.in and reseller custom domains use this when set.
 */
async function getActiveGlobalResellerRates() {
    await ensureSchema();
    try {
        const rows = await query(
            `SELECT r.user_id, r.silver_per_gram, r.gold_24k_per_gram, r.gold_22k_per_gram, r.gold_18k_per_gram,
                    r.updated_at, r.updated_by_user_id, u.business_name
             FROM reseller_metal_rates r
             INNER JOIN users u ON u.id = r.user_id
             WHERE UPPER(TRIM(COALESCE(u.customer_tier::text, ''))) = 'RESELLER'
               AND COALESCE(u.reseller_rates_update_enabled, false) = true
             ORDER BY r.updated_at DESC
             LIMIT 1`,
        );
        return rows[0] || null;
    } catch (e) {
        if (String(e.message || '').includes('reseller_metal_rates') || String(e.message || '').includes('reseller_rates_update_enabled')) {
            await ensureSchema();
            return getActiveGlobalResellerRates();
        }
        throw e;
    }
}

async function getGlobalResellerRatesPayload() {
    const row = await getActiveGlobalResellerRates();
    if (!row) return null;
    return buildDisplayPayloadFromStored(row);
}

function broadcastRatesPayload(io, payload) {
    if (!io || !payload) return;
    io.to('main').emit('live-rate', payload);
    io.to('main').emit('rate_update', payload);
    io.emit('live-rate', payload);
    io.emit('rate_update', payload);
}

/**
 * Resolve display rates — reseller override (site-wide) wins over Yahoo/market feed.
 */
function requestStorefrontDomain(req) {
    return (
        normalizeDomain(req.query?.domain) ||
        normalizeDomain(req.headers['x-storefront-domain']) ||
        normalizeDomain(req.headers['x-custom-domain'])
    );
}

async function resolveDisplayRatesForRequest(req, liveRateService) {
    const domain = requestStorefrontDomain(req);
    if (domain) {
        const reseller = await findResellerByDomain(domain);
        if (reseller?.id) {
            const payload = await getResellerRatesPayloadForUserId(reseller.id);
            if (payload) return payload;
        }
    }

    const globalPayload = await getGlobalResellerRatesPayload();
    if (globalPayload) return globalPayload;

    return liveRateService.getCurrentPayload();
}

async function resolveLiveRatesForRequest(req, liveRateService) {
    const domain = requestStorefrontDomain(req);
    if (domain) {
        const reseller = await findResellerByDomain(domain);
        if (reseller?.id && (await resellerRatesEnabled(reseller.id))) {
            const stored = await getStoredRates(reseller.id);
            if (stored) {
                return {
                    success: true,
                    rates: buildLiveRatesFromStored(stored),
                    source: 'reseller',
                    timestamp: new Date(stored.updated_at).getTime() || Date.now(),
                };
            }
        }
    }

    const row = await getActiveGlobalResellerRates();
    if (row) {
        return {
            success: true,
            rates: buildLiveRatesFromStored(row),
            source: 'reseller',
            timestamp: new Date(row.updated_at).getTime() || Date.now(),
        };
    }

    return liveRateService.fetchLiveRates();
}

async function getResellerRatesForEditor(userId) {
    await ensureSchema();
    const enabled = await resellerRatesEnabled(userId);
    const stored = await getStoredRates(userId);
    return {
        enabled,
        has_custom_rates: !!stored,
        rates: stored
            ? {
                  silver_per_gram: safeNum(stored.silver_per_gram),
                  gold_24k_per_gram: safeNum(stored.gold_24k_per_gram),
                  gold_22k_per_gram: safeNum(stored.gold_22k_per_gram),
                  gold_18k_per_gram: safeNum(stored.gold_18k_per_gram),
              }
            : null,
        updated_at: stored?.updated_at || null,
        preview: stored ? buildLiveRatesFromStored(stored) : null,
    };
}

async function saveResellerRates(userId, body, updatedByUserId, io) {
    await ensureSchema();
    const enabled = await resellerRatesEnabled(userId);
    if (!enabled) {
        const err = new Error('Rate updates are not enabled for this reseller account');
        err.status = 403;
        throw err;
    }
    const v = validatePerGramRates(body || {});
    if (!v.ok) {
        const err = new Error(v.error);
        err.status = 400;
        throw err;
    }
    const { rates } = v;
    const uid = parseInt(String(userId), 10);
    const by = parseInt(String(updatedByUserId), 10);
    const rows = await query(
        `INSERT INTO reseller_metal_rates (
            user_id, silver_per_gram, gold_24k_per_gram, gold_22k_per_gram, gold_18k_per_gram,
            updated_at, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
         ON CONFLICT (user_id) DO UPDATE SET
            silver_per_gram = EXCLUDED.silver_per_gram,
            gold_24k_per_gram = EXCLUDED.gold_24k_per_gram,
            gold_22k_per_gram = EXCLUDED.gold_22k_per_gram,
            gold_18k_per_gram = EXCLUDED.gold_18k_per_gram,
            updated_at = CURRENT_TIMESTAMP,
            updated_by_user_id = EXCLUDED.updated_by_user_id
         RETURNING *`,
        [
            uid,
            rates.silver_per_gram,
            rates.gold_24k_per_gram,
            rates.gold_22k_per_gram,
            rates.gold_18k_per_gram,
            Number.isFinite(by) && by > 0 ? by : null,
        ],
    );
    const display = buildDisplayPayloadFromStored(rows[0]);
    broadcastRatesPayload(io, display);
    return {
        saved: rows[0],
        preview: buildLiveRatesFromStored(rows[0]),
        display,
    };
}

/** Snapshot rates array for shared catalogue links (creator is reseller). */
async function getRatesSnapshotForSharedCatalogCreator(userId, liveRateService) {
    const payload = await getResellerRatesPayloadForUserId(userId);
    if (payload?.rates) return payload.rates;
    const global = await liveRateService.getCurrentPayload();
    return global?.rates ?? [];
}

function registerResellerRatesRoutes(app, { checkAuth, liveRateService, io }) {
    app.get('/api/reseller/rates', checkAuth, async (req, res) => {
        try {
            if (!req.isAuthenticated()) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const tier = String(req.user.customer_tier || '').toUpperCase();
            if (tier !== 'RESELLER') {
                return res.status(403).json({ error: 'RESELLER tier required' });
            }
            const data = await getResellerRatesForEditor(req.user.id);
            const global = await liveRateService.fetchLiveRates();
            res.json({
                ...data,
                market: global.success ? global.rates : null,
                market_source: global.source || 'live',
            });
        } catch (error) {
            console.error('GET /api/reseller/rates:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.put('/api/reseller/rates', checkAuth, async (req, res) => {
        try {
            if (!req.isAuthenticated()) {
                return res.status(401).json({ error: 'Not authenticated' });
            }
            const tier = String(req.user.customer_tier || '').toUpperCase();
            if (tier !== 'RESELLER') {
                return res.status(403).json({ error: 'RESELLER tier required' });
            }
            const result = await saveResellerRates(req.user.id, req.body, req.user.id, io);
            res.json({
                success: true,
                rates: {
                    silver_per_gram: safeNum(result.saved.silver_per_gram),
                    gold_24k_per_gram: safeNum(result.saved.gold_24k_per_gram),
                    gold_22k_per_gram: safeNum(result.saved.gold_22k_per_gram),
                    gold_18k_per_gram: safeNum(result.saved.gold_18k_per_gram),
                },
                preview: result.preview,
                updated_at: result.saved.updated_at,
            });
        } catch (error) {
            const status = error.status || 500;
            if (status >= 500) console.error('PUT /api/reseller/rates:', error);
            res.status(status).json({ error: error.message });
        }
    });
}

module.exports = {
    ensureSchema,
    normalizeDomain,
    findResellerByDomain,
    getStoredRates,
    resellerRatesEnabled,
    buildDisplayPayloadFromStored,
    buildLiveRatesFromStored,
    getResellerRatesPayloadForUserId,
    getActiveGlobalResellerRates,
    getGlobalResellerRatesPayload,
    broadcastRatesPayload,
    resolveDisplayRatesForRequest,
    resolveLiveRatesForRequest,
    getResellerRatesForEditor,
    saveResellerRates,
    validatePerGramRates,
    getRatesSnapshotForSharedCatalogCreator,
    registerResellerRatesRoutes,
};

/**
 * DigiGold / DigiSilver invest rates — preferential ₹/g for SIP (Invest) gram accumulation.
 * Stored in app_settings (KC admin) and optional overrides on reseller_metal_rates.
 * Falls back to retail display rates when digi rates are unset.
 */
const { query } = require('../config/database');
const { getActiveGlobalResellerRates } = require('./resellerMetalRates');

const APP_KEYS = {
    digi_silver_per_gram: 'digi_silver_per_gram',
    digi_gold_24k_per_gram: 'digi_gold_24k_per_gram',
    digi_gold_22k_per_gram: 'digi_gold_22k_per_gram',
    digi_gold_18k_per_gram: 'digi_gold_18k_per_gram',
};

function safeNum(n) {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : null;
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

async function getAppDigiRates() {
    const rows = await query(
        `SELECT key, value FROM app_settings WHERE key = ANY($1::text[])`,
        [Object.values(APP_KEYS)],
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
        digi_silver_per_gram: safeNum(map[APP_KEYS.digi_silver_per_gram]),
        digi_gold_24k_per_gram: safeNum(map[APP_KEYS.digi_gold_24k_per_gram]),
        digi_gold_22k_per_gram: safeNum(map[APP_KEYS.digi_gold_22k_per_gram]),
        digi_gold_18k_per_gram: safeNum(map[APP_KEYS.digi_gold_18k_per_gram]),
    };
}

async function saveAppDigiRates(body) {
    const fields = [
        ['digi_silver_per_gram', body.digi_silver_per_gram],
        ['digi_gold_24k_per_gram', body.digi_gold_24k_per_gram],
        ['digi_gold_22k_per_gram', body.digi_gold_22k_per_gram],
        ['digi_gold_18k_per_gram', body.digi_gold_18k_per_gram],
    ];
    for (const [key, raw] of fields) {
        const v = raw == null || raw === '' ? '' : String(round2(Number(raw)));
        await query(
            `INSERT INTO app_settings (key, value, updated_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            [key, v],
        );
    }
    return getAppDigiRates();
}

/** Retail ₹/g from live rate payload (same basis as SIP verify-subscription). */
function retailPerGramFromPayload(payload, metalType) {
    const rates = payload?.rates || [];
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'silver') {
        const row = rates.find((r) => (r.metal_type || '').toLowerCase() === 'silver');
        const display = Number(row?.display_rate || row?.sell_rate || 0);
        return display > 0 ? display / 1000 : null;
    }
    if (mt === 'gold') {
        const row = rates.find((r) => (r.metal_type || '').toLowerCase() === 'gold');
        const display = Number(row?.display_rate || row?.sell_rate || 0);
        return display > 0 ? display / 10 : null;
    }
    return null;
}

function mergeDigiWithRetail(digiPartial, retailRow) {
    const retail = {
        digi_silver_per_gram: safeNum(retailRow?.silver_per_gram),
        digi_gold_24k_per_gram: safeNum(retailRow?.gold_24k_per_gram),
        digi_gold_22k_per_gram: safeNum(retailRow?.gold_22k_per_gram),
        digi_gold_18k_per_gram: safeNum(retailRow?.gold_18k_per_gram),
    };
    return {
        digi_silver_per_gram:
            safeNum(digiPartial?.digi_silver_per_gram) ?? retail.digi_silver_per_gram,
        digi_gold_24k_per_gram:
            safeNum(digiPartial?.digi_gold_24k_per_gram) ?? retail.digi_gold_24k_per_gram,
        digi_gold_22k_per_gram:
            safeNum(digiPartial?.digi_gold_22k_per_gram) ?? retail.digi_gold_22k_per_gram,
        digi_gold_18k_per_gram:
            safeNum(digiPartial?.digi_gold_18k_per_gram) ?? retail.digi_gold_18k_per_gram,
    };
}

/**
 * Resolved invest rates — reseller global row digi columns > app_settings > retail per-gram.
 */
async function resolveDigiInvestRatesPerGram(liveRateService) {
    const appDigi = await getAppDigiRates();
    const globalRow = await getActiveGlobalResellerRates().catch(() => null);
    let merged = mergeDigiWithRetail(
        globalRow
            ? {
                  digi_silver_per_gram: globalRow.digi_silver_per_gram,
                  digi_gold_24k_per_gram: globalRow.digi_gold_24k_per_gram,
                  digi_gold_22k_per_gram: globalRow.digi_gold_22k_per_gram,
                  digi_gold_18k_per_gram: globalRow.digi_gold_18k_per_gram,
              }
            : null,
        globalRow,
    );

    const payload = await liveRateService.getCurrentPayload();
    const retailSilver = retailPerGramFromPayload(payload, 'silver');
    const retailGold24 = retailPerGramFromPayload(payload, 'gold');

    if (!merged.digi_silver_per_gram) merged.digi_silver_per_gram = appDigi.digi_silver_per_gram ?? retailSilver;
    if (!merged.digi_gold_24k_per_gram) merged.digi_gold_24k_per_gram = appDigi.digi_gold_24k_per_gram ?? retailGold24;
    if (!merged.digi_gold_22k_per_gram) {
        merged.digi_gold_22k_per_gram =
            appDigi.digi_gold_22k_per_gram ??
            (merged.digi_gold_24k_per_gram ? round2(merged.digi_gold_24k_per_gram * 0.916) : null);
    }
    if (!merged.digi_gold_18k_per_gram) {
        merged.digi_gold_18k_per_gram =
            appDigi.digi_gold_18k_per_gram ??
            (merged.digi_gold_24k_per_gram ? round2(merged.digi_gold_24k_per_gram * 0.75) : null);
    }

    return {
        ...merged,
        retail_silver_per_gram: retailSilver,
        retail_gold_24k_per_gram: retailGold24,
    };
}

/** SIP gram accumulation — returns ₹/g display rate used for metal_rate_on_date. */
async function resolveSipMetalRatePerGram(metalType, liveRateService) {
    const digi = await resolveDigiInvestRatesPerGram(liveRateService);
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'silver') {
        const g = digi.digi_silver_per_gram;
        return g ? { perGram: g, displayRate: g * 1000 } : null;
    }
    if (mt === 'gold') {
        const g = digi.digi_gold_24k_per_gram;
        return g ? { perGram: g, displayRate: g * 10 } : null;
    }
    return null;
}

function gramsFromInstallment(amountInr, metalType, rateInfo) {
    if (!rateInfo?.displayRate || rateInfo.displayRate <= 0) return null;
    const amt = Number(amountInr) || 0;
    if (amt <= 0) return null;
    const mt = String(metalType || '').toLowerCase();
    if (mt === 'gold') return amt / (rateInfo.displayRate / 10);
    if (mt === 'silver') return amt / (rateInfo.displayRate / 1000);
    return null;
}

function registerDigiInvestRoutes(app, { checkAuth, isAdminStrict, liveRateService }) {
    app.get('/api/rates/digi-invest', async (req, res) => {
        try {
            const rates = await resolveDigiInvestRatesPerGram(liveRateService);
            res.json({ success: true, rates });
        } catch (error) {
            console.error('GET /api/rates/digi-invest:', error);
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/admin/settings/digi-invest-rates', isAdminStrict, async (req, res) => {
        try {
            const appDigi = await getAppDigiRates();
            const resolved = await resolveDigiInvestRatesPerGram(liveRateService);
            res.json({ app: appDigi, resolved });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.put('/api/admin/settings/digi-invest-rates', isAdminStrict, async (req, res) => {
        try {
            const saved = await saveAppDigiRates(req.body || {});
            const resolved = await resolveDigiInvestRatesPerGram(liveRateService);
            res.json({ success: true, app: saved, resolved });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

module.exports = {
    APP_KEYS,
    getAppDigiRates,
    saveAppDigiRates,
    resolveDigiInvestRatesPerGram,
    resolveSipMetalRatePerGram,
    gramsFromInstallment,
    registerDigiInvestRoutes,
};

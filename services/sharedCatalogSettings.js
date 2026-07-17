/**
 * Admin-configurable shared catalogue settings (expiry options, max days).
 */

const DEFAULT_EXPIRY_OPTIONS = [
    { label: '2 hours', hours: 2 },
    { label: '24 hours', hours: 24 },
    { label: '2 days', hours: 48 },
    { label: '7 days', hours: 168 },
    { label: '24 days', hours: 576 },
];

const MAX_EXPIRY_DAYS_DEFAULT = 30;

function parseExpiryOptions(raw) {
    if (!raw) return [...DEFAULT_EXPIRY_OPTIONS];
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [...DEFAULT_EXPIRY_OPTIONS];
        const out = parsed
            .map((o) => ({
                label: String(o?.label ?? '').trim(),
                hours: parseInt(String(o?.hours ?? ''), 10),
            }))
            .filter((o) => o.label && Number.isFinite(o.hours) && o.hours > 0 && o.hours <= 24 * 90);
        return out.length ? out : [...DEFAULT_EXPIRY_OPTIONS];
    } catch {
        return [...DEFAULT_EXPIRY_OPTIONS];
    }
}

async function getSharedCatalogExpiryOptions(query) {
    const rows = await query(
        `SELECT value FROM app_settings WHERE key = 'shared_catalog_expiry_options' LIMIT 1`,
    );
    return parseExpiryOptions(rows[0]?.value);
}

async function getSharedCatalogMaxExpiryDays(query) {
    const rows = await query(
        `SELECT value FROM app_settings WHERE key = 'shared_catalog_max_expiry_days' LIMIT 1`,
    );
    const n = parseInt(String(rows[0]?.value ?? ''), 10);
    return Number.isFinite(n) && n >= 1 && n <= 90 ? n : MAX_EXPIRY_DAYS_DEFAULT;
}

async function upsertSharedCatalogExpiryOptions(query, options) {
    const parsed = parseExpiryOptions(options);
    await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('shared_catalog_expiry_options', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [JSON.stringify(parsed)],
    );
    return parsed;
}

async function upsertSharedCatalogMaxExpiryDays(query, days) {
    const n = parseInt(String(days), 10);
    const val = Number.isFinite(n) && n >= 1 && n <= 90 ? n : MAX_EXPIRY_DAYS_DEFAULT;
    await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('shared_catalog_max_expiry_days', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
        [String(val)],
    );
    return val;
}

module.exports = {
    DEFAULT_EXPIRY_OPTIONS,
    parseExpiryOptions,
    getSharedCatalogExpiryOptions,
    getSharedCatalogMaxExpiryDays,
    upsertSharedCatalogExpiryOptions,
    upsertSharedCatalogMaxExpiryDays,
};

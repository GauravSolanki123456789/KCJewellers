/**
 * Reseller shared / WhatsApp catalogue limits + inquiry analytics.
 */
const PLATFORM_MAX_PRODUCTS = 500;
const DEFAULT_MAX_PRODUCTS = 50;
const DEFAULT_DAILY_LIMIT = 10;

function clampInt(n, lo, hi) {
    const v = parseInt(String(n), 10);
    if (!Number.isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
}

function istDayBoundsUtc() {
    const now = new Date();
    const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const y = istNow.getUTCFullYear();
    const m = istNow.getUTCMonth();
    const d = istNow.getUTCDate();
    const startIst = Date.UTC(y, m, d, 0, 0, 0, 0);
    const endIst = Date.UTC(y, m, d, 23, 59, 59, 999);
    return {
        start: new Date(startIst - istOffsetMs),
        end: new Date(endIst - istOffsetMs),
    };
}

/** Resolve analytics window from `period` query (today | 7 | 30 | 90). */
function analyticsWindow(periodRaw) {
    const p = String(periodRaw || '30').trim().toLowerCase();
    if (p === 'today') {
        const { start, end } = istDayBoundsUtc();
        return { since: start, until: end, label: 'today', days: 1 };
    }
    const days = clampInt(p, 1, 365);
    return {
        since: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        until: null,
        label: String(days),
        days,
    };
}

async function ensureSharedCatalogLimitColumns(pool) {
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_catalog_max_products INTEGER NOT NULL DEFAULT 50;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_catalog_daily_limit INTEGER NOT NULL DEFAULT 10;
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS shared_catalog_inquiries (
            id SERIAL PRIMARY KEY,
            shared_catalog_id UUID REFERENCES shared_catalogs(id) ON DELETE SET NULL,
            reseller_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
            line_count INTEGER NOT NULL DEFAULT 0,
            total_pieces INTEGER NOT NULL DEFAULT 0,
            total_inr NUMERIC(14, 2),
            lines_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            catalog_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_reseller_created
            ON shared_catalog_inquiries (reseller_user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_shared_catalog_inquiries_catalog
            ON shared_catalog_inquiries (shared_catalog_id);
    `);
}

function resolveResellerCatalogLimits(userRow) {
    const rawMax = userRow?.reseller_catalog_max_products;
    const rawDaily = userRow?.reseller_catalog_daily_limit;
    const maxProducts =
        rawMax == null || rawMax === ''
            ? DEFAULT_MAX_PRODUCTS
            : clampInt(rawMax, 0, PLATFORM_MAX_PRODUCTS);
    const dailyLimit =
        rawDaily == null || rawDaily === ''
            ? DEFAULT_DAILY_LIMIT
            : clampInt(rawDaily, 0, 1000);
    return {
        maxProducts,
        dailyLimit,
        maxProductsUnlimited: maxProducts === 0,
        dailyLimitUnlimited: dailyLimit === 0,
        platformMaxProducts: PLATFORM_MAX_PRODUCTS,
    };
}

async function countResellerCatalogGenerationsToday(query, userId) {
    const { start, end } = istDayBoundsUtc();
    const rows = await query(
        `SELECT COUNT(*)::int AS n
         FROM shared_catalogs
         WHERE created_by_user_id = $1
           AND created_at >= $2
           AND created_at <= $3`,
        [userId, start, end],
    );
    return rows[0]?.n ?? 0;
}

async function getResellerCatalogLimitStatus(query, userId) {
    const urows = await query(
        `SELECT id, customer_tier,
                COALESCE(reseller_catalog_max_products, 50) AS reseller_catalog_max_products,
                COALESCE(reseller_catalog_daily_limit, 10) AS reseller_catalog_daily_limit
         FROM users WHERE id = $1`,
        [userId],
    );
    if (!urows.length) {
        return {
            tier: null,
            ...resolveResellerCatalogLimits({}),
            generationsToday: 0,
            generationsRemaining: DEFAULT_DAILY_LIMIT,
            canGenerate: false,
        };
    }
    const row = urows[0];
    const tier = String(row.customer_tier || '').toUpperCase();
    const limits = resolveResellerCatalogLimits(row);
    const generationsToday =
        tier === 'RESELLER' ? await countResellerCatalogGenerationsToday(query, userId) : 0;
    let generationsRemaining = null;
    let canGenerate = true;
    if (tier === 'RESELLER' && !limits.dailyLimitUnlimited) {
        generationsRemaining = Math.max(0, limits.dailyLimit - generationsToday);
        canGenerate = generationsRemaining > 0;
    }
    return {
        tier,
        ...limits,
        generationsToday,
        generationsRemaining,
        canGenerate,
    };
}

async function assertResellerCanCreateCatalog(query, userId, productCount) {
    const status = await getResellerCatalogLimitStatus(query, userId);
    if (status.tier !== 'RESELLER') return status;
    const n = clampInt(productCount, 1, PLATFORM_MAX_PRODUCTS);
    if (!status.maxProductsUnlimited && n > status.maxProducts) {
        const err = new Error(
            `You can include at most ${status.maxProducts} products per catalogue. Remove ${n - status.maxProducts} item(s) or ask KC admin to raise your limit.`,
        );
        err.status = 403;
        err.code = 'CATALOG_PRODUCT_LIMIT';
        throw err;
    }
    if (!status.canGenerate) {
        const err = new Error(
            `Daily catalogue limit reached (${status.dailyLimit} per day). Try again tomorrow or ask KC admin to increase your limit.`,
        );
        err.status = 403;
        err.code = 'CATALOG_DAILY_LIMIT';
        throw err;
    }
    return status;
}

async function logSharedCatalogInquiry(query, payload) {
    const {
        sharedCatalogId,
        resellerUserId,
        source,
        lineCount,
        totalPieces,
        totalInr,
        lines,
        catalogUrl,
    } = payload;
    const rows = await query(
        `INSERT INTO shared_catalog_inquiries (
            shared_catalog_id, reseller_user_id, source, line_count, total_pieces, total_inr, lines_json, catalog_url
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8)
         RETURNING id, created_at`,
        [
            sharedCatalogId || null,
            resellerUserId || null,
            String(source || 'whatsapp').slice(0, 32),
            clampInt(lineCount, 0, 9999),
            clampInt(totalPieces, 0, 999999),
            totalInr != null && Number.isFinite(Number(totalInr)) ? Number(totalInr) : null,
            JSON.stringify(Array.isArray(lines) ? lines : []),
            catalogUrl || null,
        ],
    );
    return rows[0];
}

async function getAdminResellerCatalogAnalytics(query, opts = {}) {
    const win = analyticsWindow(opts.period ?? opts.days ?? 30);
    const since = win.since;
    const until = win.until;
    const timeParams = until ? [since, until] : [since];
    const inquiryTimeSql = until
        ? 'sci.created_at >= $1 AND sci.created_at <= $2'
        : 'sci.created_at >= $1';
    const catalogTimeSql = until
        ? 'sc.created_at >= $1 AND sc.created_at <= $2'
        : 'sc.created_at >= $1';

    const summary = await query(
        `SELECT
            COUNT(*)::int AS links_created,
            COUNT(*) FILTER (WHERE expires_at <= NOW())::int AS links_expired,
            COUNT(DISTINCT created_by_user_id)::int AS resellers_active
         FROM shared_catalogs
         WHERE ${catalogTimeSql.replace(/\bsc\./g, '')}`,
        timeParams,
    );

    const inquiryAgg = await query(
        `SELECT
            COUNT(*)::int AS inquiry_count,
            COALESCE(SUM(total_pieces), 0)::int AS total_pieces,
            COALESCE(SUM(total_inr), 0)::float AS total_inr
         FROM shared_catalog_inquiries
         WHERE ${inquiryTimeSql.replace(/\bsci\./g, '')}`,
        timeParams,
    );

    // Separate sub-aggregates — never JOIN links + inquiries (Cartesian product inflated totals).
    const byReseller = await query(
        `SELECT
            u.id AS reseller_id,
            COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
            u.custom_domain,
            COALESCE(sc_stats.links_created, 0)::int AS links_created,
            COALESCE(sci_stats.inquiry_count, 0)::int AS inquiry_count,
            COALESCE(sci_stats.total_pieces, 0)::int AS total_pieces,
            COALESCE(sci_stats.total_inr, 0)::float AS total_inr,
            sci_stats.last_inquiry_at
         FROM users u
         LEFT JOIN (
            SELECT created_by_user_id, COUNT(*)::int AS links_created
            FROM shared_catalogs
            WHERE ${catalogTimeSql.replace(/\bsc\./g, '')}
            GROUP BY created_by_user_id
         ) sc_stats ON sc_stats.created_by_user_id = u.id
         LEFT JOIN (
            SELECT reseller_user_id,
                   COUNT(*)::int AS inquiry_count,
                   COALESCE(SUM(total_pieces), 0)::int AS total_pieces,
                   COALESCE(SUM(total_inr), 0)::float AS total_inr,
                   MAX(created_at) AS last_inquiry_at
            FROM shared_catalog_inquiries
            WHERE ${inquiryTimeSql.replace(/\bsci\./g, '')}
            GROUP BY reseller_user_id
         ) sci_stats ON sci_stats.reseller_user_id = u.id
         WHERE UPPER(COALESCE(u.customer_tier, '')) = 'RESELLER'
           AND (
             COALESCE(sc_stats.links_created, 0) > 0
             OR COALESCE(sci_stats.inquiry_count, 0) > 0
           )
         ORDER BY COALESCE(sci_stats.total_inr, 0) DESC, COALESCE(sci_stats.inquiry_count, 0) DESC`,
        timeParams,
    );

    const recentInquiries = await query(
        `SELECT sci.id, sci.shared_catalog_id, sci.reseller_user_id, sci.source,
                sci.line_count, sci.total_pieces, sci.total_inr, sci.lines_json,
                sci.catalog_url, sci.created_at,
                COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
                u.custom_domain AS reseller_domain
         FROM shared_catalog_inquiries sci
         LEFT JOIN users u ON u.id = sci.reseller_user_id
         WHERE ${inquiryTimeSql}
         ORDER BY sci.created_at DESC
         LIMIT 200`,
        timeParams,
    );

    return {
        period: win.label,
        days: win.days,
        since: since.toISOString(),
        until: until ? until.toISOString() : null,
        summary: {
            linksCreated: summary[0]?.links_created ?? 0,
            linksExpired: summary[0]?.links_expired ?? 0,
            resellersActive: summary[0]?.resellers_active ?? 0,
            inquiryCount: inquiryAgg[0]?.inquiry_count ?? 0,
            totalPieces: inquiryAgg[0]?.total_pieces ?? 0,
            totalInr: inquiryAgg[0]?.total_inr ?? 0,
        },
        byReseller,
        recentInquiries: recentInquiries.map((row) => ({
            ...row,
            total_inr: row.total_inr != null ? Number(row.total_inr) : null,
            lines: Array.isArray(row.lines_json)
                ? row.lines_json
                : row.lines_json && typeof row.lines_json === 'object'
                  ? row.lines_json
                  : [],
        })),
    };
}

async function getAdminResellerCatalogInquiries(query, opts = {}) {
    const win = analyticsWindow(opts.period ?? opts.days ?? 30);
    const since = win.since;
    const until = win.until;
    const params = until ? [since, until] : [since];
    let paramIdx = params.length + 1;
    const timeSql = until
        ? 'sci.created_at >= $1 AND sci.created_at <= $2'
        : 'sci.created_at >= $1';
    let resellerFilter = '';
    if (opts.resellerId != null) {
        const rid = parseInt(String(opts.resellerId), 10);
        if (Number.isFinite(rid) && rid > 0) {
            resellerFilter = ` AND sci.reseller_user_id = $${paramIdx++}`;
            params.push(rid);
        }
    }
    const limit = clampInt(opts.limit ?? 100, 1, 500);
    params.push(limit);

    const rows = await query(
        `SELECT sci.id, sci.shared_catalog_id, sci.reseller_user_id, sci.source,
                sci.line_count, sci.total_pieces, sci.total_inr, sci.lines_json,
                sci.catalog_url, sci.created_at,
                COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
                u.custom_domain AS reseller_domain
         FROM shared_catalog_inquiries sci
         LEFT JOIN users u ON u.id = sci.reseller_user_id
         WHERE ${timeSql}${resellerFilter}
         ORDER BY sci.created_at DESC
         LIMIT $${paramIdx}`,
        params,
    );

    return rows.map((row) => ({
        ...row,
        total_inr: row.total_inr != null ? Number(row.total_inr) : null,
        lines: Array.isArray(row.lines_json)
            ? row.lines_json
            : typeof row.lines_json === 'string'
              ? (() => {
                    try {
                        return JSON.parse(row.lines_json);
                    } catch {
                        return [];
                    }
                })()
              : [],
    }));
}

module.exports = {
    PLATFORM_MAX_PRODUCTS,
    DEFAULT_MAX_PRODUCTS,
    DEFAULT_DAILY_LIMIT,
    ensureSharedCatalogLimitColumns,
    resolveResellerCatalogLimits,
    countResellerCatalogGenerationsToday,
    getResellerCatalogLimitStatus,
    assertResellerCanCreateCatalog,
    logSharedCatalogInquiry,
    getAdminResellerCatalogAnalytics,
    getAdminResellerCatalogInquiries,
    analyticsWindow,
};

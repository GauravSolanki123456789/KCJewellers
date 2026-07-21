/**
 * Reseller shared / WhatsApp catalogue limits + inquiry analytics.
 */
const PLATFORM_MAX_PRODUCTS = 500;
const DEFAULT_MAX_PRODUCTS = 50;
const DEFAULT_DAILY_LIMIT = 10;

const INQUIRY_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    NO_SALE: 'no_sale',
};

/** Count in quoted totals — excludes no_sale. */
const COUNTABLE_INQUIRY_STATUS_SQL = `COALESCE(inquiry_status, 'pending') IN ('pending', 'completed')`;

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
    await pool.query(`
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS inquiry_status VARCHAR(24) NOT NULL DEFAULT 'pending';
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ;
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS status_note TEXT;
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS customer_mobile VARCHAR(10);
        ALTER TABLE shared_catalog_inquiries
            ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
    `);
}

function normalizeInquiryStatus(raw) {
    const s = String(raw || INQUIRY_STATUS.PENDING).trim().toLowerCase();
    if (s === INQUIRY_STATUS.COMPLETED) return INQUIRY_STATUS.COMPLETED;
    if (s === INQUIRY_STATUS.NO_SALE) return INQUIRY_STATUS.NO_SALE;
    return INQUIRY_STATUS.PENDING;
}

function mapInquiryRow(row) {
    if (!row) return row;
    return {
        ...row,
        inquiry_status: normalizeInquiryStatus(row.inquiry_status),
        total_inr: row.total_inr != null ? Number(row.total_inr) : null,
        lines: Array.isArray(row.lines_json)
            ? row.lines_json
            : row.lines_json && typeof row.lines_json === 'object'
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
    };
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

const {
    normalizeStoredMobile,
    mobilesMatch,
} = require('./internationalMobile');

/**
 * Session cookie may be unavailable on reseller custom domains (cross-site).
 * Fall back to customer id + mobile from the client after OTP / register-mobile.
 */
async function resolveInquiryCustomerIdentity(query, req, body) {
    if (req?.isAuthenticated && req.isAuthenticated()) {
        const mobile = normalizeStoredMobile(req.user?.mobile_number);
        if (mobile.length >= 8 && req.user?.id != null) {
            const name =
                req.user?.name != null && String(req.user.name).trim()
                    ? String(req.user.name).trim()
                    : `Customer ${mobile.slice(-4)}`;
            return {
                customerUserId: req.user.id,
                customerMobile: mobile,
                customerName: name,
            };
        }
    }

    const userId = parseInt(String(body?.customerUserId ?? body?.customer_user_id ?? ''), 10);
    const mobile = normalizeStoredMobile(body?.customerMobile ?? body?.customer_mobile);
    if (!Number.isFinite(userId) || userId <= 0 || mobile.length < 8) {
        return null;
    }

    const rows = await query('SELECT id, mobile_number, name FROM users WHERE id = $1', [userId]);
    if (!rows.length) return null;
    const dbMobile = normalizeStoredMobile(rows[0].mobile_number);
    if (!mobilesMatch(dbMobile, mobile)) return null;

    const rawName = body?.customerName ?? body?.customer_name ?? rows[0].name;
    const customerName =
        rawName != null && String(rawName).trim()
            ? String(rawName).trim().slice(0, 255)
            : `Customer ${mobile.slice(-4)}`;

    return {
        customerUserId: userId,
        customerMobile: mobile,
        customerName,
    };
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
        customerUserId,
        customerMobile,
        customerName,
    } = payload;
    const mobile =
        customerMobile != null ? normalizeStoredMobile(customerMobile) : '';
    const normalizedLines = Array.isArray(lines) ? lines : [];
    const linesJson = JSON.stringify(normalizedLines);
    const totalInrVal =
        totalInr != null && Number.isFinite(Number(totalInr)) ? Number(totalInr) : null;

    // Idempotent: same customer + catalogue + shortlist within 15 minutes → one inquiry row.
    if (sharedCatalogId && mobile.length >= 8) {
        const dup = await query(
            `SELECT id, created_at
             FROM shared_catalog_inquiries
             WHERE shared_catalog_id = $1::uuid
               AND customer_mobile = $2
               AND LOWER(TRIM(source)) = LOWER(TRIM($3))
               AND line_count = $4
               AND total_pieces = $5
               AND (
                 (total_inr IS NULL AND $6::float8 IS NULL)
                 OR total_inr = $6::float8
               )
               AND lines_json = $7::jsonb
               AND created_at >= NOW() - INTERVAL '15 minutes'
             ORDER BY created_at DESC
             LIMIT 1`,
            [
                sharedCatalogId,
                mobile,
                String(source || 'whatsapp').slice(0, 32),
                clampInt(lineCount, 0, 9999),
                clampInt(totalPieces, 0, 999999),
                totalInrVal,
                linesJson,
            ],
        );
        if (dup.length) {
            return { ...dup[0], deduplicated: true };
        }
    }

    const rows = await query(
        `INSERT INTO shared_catalog_inquiries (
            shared_catalog_id, reseller_user_id, source, line_count, total_pieces, total_inr, lines_json, catalog_url,
            customer_user_id, customer_mobile, customer_name
         ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING id, created_at`,
        [
            sharedCatalogId || null,
            resellerUserId || null,
            String(source || 'whatsapp').slice(0, 32),
            clampInt(lineCount, 0, 9999),
            clampInt(totalPieces, 0, 999999),
            totalInrVal,
            linesJson,
            catalogUrl || null,
            customerUserId != null && Number.isFinite(Number(customerUserId)) ? Number(customerUserId) : null,
            mobile.length >= 8 ? mobile : null,
            customerName != null && String(customerName).trim() ? String(customerName).trim().slice(0, 255) : null,
        ],
    );
    return { ...rows[0], deduplicated: false };
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
            COUNT(*) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL})::int AS inquiry_count,
            COUNT(*) FILTER (WHERE inquiry_status = 'completed')::int AS completed_count,
            COALESCE(SUM(total_pieces) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::int AS total_pieces,
            COALESCE(SUM(total_inr) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::float AS total_inr,
            COALESCE(SUM(total_inr) FILTER (WHERE inquiry_status = 'completed'), 0)::float AS completed_inr,
            COUNT(*) FILTER (WHERE inquiry_status = 'no_sale')::int AS no_sale_count
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
            COALESCE(sci_stats.completed_count, 0)::int AS completed_count,
            COALESCE(sci_stats.total_pieces, 0)::int AS total_pieces,
            COALESCE(sci_stats.total_inr, 0)::float AS total_inr,
            COALESCE(sci_stats.completed_inr, 0)::float AS completed_inr,
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
                   COUNT(*) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL})::int AS inquiry_count,
                   COUNT(*) FILTER (WHERE inquiry_status = 'completed')::int AS completed_count,
                   COALESCE(SUM(total_pieces) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::int AS total_pieces,
                   COALESCE(SUM(total_inr) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::float AS total_inr,
                   COALESCE(SUM(total_inr) FILTER (WHERE inquiry_status = 'completed'), 0)::float AS completed_inr,
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
                sci.catalog_url, sci.created_at, sci.inquiry_status, sci.status_updated_at,
                sci.status_note,
                sci.customer_user_id, sci.customer_mobile, sci.customer_name,
                COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
                u.custom_domain AS reseller_domain
         FROM shared_catalog_inquiries sci
         LEFT JOIN users u ON u.id = sci.reseller_user_id
         WHERE ${inquiryTimeSql}
         ORDER BY sci.created_at DESC
         LIMIT 200`,
        timeParams,
    );

    let resellerDetail = null;
    const filterResellerId = parseInt(String(opts.resellerId ?? ''), 10);
    if (Number.isFinite(filterResellerId) && filterResellerId > 0) {
        const urows = await query(
            `SELECT id, COALESCE(NULLIF(TRIM(business_name), ''), email) AS reseller_label, custom_domain
             FROM users WHERE id = $1`,
            [filterResellerId],
        );
        const row = byReseller.find((r) => Number(r.reseller_id) === filterResellerId);
        resellerDetail = {
            resellerId: filterResellerId,
            resellerLabel: urows[0]?.reseller_label ?? row?.reseller_label ?? 'Reseller',
            customDomain: urows[0]?.custom_domain ?? row?.custom_domain ?? null,
            linksCreated: row?.links_created ?? 0,
            inquiryCount: row?.inquiry_count ?? 0,
            completedCount: row?.completed_count ?? 0,
            totalPieces: row?.total_pieces ?? 0,
            totalInr: row?.total_inr ?? 0,
            completedInr: row?.completed_inr ?? 0,
            lastInquiryAt: row?.last_inquiry_at ?? null,
        };
    }

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
            completedCount: inquiryAgg[0]?.completed_count ?? 0,
            totalPieces: inquiryAgg[0]?.total_pieces ?? 0,
            totalInr: inquiryAgg[0]?.total_inr ?? 0,
            completedInr: inquiryAgg[0]?.completed_inr ?? 0,
            noSaleCount: inquiryAgg[0]?.no_sale_count ?? 0,
        },
        byReseller,
        resellerDetail,
        recentInquiries: recentInquiries
            .filter((row) => {
                if (!Number.isFinite(filterResellerId) || filterResellerId <= 0) return true;
                return Number(row.reseller_user_id) === filterResellerId;
            })
            .map(mapInquiryRow),
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
                sci.catalog_url, sci.created_at, sci.inquiry_status, sci.status_updated_at,
                sci.status_note,
                sci.customer_user_id, sci.customer_mobile, sci.customer_name,
                COALESCE(NULLIF(TRIM(u.business_name), ''), u.email) AS reseller_label,
                u.custom_domain AS reseller_domain
         FROM shared_catalog_inquiries sci
         LEFT JOIN users u ON u.id = sci.reseller_user_id
         WHERE ${timeSql}${resellerFilter}
         ORDER BY sci.created_at DESC
         LIMIT $${paramIdx}`,
        params,
    );

    return rows.map(mapInquiryRow);
}

async function updateSharedCatalogInquiryStatus(query, inquiryId, status, opts = {}) {
    const id = parseInt(String(inquiryId), 10);
    if (!Number.isFinite(id) || id <= 0) {
        const err = new Error('Invalid inquiry id');
        err.status = 400;
        throw err;
    }
    const normalized = normalizeInquiryStatus(status);
    const note =
        opts.note != null && String(opts.note).trim()
            ? String(opts.note).trim().slice(0, 500)
            : null;
    let ownerFilter = '';
    const params = [normalized, note, id];
    if (opts.resellerUserId != null) {
        ownerFilter = ' AND reseller_user_id = $4';
        params.push(parseInt(String(opts.resellerUserId), 10));
    }
    const rows = await query(
        `UPDATE shared_catalog_inquiries
         SET inquiry_status = $1,
             status_note = COALESCE($2, status_note),
             status_updated_at = NOW()
         WHERE id = $3${ownerFilter}
         RETURNING id, inquiry_status, status_updated_at, status_note, reseller_user_id`,
        params,
    );
    if (!rows.length) {
        const err = new Error('Inquiry not found');
        err.status = 404;
        throw err;
    }
    return rows[0];
}

async function countCatalogInquiriesAttention(query, since = null) {
    const base = `SELECT COUNT(*)::int AS n FROM shared_catalog_inquiries
                  WHERE inquiry_status = 'pending' AND created_at >= NOW() - INTERVAL '30 days'`;
    if (since) {
        const rows = await query(`${base} AND created_at > $1`, [since]);
        return rows[0]?.n ?? 0;
    }
    const rows = await query(base);
    return rows[0]?.n ?? 0;
}

async function getResellerCatalogInquiriesSummary(query, resellerUserId, opts = {}) {
    const win = analyticsWindow(opts.period ?? opts.days ?? 30);
    const since = win.since;
    const until = win.until;
    const params = until ? [since, until, resellerUserId] : [since, resellerUserId];
    const timeSql = until
        ? 'created_at >= $1 AND created_at <= $2 AND reseller_user_id = $3'
        : 'created_at >= $1 AND reseller_user_id = $2';

    const agg = await query(
        `SELECT
            COUNT(*) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL})::int AS inquiry_count,
            COUNT(*) FILTER (WHERE inquiry_status = 'completed')::int AS completed_count,
            COUNT(*) FILTER (WHERE inquiry_status = 'pending')::int AS pending_count,
            COALESCE(SUM(total_pieces) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::int AS total_pieces,
            COALESCE(SUM(total_inr) FILTER (WHERE ${COUNTABLE_INQUIRY_STATUS_SQL}), 0)::float AS quoted_inr,
            COALESCE(SUM(total_inr) FILTER (WHERE inquiry_status = 'completed'), 0)::float AS completed_inr
         FROM shared_catalog_inquiries
         WHERE ${timeSql}`,
        params,
    );

    const inquiries = await getAdminResellerCatalogInquiries(query, {
        period: opts.period ?? opts.days ?? 30,
        resellerId: resellerUserId,
        limit: opts.limit ?? 100,
    });

    return {
        period: win.label,
        since: since.toISOString(),
        until: until ? until.toISOString() : null,
        summary: {
            inquiryCount: agg[0]?.inquiry_count ?? 0,
            completedCount: agg[0]?.completed_count ?? 0,
            pendingCount: agg[0]?.pending_count ?? 0,
            totalPieces: agg[0]?.total_pieces ?? 0,
            quotedInr: agg[0]?.quoted_inr ?? 0,
            completedInr: agg[0]?.completed_inr ?? 0,
        },
        inquiries,
    };
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
    resolveInquiryCustomerIdentity,
    getAdminResellerCatalogAnalytics,
    getAdminResellerCatalogInquiries,
    updateSharedCatalogInquiryStatus,
    countCatalogInquiriesAttention,
    getResellerCatalogInquiriesSummary,
    analyticsWindow,
    INQUIRY_STATUS,
    normalizeInquiryStatus,
};

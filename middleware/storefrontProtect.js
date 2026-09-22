/**
 * Storefront protection — block catalog/data theft from unknown hosts and mirror sites.
 * Legitimate: kcjewellers.co.in, registered reseller custom_domain, SSR with shared secret.
 */
const { getClientIp } = require('./rateLimit');

const CATALOG_DATA_PREFIXES = [
    '/api/catalog',
    '/api/rates/display',
    '/api/rates/live',
    '/api/products',
    '/api/search',
];

const PLATFORM_HOSTS = new Set([
    'kcjewellers.co.in',
    'www.kcjewellers.co.in',
    'localhost',
    '127.0.0.1',
]);

function parseHostFromHeaderValue(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    try {
        if (/^https?:\/\//i.test(s)) {
            return normalizeHostname(new URL(s).hostname);
        }
    } catch {
        /* fall through */
    }
    const host = s.split('/')[0].split(':')[0].trim().toLowerCase();
    return host || null;
}

function normalizeHostname(hostname) {
    const h = String(hostname || '').split(':')[0].trim().toLowerCase();
    if (!h) return '';
    return h.replace(/^www\./, '');
}

function blockedScraperHosts() {
    const fromEnv = String(process.env.SCRAPER_BLOCKED_HOSTS || '')
        .split(',')
        .map((s) => normalizeHostname(s))
        .filter(Boolean);
    const defaults = ['reddicecricket.com'];
    return new Set([...defaults, ...fromEnv]);
}

function requestPath(req) {
    return String(req.path || req.url || '').split('?')[0];
}

function isCatalogDataPath(path) {
    return CATALOG_DATA_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p));
}

function isUploadPath(path) {
    return path === '/uploads' || path.startsWith('/uploads/');
}

function hasValidSsrSecret(req) {
    const expected = String(process.env.STOREFRONT_SSR_SECRET || '').trim();
    if (!expected) return process.env.NODE_ENV !== 'production';
    return String(req.headers['x-kc-storefront-ssr'] || '') === expected;
}

function originHostAllowedSync(originHost, allowedOrigins) {
    if (!originHost) return false;
    if (PLATFORM_HOSTS.has(originHost) || originHost.endsWith('.kcjewellers.co.in')) return true;
    for (const o of allowedOrigins || []) {
        try {
            const h = normalizeHostname(new URL(o).hostname);
            if (h && h === originHost) return true;
        } catch {
            /* ignore */
        }
    }
    return false;
}

function createStorefrontProtect({ query, allowedOrigins = [] }) {
    const resellerHostCache = new Map();
    const RESELLER_CACHE_MS = 120000;
    const blockedHosts = blockedScraperHosts();

    async function isRegisteredResellerHost(hostname) {
        const h = normalizeHostname(hostname);
        if (!h) return false;
        const now = Date.now();
        const cached = resellerHostCache.get(h);
        if (cached && now - cached.at < RESELLER_CACHE_MS) return cached.ok;
        let ok = false;
        try {
            const rows = await query(
                `SELECT 1 FROM users
                 WHERE UPPER(TRIM(COALESCE(customer_tier::text, ''))) = 'RESELLER'
                   AND NULLIF(TRIM(custom_domain), '') IS NOT NULL
                   AND LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(custom_domain), '^https?://', '', 'i'), '/.*$', ''), '^www\.', '', 'i'))) = $1
                 LIMIT 1`,
                [h],
            );
            ok = rows.length > 0;
        } catch {
            ok = false;
        }
        resellerHostCache.set(h, { ok, at: now });
        return ok;
    }

    async function isAllowedRequestHost(hostname) {
        const h = normalizeHostname(hostname);
        if (!h) return false;
        if (blockedHosts.has(h)) return false;
        if (PLATFORM_HOSTS.has(h) || h.endsWith('.kcjewellers.co.in')) return true;
        if (originHostAllowedSync(h, allowedOrigins)) return true;
        return isRegisteredResellerHost(h);
    }

    async function storefrontProtectMiddleware(req, res, next) {
        const path = requestPath(req);
        const refererHost = parseHostFromHeaderValue(req.headers.referer);
        const originHost = parseHostFromHeaderValue(req.headers.origin);

        for (const h of [refererHost, originHost]) {
            if (h && blockedHosts.has(h)) {
                res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        if ((req.method === 'GET' || req.method === 'HEAD') && isUploadPath(path)) {
            return next();
        }

        const needsCatalogGuard =
            (req.method === 'GET' || req.method === 'HEAD') && isCatalogDataPath(path);

        if (!needsCatalogGuard) return next();

        if (req.isAuthenticated && req.isAuthenticated()) return next();
        if (hasValidSsrSecret(req)) return next();

        const candidateHosts = [originHost, refererHost].filter(Boolean);
        for (const h of candidateHosts) {
            if (await isAllowedRequestHost(h)) {
                res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
                return next();
            }
        }

        if (!originHost && !refererHost) {
            if (process.env.NODE_ENV !== 'production') return next();
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            return res.status(403).json({ error: 'Forbidden' });
        }

        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        return res.status(403).json({ error: 'Forbidden' });
    }

    async function isStorefrontHostAllowedPublic(hostname) {
        const h = normalizeHostname(hostname);
        if (!h) return false;
        if (blockedHosts.has(h)) return false;
        return isAllowedRequestHost(h);
    }

    return { storefrontProtectMiddleware, isStorefrontHostAllowedPublic, normalizeHostname };
}

module.exports = { createStorefrontProtect, normalizeHostname, PLATFORM_HOSTS };

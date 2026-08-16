const buckets = new Map();

function now() {
  return Date.now();
}

/** Resolve client IP behind reverse proxies (nginx, Cloudflare, etc.). */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri.trim()) return xri.trim();
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

const PUBLIC_STOREFRONT_GET_PREFIXES = [
  '/api/catalog',
  '/api/rates/display',
  '/api/rates/live',
  '/api/public/',
  '/api/shared-catalog/',
];

function isPublicStorefrontRead(req) {
  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') return false;
  const path = String(req.path || req.url || '').split('?')[0];
  return PUBLIC_STOREFRONT_GET_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix),
  );
}

function pruneBuckets(win) {
  if (buckets.size < 5000) return;
  const t = now();
  for (const [k, b] of buckets) {
    if (t - b.ts > win) buckets.delete(k);
  }
}

function createRateLimiter({
  windowMs,
  max,
  key = getClientIp,
  message = 'Too many requests',
  namespace = 'default',
}) {
  const win = Math.max(1000, Number(windowMs || 60000));
  const limit = Math.max(1, Number(max || 60));
  return (req, res, next) => {
    try {
      const ip = key(req) || 'unknown';
      const k = `${namespace}:${ip}`;
      const t = now();
      let b = buckets.get(k);
      if (!b || t - b.ts > win) {
        b = { ts: t, n: 0 };
      }
      b.n += 1;
      buckets.set(k, b);
      pruneBuckets(win);
      if (b.n > limit) {
        res.setHeader('Retry-After', Math.ceil((b.ts + win - t) / 1000));
        return res.status(429).json({ error: message });
      }
      next();
    } catch {
      next();
    }
  };
}

/** Baseline API limit — per client IP, namespaced so auth/admin counters stay separate. */
const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8000,
  namespace: 'global',
  message: 'Rate limit exceeded',
});

/** Storefront catalogue + rates reads — generous limit; normal browsing must not 429. */
const publicReadLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120000,
  namespace: 'public',
  message: 'Rate limit exceeded',
});

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8000,
  namespace: 'auth',
  message: 'Too many auth attempts',
});

const adminLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8000,
  namespace: 'admin',
  message: 'Admin rate limit exceeded',
});

/** Session read — high traffic from layout/nav; keep separate from auth POST limits. */
const authSessionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30000,
  namespace: 'auth-session',
  message: 'Too many session checks',
});

function skipRateLimitForCurrentUser(req, res, next) {
  const path = String(req.path || '');
  if (req.method === 'GET' && path === '/api/auth/current_user') {
    return authSessionLimiter(req, res, next);
  }
  if (req.method === 'GET' && path.startsWith('/auth/')) {
    return authSessionLimiter(req, res, next);
  }
  if (isPublicStorefrontRead(req)) {
    return publicReadLimiter(req, res, next);
  }
  return globalLimiter(req, res, next);
}

function requireJson(req, res, next) {
  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS' ||
    req.method === 'DELETE'
  ) {
    return next();
  }
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('application/json')) {
    return res.status(415).json({
      error: 'Unsupported Media Type. Use application/json',
    });
  }
  next();
}

module.exports = {
  createRateLimiter,
  getClientIp,
  isPublicStorefrontRead,
  globalLimiter,
  publicReadLimiter,
  authLimiter,
  authSessionLimiter,
  adminLimiter,
  skipRateLimitForCurrentUser,
  requireJson,
};

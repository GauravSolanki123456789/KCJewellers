/**
 * Early-request anti-scraping layer — blocks common automated clients on public/catalog
 * routes without changing UI. Legitimate integrations (webhooks, Posh RFID, health) bypass.
 */
const { getClientIp } = require('./rateLimit');

const SCRAPER_UA_PATTERNS = [
  /scrapy/i,
  /python-requests/i,
  /python-urllib/i,
  /aiohttp/i,
  /httpx/i,
  /go-http-client/i,
  /java\/[\d.]+/i,
  /libwww-perl/i,
  /mechanize/i,
  /phantomjs/i,
  /headlesschrome/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /curl\/[\d.]+/i,
  /wget/i,
  /okhttp/i,
  /axios\/[\d.]+/i,
  /node-fetch/i,
  /undici/i,
  /postman/i,
  /insomnia/i,
  /httpclient/i,
  /apache-httpclient/i,
  /colly/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /sqlmap/i,
  /nikto/i,
];

const BYPASS_PREFIXES = [
  '/api/external/',
  '/webhooks/',
  '/health',
  '/api/health',
  '/api/webhooks/',
  '/socket.io',
];

const SENSITIVE_PUBLIC_PREFIXES = [
  '/api/catalog',
  '/api/public/',
  '/api/shared-catalog/',
  '/api/rates/',
  '/uploads/',
  '/api/products',
  '/api/search',
];

const catalogHitBuckets = new Map();
const CATALOG_WINDOW_MS = 60 * 1000;
const CATALOG_MAX_HITS = 120;

function requestPath(req) {
  return String(req.path || req.url || '').split('?')[0];
}

function isBypassPath(path) {
  return BYPASS_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function isSensitivePublicPath(path) {
  return SENSITIVE_PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function looksLikeScraperUa(ua) {
  const s = String(ua || '').trim();
  if (!s) return false;
  return SCRAPER_UA_PATTERNS.some((re) => re.test(s));
}

function hasBrowserSignals(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (/Mozilla\/5\.0/i.test(ua) && /(Chrome|Firefox|Safari|Edg|Opera)/i.test(ua)) {
    return true;
  }
  const accept = String(req.headers.accept || '');
  if (accept.includes('text/html') || accept.includes('application/json')) {
    return true;
  }
  return false;
}

function hasSessionCookie(req) {
  const cookie = String(req.headers.cookie || '');
  return /connect\.sid=|session=|kc_session=/i.test(cookie);
}

function catalogRateKey(req) {
  return `${getClientIp(req)}:${requestPath(req).split('/').slice(0, 4).join('/')}`;
}

function pruneCatalogBuckets() {
  if (catalogHitBuckets.size < 8000) return;
  const t = Date.now();
  for (const [k, b] of catalogHitBuckets) {
    if (t - b.ts > CATALOG_WINDOW_MS) catalogHitBuckets.delete(k);
  }
}

function catalogBurstLimiter(req, res, next) {
  const path = requestPath(req);
  if (!isSensitivePublicPath(path)) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  const key = catalogRateKey(req);
  const t = Date.now();
  let b = catalogHitBuckets.get(key);
  if (!b || t - b.ts > CATALOG_WINDOW_MS) {
    b = { ts: t, n: 0 };
  }
  b.n += 1;
  catalogHitBuckets.set(key, b);
  pruneCatalogBuckets();

  const suspicious = !hasBrowserSignals(req) || looksLikeScraperUa(req.headers['user-agent']);
  const limit = suspicious ? Math.floor(CATALOG_MAX_HITS / 3) : CATALOG_MAX_HITS;
  if (b.n > limit) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many requests' });
  }
  return next();
}

function antiScrapeMiddleware(req, res, next) {
  const path = requestPath(req);
  if (isBypassPath(path)) return next();

  const ua = String(req.headers['user-agent'] || '').trim();
  const isPublicRead =
    (req.method === 'GET' || req.method === 'HEAD') && isSensitivePublicPath(path);

  if (isPublicRead) {
    if (!ua && !hasSessionCookie(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (looksLikeScraperUa(ua) && !hasSessionCookie(req)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else if (looksLikeScraperUa(ua) && !hasSessionCookie(req) && path.startsWith('/api/')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return catalogBurstLimiter(req, res, next);
}

module.exports = {
  antiScrapeMiddleware,
  looksLikeScraperUa,
  isSensitivePublicPath,
};

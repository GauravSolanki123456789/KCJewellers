 const buckets = new Map();
 
 function now() { return Date.now(); }
 
 function createRateLimiter({ windowMs, max, key = (req) => req.ip, message = 'Too many requests' }) {
   const win = Math.max(1000, Number(windowMs || 60000));
   const limit = Math.max(1, Number(max || 60));
   return (req, res, next) => {
     try {
       const k = key(req) || req.ip || 'unknown';
       const t = now();
       let b = buckets.get(k);
       if (!b || t - b.ts > win) {
         b = { ts: t, n: 0 };
       }
       b.n += 1;
       buckets.set(k, b);
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
 
 const globalLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 120, message: 'Rate limit exceeded' });
 const authLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, message: 'Too many auth attempts' });
 const adminLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 100, message: 'Admin rate limit exceeded' });
 
 function requireJson(req, res, next) {
   if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
   const ct = String(req.headers['content-type'] || '').toLowerCase();
   if (!ct.includes('application/json')) {
     return res.status(415).json({ error: 'Unsupported Media Type. Use application/json' });
   }
   next();
 }
 
 module.exports = {
   createRateLimiter,
   globalLimiter,
   authLimiter,
   adminLimiter,
   requireJson
 };
 

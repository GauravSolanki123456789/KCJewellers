 function clampString(s, maxLen = 2000) {
   if (typeof s !== 'string') return s;
   let v = s.replace(/[\u0000-\u001F\u007F]/g, '');
   v = v.replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gis, '');
   v = v.trim();
   if (v.length > maxLen) v = v.slice(0, maxLen);
   return v;
 }
 
 function sanitizeValue(v) {
   if (v == null) return v;
   if (typeof v === 'string') return clampString(v);
   if (Array.isArray(v)) return v.map(sanitizeValue);
   if (typeof v === 'object') return sanitizeObject(v);
   if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
   if (typeof v === 'boolean') return v;
   return v;
 }
 
 function sanitizeObject(obj) {
   const out = Array.isArray(obj) ? [] : {};
   for (const k in obj) {
     if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
     if (k === '__proto__' || k === 'constructor') continue;
     out[k] = sanitizeValue(obj[k]);
   }
   return out;
 }
 
 function sanitizeMiddleware(maxLen) {
   return (req, _res, next) => {
     try {
       if (req.body && typeof req.body === 'object') req.body = sanitizeObject(req.body);
       if (req.query && typeof req.query === 'object') req.query = sanitizeObject(req.query);
       if (req.params && typeof req.params === 'object') req.params = sanitizeObject(req.params);
     } catch {}
     next();
   };
 }
 
 function validateNumbers(keys) {
   return (req, res, next) => {
     try {
       for (const k of keys) {
         const v = req.body?.[k];
         if (v !== undefined && !Number.isFinite(Number(v))) {
           return res.status(400).json({ error: `Invalid numeric field: ${k}` });
         }
       }
       next();
     } catch {
       return res.status(400).json({ error: 'Invalid payload' });
     }
   };
 }
 
 module.exports = {
   sanitizeMiddleware,
   validateNumbers
 };
 

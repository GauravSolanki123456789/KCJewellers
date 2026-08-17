 const DEFAULT_STRING_MAX = 2000;
 /** AI prompts and other long text fields — must not truncate master prompts. */
 const LONG_TEXT_FIELD_MAX = 50000;
 const LONG_TEXT_KEYS = new Set([
   'prompt_text',
   'negative_prompt',
   'bank_details',
   'review_notes',
   'notes',
   'canvas_text',
   'description',
   'body',
   'labelPrnTemplate',
  'billTemplate',
  'estimateTemplateGold',
  'estimateTemplateSilver',
  'label_prn_template',
  'bill_template',
  'estimate_template_gold',
  'estimate_template_silver',
  'template',
 ]);

 function maxLenForKey(key) {
   if (LONG_TEXT_KEYS.has(String(key || ''))) return LONG_TEXT_FIELD_MAX;
   return DEFAULT_STRING_MAX;
 }

function clampString(s, maxLen = DEFAULT_STRING_MAX, key = '') {
  if (typeof s !== 'string') return s;
  const preserveBreaks = LONG_TEXT_KEYS.has(String(key || ''));
  let v;
  if (preserveBreaks) {
    // Keep newlines and tabs for AI prompts / multi-line settings; strip other control chars.
    v = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    v = v.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Do not trim — PRN templates may start with a blank line on purpose.
  } else {
    v = s.replace(/[\u0000-\u001F\u007F]/g, '');
    v = v.trim();
  }
  v = v.replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gis, '');
  if (v.length > maxLen) v = v.slice(0, maxLen);
  return v;
}
 
 function sanitizeValue(v, key) {
   if (v == null) return v;
  if (typeof v === 'string') return clampString(v, maxLenForKey(key), key);
   if (Array.isArray(v)) return v.map((entry) => sanitizeValue(entry, key));
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
     out[k] = sanitizeValue(obj[k], k);
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
 

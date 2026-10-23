/** Force customer-facing text to ALL CAPS (ERP / CRM). */

function normalizeCustomerCapsField(raw, maxLen = 255) {
    const s = String(raw ?? '')
        .trim()
        .toUpperCase();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeCustomerAddressCaps(raw, maxLen = 2000) {
    const t = String(raw ?? '').trim();
    if (!t) return null;
    const lines = t
        .split(/\r?\n/)
        .map((line) => line.trim().toUpperCase())
        .filter(Boolean);
    const joined = lines.length ? lines.join('\n') : t.toUpperCase();
    return joined.length > maxLen ? joined.slice(0, maxLen) : joined;
}

module.exports = {
    normalizeCustomerCapsField,
    normalizeCustomerAddressCaps,
};

/**
 * International mobile parsing for shared-catalog customer sign-in.
 * Indian numbers stay as 10-digit national (backward compatible).
 * Foreign numbers stored as E.164 digits without '+' (e.g. 14155552671).
 */

function digitsOnly(raw) {
    return String(raw ?? '').replace(/\D/g, '');
}

/** True when digits represent a valid Indian mobile (10-digit national or 91-prefixed). */
function isIndianMobileDigits(digits) {
    const d = digitsOnly(digits);
    if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) return true;
    if (d.length === 12 && d.startsWith('91') && /^91[6-9]\d{9}$/.test(d)) return true;
    return false;
}

/** Normalize to storage form: Indian → 10 digits; international → full E.164 digits. */
function normalizeStoredMobile(raw) {
    const d = digitsOnly(raw);
    if (!d) return '';
    if (d.length === 12 && d.startsWith('91') && /^91[6-9]\d{9}$/.test(d)) {
        return d.slice(2);
    }
    if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) {
        return d;
    }
    return d;
}

/** Parse country code + national number into storage form. */
function parseInternationalMobileInput(countryCode, nationalNumber) {
    const cc = digitsOnly(countryCode).replace(/^0+/, '');
    const national = digitsOnly(nationalNumber).replace(/^0+/, '');
    if (!cc || !national) {
        return { ok: false, error: 'Enter country code and mobile number' };
    }
    const combined = `${cc}${national}`;
    if (cc === '91') {
        const indian = national.length === 10 ? national : combined.slice(-10);
        if (!/^[6-9]\d{9}$/.test(indian)) {
            return { ok: false, error: 'Enter a valid 10-digit Indian mobile number' };
        }
        return {
            ok: true,
            stored: indian,
            countryCode: '91',
            national: indian,
            isIndian: true,
            display: `+91 ${indian.slice(0, 5)} ${indian.slice(5)}`,
            whatsAppDigits: `91${indian}`,
        };
    }
    if (national.length < 4 || national.length > 14) {
        return { ok: false, error: 'Enter a valid mobile number for your country' };
    }
    if (combined.length < 8 || combined.length > 15) {
        return { ok: false, error: 'Mobile number looks too short or too long' };
    }
    return {
        ok: true,
        stored: combined,
        countryCode: cc,
        national,
        isIndian: false,
        display: `+${cc} ${national}`,
        whatsAppDigits: combined,
    };
}

/** Parse a full number string (may include + and spaces). */
function parseFullMobileInput(raw) {
    const d = digitsOnly(raw);
    if (!d) return { ok: false, error: 'Enter your mobile number' };
    if (isIndianMobileDigits(d)) {
        const indian = d.length === 12 ? d.slice(2) : d;
        return parseInternationalMobileInput('91', indian);
    }
    if (d.length >= 8 && d.length <= 15) {
        return {
            ok: true,
            stored: d,
            countryCode: d.slice(0, Math.min(3, d.length - 4)),
            national: d,
            isIndian: false,
            display: `+${d}`,
            whatsAppDigits: d,
        };
    }
    return { ok: false, error: 'Enter a valid mobile number' };
}

function mobilesMatch(a, b) {
    const na = normalizeStoredMobile(a);
    const nb = normalizeStoredMobile(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.length === 10 && nb === `91${na}`) return true;
    if (nb.length === 10 && na === `91${nb}`) return true;
    return false;
}

function formatStoredMobileDisplay(stored) {
    const n = normalizeStoredMobile(stored);
    if (!n) return null;
    if (n.length === 10 && /^[6-9]/.test(n)) {
        return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
    }
    if (n.startsWith('91') && n.length === 12) {
        const indian = n.slice(2);
        return `+91 ${indian.slice(0, 5)} ${indian.slice(5)}`;
    }
    return `+${n}`;
}

function whatsAppDigitsFromStored(stored) {
    const n = normalizeStoredMobile(stored);
    if (!n) return null;
    if (n.length === 10 && /^[6-9]/.test(n)) return `91${n}`;
    return n;
}

module.exports = {
    digitsOnly,
    isIndianMobileDigits,
    normalizeStoredMobile,
    parseInternationalMobileInput,
    parseFullMobileInput,
    mobilesMatch,
    formatStoredMobileDisplay,
    whatsAppDigitsFromStored,
};

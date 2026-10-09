/**
 * Jainav / shadow unlock sequence — validation (browser-safe) and comparison.
 */

const crypto = require('crypto');

const DEFAULT_SHADOW_SEQUENCE = 'F9Rs*';

/** Function keys that browsers reserve (devtools, refresh, etc.). */
const BROWSER_RESERVED_FN = new Set(['F1', 'F5', 'F11', 'F12']);

const UNLOCK_MAX_ATTEMPTS = 8;
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;

const unlockAttemptState = new Map();

function normalizeShadowSecretSequence(seq) {
    const s = String(seq || '').trim();
    const m = s.match(/^(F\d{1,2})([\s\S]*)$/i);
    if (m) return `${m[1].toUpperCase()}${m[2]}`;
    return s;
}

function validateShadowSecretSequence(seq) {
    const s = normalizeShadowSecretSequence(seq);
    if (s.length < 5) return 'Secret sequence must be at least 5 characters.';
    if (s.length > 32) return 'Secret sequence is too long (max 32).';
    const m = s.match(/^(F\d{1,2})/i);
    if (m && BROWSER_RESERVED_FN.has(m[1].toUpperCase())) {
        return `${m[1].toUpperCase()} cannot be used — the browser captures that key. Use F8, F9, or F10 instead.`;
    }
    return null;
}

function shadowSequencesEqual(expected, provided) {
    const a = normalizeShadowSecretSequence(expected);
    const b = normalizeShadowSecretSequence(provided);
    const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
    const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(ha, hb) && a === b;
}

function checkShadowUnlockRateLimit(resellerUserId) {
    const key = String(resellerUserId);
    const now = Date.now();
    let entry = unlockAttemptState.get(key);
    if (!entry || entry.resetAt <= now) {
        entry = { failures: 0, resetAt: now + UNLOCK_WINDOW_MS };
        unlockAttemptState.set(key, entry);
    }
    if (entry.failures >= UNLOCK_MAX_ATTEMPTS) {
        return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    return { allowed: true };
}

function recordShadowUnlockFailure(resellerUserId) {
    const key = String(resellerUserId);
    const now = Date.now();
    let entry = unlockAttemptState.get(key);
    if (!entry || entry.resetAt <= now) {
        entry = { failures: 0, resetAt: now + UNLOCK_WINDOW_MS };
    }
    entry.failures += 1;
    unlockAttemptState.set(key, entry);
}

function clearShadowUnlockFailures(resellerUserId) {
    unlockAttemptState.delete(String(resellerUserId));
}

module.exports = {
    DEFAULT_SHADOW_SEQUENCE,
    BROWSER_RESERVED_FN,
    normalizeShadowSecretSequence,
    validateShadowSecretSequence,
    shadowSequencesEqual,
    checkShadowUnlockRateLimit,
    recordShadowUnlockFailure,
    clearShadowUnlockFailures,
};

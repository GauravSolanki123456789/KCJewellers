/** Must match services/erpShadowSequence.js (browser-reserved keys). */

export const DEFAULT_SHADOW_SEQUENCE = 'F9Rs*'

const BROWSER_RESERVED_FN = new Set(['F1', 'F5', 'F11', 'F12'])

export function isBrowserReservedFnKey(key: string): boolean {
  return BROWSER_RESERVED_FN.has(String(key || '').toUpperCase())
}

export function normalizeShadowSecretSequence(seq: string): string {
  const s = String(seq || '').trim()
  const m = s.match(/^(F\d{1,2})([\s\S]*)$/i)
  if (m) return `${m[1].toUpperCase()}${m[2]}`
  return s
}

export function validateShadowSecretSequence(seq: string): string | null {
  const s = normalizeShadowSecretSequence(seq)
  if (s.length < 5) return 'Secret sequence must be at least 5 characters.'
  if (s.length > 32) return 'Secret sequence is too long (max 32).'
  const m = s.match(/^(F\d{1,2})/i)
  if (m && BROWSER_RESERVED_FN.has(m[1].toUpperCase())) {
    return `${m[1].toUpperCase()} cannot be used — the browser captures that key. Use F8, F9, or F10 instead.`
  }
  return null
}

/** Minimum typed length before Enter submits unlock (matches server min 5). */
export const SHADOW_UNLOCK_MIN_LENGTH = 5

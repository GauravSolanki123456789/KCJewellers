/** Indian GSTIN format (15 chars). */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function validateGstin(
  gstin: string | null | undefined,
  label = 'GST number',
): { ok: true; gstin: string } | { ok: false; error: string } {
  const s = String(gstin || '').trim().toUpperCase()
  if (!s) return { ok: true, gstin: '' }
  if (!GSTIN_RE.test(s)) {
    return {
      ok: false,
      error: `${label} is invalid. Enter a valid 15-character GSTIN (e.g. 33AAAHB1074R1ZB).`,
    }
  }
  return { ok: true, gstin: s }
}

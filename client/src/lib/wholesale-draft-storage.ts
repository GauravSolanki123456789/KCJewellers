/** Session keys for B2B wholesale quick order — survives Ledger / navigation within the same tab. */
export const WHOLESALE_QTY_DRAFT_KEY = 'kc_jewellers_wholesale_qty_draft_v1'
/** Active metal tab — restored with the page so users return to the same section. */
export const WHOLESALE_METAL_KEY = 'kc_jewellers_wholesale_metal_v1'

export function loadWholesaleQtyDraft(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(WHOLESALE_QTY_DRAFT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 1) out[k] = Math.min(9999, Math.floor(n))
    }
    return out
  } catch {
    return {}
  }
}

export function saveWholesaleQtyDraft(qty: Record<string, number>): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(WHOLESALE_QTY_DRAFT_KEY, JSON.stringify(qty))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearWholesaleQtyDraft(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(WHOLESALE_QTY_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

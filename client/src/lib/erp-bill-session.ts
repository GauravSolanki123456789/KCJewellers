import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

/** Parse slab from bill notes (`Rate slab W · …`) when session_json lacks rateSlab. */
export function parseRateSlabFromNotes(notes?: string | null): ErpRateSlab | null {
  const m = String(notes || '').match(/Rate slab\s+([RWF])\b/i)
  if (!m) return null
  const c = m[1].toUpperCase()
  if (c === 'W' || c === 'F' || c === 'R') return c
  return null
}

export function normalizeRateSlab(raw?: string | null): ErpRateSlab {
  const s = String(raw || '').trim().toUpperCase()
  if (s === 'W' || s === 'F') return s
  return 'R'
}

/** Resolve saved slab from session + notes fallback. */
export function resolveSavedRateSlab(
  session?: { rateSlab?: string | null } | null,
  notes?: string | null,
): ErpRateSlab {
  if (session?.rateSlab === 'R' || session?.rateSlab === 'W' || session?.rateSlab === 'F') {
    return session.rateSlab
  }
  return parseRateSlabFromNotes(notes) ?? 'R'
}

export type ErpBillSession = {
  rateSlab?: ErpRateSlab
  wholesaleGold?: number | null
  wholesaleSilver?: number | null
  goldPerG?: number
  silverPerG?: number
  /** Snapshot of live rates used in billing (incl. per-line rate overrides on regen). */
  displayRates?: unknown
  mobile?: string
  address?: string
  /** When true, Rate column stays empty on reload (rate unfix). */
  ratesUnfixed?: boolean
  /** Advance amount customer has paid (₹). */
  advancePaidInr?: number
  /** Customer PAN for tax invoice */
  pan?: string
  /** Customer GSTIN for tax invoice */
  customerGst?: string
  /** Set when this estimate was converted to a sales bill */
  billedSaleBillId?: number
  billedSaleBillNumber?: string
  billedAt?: string
}

export function buildErpBillSession(input: {
  rateSlab: ErpRateSlab
  wholesaleGold: number | null
  wholesaleSilver: number | null
  goldPerG: number
  silverPerG: number
  displayRates?: unknown
  mobile: string
  address: string
  lines: ErpBillLine[]
  advancePaidInr?: number | null
  pan?: string
  customerGst?: string
}): ErpBillSession {
  const ratesUnfixed =
    input.lines.length > 0 && input.lines.every((l) => l.rateLocked)
  const advance = Math.max(0, Number(input.advancePaidInr) || 0)
  return {
    rateSlab: input.rateSlab,
    wholesaleGold: input.wholesaleGold,
    wholesaleSilver: input.wholesaleSilver,
    goldPerG: input.goldPerG,
    silverPerG: input.silverPerG,
    displayRates: input.displayRates,
    mobile: input.mobile.trim() || undefined,
    address: input.address.trim() || undefined,
    ratesUnfixed: ratesUnfixed || undefined,
    advancePaidInr: advance > 0 ? advance : undefined,
    pan: input.pan?.trim() || undefined,
    customerGst: input.customerGst?.trim() || undefined,
  }
}

export function applyRatesUnfixed(lines: ErpBillLine[], ratesUnfixed?: boolean): ErpBillLine[] {
  if (!ratesUnfixed) return lines
  return lines.map((l) => ({ ...l, ratePerGram: null, rateLocked: true }))
}

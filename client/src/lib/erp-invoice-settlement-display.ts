import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import { groupMarlechaInvoiceLines, isMrpInvoiceLine } from '@/lib/erp-invoice-defaults'

/** Raw physical net weight (never metal-% billed weight). */
export function rawPhysicalNetGm(line: ErpBillLine): number {
  return Number(line.originalWeightGm ?? line.weightGm) || 0
}

export function normalizeInvoiceLineRawWeight(line: ErpBillLine): ErpBillLine {
  const raw = rawPhysicalNetGm(line)
  if (raw <= 0) return line
  return {
    ...line,
    originalWeightGm: raw,
    weightGm: raw,
  }
}

export type SettlementDiscountOpts = {
  netTotalBefore?: number | null
  cashDiscountInr?: number | null
  targetNetInr?: number | null
}

/** Pro-rate explicit header settlement discount across grouped invoice rows (display only). */
export function applySettlementDiscountToGroups(
  groups: ErpBillLine[],
  opts: SettlementDiscountOpts,
): ErpBillLine[] {
  const normalized = groups.map(normalizeInvoiceLineRawWeight)
  const totalBefore =
    opts.netTotalBefore != null && Number(opts.netTotalBefore) > 0
      ? Math.round(Number(opts.netTotalBefore))
      : Math.round(
          normalized.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0),
        )

  const discRaw = opts.cashDiscountInr
  const explicitDisc =
    discRaw != null && String(discRaw).trim() !== '' && Number.isFinite(Number(discRaw))
      ? Number(discRaw)
      : 0

  if (!explicitDisc || totalBefore <= 0) {
    return normalized
  }

  let assignedDisc = 0
  const out: ErpBillLine[] = []

  for (let idx = 0; idx < normalized.length; idx += 1) {
    const line = normalized[idx]!
    const base = Number(line.lineTotalInr) || 0
    const groupDisc =
      idx === normalized.length - 1
        ? explicitDisc - assignedDisc
        : Math.round((base / totalBefore) * explicitDisc)
    assignedDisc += groupDisc
    const finalAmt = Math.max(0, Math.round((base - groupDisc) * 100) / 100)
    out.push({
      ...line,
      lineTotalInr: finalAmt,
      ratePerGram: backCalcDisplayRatePerGram(line, finalAmt),
      rateLocked: false,
    })
  }

  const target =
    opts.targetNetInr != null && Number(opts.targetNetInr) > 0
      ? Math.round(Number(opts.targetNetInr))
      : Math.max(0, totalBefore - explicitDisc)
  const sum = out.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0)
  const drift = target - sum
  if (out.length && drift !== 0) {
    const last = out[out.length - 1]!
    const adjusted = Math.max(0, (Number(last.lineTotalInr) || 0) + drift)
    out[out.length - 1] = {
      ...last,
      lineTotalInr: adjusted,
      ratePerGram: backCalcDisplayRatePerGram(last, adjusted),
    }
  }

  return out
}

function backCalcDisplayRatePerGram(line: ErpBillLine, finalAmt: number): number | null {
  const qty = Math.max(1, Number(line.qty) || 1)
  if (line.mrpMode || line.manualCategory === 'gift') {
    return Math.round((finalAmt / qty) * 100) / 100
  }
  const raw = rawPhysicalNetGm(line)
  if (raw <= 0) return line.ratePerGram ?? null
  return Math.round((finalAmt / raw) * 100) / 100
}

export function settlementOptsFromBill(bill: ErpBill): SettlementDiscountOpts {
  const session = (bill.session || {}) as ErpBillSession
  return {
    netTotalBefore: session.netTotalInr,
    cashDiscountInr: session.cashDiscountInr,
    targetNetInr: bill.total_inr,
  }
}

/** Group by invoice item + apply settlement discount — PDF & preview display payload. */
export function buildSettlementAdjustedInvoiceLines(
  bill: ErpBill,
  mrpItemNames?: Set<string> | null,
): ErpBillLine[] {
  const grouped = groupMarlechaInvoiceLines(bill.lines ?? [], mrpItemNames)
  return applySettlementDiscountToGroups(grouped, settlementOptsFromBill(bill))
}

function hasExplicitSettlementDiscount(bill: ErpBill): boolean {
  const session = (bill.session || {}) as ErpBillSession
  const raw = session.cashDiscountInr
  if (raw == null || String(raw).trim() === '') return false
  const n = Number(raw)
  return Number.isFinite(n) && n !== 0
}

/** Sales/estimate preview — per-line unless header settlement discount needs invoice grouping. */
export function buildBillPreviewDisplayLines(
  bill: ErpBill,
  mrpItemNames?: Set<string> | null,
): ErpBillLine[] {
  if (hasExplicitSettlementDiscount(bill)) {
    return buildSettlementAdjustedInvoiceLines(bill, mrpItemNames)
  }
  return (bill.lines ?? []).map(normalizeInvoiceLineRawWeight)
}

export function previewLineRateDisplay(line: ErpBillLine): string {
  const r = Number(line.ratePerGram)
  if (Number.isFinite(r) && r > 0) return String(line.ratePerGram)
  if (line.rateLocked && !(Number(line.ratePerGram) > 0)) return '—'
  return line.ratePerGram != null ? String(line.ratePerGram) : '—'
}

export function previewDisplayLabel(line: ErpBillLine): string {
  return (line.invoice_item_name || line.name || '—').trim()
}

export function isMrpPreviewLine(line: ErpBillLine, mrpItemNames?: Set<string> | null): boolean {
  return isMrpInvoiceLine(line, mrpItemNames)
}

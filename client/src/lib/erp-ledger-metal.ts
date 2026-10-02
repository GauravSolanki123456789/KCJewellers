import { formatErpInr } from '@/lib/reseller-erp-modules'

export function formatMetalGm(gm: number | null | undefined): string {
  const n = Number(gm)
  if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return ''
  return `${n.toFixed(3)} g`
}

/** Debit / credit / amount cell: ₹ and/or grams, never a blank ₹0 when metal exists. */
export function formatLedgerVirtualMetalCredit(tx: {
  virtual_metal_inr?: boolean
  virtual_metal_show_inr_credit?: boolean
  credit?: number
  weight_gm?: number
  credit_metal_gm?: number
}): string {
  if (tx.virtual_metal_inr && tx.virtual_metal_show_inr_credit) {
    return formatLedgerMoneyOrMetal(tx.credit, 0)
  }
  if (tx.virtual_metal_inr) {
    return formatLedgerMoneyOrMetal(0, tx.weight_gm ?? tx.credit_metal_gm)
  }
  return formatLedgerMoneyOrMetal(
    tx.credit,
    tx.credit_metal_gm ?? (tx.credit ? tx.weight_gm : 0),
  )
}

export function formatLedgerMoneyOrMetal(
  inr: number | null | undefined,
  gm: number | null | undefined,
): string {
  const money = Number(inr) || 0
  const metal = Number(gm) || 0
  const moneyPart = Math.abs(money) >= 0.005 ? formatErpInr(money) : ''
  const metalPart = formatMetalGm(Math.abs(metal))
  if (moneyPart && metalPart) return `${moneyPart} · ${metalPart}`
  if (moneyPart) return moneyPart
  if (metalPart) return metalPart
  return '—'
}

export function formatLedgerRunningBalance(
  inr: number | null | undefined,
  gm: number | null | undefined,
): string {
  const money = formatErpInr(Number(inr) || 0)
  const metal = formatMetalGm(gm)
  return metal ? `${money} · ${metal}` : money
}

export function metalBalanceHint(balanceGm: number): string {
  const n = Number(balanceGm) || 0
  if (Math.abs(n) < 0.0005) return 'Metal even'
  if (n > 0) return `Customer owes ${n.toFixed(3)} g`
  return `You owe customer ${Math.abs(n).toFixed(3)} g`
}

export function isVirtualMetalInrOffset(entry: {
  virtual_metal_inr?: boolean | null
  narration?: string | null
}): boolean {
  if (entry?.virtual_metal_inr) return true
  const nar = String(entry?.narration || '')
  return /₹ offset only|no cash received/i.test(nar)
}

/** Grams that change running metal balance (not ₹-offset-only receipts). */
export function ledgerEntryMetalGmForBalance(entry: {
  metal_gm?: number | null
  weight_kg?: number | null
  reference_no?: string | null
  narration?: string | null
  virtual_metal_inr?: boolean | null
}): number {
  if (isVirtualMetalInrOffset(entry)) return 0
  return ledgerEntryMetalGm(entry)
}

export function ledgerEntryMetalGm(entry: {
  metal_gm?: number | null
  weight_kg?: number | null
  reference_no?: string | null
  narration?: string | null
}): number {
  const gm = Number(entry?.metal_gm)
  if (Number.isFinite(gm) && Math.abs(gm) >= 0.0005) return Math.round(gm * 1000) / 1000
  const ref = String(entry?.reference_no || '')
  const nar = String(entry?.narration || '')
  const looksJewellery =
    /^(MT|MB|MI|MR)/i.test(ref) ||
    /\d+(?:\.\d+)?\s*g\b/i.test(nar) ||
    /metal (received|balance|issued|applied|converted)/i.test(nar)
  const kg = Number(entry?.weight_kg)
  if (looksJewellery && Number.isFinite(kg) && kg > 0) {
    return kg >= 20 ? Math.round(kg * 1000) / 1000 : Math.round(kg * 1000 * 1000) / 1000
  }
  const m = nar.match(/(\d+(?:\.\d+)?)\s*g\b/i)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000) / 1000
  }
  return 0
}

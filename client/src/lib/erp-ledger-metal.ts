import { formatErpInr } from '@/lib/reseller-erp-modules'

export type LedgerCellFormatOpts = {
  /** Helvetica PDF: plain numbers, no ₹ (avoids superscript artifacts). */
  pdfSafe?: boolean
  laneLedger?: boolean
  /** Lane ledger: Balance column is ₹ only; metal in Metal balance column. */
  splitMetalColumn?: boolean
}

function formatInrAmount(amount: number, pdfSafe?: boolean): string {
  const n = Math.round(amount)
  if (pdfSafe) return n.toLocaleString('en-IN')
  return formatErpInr(n)
}

export function formatMetalGm(gm: number | null | undefined): string {
  const n = Number(gm)
  if (!Number.isFinite(n) || Math.abs(n) < 0.0005) return ''
  return `${n.toFixed(3)} g`
}

export function formatMetalBalanceCell(gm: number | null | undefined): string {
  const part = formatMetalGm(gm)
  return part || '—'
}

/** Debit / credit / amount cell: ₹ and/or grams, never a blank ₹0 when metal exists. */
export function formatLedgerVirtualMetalCredit(
  tx: {
    virtual_metal_inr?: boolean
    virtual_metal_show_inr_credit?: boolean
    credit?: number
    weight_gm?: number
    credit_metal_gm?: number
  },
  opts: LedgerCellFormatOpts = {},
): string {
  if (tx.virtual_metal_inr && tx.virtual_metal_show_inr_credit) {
    return formatLedgerMoneyOrMetal(tx.credit, 0, opts)
  }
  if (tx.virtual_metal_inr) {
    return formatLedgerMoneyOrMetal(0, tx.weight_gm ?? tx.credit_metal_gm, opts)
  }
  return formatLedgerMoneyOrMetal(
    tx.credit,
    tx.credit_metal_gm ?? (tx.credit ? tx.weight_gm : 0),
    opts,
  )
}

export function formatLedgerMoneyOrMetal(
  inr: number | null | undefined,
  gm: number | null | undefined,
  opts: LedgerCellFormatOpts = {},
): string {
  const money = Number(inr) || 0
  const metal = Number(gm) || 0
  const moneyPart = Math.abs(money) >= 0.005 ? formatInrAmount(money, opts.pdfSafe) : ''
  const metalPart = formatMetalGm(Math.abs(metal))
  if (moneyPart && metalPart) return `${moneyPart} · ${metalPart}`
  if (moneyPart) return moneyPart
  if (metalPart) return metalPart
  return '—'
}

export function formatLedgerRunningBalance(
  inr: number | null | undefined,
  gm: number | null | undefined,
  opts: LedgerCellFormatOpts = {},
): string {
  const money = formatInrAmount(Number(inr) || 0, opts.pdfSafe)
  const metal = formatMetalGm(gm)
  return metal ? `${money} · ${metal}` : money
}

/** GST / bank RTGS sales — grams stay in the Weight column only, not in Debit. */
export function isRupeeOnlyGstSale(row: {
  lane?: string | null
  rupee_only_debit?: boolean | null
  metal_ledger_mode?: boolean | null
  source?: string | null
  shadow_bill_id?: number | null
  kind?: string | null
}): boolean {
  if (row.rupee_only_debit) return true
  const kind = String(row.kind || '').toLowerCase()
  if (kind && kind !== 'sale' && kind !== 'debit') return false
  if (row.metal_ledger_mode) return false
  if (row.shadow_bill_id) return false
  if (String(row.lane || '').toLowerCase() === 'gst') return true
  if (row.source === 'bill') return true
  return false
}

export function formatLedgerDebitCell(
  row: {
    debit?: number
    debit_inr?: number
    debit_metal_gm?: number
    weight_gm?: number
    lane?: string | null
    rupee_only_debit?: boolean | null
    metal_ledger_mode?: boolean | null
    source?: string | null
    shadow_bill_id?: number | null
    kind?: string | null
  },
  opts: LedgerCellFormatOpts = {},
): string {
  const inr = row.debit_inr ?? row.debit
  if (isRupeeOnlyGstSale(row)) {
    return formatLedgerMoneyOrMetal(inr, 0, opts)
  }
  const metal =
    row.debit_metal_gm ??
    (Math.abs(Number(inr) || 0) >= 0.005 ? row.weight_gm : 0)
  return formatLedgerMoneyOrMetal(inr, metal, opts)
}

/** Official payment ledger: running balance is ₹ only. Lane: split metal to its own column when requested. */
export function formatLedgerBalanceCell(
  balanceInr: number | null | undefined,
  balanceMetalGm: number | null | undefined,
  opts: LedgerCellFormatOpts = {},
): string {
  if (!opts.laneLedger || opts.splitMetalColumn) {
    return formatInrAmount(Number(balanceInr) || 0, opts.pdfSafe)
  }
  return formatLedgerRunningBalance(balanceInr, balanceMetalGm, opts)
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

import axios from '@/lib/axios'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { customerWhatsAppHref } from '@/lib/catalog-inquiry-shared'
import type { ErpBillSession } from '@/lib/erp-bill-session'
import {
  computeLineBreakdown,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  resolveLineDisplayRates,
} from '@/lib/erp-billing-pricing'
import { isGoldSlabRLine } from '@/lib/erp-billing-display'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'

export type ErpQuoteTotals = {
  count: number
  weight: number
  subtotal: number
  gst: number
  net: number
  advancePaid?: number
  balanceDue?: number
  collectedAmount?: number
  billingDiscount?: number
}

/** Ensure Slab R gold lines carry MC discount display fields for PDF/grid. */
export function enrichErpBillLinesForDisplay(
  bill: ErpBill,
  slabSettingsRaw?: unknown,
): ErpBillLine[] {
  const session = (bill.session || {}) as ErpBillSession
  const slab = (session.rateSlab || 'R') as ErpRateSlab
  const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw)
  const goldPerG = Number(session.goldPerG) || 0
  const silverPerG = Number(session.silverPerG) || 0
  const baseRates =
    session.displayRates ??
    (goldPerG > 0 ? perGramToDisplayRates(goldPerG, silverPerG) : [])

  return (bill.lines ?? []).map((line) => {
    const rates = resolveLineDisplayRates(line, baseRates, goldPerG, silverPerG)
    const bd = computeLineBreakdown(
      line,
      rates,
      slab,
      slabSettings,
      session.wholesaleGold,
      session.wholesaleSilver,
      goldPerG,
      silverPerG,
    )
    const next: ErpBillLine = { ...line, lineTotalInr: line.lineTotalInr ?? bd.total }
    if (isGoldSlabRLine(line, slab)) {
      next.displayWastagePct = 0
      next.displayMcInr = bd.mc > 0 ? bd.mc : null
      next.displayMcBeforeDiscount =
        bd.mc_before_discount != null && bd.mc_before_discount > bd.mc
          ? bd.mc_before_discount
          : null
      next.displayMcDiscountPct = bd.mc_discount_pct ?? null
    }
    return next
  })
}

function slugPart(s: string, max = 32): string {
  return s
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, max)
    .replace(/-+$/, '')
}

export function buildErpQuotePdfFilename(params: {
  billNumber: string
  customerName?: string | null
  createdAt?: string | null
}): string {
  const num = slugPart(params.billNumber.replace(/\s+/g, '-'), 24) || 'quote'
  const name = params.customerName?.trim() ? slugPart(params.customerName, 28) : 'customer'
  const d = params.createdAt ? new Date(params.createdAt) : new Date()
  const stamp = Number.isNaN(d.getTime())
    ? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
  return `${num}-${name}-${stamp}.pdf`
}

export function computeErpQuoteTotals(bill: ErpBill, slabSettingsRaw?: unknown): ErpQuoteTotals {
  const lines = bill.lines ?? []
  const session = (bill.session || {}) as ErpBillSession
  const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw)
  const goldPerG = Number(session.goldPerG) || 0
  const silverPerG = Number(session.silverPerG) || 0
  const baseRates =
    session.displayRates ??
    (goldPerG > 0 ? perGramToDisplayRates(goldPerG, silverPerG) : null)

  let subtotal = 0
  let gst = 0
  let net = 0
  let weight = 0
  let count = 0

  const slab = session.rateSlab

  if (baseRates && slab) {
    for (const line of lines) {
      count += Number(line.qty) || 1
      weight += Number(line.weightGm) || 0
      const rates = resolveLineDisplayRates(line, baseRates, goldPerG, silverPerG)
      const bd = computeLineBreakdown(
        line,
        rates,
        slab,
        slabSettings,
        session.wholesaleGold,
        session.wholesaleSilver,
        goldPerG,
        silverPerG,
      )
      subtotal += bd.taxable
      gst += (bd.cgst || 0) + (bd.sgst || 0)
      net += bd.total
    }
  } else {
    for (const line of lines) {
      count += Number(line.qty) || 1
      weight += Number(line.weightGm) || 0
      net += Number(line.lineTotalInr) || 0
    }
    if (net > 0) {
      subtotal = Math.round(net / 1.03)
      gst = net - subtotal
    }
  }

  const lineNetSum = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0)
  if (lineNetSum > 0 && Math.abs(lineNetSum - net) > 1) {
    net = lineNetSum
    if (subtotal > 0 && gst > 0) {
      const ratio = lineNetSum / (subtotal + gst)
      subtotal = Math.round(subtotal * ratio)
      gst = lineNetSum - subtotal
    } else {
      subtotal = Math.round(net / 1.03)
      gst = net - subtotal
    }
  }

  if (!net && bill.total_inr) {
    net = Number(bill.total_inr) || 0
    subtotal = Math.round(net / 1.03)
    gst = net - subtotal
  }

  const advance = Math.max(0, Number(session.advancePaidInr) || 0)
  const balanceDue = advance > 0 ? Math.max(0, net - advance) : undefined
  const collected = Number(session.collectedAmountInr)
  const collectedAmount = Number.isFinite(collected) ? collected : undefined
  const billingDiscount =
    session.billingDiscountInr != null && Number.isFinite(Number(session.billingDiscountInr))
      ? Number(session.billingDiscountInr)
      : collectedAmount != null && net > 0
        ? Math.round(net - collectedAmount)
        : undefined

  return {
    count,
    weight,
    subtotal,
    gst,
    net,
    advancePaid: advance > 0 ? advance : undefined,
    balanceDue,
    collectedAmount,
    billingDiscount,
  }
}

export async function resolveErpLineImages(lines: ErpBillLine[]): Promise<ErpBillLine[]> {
  const needIdx: number[] = []
  const keys: Record<string, unknown>[] = []
  lines.forEach((line, i) => {
    if (line.imageUrl) return
    needIdx.push(i)
    keys.push({
      product_name: line.name,
      sku: line.sku,
      style_code: line.style_code,
      item_code: line.item_code,
      metal_type: line.metal_type,
    })
  })
  if (!needIdx.length) return lines

  try {
    const res = await axios.post<{ images: (string | null)[] }>(
      '/api/reseller/erp/products/resolve-images',
      { keys },
    )
    const images = res.data.images || []
    const out = lines.map((l) => ({ ...l }))
    needIdx.forEach((lineIdx, k) => {
      const url = images[k]
      if (url) out[lineIdx] = { ...out[lineIdx], imageUrl: url }
    })
    return out
  } catch {
    return lines
  }
}

export function erpLinesToPdfItems(lines: ErpBillLine[]): ItemWithPdfImage[] {
  return lines.map((line) => {
    const code = line.barcode || line.code || ''
    const wt = line.weightGm
    return {
      barcode: code,
      sku: line.sku,
      item_name: line.name,
      name: line.name,
      style_code: line.style_code,
      metal_type: line.metal_type || 'silver',
      net_weight: wt ?? undefined,
      net_wt: wt ?? undefined,
      purity: line.purity ?? undefined,
      wastage_pct: line.wastage_pct ?? undefined,
      mc_rate: line.mc_rate ?? undefined,
      mc_type: line.mc_type ?? undefined,
      stone_charges: line.stone_charges ?? 0,
      box_charges: line.box_charges ?? 0,
      fixed_price: line.fixed_price ?? undefined,
      size: line.size ?? undefined,
      pcs: line.qty ?? 1,
      image_url: line.imageUrl ?? undefined,
      shareCatalogQty: line.qty ?? 1,
      shareCatalogDisplayTitle: line.name,
      shareCatalogSize: line.size ?? null,
      shareCatalogWeightLabel: wt != null ? `${wt} gm` : null,
      shareCatalogUnitTotalInr: line.lineTotalInr ?? null,
      shareCatalogLineTotalInr: line.lineTotalInr ?? null,
      shareCatalogMcRate: line.mc_rate ?? null,
      shareCatalogMcType: line.mc_type ?? null,
      erpRateLocked: line.rateLocked ?? false,
      erpRatePerGram: line.rateLocked ? null : (line.ratePerGram ?? null),
    } as ItemWithPdfImage
  })
}

export function buildErpQuoteWhatsAppMessage(params: {
  brandLabel: string
  bill: ErpBill
  customerName?: string | null
  mobile?: string | null
  filename: string
}): string {
  const { brandLabel, bill, customerName, filename } = params
  const greeting = customerName?.trim() ? `Hi ${customerName.trim()},` : 'Hi,'
  const lines = bill.lines ?? []
  const itemLines = lines
    .map((l, i) => {
      const amt = l.lineTotalInr != null ? formatErpInr(l.lineTotalInr) : '—'
      const wt = l.weightGm != null ? ` · ${l.weightGm} gm` : ''
      return `${i + 1}. ${l.name}${wt} — ${amt}`
    })
    .join('\n')
  return `${greeting}\n\nPlease find your quotation *${bill.bill_number}* from ${brandLabel} attached (${filename}).\n\n${itemLines}\n\n*Total (incl. GST):* ${formatErpInr(bill.total_inr)}\n\nThank you!`
}

export function erpCustomerWhatsAppHref(mobile: string | null | undefined, text: string): string | null {
  return customerWhatsAppHref(mobile, text)
}

/** True when quotation PDF should show RATE UNFIX badge. */
export function billRatesUnfixed(bill: ErpBill): boolean {
  const session = bill.session as { ratesUnfixed?: boolean } | null | undefined
  if (session?.ratesUnfixed === false) return false
  if (session?.ratesUnfixed) return true
  const lines = bill.lines ?? []
  if (!lines.length) return false
  return lines.every((l) => l.rateLocked)
}

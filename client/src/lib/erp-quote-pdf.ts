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
} from '@/lib/erp-billing-pricing'

export type ErpQuoteTotals = {
  count: number
  weight: number
  subtotal: number
  gst: number
  net: number
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
  const displayRates =
    session.goldPerG && session.goldPerG > 0
      ? perGramToDisplayRates(session.goldPerG, session.silverPerG ?? 0)
      : null

  let subtotal = 0
  let gst = 0
  let net = 0
  let weight = 0
  let count = 0

  if (displayRates && session.rateSlab) {
    for (const line of lines) {
      count += Number(line.qty) || 1
      weight += Number(line.weightGm) || 0
      const bd = computeLineBreakdown(
        line,
        displayRates,
        session.rateSlab,
        slabSettings,
        session.wholesaleGold,
        session.wholesaleSilver,
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

  if (!net && bill.total_inr) {
    net = Number(bill.total_inr) || 0
    subtotal = Math.round(net / 1.03)
    gst = net - subtotal
  }

  return { count, weight, subtotal, gst, net }
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

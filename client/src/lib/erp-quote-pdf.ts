import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { customerWhatsAppHref } from '@/lib/catalog-inquiry-shared'

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

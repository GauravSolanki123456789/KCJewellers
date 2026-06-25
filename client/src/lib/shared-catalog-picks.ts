import { getCustomerDisplaySize, getCustomerDisplayWeightLabel } from '@/lib/pricing'
import { formatProductMetalSpecSummary } from '@/lib/product-metal-specs'
import { getProductBoxCharges, productHasBoxOption } from '@/lib/product-box-pricing'
import type { SharedCatalogPickLineForWhatsApp } from '@/lib/cart-order-whatsapp'
import {
  sharedCatalogProductToItem,
  type SharedCatalogGroupedRow,
  type SharedCatalogPricingRow,
} from '@/lib/shared-catalog-pricing'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'

export type SharedCatalogSelectionPick = {
  row: SharedCatalogPricingRow
  key: string
  qty: number
  includeBox: boolean
  displayTitle: string
  sizeLabel: string | null
  weightLabel: string | null
  unitTotalInr: number
  lineTotalInr: number
}

export function buildSharedCatalogSelectionPicks(
  groupedRows: SharedCatalogGroupedRow[],
  rowKeyByRow: Map<SharedCatalogPricingRow, string>,
  selections: Map<string, number>,
  includeBoxByKey: Map<string, boolean>,
): SharedCatalogSelectionPick[] {
  const picks: SharedCatalogSelectionPick[] = []

  for (const group of groupedRows) {
    for (const variant of group.variants) {
      const key = rowKeyByRow.get(variant)
      if (!key) continue
      const qty = selections.get(key)
      if (!qty) continue

      const item = variant.item
      const includeBox = includeBoxByKey.get(key) ?? false
      const boxAdd = includeBox && productHasBoxOption(item) ? getProductBoxCharges(item) : 0
      const unitTotalInr = variant.unitTotalInr + boxAdd
      const lineTotalInr = unitTotalInr * qty

      picks.push({
        row: variant,
        key,
        qty,
        includeBox,
        displayTitle: group.displayTitle,
        sizeLabel: getCustomerDisplaySize(item),
        weightLabel: getCustomerDisplayWeightLabel(sharedCatalogProductToItem(variant.product)),
        unitTotalInr,
        lineTotalInr,
      })
    }
  }

  return picks
}

export function sharedCatalogPickToWhatsAppLine(
  pick: SharedCatalogSelectionPick,
  rates?: unknown,
): SharedCatalogPickLineForWhatsApp {
  const code = String(pick.row.product.barcode || pick.row.product.sku || pick.key)
  const item = sharedCatalogProductToItem(pick.row.product)
  return {
    name: pick.displayTitle,
    skuOrBarcode: code,
    priceInr: pick.unitTotalInr,
    compareAtInr: pick.row.unitCompareAtInr,
    qty: pick.qty,
    sizeLabel: pick.sizeLabel,
    weightLabel: pick.weightLabel,
    metalSpecSummary: formatProductMetalSpecSummary(item, rates),
    showInclGst: pick.row.showInclGst,
    withBoxPriceInr:
      pick.includeBox && productHasBoxOption(pick.row.item) ? pick.unitTotalInr : null,
  }
}

export function sharedCatalogPickToPdfItem(
  pick: SharedCatalogSelectionPick,
): ReturnType<typeof sharedCatalogProductToItem> & {
  shareCatalogQty: number
  shareCatalogDisplayTitle: string
  shareCatalogSize: string | null
  shareCatalogWeightLabel: string | null
  shareCatalogMetalSpecSummary: string | null
  shareCatalogLineTotalInr: number
  shareCatalogUnitTotalInr: number
} {
  return {
    ...sharedCatalogProductToItem(pick.row.product),
    shareCatalogQty: pick.qty,
    shareCatalogDisplayTitle: pick.displayTitle,
    shareCatalogSize: pick.sizeLabel,
    shareCatalogWeightLabel: pick.weightLabel,
    shareCatalogMetalSpecSummary: formatProductMetalSpecSummary(
      sharedCatalogProductToItem(pick.row.product),
    ),
    shareCatalogLineTotalInr: pick.lineTotalInr,
    shareCatalogUnitTotalInr: pick.unitTotalInr,
  }
}

export type SharedCatalogOrderSummary = {
  totalPieces: number
  designCount: number
  orderTotalInr: number
}

export function summarizeSharedCatalogPicks(
  picks: SharedCatalogSelectionPick[],
): SharedCatalogOrderSummary {
  let totalPieces = 0
  let orderTotalInr = 0
  for (const pick of picks) {
    totalPieces += pick.qty
    orderTotalInr += pick.lineTotalInr
  }
  return {
    totalPieces,
    designCount: picks.length,
    orderTotalInr,
  }
}

export function picksToPdfItems(picks: SharedCatalogSelectionPick[]): ItemWithPdfImage[] {
  return picks.map((pick) => sharedCatalogPickToPdfItem(pick) as ItemWithPdfImage)
}

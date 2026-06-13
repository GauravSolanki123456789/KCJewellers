import { getCustomerDisplaySize, getCustomerDisplayWeightLabel } from '@/lib/pricing'
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
    let matchedRow: SharedCatalogPricingRow | null = null
    let matchedKey: string | null = null
    let matchedQty: number | null = null

    for (const variant of group.variants) {
      const key = rowKeyByRow.get(variant)
      if (!key) continue
      const qty = selections.get(key)
      if (qty) {
        matchedRow = variant
        matchedKey = key
        matchedQty = qty
        break
      }
    }

    if (!matchedRow || !matchedKey || matchedQty == null) continue

    const item = matchedRow.item
    const includeBox = includeBoxByKey.get(matchedKey) ?? false
    const boxAdd = includeBox && productHasBoxOption(item) ? getProductBoxCharges(item) : 0
    const unitTotalInr = matchedRow.unitTotalInr + boxAdd
    const lineTotalInr = unitTotalInr * matchedQty

    picks.push({
      row: matchedRow,
      key: matchedKey,
      qty: matchedQty,
      includeBox,
      displayTitle: group.displayTitle,
      sizeLabel: getCustomerDisplaySize(item),
      weightLabel: getCustomerDisplayWeightLabel(sharedCatalogProductToItem(matchedRow.product)),
      unitTotalInr,
      lineTotalInr,
    })
  }

  return picks
}

export function sharedCatalogPickToWhatsAppLine(
  pick: SharedCatalogSelectionPick,
): SharedCatalogPickLineForWhatsApp {
  const code = String(pick.row.product.barcode || pick.row.product.sku || pick.key)
  return {
    name: pick.displayTitle,
    skuOrBarcode: code,
    priceInr: pick.unitTotalInr,
    compareAtInr: pick.row.unitCompareAtInr,
    qty: pick.qty,
    sizeLabel: pick.sizeLabel,
    weightLabel: pick.weightLabel,
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
  shareCatalogLineTotalInr: number
  shareCatalogUnitTotalInr: number
} {
  return {
    ...sharedCatalogProductToItem(pick.row.product),
    shareCatalogQty: pick.qty,
    shareCatalogDisplayTitle: pick.displayTitle,
    shareCatalogSize: pick.sizeLabel,
    shareCatalogWeightLabel: pick.weightLabel,
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

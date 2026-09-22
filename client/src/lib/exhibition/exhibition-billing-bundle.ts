/**
 * Entry for esbuild → client/public/exhibition-kit/billing-core.js
 * Keeps offline exhibition math in sync with live ERP billing.
 */
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import {
  computeLineBreakdown,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
} from '@/lib/erp-billing-pricing'
import {
  createManualBillLine,
  findInvoiceItemForCategory,
  findStyleForSku,
  findStylesForSku,
  firstManualEntryField,
  GIFT_ENTRY_FIELD_ORDER,
  isGiftManualLine,
  MANUAL_ENTRY_FIELD_ORDER,
  nextManualEntryField,
  productNamesForSku,
  resolveBillingScanShortcut,
  uniqueSkusFromCatalog,
  type DesignBillingStyle,
} from '@/lib/erp-billing-shortcuts'
import {
  findCatalogProduct,
  findDesignOptionLabel,
  nextFieldAfterCatalogProduct,
  nextFieldAfterCatalogSize,
  patchLineFromCatalogProduct,
  patchLineFromCatalogSize,
} from '@/lib/erp-catalog-product'
import { giftMrpSlabPrice } from '@/lib/erp-gift-mrp-pricing'
import { generateManualBarcode } from '@/lib/erp-manual-barcode'
import {
  cartTotalsFromLines,
  recalcExhibitionBillLine,
  type ExhibitionRecalcOpts,
} from '@/lib/exhibition/exhibition-bill-line-recalc'

export type ExhibitionRates = {
  gold_per_gram: number
  silver_per_gram: number
  gold_22k_per_gram?: number
  gold_18k_per_gram?: number
  wholesale_silver_per_gram?: number
  wholesale_gold_per_gram?: number
}

function calcLineTotal(
  line: ErpBillLine,
  rates: ExhibitionRates,
  slab: ErpRateSlab,
  slabSettingsRaw: unknown,
): number {
  const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw)
  const recalced = recalcExhibitionBillLine(line, {
    slab,
    slabSettings,
    goldPerG: Number(rates.gold_per_gram) || 0,
    silverPerG: Number(rates.silver_per_gram) || 0,
    wholesaleGold: rates.wholesale_gold_per_gram ?? null,
    wholesaleSilver: rates.wholesale_silver_per_gram ?? null,
  })
  return Number(recalced.lineTotalInr) || 0
}

function recalcBillLine(
  line: ErpBillLine,
  rates: ExhibitionRates,
  slab: ErpRateSlab,
  slabSettingsRaw: unknown,
): ErpBillLine {
  const slabSettings = parseSlabSettingsFromUser(slabSettingsRaw)
  return recalcExhibitionBillLine(line, {
    slab,
    slabSettings,
    goldPerG: Number(rates.gold_per_gram) || 0,
    silverPerG: Number(rates.silver_per_gram) || 0,
    wholesaleGold: rates.wholesale_gold_per_gram ?? null,
    wholesaleSilver: rates.wholesale_silver_per_gram ?? null,
  })
}

declare global {
  interface Window {
    KcExhibitionBilling?: Record<string, unknown>
  }
}

const api = {
  generateManualBarcode,
  resolveBillingScanShortcut,
  findInvoiceItemForCategory,
  createManualBillLine,
  uniqueSkusFromCatalog,
  findStyleForSku,
  findStylesForSku,
  productNamesForSku,
  findCatalogProduct,
  patchLineFromCatalogProduct,
  patchLineFromCatalogSize,
  nextFieldAfterCatalogProduct,
  nextFieldAfterCatalogSize,
  findDesignOptionLabel,
  firstManualEntryField,
  nextManualEntryField,
  entryFieldOrderForLine: (line: ErpBillLine) =>
    isGiftManualLine(line) ? GIFT_ENTRY_FIELD_ORDER : MANUAL_ENTRY_FIELD_ORDER,
  isGiftManualLine,
  calcLineTotal,
  recalcBillLine,
  computeLineBreakdown,
  parseSlabSettingsFromUser,
  perGramToDisplayRates,
  giftMrpSlabPrice,
  cartTotalsFromLines,
  MANUAL_ENTRY_FIELD_ORDER,
  GIFT_ENTRY_FIELD_ORDER,
}

if (typeof window !== 'undefined') {
  window.KcExhibitionBilling = api
}

export type { DesignBillingStyle, ExhibitionRecalcOpts }
export { api as KcExhibitionBilling }

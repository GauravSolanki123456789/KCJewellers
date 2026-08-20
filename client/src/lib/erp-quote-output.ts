/** Quote / estimate output — PDF, Epson thermal, or both (shop default + workstation override). */

export type ErpQuoteOutputMode = 'pdf' | 'epson' | 'both'

export const ERP_QUOTE_OUTPUT_MODES: ErpQuoteOutputMode[] = ['pdf', 'epson', 'both']

export const ERP_QUOTE_OUTPUT_LABELS: Record<ErpQuoteOutputMode, string> = {
  pdf: 'PDF only',
  epson: 'Epson estimate only',
  both: 'PDF + Epson estimate',
}

export const ERP_QUOTE_OUTPUT_HINTS: Record<ErpQuoteOutputMode, string> = {
  pdf: 'Download / share the photo quotation PDF.',
  epson: 'Print a thermal estimate on the billing Epson (no PDF).',
  both: 'Print on Epson and open the PDF share sheet.',
}

export function normalizeQuoteOutputMode(raw: unknown): ErpQuoteOutputMode {
  const v = String(raw || 'pdf').toLowerCase()
  if (v === 'epson' || v === 'both') return v
  return 'pdf'
}

export function resolveQuoteOutputMode(
  workstationMode: ErpQuoteOutputMode | null | undefined,
  resellerDefault: ErpQuoteOutputMode | null | undefined,
): ErpQuoteOutputMode {
  if (workstationMode) return normalizeQuoteOutputMode(workstationMode)
  return normalizeQuoteOutputMode(resellerDefault ?? 'pdf')
}

/** Billing slab overrides shop default: R → Epson only, W/F → PDF only. */
export function resolveQuoteOutputModeForSlab(
  rateSlab: 'R' | 'W' | 'F',
  workstationMode?: ErpQuoteOutputMode | null,
  resellerDefault?: ErpQuoteOutputMode | null,
): ErpQuoteOutputMode {
  if (rateSlab === 'R') return 'epson'
  if (rateSlab === 'W' || rateSlab === 'F') return 'pdf'
  return resolveQuoteOutputMode(workstationMode, resellerDefault)
}

export { printErpEstimateThermal } from '@/lib/erp-billing-print'

/** Quote / estimate output — PDF, Epson thermal, Bills Banao, or both (shop default + workstation override). */

export type ErpQuoteOutputMode = 'pdf' | 'epson' | 'bills_banao' | 'both'

export const ERP_QUOTE_OUTPUT_MODES: ErpQuoteOutputMode[] = ['pdf', 'epson', 'bills_banao', 'both']

export const ERP_QUOTE_OUTPUT_LABELS: Record<ErpQuoteOutputMode, string> = {
  pdf: 'PDF only',
  epson: 'Epson estimate only',
  bills_banao: 'Bills Banao estimate only',
  both: 'PDF + Epson estimate',
}

export const ERP_QUOTE_OUTPUT_HINTS: Record<ErpQuoteOutputMode, string> = {
  pdf: 'Download / share the photo quotation PDF.',
  epson: 'Print a thermal estimate on the billing Epson (no PDF).',
  bills_banao: 'Print a thermal estimate on the portable Bills Banao printer (Slab R).',
  both: 'Print on Epson and open the PDF share sheet.',
}

export function normalizeQuoteOutputMode(raw: unknown): ErpQuoteOutputMode {
  const v = String(raw || 'pdf').toLowerCase()
  if (v === 'epson' || v === 'both' || v === 'bills_banao' || v === 'billsbanao') {
    return v === 'billsbanao' ? 'bills_banao' : (v as ErpQuoteOutputMode)
  }
  return 'pdf'
}

export function resolveQuoteOutputMode(
  workstationMode: ErpQuoteOutputMode | null | undefined,
  resellerDefault: ErpQuoteOutputMode | null | undefined,
): ErpQuoteOutputMode {
  if (workstationMode) return normalizeQuoteOutputMode(workstationMode)
  return normalizeQuoteOutputMode(resellerDefault ?? 'pdf')
}

/** Default output by slab: R → Epson, W/F → PDF. Billing UI can override. */
export function resolveQuoteOutputModeForSlab(
  rateSlab: 'R' | 'W' | 'F',
  workstationMode?: ErpQuoteOutputMode | null,
  resellerDefault?: ErpQuoteOutputMode | null,
  override?: ErpQuoteOutputMode | null,
): ErpQuoteOutputMode {
  if (
    override === 'pdf' ||
    override === 'epson' ||
    override === 'bills_banao' ||
    override === 'both'
  ) {
    return override
  }
  if (rateSlab === 'R') return 'epson'
  if (rateSlab === 'W' || rateSlab === 'F') return 'pdf'
  return resolveQuoteOutputMode(workstationMode, resellerDefault)
}

export {
  printErpEstimateThermal,
  printErpEstimateThermalBillsBanao,
} from '@/lib/erp-billing-print'

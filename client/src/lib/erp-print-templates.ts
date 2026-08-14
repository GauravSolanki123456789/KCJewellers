/** Client-side print template defaults & variable help (mirrors scripts/erp-print-templates.js). */

export const DEFAULT_LABEL_PRN = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 738,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 738,77,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 666,77,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 738,53,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 666,53,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim()

export const DEFAULT_BILL_TEMPLATE = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
TAX INVOICE
Bill: {{bill_number}}
Date: {{bill_date}}
--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
GSTIN: {{customer_gst}}
--------------------------------
{{lines_table}}
--------------------------------
Items: {{item_count}}
Gold rate: Rs.{{gold_rate}}/g
Silver rate: Rs.{{silver_rate}}/g
--------------------------------
TOTAL: Rs. {{total}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Thank you — visit again!
`.trim()

export const LABEL_TEMPLATE_VARS = [
  'barcode',
  'product_name',
  'style_code',
  'item_code',
  'sku',
  'gross_weight',
  'net_weight',
  'avg_weight',
  'wastage_pct',
  'mc_rate',
  'mc_type',
  'company_code',
  'metal_type',
  'pcs',
  'bags',
] as const

export const BILL_TEMPLATE_VARS = [
  'shop_name',
  'shop_address',
  'shop_phone',
  'shop_gstin',
  'bill_number',
  'bill_date',
  'customer_name',
  'customer_mobile',
  'customer_address',
  'customer_gst',
  'lines_table',
  'item_count',
  'subtotal',
  'total',
  'advance_paid',
  'balance',
  'gold_rate',
  'silver_rate',
] as const

export type ErpPrintFormatsSettings = {
  labelPrnTemplate?: string
  labelUsePrn?: boolean
  billTemplate?: string
  shopName?: string
  shopAddress?: string
  shopPhone?: string
  shopGstin?: string
}

export function migratePrintFormats(raw: ErpPrintFormatsSettings | null | undefined): ErpPrintFormatsSettings {
  const pf: ErpPrintFormatsSettings = { ...(raw || {}) }
  pf.labelPrnTemplate = normalizePrnTemplate(pf.labelPrnTemplate || DEFAULT_LABEL_PRN)
  if (!pf.billTemplate?.trim()) pf.billTemplate = DEFAULT_BILL_TEMPLATE
  if (pf.labelUsePrn == null) pf.labelUsePrn = true
  if (!pf.shopName) pf.shopName = 'B N MARLECHA SILVER'
  return pf
}

/** Normalize line endings only — keeps leading blank lines and empty TEXT rows. */
export function preservePrnTemplate(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function repairCorruptedPrnTemplate(raw: string): string {
  let s = preservePrnTemplate(raw).trim()
  if (!s) return DEFAULT_LABEL_PRN

  s = s.replace(/SET PEEL OFFSET/gi, 'SET PEEL OFF\nSET')
  s = s.replace(/SET CUTTER OFFSET/gi, 'SET CUTTER OFF\nSET')
  s = s.replace(/SET PARTIAL_CUTTER OFFSET/gi, 'SET PARTIAL_CUTTER OFF\nSET')
  s = s.replace(/TEAR ON\s*CLS/gi, 'SET TEAR ON\nCLS')
  s = s.replace(/(\d)\s*mm\s*([A-Z])/gi, '$1 mm\n$2')
  s = s.replace(/0,0\s*([A-Z])/g, '0,0\n$1')
  s = s.replace(/ON\s*CLS/gi, 'ON\nCLS')
  s = s.replace(/CLS\s*CODEPAGE/gi, 'CLS\nCODEPAGE')
  s = s.replace(/1252\s*TEXT/gi, '1252\nTEXT')
  s = s.replace(/"\s*TEXT/gi, '"\nTEXT')
  s = s.replace(/"\s*QRCODE/gi, '"\nQRCODE')

  const cmds = [
    'SIZE',
    'GAP',
    'DIRECTION',
    'REFERENCE',
    'OFFSET',
    'SET PEEL OFF',
    'SET CUTTER OFF',
    'SET PARTIAL_CUTTER OFF',
    'SET TEAR ON',
    'CLS',
    'CODEPAGE',
    'TEXT',
    'QRCODE',
    'BARCODE',
    'PRINT',
  ]
  for (const cmd of cmds) {
    const esc = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    s = s.replace(new RegExp(`(?<!\\n)(${esc})`, 'gi'), '\n$1')
  }

  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** Restore TSPL line breaks when server sanitize collapsed multi-line PRN. */
export function normalizePrnTemplate(raw: string | null | undefined): string {
  const preserved = preservePrnTemplate(raw)
  if (!preserved.trim()) return DEFAULT_LABEL_PRN
  if (isPrnTemplateLikelyCorrupted(preserved)) {
    return repairCorruptedPrnTemplate(preserved)
  }
  return preserved
}

export function isPrnTemplateLikelyCorrupted(raw: string | null | undefined): boolean {
  const s = String(raw || '')
  return /mmGAP|ONCLS|PEEL OFFSET|CUTTER OFFSET|1252TEXT/i.test(s) || (s.length > 80 && !s.includes('\n'))
}

/** Best-effort map from another software's sample PRN to our {{placeholders}}. */
export function suggestPrnPlaceholders(raw: string): string {
  let out = normalizePrnTemplate(raw)
  out = out.replace(
    /TEXT 738,101,"ROMAN\.TTF",180,1,8,"[^"]*"/,
    'TEXT 738,101,"ROMAN.TTF",180,1,8,"{{product_name}}"',
  )
  out = out.replace(
    /TEXT 666,77,"ROMAN\.TTF",180,1,9,"[^"]*"/,
    'TEXT 666,77,"ROMAN.TTF",180,1,9,"{{gross_weight}}"',
  )
  out = out.replace(
    /TEXT 666,53,"ROMAN\.TTF",180,1,9,"[^"]*"/,
    'TEXT 666,53,"ROMAN.TTF",180,1,9,"{{net_weight}}"',
  )
  out = out.replace(
    /TEXT 530,101,"ROMAN\.TTF",180,1,9,"[^"]*"/,
    'TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"',
  )
  out = out.replace(
    /TEXT 530,61,"ROMAN\.TTF",180,1,9,"[^"]*"/,
    'TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"',
  )
  out = out.replace(/QRCODE ([^\n]*),"[^"]+"/, 'QRCODE $1,"{{barcode}}"')
  out = out.replace(/"PLT-\d+"/gi, '"{{barcode}}"')
  out = out.replace(/"BMS\d*"/gi, '"{{company_code}}"')
  return normalizePrnTemplate(out)
}

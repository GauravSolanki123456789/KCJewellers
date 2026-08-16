/** Client-side print template defaults & variable help (mirrors scripts/erp-print-templates.js). */

export const DEFAULT_LABEL_PRN_SILVER = `
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
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 738,21,"ROMAN.TTF",180,1,8,""
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim()

export const DEFAULT_LABEL_PRN_GOLD = `
SIZE 92.5 mm, 15 mm
GAP 3 mm, 0 mm
DIRECTION 0,0
REFERENCE 0,0
OFFSET 0 mm
SET PEEL OFF
SET CUTTER OFF
SET PARTIAL_CUTTER OFF
SET
SET TEAR ON
CLS
CODEPAGE 1252
TEXT 720,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 720,77,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 648,77,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 720,53,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 648,53,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 720,29,"ROMAN.TTF",180,1,8,"MC:"
TEXT 648,29,"ROMAN.TTF",180,1,9,"{{mc_rate}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 720,21,"ROMAN.TTF",180,1,8,""
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim()

export const DEFAULT_LABEL_PRN_SILVER_EXTRAS = `
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
TEXT 738,29,"ROMAN.TTF",180,1,8,"V.A:"
TEXT 666,29,"ROMAN.TTF",180,1,9,"{{wastage_pct}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
TEXT 530,61,"ROMAN.TTF",180,1,9,"{{company_code}}"
TEXT 530,23,"ROMAN.TTF",180,1,9,""
TEXT 738,21,"ROMAN.TTF",180,1,8,""
QRCODE 418,70,L,3,A,180,M2,S7,"{{barcode}}"
PRINT 1,1
`.trim()

/** Legacy alias — silver standard layout. */
export const DEFAULT_LABEL_PRN = DEFAULT_LABEL_PRN_SILVER

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
Slab: {{rate_slab}}
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
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Collected: Rs. {{collected_amount}}
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
  'bag_wt',
  'stone_charges',
  'stone_wt',
  'box_charges',
  'purity',
] as const

export const LABEL_RULE_FIELD_KEYS = [
  'gross_weight',
  'bag_wt',
  'stone_charges',
  'stone_wt',
  'wastage_pct',
  'mc_rate',
  'bags',
  'box_charges',
] as const

export type LabelRuleFieldKey = (typeof LABEL_RULE_FIELD_KEYS)[number]

export type LabelPrnRule = {
  id: string
  name: string
  enabled?: boolean
  priority: number
  metalTypes: string[]
  requireAny?: LabelRuleFieldKey[]
  requireAll?: LabelRuleFieldKey[]
  requireNone?: LabelRuleFieldKey[]
  template: string
}

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
  'rate_slab',
  'subtotal',
  'total',
  'mc_discount',
  'cash_discount',
  'total_discount',
  'collected_amount',
  'advance_paid',
  'balance',
  'gold_rate',
  'silver_rate',
] as const

export type ErpPrintFormatsSettings = {
  labelPrnTemplate?: string
  labelPrnRules?: LabelPrnRule[]
  labelUsePrn?: boolean
  billTemplate?: string
  shopName?: string
  shopAddress?: string
  shopPhone?: string
  shopGstin?: string
}

export function newRuleId(): string {
  return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function buildDefaultLabelPrnRules(fallbackTemplate?: string): LabelPrnRule[] {
  const silverFallback = normalizePrnTemplate(fallbackTemplate || DEFAULT_LABEL_PRN_SILVER)
  return [
    {
      id: 'silver-extras',
      name: 'Silver · gross / bag / stone',
      enabled: true,
      priority: 30,
      metalTypes: ['SILVER'],
      requireAny: ['gross_weight', 'bag_wt', 'stone_charges'],
      requireAll: [],
      requireNone: [],
      template: DEFAULT_LABEL_PRN_SILVER_EXTRAS,
    },
    {
      id: 'gold',
      name: 'Gold',
      enabled: true,
      priority: 20,
      metalTypes: ['GOLD'],
      requireAny: [],
      requireAll: [],
      requireNone: [],
      template: DEFAULT_LABEL_PRN_GOLD,
    },
    {
      id: 'silver-standard',
      name: 'Silver · standard',
      enabled: true,
      priority: 10,
      metalTypes: ['SILVER'],
      requireAny: [],
      requireAll: [],
      requireNone: [],
      template: silverFallback,
    },
  ]
}

export function migrateLabelPrnRules(pf: ErpPrintFormatsSettings | null | undefined): LabelPrnRule[] {
  const raw = pf?.labelPrnRules
  if (!Array.isArray(raw) || !raw.length) return []
  return raw
    .map((rule) => ({
      id: String(rule.id || newRuleId()),
      name: String(rule.name || 'Label rule').trim() || 'Label rule',
      enabled: rule.enabled !== false,
      priority: Number(rule.priority) || 0,
      metalTypes: Array.isArray(rule.metalTypes)
        ? rule.metalTypes.map((t) => String(t).trim()).filter(Boolean)
        : [],
      requireAny: (rule.requireAny || []) as LabelRuleFieldKey[],
      requireAll: (rule.requireAll || []) as LabelRuleFieldKey[],
      requireNone: (rule.requireNone || []) as LabelRuleFieldKey[],
      template: normalizePrnTemplate(rule.template || pf?.labelPrnTemplate || DEFAULT_LABEL_PRN),
    }))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
}

export function preservePrnTemplate(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** Preserve Epson receipt line breaks and blank lines — never run PRN repair logic. */
export function preserveBillTemplate(raw: string | null | undefined): string {
  return preservePrnTemplate(raw)
}

export function migratePrintFormats(raw: ErpPrintFormatsSettings | null | undefined): ErpPrintFormatsSettings {
  const pf: ErpPrintFormatsSettings = { ...(raw || {}) }
  pf.labelPrnTemplate = normalizePrnTemplate(pf.labelPrnTemplate || DEFAULT_LABEL_PRN)
  pf.labelPrnRules = migrateLabelPrnRules(pf)
  if (pf.billTemplate?.trim()) {
    pf.billTemplate = preserveBillTemplate(pf.billTemplate)
  } else {
    pf.billTemplate = DEFAULT_BILL_TEMPLATE
  }
  if (pf.labelUsePrn == null) pf.labelUsePrn = true
  if (!pf.shopName) pf.shopName = 'B N MARLECHA SILVER'
  return pf
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

export const LABEL_RULE_FIELD_LABELS: Record<LabelRuleFieldKey, string> = {
  gross_weight: 'Gross weight',
  bag_wt: 'Bag weight',
  stone_charges: 'Stone charges',
  stone_wt: 'Stone weight',
  wastage_pct: 'Wastage %',
  mc_rate: 'MC rate',
  bags: 'Bags count',
  box_charges: 'Box charges',
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

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

/** Standard silver label — also the default fallback template. */
export const DEFAULT_LABEL_PRN = DEFAULT_LABEL_PRN_SILVER

/** Box-assigned pieces — prints box name on label (use with smart rule: box code present). */
export const DEFAULT_LABEL_PRN_BOX = `
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
TEXT 720,101,"ROMAN.TTF",180,1,8,"{{product_name}}"
TEXT 720,77,"ROMAN.TTF",180,1,8,"NWT:"
TEXT 648,77,"ROMAN.TTF",180,1,9,"{{net_weight}}"
TEXT 720,53,"ROMAN.TTF",180,1,8,"GWT:"
TEXT 648,53,"ROMAN.TTF",180,1,9,"{{gross_weight}}"
TEXT 720,29,"ROMAN.TTF",180,1,8,"BOX:"
TEXT 648,29,"ROMAN.TTF",180,1,9,"{{box_name}}"
TEXT 530,101,"ROMAN.TTF",180,1,9,"{{barcode}}"
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

export const DEFAULT_ESTIMATE_TEMPLATE_GOLD = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
GOLD ESTIMATE
Estimate: {{bill_number}}
Date: {{bill_date}}
Slab: {{rate_slab}}

--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
Address: {{customer_address}}
--------------------------------
{{lines_table}}
--------------------------------
Items: {{item_count}}
Gold rate: Rs.{{gold_rate}}/g
Silver rate: Rs.{{silver_rate}}/g
--------------------------------
ESTIMATE TOTAL: Rs. {{total}}
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Rates subject to change.
This is an estimate, not a tax invoice.
`.trim()

export const DEFAULT_ESTIMATE_TEMPLATE_SILVER = `
================================
{{shop_name}}
{{shop_address}}
Ph: {{shop_phone}}
GSTIN: {{shop_gstin}}
================================
SILVER ESTIMATE
Estimate: {{bill_number}}
Date: {{bill_date}}
Slab: {{rate_slab}}

--------------------------------
Customer: {{customer_name}}
Mobile: {{customer_mobile}}
Address: {{customer_address}}
--------------------------------
{{lines_table}}
--------------------------------
{{savings_block}}
Items: {{item_count}}
Silver rate: Rs.{{silver_rate}}/g (live Rs.{{live_silver_rate}}/g)
--------------------------------
ESTIMATE TOTAL: Rs. {{total}}
MC discount: Rs. {{mc_discount}}
Cash discount: Rs. {{cash_discount}}
Total discount: Rs. {{total_discount}}
Advance: Rs. {{advance_paid}}
Balance: Rs. {{balance}}
================================
Rates subject to change.
This is an estimate, not a tax invoice.

Note: Epson "Generate estimate" uses a separate
ROUGH ESTIMATE layout (weight, Rate/Gm, MC total,
CGST/SGST). Silver items omit purity/karat.
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
  'stone_weight',
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
  'box_code',
  'box_name',
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
  'savings_block',
  'live_silver_rate',
] as const

export type EstimatePrintMode = 'rough' | 'custom'

export type ErpPrintFormatsSettings = {
  labelPrnTemplate?: string
  labelPrnRules?: LabelPrnRule[]
  labelUsePrn?: boolean
  billTemplate?: string
  estimateTemplateGold?: string
  estimateTemplateSilver?: string
  /** Shop-wide default when staff clicks Generate quote (workstation can override). */
  defaultQuoteOutputMode?: 'pdf' | 'epson' | 'both'
  /** Slab R gold: show MC ₹ on bills/estimates (default). When false, show wastage % like Slab W/F. */
  goldSlabRShowMc?: boolean
  /** Epson estimate: rough (legacy layout) or custom (gold/silver template textareas). */
  estimatePrintMode?: EstimatePrintMode
  /** When custom estimate mode, print duplicate copy below original. */
  estimateDuplicateCopy?: boolean
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

/** Restore line breaks when sanitize or legacy save collapsed a multi-line Epson template. */
export function repairCollapsedBillTemplate(raw: string | null | undefined): string {
  const preserved = preserveBillTemplate(raw)
  if (!preserved.trim()) return preserved
  if (preserved.includes('\n')) return preserved

  let s = preserved
  s = s.replace(/={8,}/g, '\n$&\n')
  s = s.replace(/-{8,}/g, '\n$&\n')
  const breaks = [
    'TAX INVOICE',
    'GOLD ESTIMATE',
    'SILVER ESTIMATE',
    'Bill:',
    'Estimate:',
    'Date:',
    'Slab:',
    'Customer:',
    'Mobile:',
    'Address:',
    'GSTIN:',
    'Ph:',
    'Items:',
    'Gold rate:',
    'Silver rate:',
    'TOTAL:',
    'ESTIMATE TOTAL:',
    'MC discount:',
    'Cash discount:',
    'Total discount:',
    'Collected:',
    'Advance:',
    'Balance:',
    'Rates subject',
    'Thank you',
    'This is an estimate',
    '{{lines_table}}',
  ]
  for (const token of breaks) {
    s = s.split(token).join(`\n${token}`)
  }
  s = s.replace(/\{\{([^}]+)\}\}/g, '{{$1}}')
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function applyBillTemplatePreservation(raw: string | null | undefined, fallback: string): string {
  const preserved = preserveBillTemplate(raw)
  if (!preserved.trim()) return fallback
  return repairCollapsedBillTemplate(preserved)
}

export function migratePrintFormats(raw: ErpPrintFormatsSettings | null | undefined): ErpPrintFormatsSettings {
  const pf: ErpPrintFormatsSettings = { ...(raw || {}) }
  pf.labelPrnTemplate = normalizePrnTemplate(pf.labelPrnTemplate || DEFAULT_LABEL_PRN)
  pf.labelPrnRules = migrateLabelPrnRules(pf)
  if (pf.billTemplate?.trim()) {
    pf.billTemplate = applyBillTemplatePreservation(pf.billTemplate, DEFAULT_BILL_TEMPLATE)
  } else {
    pf.billTemplate = DEFAULT_BILL_TEMPLATE
  }
  if (pf.estimateTemplateGold?.trim()) {
    pf.estimateTemplateGold = applyBillTemplatePreservation(
      pf.estimateTemplateGold,
      DEFAULT_ESTIMATE_TEMPLATE_GOLD,
    )
  } else {
    pf.estimateTemplateGold = DEFAULT_ESTIMATE_TEMPLATE_GOLD
  }
  if (pf.estimateTemplateSilver?.trim()) {
    pf.estimateTemplateSilver = applyBillTemplatePreservation(
      pf.estimateTemplateSilver,
      DEFAULT_ESTIMATE_TEMPLATE_SILVER,
    )
  } else {
    pf.estimateTemplateSilver = DEFAULT_ESTIMATE_TEMPLATE_SILVER
  }
  if (!pf.defaultQuoteOutputMode) pf.defaultQuoteOutputMode = 'pdf'
  if (pf.labelUsePrn == null) pf.labelUsePrn = true
  if (pf.goldSlabRShowMc == null) pf.goldSlabRShowMc = true
  if (!pf.estimatePrintMode) pf.estimatePrintMode = 'rough'
  if (pf.estimateDuplicateCopy == null) pf.estimateDuplicateCopy = true
  if (!pf.shopName) pf.shopName = 'B N MARLECHA SILVER'
  return pf
}

/** Pick gold vs silver Epson estimate template from bill line metals. */
export function resolveEstimateTemplateForBill(
  lines: { metal_type?: string | null }[] | null | undefined,
  printFormats: ErpPrintFormatsSettings | null | undefined,
): string {
  const pf = migratePrintFormats(printFormats)
  const list = lines || []
  let gold = 0
  let silver = 0
  for (const line of list) {
    const metal = String(line?.metal_type || '').toLowerCase()
    if (metal.startsWith('gold')) gold += 1
    else silver += 1
  }
  if (gold > 0 && silver === 0) return pf.estimateTemplateGold || DEFAULT_ESTIMATE_TEMPLATE_GOLD
  if (silver > 0 && gold === 0) return pf.estimateTemplateSilver || DEFAULT_ESTIMATE_TEMPLATE_SILVER
  return gold >= silver
    ? pf.estimateTemplateGold || DEFAULT_ESTIMATE_TEMPLATE_GOLD
    : pf.estimateTemplateSilver || DEFAULT_ESTIMATE_TEMPLATE_SILVER
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
  box_code: 'Box code',
  box_name: 'Box name (label)',
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

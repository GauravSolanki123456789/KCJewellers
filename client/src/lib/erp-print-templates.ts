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
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,68,L,2,A,180,M2,S7,"{{qr_code}}"
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
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 720,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,68,L,2,A,180,M2,S7,"{{qr_code}}"
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
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"
QRCODE 418,68,L,2,A,180,M2,S7,"{{qr_code}}"
PRINT 1,1
`.trim()

/** Standard silver label — also the default fallback template. */
export const DEFAULT_LABEL_PRN = DEFAULT_LABEL_PRN_SILVER

/**
 * TSC 3-across sheet (same TTP-244, different media).
 * COLUMNS / COLUMN_PITCH / SIZE / GAP and every TEXT/BARCODE x,y live in this PRN —
 * edit them in Print formats. Software only tiles by COLUMNS × COLUMN_PITCH.
 */
export const DEFAULT_LABEL_PRN_3ACROSS = `
COLUMNS 3
COLUMN_PITCH 34.67 mm
SIZE 104 mm, 22 mm
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
TEXT 268,152,"ROMAN.TTF",180,1,8,"{{product_name_short}}"
TEXT 268,118,"ROMAN.TTF",180,1,7,"GWT:{{gross_weight}}"
TEXT 268,84,"ROMAN.TTF",180,1,7,"NWT:{{net_weight}}"
TEXT 268,50,"ROMAN.TTF",180,1,7,"Pcs:{{pcs_label}}"
TEXT 168,152,"ROMAN.TTF",180,1,7,"{{barcode}}"
QRCODE 168,106,L,2,A,180,"{{qr_code}}"
TEXT 168,36,"ROMAN.TTF",180,1,8,"{{company_code}}"
PRINT 1,1
`.trim()

export const TSC_PRN_LAYOUT_STANDARD = 'standard'
export const TSC_PRN_LAYOUT_3ACROSS = 'tsc-3across'

export type TscPrnLayoutId = typeof TSC_PRN_LAYOUT_STANDARD | typeof TSC_PRN_LAYOUT_3ACROSS

export function normalizeTscPrnLayout(raw?: string | null): TscPrnLayoutId {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (
    s === 'tsc_3across' ||
    s === 'tsc3across' ||
    s === '3across' ||
    s === '3_across' ||
    s === 'three_across'
  ) {
    return TSC_PRN_LAYOUT_3ACROSS
  }
  return TSC_PRN_LAYOUT_STANDARD
}

export function tscPrnLayoutLabel(raw?: string | null): string {
  return normalizeTscPrnLayout(raw) === TSC_PRN_LAYOUT_3ACROSS
    ? 'TSC 3-across'
    : 'Standard TSC'
}

/** Workstation override + printer profile — profile 3-across wins over a stale "standard" PC override. */
export function resolvePrintPrnLayout(
  workstation: { prnTemplateName?: string | null },
  printerProfile: { prnTemplateName?: string | null; name?: string } | null | undefined,
): TscPrnLayoutId {
  const ws = workstation.prnTemplateName ? normalizeTscPrnLayout(workstation.prnTemplateName) : null
  const fromProfile = printerProfile?.prnTemplateName
    ? normalizeTscPrnLayout(printerProfile.prnTemplateName)
    : null
  const nameHint =
    printerProfile?.name && /3.?across/i.test(printerProfile.name)
      ? TSC_PRN_LAYOUT_3ACROSS
      : null

  if (ws === TSC_PRN_LAYOUT_3ACROSS) return TSC_PRN_LAYOUT_3ACROSS
  if (fromProfile === TSC_PRN_LAYOUT_3ACROSS || nameHint === TSC_PRN_LAYOUT_3ACROSS) {
    return TSC_PRN_LAYOUT_3ACROSS
  }
  if (ws) return ws
  return fromProfile || TSC_PRN_LAYOUT_STANDARD
}

/** Zebra GC420t sample — multiline ZPL (same commands as one-line export). */
export const DEFAULT_LABEL_ZPL = `CT~~CD,~CC^~CT~
^XA~TA000~JSN^LT0^MNW^MTT^PON^PMN^LH0,0^JMA^PR2,2~SD15^JUS^LRN^CI0^XZ
^XA
^MMT
^PW280
^LL0120
^LS0
^BY1,3,46^FT9,97^BCN,,N,N
^FD{{barcode}}^FS
^FT25,33^A0N,14,14^FH^FD{{product_name}}^FS
^FT20,50^A0N,17,16^FH^FD{{company_code}}^FS
^FT156,40^A0N,23,24^FH^FDWT:{{gross_weight}}^FS
^FT158,68^A0N,23,24^FH^FDPCS:{{pcs_label}}^FS
^FT150,102^A0N,23,24^FH^FDMY925 {{net_weight}}^FS
^FT157,120^A0N,22,21^FH^FDInc:{{size}}^FS
^FT20,120^A0N,23,21^FH^FD{{barcode}}^FS
^PQ1,0,1,Y^XZ`.trim()

export function isZplLabelTemplate(raw: string | null | undefined): boolean {
  return /\^XA|\^XZ|\^FO|\^FT|\^BY|\^BCN|\^FD|\^PQ|\^A0/i.test(String(raw || ''))
}

export function migrateZplPlaceholders(raw: string | null | undefined): string {
  let s = String(raw || '')
  const pairs: [string, string][] = [
    ['TAGNO_ALPHA', 'barcode'],
    ['TAGNO', 'barcode'],
    ['INAME', 'product_name'],
    ['DESIGN', 'company_code'],
    ['GROSS', 'gross_weight'],
    ['QTY', 'pcs_label'],
    ['SIZENORMAL', 'size'],
    ['MC', 'net_weight'],
  ]
  for (const [tag, key] of pairs) {
    s = s.replace(new RegExp(`<${tag}>`, 'gi'), `{{${key}}}`)
  }
  return s
}

export function sanitizeZplControlChars(raw: string): string {
  return String(raw || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export function preserveZplTemplate(raw: string | null | undefined): string {
  return sanitizeZplControlChars(migrateZplPlaceholders(String(raw || '')))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}

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
TEXT 530,23,"ROMAN.TTF",180,1,9,"RFID:{{rfid_tag}}"
QRCODE 418,68,L,2,A,180,M2,S7,"{{qr_code}}"
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

/**
 * Epson L3310 / cut-sheet estimate. PAPER / MARGIN_MM / FONT_PT / FONT are read by
 * the print service — edit them here, they are not hardcoded in software.
 * {{estimate_body}} is the same Marlecha item list used on the 80mm roll.
 */
export const DEFAULT_ESTIMATE_SHEET_TEMPLATE = `
PAPER A5
MARGIN_MM 10
FONT_PT 9
FONT Courier New
{{estimate_body}}
`.trim()

export const LABEL_TEMPLATE_VARS = [
  'barcode',
  'qr_code',
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
  'pcs_label',
  'bags',
  'bag_wt',
  'stone_charges',
  'stone_wt',
  'stone_weight',
  'box_charges',
  'purity',
  'rfid_tag',
  'tag_no',
] as const

export const LABEL_RULE_FIELD_KEYS = [
  'gross_weight',
  'net_weight',
  'bag_wt',
  'stone_charges',
  'stone_wt',
  'wastage_pct',
  'mc_rate',
  'bags',
  'box_charges',
  'box_code',
  'box_name',
  'fixed_price',
  'rfid_tag',
  'pcs_gt_1',
] as const

export type LabelRuleFieldKey = (typeof LABEL_RULE_FIELD_KEYS)[number]

export type LabelPrnRule = {
  id: string
  name: string
  enabled?: boolean
  priority: number
  metalTypes: string[]
  /** All listed fields must have a value (AND). Stored as requireAny for backward compatibility. */
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
  'estimate_body',
] as const

export type EstimatePrintMode = 'rough' | 'custom'

export type ErpPrintFormatsSettings = {
  labelPrnTemplate?: string
  labelPrnRules?: LabelPrnRule[]
  labelUsePrn?: boolean
  labelZebraPrnTemplate?: string
  labelZebraPrnRules?: LabelPrnRule[]
  labelUseZebraPrn?: boolean
  labelTvsLp46PrnTemplate?: string
  labelTvsLp46PrnRules?: LabelPrnRule[]
  labelUseTvsLp46Prn?: boolean
  /** Separate TSC 3-across sheet PRN — never overwrites the standard jewelry-tag PRN. */
  labelPrnTemplate3Across?: string
  labelPrn3AcrossRules?: LabelPrnRule[]
  billTemplate?: string
  estimateTemplateGold?: string
  estimateTemplateSilver?: string
  /** Cut-sheet Epson L3310 estimate — independent of the 80mm thermal Marlecha template. */
  estimateSheetTemplate?: string
  /** Shop-wide default when staff clicks Generate quote (workstation can override). */
  defaultQuoteOutputMode?: 'pdf' | 'epson' | 'bills_banao' | 'both'
  /** Slab R gold: show MC ₹ on bills/estimates (default). When false, show wastage % like Slab W/F. */
  goldSlabRShowMc?: boolean
  /** Epson estimate: rough (legacy layout) or custom (gold/silver template textareas). */
  estimatePrintMode?: EstimatePrintMode
  /** When custom estimate mode, print duplicate copy below original. */
  estimateDuplicateCopy?: boolean
  /** Photo grid on quotation PDF (default off). Set in Print formats → Estimate tab. */
  showEstimatePdfPhotos?: boolean
  /** Purity column on bill, estimate, and approval PDFs (default off). Print formats. */
  showPurityInBillEstimatePdf?: boolean
  /** When ON, silver ₹/g entered in wholesale/slab rate dialogs is stored as rate − 3%. Default off. */
  minusThreePctSilverRate?: boolean
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
      requireAny: ['net_weight', 'mc_rate'],
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
      requireAny: normalizeLabelRuleFieldList(rule.requireAny),
      requireAll: normalizeLabelRuleFieldList(rule.requireAll),
      requireNone: normalizeLabelRuleFieldList(rule.requireNone),
      template: normalizePrnTemplate(rule.template || pf?.labelPrnTemplate || DEFAULT_LABEL_PRN),
    }))
    .map((rule) => {
      const namedPcs = /pcs\s*greater\s*than\s*1/i.test(rule.name)
      const requireAll = [...(rule.requireAll || [])]
      if (namedPcs && !requireAll.includes('pcs_gt_1')) requireAll.push('pcs_gt_1')
      let template = rule.template
      if (!/\{\{\s*pcs/i.test(template)) {
        template = template.replace(
          /TEXT 738,21,"ROMAN\.TTF",180,1,8,""/,
          'TEXT 738,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"',
        )
        template = template.replace(
          /TEXT 720,21,"ROMAN\.TTF",180,1,8,""/,
          'TEXT 720,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"',
        )
        if (namedPcs && !/\{\{\s*pcs/i.test(template)) {
          template = template.replace(
            /PRINT 1,1\s*$/m,
            'TEXT 400,21,"ROMAN.TTF",180,1,8,"{{pcs_label}}"\nPRINT 1,1',
          )
        }
      }
      return { ...rule, requireAll, template }
    })
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
  pf.labelPrnTemplate3Across = normalizePrnTemplateOrFallback(
    pf.labelPrnTemplate3Across,
    DEFAULT_LABEL_PRN_3ACROSS,
  )
  if (Array.isArray(pf.labelPrn3AcrossRules) && pf.labelPrn3AcrossRules.length) {
    pf.labelPrn3AcrossRules = pf.labelPrn3AcrossRules.map((rule) => ({
      ...rule,
      template: normalizePrnTemplateOrFallback(
        rule.template || pf.labelPrnTemplate3Across,
        DEFAULT_LABEL_PRN_3ACROSS,
      ),
    }))
  }
  pf.labelTvsLp46PrnTemplate = normalizePrnTemplate(
    pf.labelTvsLp46PrnTemplate || pf.labelPrnTemplate || DEFAULT_LABEL_PRN,
  )
  if (pf.labelUseTvsLp46Prn == null) pf.labelUseTvsLp46Prn = true
  pf.labelZebraPrnTemplate = formatZplForEditor(
    normalizeLabelTemplate(pf.labelZebraPrnTemplate || DEFAULT_LABEL_ZPL, 'zpl'),
  )
  if (pf.labelUseZebraPrn == null) pf.labelUseZebraPrn = true
  if (Array.isArray(pf.labelZebraPrnRules) && pf.labelZebraPrnRules.length) {
    pf.labelZebraPrnRules = pf.labelZebraPrnRules.map((rule) => ({
      ...rule,
      template: formatZplForEditor(
        normalizeLabelTemplate(rule.template || pf.labelZebraPrnTemplate, 'zpl'),
      ),
    }))
  }
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
  if (pf.estimateSheetTemplate?.trim()) {
    pf.estimateSheetTemplate = preserveBillTemplate(pf.estimateSheetTemplate)
  } else {
    pf.estimateSheetTemplate = DEFAULT_ESTIMATE_SHEET_TEMPLATE
  }
  if (!pf.defaultQuoteOutputMode) pf.defaultQuoteOutputMode = 'pdf'
  if (pf.labelUsePrn == null) pf.labelUsePrn = true
  if (Array.isArray(pf.labelTvsLp46PrnRules) && pf.labelTvsLp46PrnRules.length) {
    pf.labelTvsLp46PrnRules = pf.labelTvsLp46PrnRules.map((rule) => ({
      ...rule,
      template: normalizePrnTemplate(
        rule.template || pf.labelTvsLp46PrnTemplate || pf.labelPrnTemplate || DEFAULT_LABEL_PRN,
      ),
    }))
  }
  if (pf.goldSlabRShowMc == null) pf.goldSlabRShowMc = true
  if (!pf.estimatePrintMode) pf.estimatePrintMode = 'rough'
  if (pf.estimateDuplicateCopy == null) pf.estimateDuplicateCopy = true
  if (pf.showEstimatePdfPhotos == null) pf.showEstimatePdfPhotos = false
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

/** Merge `"{{\nbarcode}}"` → `"{{barcode}}"` after bad PRN repair split placeholders. */
export function fixSplitTemplatePlaceholders(raw: string | null | undefined): string {
  return String(raw || '')
    .replace(/"\{\{\s*\n\s*([\w.]+)\s*\}\}"/g, '"{{$1}}"')
    .replace(/,\s*"\{\{\s*\n\s*([\w.]+)\s*\}\}"/g, ',"{{$1}}"')
    .replace(/\{\{\s*\n\s*([\w.]+)\s*\}\}/g, '{{$1}}')
}

function shieldTemplatePlaceholders(raw: string): { out: string; tokens: string[] } {
  const tokens: string[] = []
  const out = String(raw || '').replace(/\{\{([\w.]+)\}\}/g, (_m, key: string) => {
    const id = tokens.length
    tokens.push(`{{${key}}}`)
    return `\u0000KCPL${id}\u0000`
  })
  return { out, tokens }
}

function unshieldTemplatePlaceholders(raw: string, tokens: string[]): string {
  let out = String(raw || '')
  for (let id = 0; id < tokens.length; id += 1) {
    out = out.split(`\u0000KCPL${id}\u0000`).join(tokens[id])
  }
  return out
}

function repairCorruptedPrnTemplate(raw: string): string {
  let s = fixSplitTemplatePlaceholders(preservePrnTemplate(raw)).trim()
  if (!s) return DEFAULT_LABEL_PRN

  const shield = shieldTemplatePlaceholders(s)
  s = shield.out

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
  s = s.replace(/^\s*SET\s*$/gim, '')

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
    if (cmd === 'BARCODE') {
      s = s.replace(/(?<!\n)(BARCODE)\s+(?=\d)/gi, '\n$1 ')
      continue
    }
    s = s.replace(new RegExp(`(?<!\\n)(${esc})`, 'gi'), '\n$1')
  }

  s = unshieldTemplatePlaceholders(s, shield.tokens)
  s = fixSplitTemplatePlaceholders(s)

  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/** Restore TSPL line breaks when server sanitize collapsed multi-line PRN. */
export function normalizePrnTemplate(raw: string | null | undefined): string {
  return normalizePrnTemplateOrFallback(raw, DEFAULT_LABEL_PRN)
}

export function normalizePrnTemplateOrFallback(
  raw: string | null | undefined,
  fallback: string,
): string {
  const preserved = fixSplitTemplatePlaceholders(preservePrnTemplate(raw))
  if (!preserved.trim()) return fallback
  if (isZplLabelTemplate(preserved)) return preserveZplTemplate(preserved)
  if (isPrnTemplateLikelyCorrupted(preserved)) {
    return fixSplitTemplatePlaceholders(repairCorruptedPrnTemplate(preserved))
  }
  return preserved
}

export function isPrnTemplateLikelyCorrupted(raw: string | null | undefined): boolean {
  const s = String(raw || '')
  if (isZplLabelTemplate(s)) return false
  return /mmGAP|ONCLS|PEEL OFFSET|CUTTER OFFSET|1252TEXT/i.test(s) || (s.length > 80 && !s.includes('\n'))
}

export function normalizeLabelTemplate(
  raw: string | null | undefined,
  engine: 'tspl' | 'zpl',
): string {
  const preserved = preservePrnTemplate(raw)
  if (!preserved.trim()) return engine === 'zpl' ? DEFAULT_LABEL_ZPL : DEFAULT_LABEL_PRN
  if (engine === 'zpl' || isZplLabelTemplate(preserved)) return preserveZplTemplate(preserved)
  return normalizePrnTemplate(preserved)
}

/** GC420t with an "EPL" Windows driver often ignores raw ZPL until language is set. */
export function zebraEplDriverNeedsZplWake(windowsPrinterName: string | null | undefined): boolean {
  return /EPL/i.test(String(windowsPrinterName || ''))
}

function labelHeightMmFromTspl(tspl: string): number | null {
  const m = String(tspl || '').match(/SIZE\s+[\d.]+\s*mm\s*,\s*([\d.]+)\s*mm/i)
  if (!m) return null
  const h = parseFloat(m[1])
  return Number.isFinite(h) ? h : null
}

function labelWidthMmFromTspl(tspl: string): number | null {
  const m = String(tspl || '').match(/SIZE\s+([\d.]+)\s*mm\s*,/i)
  if (!m) return null
  const w = parseFloat(m[1])
  return Number.isFinite(w) ? w : null
}

/** Approximate QR print size in TSPL dots (203 dpi ≈ 8 dots/mm). */
function tsplQrSizeDots(cell: number): number {
  const c = Math.max(1, Math.min(4, cell))
  const modules = 21 + (c - 1) * 4
  return modules * c
}

/** Payload for TSPL QRCODE — mirrors scripts/erp-print-templates.js */
export function tsplQrContent(raw: string | null | undefined): string {
  let s = String(raw ?? '').trim().toUpperCase()
  if (!s) return ''
  s = s.replace(/[()]/g, '').replace(/\s+/g, '')
  s = s.replace(/"/g, "'")
  return s.slice(0, 120)
}

/** Sanitize QRCODE payload only — keep PRN x/y/cell/rotation (auto nudge broke 180° QRs). */
export function fixTsplQrcodeCommands(tspl: string): string {
  const heightMm = labelHeightMmFromTspl(tspl)
  const smallTag = heightMm != null && heightMm <= 16
  return String(tspl || '')
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!/^QRCODE\b/i.test(t)) return line
      const dataMatch = t.match(/"([^"]*)"\s*$/)
      let data = dataMatch ? String(dataMatch[1] || '').trim() : ''
      data = tsplQrContent(data)
      if (!data) return ''
      const m = t.match(
        /^QRCODE\s+(\d+)\s*,\s*(\d+)\s*,\s*([LMQH])\s*,\s*(\d+)\s*,\s*([AMan])\s*,\s*(\d+)(?:\s*,\s*M2\s*,\s*S7)?/i,
      )
      const rot = m ? String(m[6] || '0') : '0'
      const x = m ? parseInt(m[1], 10) : 92
      const y = m ? parseInt(m[2], 10) : 22
      const ecc = m ? String(m[3] || 'L').toUpperCase() : 'L'
      let cell = m ? parseInt(m[4], 10) || 2 : 2
      cell = Math.min(4, Math.max(1, cell))
      if (smallTag && data.length <= 20 && cell < 2) cell = 2
      const hasModel = /,\s*M2\s*,\s*S7/i.test(t)
      const modelSuffix = hasModel ? ',M2,S7' : ',M2,S7'
      return `QRCODE ${x},${y},${ecc},${cell},A,${rot}${modelSuffix},"${data}"`
    })
    .filter((line) => line !== '')
    .join('\n')
}

function stripBareSetLines(tspl: string): string {
  return String(tspl || '')
    .split('\n')
    .filter((line) => !/^\s*SET\s*$/i.test(line.trim()))
    .join('\n')
}

/** Omit TSPL TEXT lines that only print an empty RFID value (mirrors server renderTemplate). */
function stripEmptyRfidLabelLines(tspl: string): string {
  return String(tspl || '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!/^TEXT\b/i.test(t)) return true
      const m = t.match(/,"([^"]*)"\s*$/)
      if (!m) return true
      const labelText = m[1]
      if (/^RFID:\s*$/i.test(labelText)) return false
      if (/^RFID:\{\{rfid_tag\}\}$/i.test(labelText)) return false
      return true
    })
    .join('\n')
}

function normalizeLabelRuleFieldKey(field: string): LabelRuleFieldKey | string {
  const f = String(field || '').trim()
  if (f === 'avg_weight' || f === 'weight_gm') return 'net_weight'
  return f
}

function normalizeLabelRuleFieldList(list: unknown): LabelRuleFieldKey[] {
  if (!Array.isArray(list)) return []
  return list
    .map((f) => normalizeLabelRuleFieldKey(String(f)))
    .filter(Boolean) as LabelRuleFieldKey[]
}

export function formatRawLabelForPrint(
  raw: string,
  windowsPrinterName?: string | null,
): string {
  if (isZplLabelTemplate(raw)) {
    const body = sanitizeZplControlChars(preserveZplTemplate(raw))
    const wire = body.includes('\n') ? body.split('\n').join('\r\n') : body
    let out = `${wire}\r\n`
    if (zebraEplDriverNeedsZplWake(windowsPrinterName)) {
      out = `! U1 setvar "device.languages" "zpl"\r\n${out}`
    }
    return out
  }
  const body = fixTsplQrcodeCommands(
    stripBareSetLines(stripEmptyRfidLabelLines(normalizePrnTemplate(raw))),
  )
  return `${body.split('\n').join('\r\n')}\r\n`
}

export function buildDefaultLabelZebraPrnRules(fallbackTemplate?: string): LabelPrnRule[] {
  const base = preserveZplTemplate(fallbackTemplate || DEFAULT_LABEL_ZPL)
  return [
    {
      id: 'zebra-gold',
      name: 'Gold',
      enabled: true,
      priority: 20,
      metalTypes: ['GOLD'],
      requireAny: [],
      requireAll: [],
      requireNone: [],
      template: base,
    },
    {
      id: 'zebra-silver',
      name: 'Silver · standard',
      enabled: true,
      priority: 10,
      metalTypes: ['SILVER'],
      requireAny: ['net_weight', 'mc_rate'],
      requireAll: [],
      requireNone: [],
      template: base,
    },
  ]
}

export const LABEL_RULE_FIELD_LABELS: Record<LabelRuleFieldKey, string> = {
  gross_weight: 'Gross weight',
  net_weight: 'Net weight',
  bag_wt: 'Bag weight',
  stone_charges: 'Stone charges',
  stone_wt: 'Stone weight',
  wastage_pct: 'Wastage %',
  mc_rate: 'MC rate',
  bags: 'Bags count',
  box_charges: 'Box charges',
  box_code: 'Box code',
  box_name: 'Box name (label)',
  fixed_price: 'Fixed price / MRP',
  rfid_tag: 'RFID tag',
  pcs_gt_1: 'Pcs greater than 1',
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

export function formatZplForEditor(raw: string): string {
  const s = preserveZplTemplate(raw)
  const logicalLines = s.split('\n').filter((l) => l.trim()).length
  if (logicalLines >= 4) return s
  return s
    .replace(/~\^CT~\^XA/g, '~^CT~\n^XA')
    .replace(/\^XZ\^XA/g, '^XZ\n^XA')
    .replace(/\^XA/g, '\n^XA')
    .replace(/\^MMT/g, '\n^MMT')
    .replace(/\^PW(\d+)/g, '\n^PW$1')
    .replace(/\^LL(\d+)/g, '\n^LL$1')
    .replace(/\^LS(\d+)/g, '\n^LS$1')
    .replace(/\^BY/g, '\n^BY')
    .replace(/\^FT/g, '\n^FT')
    .replace(/\^PQ/g, '\n^PQ')
    .replace(/\^XZ/g, '\n^XZ')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Zebra .prn — map Designer tags and normalize line breaks (no TSPL repair). */
export function suggestZplPlaceholders(raw: string): string {
  return formatZplForEditor(migrateZplPlaceholders(raw))
}

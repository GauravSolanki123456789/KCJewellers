/** Editable tax invoice / e-invoice / e-way PDF layout (per reseller). */

export type ErpTaxInvoiceCopyLabels = [string, string, string]

export type ErpTaxInvoiceTemplateConfig = {
  /** marlecha | custom */
  preset?: string
  copyLabels: ErpTaxInvoiceCopyLabels
  headerTitle: string
  shopName: string
  addressLines: string[]
  phoneEmailLine: string
  panLine: string
  gstinLine: string
  billingAddressLabel: string
  toLabel: string
  billNoLabel: string
  dateLabel: string
  placeOfSupplyLabel: string
  tableColumns: string[]
  partySignatureLabel: string
  totalsLabels: {
    total: string
    igst: string
    cgst: string
    sgst: string
    roundOff: string
    netAmount: string
  }
  termsTitle: string
  termsLines: string[]
  jurisdictionLine: string
  bankLines: string[]
  authorisedForPrefix: string
  authorisedSignatoryLabel: string
  electronicRefLabel: string
  /** Optional uploaded reference (data URL or path) */
  referenceImage?: string | null
  /** Raw OCR / notepad edit buffer */
  sourceText?: string | null
  updatedAt?: string | null
}

export const DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE: ErpTaxInvoiceTemplateConfig = {
  preset: 'marlecha',
  copyLabels: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR RECIPIENT', 'TRIPLICATE FOR SUPPLIER'],
  headerTitle: 'TAX INVOICE CUM DELIVERY CHALLAN',
  shopName: 'B.N. MARLECHA SILVER',
  addressLines: ['No : 10/24A, 2nd Floor,', 'Vijay Complex, Veerappan Street, Sowcarpet, Chennai-600079'],
  phoneEmailLine: 'Ph : 044 - 4272 8080 , E-mail Id : bnmarlechasilver@gmail.com',
  panLine: 'PAN : AAAHB1074R',
  gstinLine: 'GSTIN : 33AAAHB1074R1ZB',
  billingAddressLabel: 'Billing Address',
  toLabel: 'To',
  billNoLabel: 'Bill No :',
  dateLabel: 'Date :',
  placeOfSupplyLabel: 'Place Of Supply',
  tableColumns: [
    'SlNo',
    'Description of Goods',
    'HSN Code',
    'Gross Wt. in-Kgs',
    'Net Wt. in-Kgs',
    'Rate',
    'Amount ( in Rs. )',
  ],
  partySignatureLabel: 'Party Signature',
  totalsLabels: {
    total: 'Total',
    igst: 'IGST 3.00%',
    cgst: 'CGST 1.50%',
    sgst: 'SGST 1.50%',
    roundOff: 'Round Off',
    netAmount: 'Net Amount',
  },
  termsTitle: 'Terms & Conditions',
  termsLines: [
    'Delivery of goods shall be taken after all Testing are Over.',
    'Interest @ 24% per annum will be charged for the Bills not paid within 15 days.',
    'Our responsibility ceases after the delivery of goods',
    'Goods once sold will not be taken back.',
  ],
  jurisdictionLine: 'Subject to Chennai Jurisdiction',
  bankLines: [
    'Bank : HDFC',
    'Branch : SOWCARPET, CHENNAI',
    'IFSC : HDFC0002077',
    'A/C No : 50200044121535',
  ],
  authorisedForPrefix: 'for',
  authorisedSignatoryLabel: 'Authorised Signatory',
  electronicRefLabel: 'Electronic Ref No :',
}

const MRP_TABLE_COLUMNS = [
  'SlNo',
  'Description of Goods',
  'HSN Code',
  'Qty',
  'Rate',
  'Amount ( in Rs. )',
]

function stripTemplatePlaceholders(s: string): string {
  return s
    .replace(/\{\{shop_name\}\}/gi, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeLines(lines: string[], max = 8): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of lines) {
    const line = stripTemplatePlaceholders(String(raw || ''))
    if (!line) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line)
    if (out.length >= max) break
  }
  return out
}

/** Clean OCR / save artifacts — dedupe address, terms, bank; never leak placeholders. */
export function sanitizeTaxInvoiceTemplate(
  cfg: ErpTaxInvoiceTemplateConfig,
): ErpTaxInvoiceTemplateConfig {
  const base = DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE
  return {
    ...cfg,
    copyLabels: [
      stripTemplatePlaceholders(cfg.copyLabels[0] || base.copyLabels[0]),
      stripTemplatePlaceholders(cfg.copyLabels[1] || base.copyLabels[1]),
      stripTemplatePlaceholders(cfg.copyLabels[2] || base.copyLabels[2]),
    ] as ErpTaxInvoiceCopyLabels,
    headerTitle: stripTemplatePlaceholders(cfg.headerTitle || base.headerTitle),
    shopName: stripTemplatePlaceholders(cfg.shopName || base.shopName),
    addressLines: dedupeLines(cfg.addressLines, 3),
    phoneEmailLine: stripTemplatePlaceholders(cfg.phoneEmailLine || base.phoneEmailLine),
    panLine: stripTemplatePlaceholders(cfg.panLine || base.panLine),
    gstinLine: stripTemplatePlaceholders(cfg.gstinLine || base.gstinLine),
    termsLines: dedupeLines(cfg.termsLines, 4),
    bankLines: dedupeLines(cfg.bankLines, 4),
    tableColumns: dedupeLines(cfg.tableColumns, 7),
    authorisedForPrefix: 'for',
    sourceText: null,
  }
}

export function mrpTableColumns(): string[] {
  return [...MRP_TABLE_COLUMNS]
}

export function templateConfigToEditableText(cfg: ErpTaxInvoiceTemplateConfig): string {
  const lines: string[] = [
    `[COPY 1] ${cfg.copyLabels[0]}`,
    `[COPY 2] ${cfg.copyLabels[1]}`,
    `[COPY 3] ${cfg.copyLabels[2]}`,
    '',
    cfg.headerTitle,
    cfg.shopName,
    ...cfg.addressLines,
    cfg.phoneEmailLine,
    cfg.panLine,
    cfg.gstinLine,
    '',
    cfg.billingAddressLabel,
    cfg.toLabel,
    cfg.billNoLabel,
    cfg.dateLabel,
    cfg.placeOfSupplyLabel,
    '',
    `[TABLE] ${cfg.tableColumns.join(' | ')}`,
    '',
    cfg.partySignatureLabel,
    ...Object.values(cfg.totalsLabels).map((l) => `[TOTAL] ${l}`),
    '',
    cfg.termsTitle,
    ...cfg.termsLines.map((t, i) => `${i + 1}. ${t}`),
    cfg.jurisdictionLine,
    '',
    ...cfg.bankLines,
    '',
    `${cfg.authorisedForPrefix} ${cfg.shopName}`,
    cfg.authorisedSignatoryLabel,
    cfg.electronicRefLabel,
  ]
  return lines.join('\n')
}

export function parseEditableTextToTemplate(
  text: string,
  base: ErpTaxInvoiceTemplateConfig = DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE,
): ErpTaxInvoiceTemplateConfig {
  const lines = text.split(/\r?\n/)
  const next = { ...base, copyLabels: [...base.copyLabels] as ErpTaxInvoiceCopyLabels, addressLines: [...base.addressLines], termsLines: [...base.termsLines], bankLines: [...base.bankLines], tableColumns: [...base.tableColumns] }
  const copyLabels: string[] = []
  const terms: string[] = []
  const bank: string[] = []
  let tableCols: string[] | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('[COPY 1]')) copyLabels[0] = line.replace('[COPY 1]', '').trim()
    else if (line.startsWith('[COPY 2]')) copyLabels[1] = line.replace('[COPY 2]', '').trim()
    else if (line.startsWith('[COPY 3]')) copyLabels[2] = line.replace('[COPY 3]', '').trim()
    else if (line.startsWith('[TABLE]')) {
      tableCols = line.replace('[TABLE]', '').trim().split('|').map((s) => s.trim())
    } else if (line.startsWith('[TOTAL]')) {
      const label = line.replace('[TOTAL]', '').trim()
      if (label.toLowerCase().includes('igst')) next.totalsLabels.igst = label
      else if (label.toLowerCase().includes('cgst')) next.totalsLabels.cgst = label
      else if (label.toLowerCase().includes('sgst')) next.totalsLabels.sgst = label
      else if (label.toLowerCase().includes('round')) next.totalsLabels.roundOff = label
      else if (label.toLowerCase().includes('net')) next.totalsLabels.netAmount = label
      else next.totalsLabels.total = label
    } else if (/^\d+\.\s/.test(line)) terms.push(line.replace(/^\d+\.\s*/, ''))
    else if (line.startsWith('Bank :') || line.startsWith('Branch :') || line.startsWith('IFSC :') || line.startsWith('A/C No')) bank.push(line)
    else if (line === 'TAX INVOICE CUM DELIVERY CHALLAN') next.headerTitle = line
    else if (line.startsWith('Ph :')) next.phoneEmailLine = line
    else if (line.startsWith('PAN :')) next.panLine = line
    else if (line.startsWith('GSTIN :')) next.gstinLine = line
    else if (line === 'Billing Address') next.billingAddressLabel = line
    else if (line === 'To') next.toLabel = line
    else if (line.startsWith('Bill No')) next.billNoLabel = line
    else if (line.startsWith('Date :')) next.dateLabel = line
    else if (line === 'Place Of Supply' || line === 'Place of Supply') next.placeOfSupplyLabel = line
    else if (line === 'Party Signature') next.partySignatureLabel = line
    else if (line === 'Terms & Conditions') next.termsTitle = line
    else if (line.startsWith('Subject to')) next.jurisdictionLine = line
    else if (line === 'Authorised Signatory') next.authorisedSignatoryLabel = line
    else if (line.startsWith('Electronic Ref')) next.electronicRefLabel = line
    else if (line.startsWith('for ')) next.authorisedForPrefix = 'for'
    else if (line.includes('{{shop_name}}')) next.authorisedForPrefix = 'for'
    else if (line.includes('MARLECHA') || line.includes('SILVER')) next.shopName = stripTemplatePlaceholders(line)
    else if (line.startsWith('No :') || line.includes('Vijay Complex') || line.includes('Sowcarpet')) {
      const cleaned = stripTemplatePlaceholders(line)
      if (cleaned && !next.addressLines.some((x) => x.toLowerCase() === cleaned.toLowerCase())) {
        next.addressLines.push(cleaned)
      }
    }
  }

  if (copyLabels[0]) next.copyLabels[0] = stripTemplatePlaceholders(copyLabels[0])
  if (copyLabels[1]) next.copyLabels[1] = stripTemplatePlaceholders(copyLabels[1])
  if (copyLabels[2]) next.copyLabels[2] = stripTemplatePlaceholders(copyLabels[2])
  if (tableCols?.length) next.tableColumns = tableCols
  if (terms.length) next.termsLines = dedupeLines(terms, 4)
  if (bank.length) next.bankLines = dedupeLines(bank, 4)
  return sanitizeTaxInvoiceTemplate({
    ...next,
    updatedAt: new Date().toISOString(),
  })
}

export function isCorruptedTemplateSource(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.includes('{{shop_name}}')) return true
  if (t.includes('[COPY 2]') && !t.includes('\n[COPY 2]') && !t.startsWith('[COPY 2]')) return true
  if (t.includes('[TABLE]') && !t.includes('\n[TABLE]') && !t.startsWith('[TABLE]')) return true
  return false
}

export function normalizeTaxInvoiceTemplate(raw: unknown): ErpTaxInvoiceTemplateConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE }
  const o = raw as Record<string, unknown>
  const base = DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE

  const hasStructuredFields =
    typeof o.headerTitle === 'string' ||
    typeof o.shopName === 'string' ||
    Array.isArray(o.addressLines) ||
    Array.isArray(o.tableColumns)

  if (hasStructuredFields) {
    return sanitizeTaxInvoiceTemplate({
      ...base,
      ...o,
      copyLabels: Array.isArray(o.copyLabels) && o.copyLabels.length === 3
        ? [String(o.copyLabels[0]), String(o.copyLabels[1]), String(o.copyLabels[2])]
        : base.copyLabels,
      addressLines: Array.isArray(o.addressLines) ? o.addressLines.map(String) : base.addressLines,
      tableColumns: Array.isArray(o.tableColumns) ? o.tableColumns.map(String) : base.tableColumns,
      termsLines: Array.isArray(o.termsLines) ? o.termsLines.map(String) : base.termsLines,
      bankLines: Array.isArray(o.bankLines) ? o.bankLines.map(String) : base.bankLines,
      totalsLabels: {
        ...base.totalsLabels,
        ...(o.totalsLabels && typeof o.totalsLabels === 'object' ? (o.totalsLabels as object) : {}),
      },
      sourceText: null,
    })
  }

  if (typeof o.sourceText === 'string' && o.sourceText.trim()) {
    if (isCorruptedTemplateSource(o.sourceText)) {
      return sanitizeTaxInvoiceTemplate({
        ...base,
        ...(typeof o.shopName === 'string' ? { shopName: stripTemplatePlaceholders(o.shopName) } : {}),
      })
    }
    return parseEditableTextToTemplate(o.sourceText, base)
  }
  return { ...base }
}

export function mergeTemplateWithGstSettings(
  template: ErpTaxInvoiceTemplateConfig,
  gst?: { legalName?: string | null; address?: string | null; phone?: string | null; email?: string | null; gstin?: string | null } | null,
  bank?: { bankName?: string | null; branch?: string | null; ifsc?: string | null; accountNo?: string | null } | null,
): ErpTaxInvoiceTemplateConfig {
  const t = { ...template, addressLines: [...template.addressLines], bankLines: [...template.bankLines] }
  if (gst?.legalName) t.shopName = gst.legalName
  if (gst?.address) {
    t.addressLines = gst.address.split(/\n|, /).map((s) => s.trim()).filter(Boolean)
  }
  if (gst?.phone || gst?.email) {
    const parts = []
    if (gst.phone) parts.push(`Ph : ${gst.phone}`)
    if (gst.email) parts.push(`E-mail Id : ${gst.email}`)
    t.phoneEmailLine = parts.join(' , ')
  }
  if (gst?.gstin) {
    const pan = gst.gstin.length >= 12 ? gst.gstin.slice(2, 12) : ''
    if (pan) t.panLine = `PAN : ${pan}`
    t.gstinLine = `GSTIN : ${gst.gstin}`
  }
  if (bank?.bankName || bank?.accountNo) {
    t.bankLines = [
      bank.bankName ? `Bank : ${bank.bankName}` : t.bankLines[0] || '',
      bank.branch ? `Branch : ${bank.branch}` : t.bankLines[1] || '',
      bank.ifsc ? `IFSC : ${bank.ifsc}` : t.bankLines[2] || '',
      bank.accountNo ? `A/C No : ${bank.accountNo}` : t.bankLines[3] || '',
    ].filter(Boolean)
  }
  return t
}

/** Heuristic OCR text → editable template lines */
export function ocrTextToEditableTemplate(ocrText: string): string {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const cfg = { ...DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE, copyLabels: [...DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE.copyLabels] as ErpTaxInvoiceCopyLabels }

  for (const line of lines) {
    if (/ORIGINAL\s+FOR\s+RECIPIENT/i.test(line)) cfg.copyLabels[0] = line.toUpperCase()
    else if (/DUPLICATE\s+FOR\s+RECIPIENT/i.test(line)) cfg.copyLabels[1] = line.toUpperCase()
    else if (/TRIPLICATE\s+FOR\s+SUPPLIER/i.test(line)) cfg.copyLabels[2] = line.toUpperCase()
    else if (/TAX\s+INVOICE/i.test(line) && line.length < 80) cfg.headerTitle = line.toUpperCase()
    else if (/^PAN\s*:/i.test(line)) cfg.panLine = line
    else if (/^GSTIN\s*:/i.test(line)) cfg.gstinLine = line
    else if (/^Ph\s*:/i.test(line) || /E-mail/i.test(line)) cfg.phoneEmailLine = line
    else if (/Billing Address/i.test(line)) cfg.billingAddressLabel = 'Billing Address'
    else if (line === 'To') cfg.toLabel = 'To'
    else if (/^Bill\s*No/i.test(line)) cfg.billNoLabel = line.includes(':') ? line.split(/\s+/).slice(0, 2).join(' ') + ' :' : 'Bill No :'
    else if (/^Date\s*:/i.test(line)) cfg.dateLabel = 'Date :'
    else if (/Place Of Supply/i.test(line)) cfg.placeOfSupplyLabel = 'Place Of Supply'
    else if (/Party Signature/i.test(line)) cfg.partySignatureLabel = line
    else if (/Terms\s*&\s*Conditions/i.test(line)) cfg.termsTitle = line
    else if (/Subject to/i.test(line)) cfg.jurisdictionLine = line
    else if (/Authorised Signatory/i.test(line)) cfg.authorisedSignatoryLabel = line
    else if (/Electronic Ref/i.test(line)) cfg.electronicRefLabel = line
    else if (/^Bank\s*:/i.test(line) || /^Branch\s*:/i.test(line) || /^IFSC\s*:/i.test(line) || /^A\/C No/i.test(line)) {
      if (!cfg.bankLines.includes(line)) cfg.bankLines.push(line)
    } else if (/^\d+\.\s/.test(line)) {
      cfg.termsLines.push(line.replace(/^\d+\.\s*/, ''))
    } else if (/Sl\.?\s*No|Description of Goods|HSN Code|Gross Wt|Net Wt|Amount/i.test(line) && line.includes('|')) {
      cfg.tableColumns = line.split('|').map((s) => s.trim())
    } else if (/SILVER|GOLD|JEWELL|MARLECHA/i.test(line) && line.length < 60 && !cfg.shopName.includes('MARLECHA')) {
      if (/MARLECHA|SILVER|GOLD/i.test(line)) cfg.shopName = line
    } else if (/^No\s*:/i.test(line) || /Complex|Street|Sowcarpet|Chennai|Floor/i.test(line)) {
      if (!cfg.addressLines.includes(line) && cfg.addressLines.length < 4) cfg.addressLines.push(line)
    } else if (/^Total$/i.test(line) || /^IGST/i.test(line) || /^Round Off/i.test(line) || /^Net Amount/i.test(line)) {
      if (/IGST/i.test(line)) cfg.totalsLabels.igst = line
      else if (/Round/i.test(line)) cfg.totalsLabels.roundOff = line
      else if (/Net/i.test(line)) cfg.totalsLabels.netAmount = line
      else cfg.totalsLabels.total = line
    } else if (/^for\s+/i.test(line)) {
      cfg.authorisedForPrefix = 'for'
    }
  }

  cfg.updatedAt = new Date().toISOString()
  return templateConfigToEditableText(sanitizeTaxInvoiceTemplate(cfg))
}

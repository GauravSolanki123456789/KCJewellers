import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { isMrpInvoiceLine } from '@/lib/erp-invoice-defaults'
import { buildSettlementAdjustedInvoiceLines } from '@/lib/erp-invoice-settlement-display'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { amountInWordsInr } from '@/lib/erp-amount-in-words'
import {
  isInterstateSupply,
  paymentMethodInvoiceLabel,
} from '@/lib/erp-invoice-template'
import type {
  ErpBankSettings,
  ErpGstSettings,
  ErpTaxInvoiceCompliance,
  ErpTaxInvoicePdfDocumentProps,
} from '@/lib/erp-tax-invoice-pdf-document'
import {
  DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE,
  mergeTemplateWithGstSettings,
  normalizeTaxInvoiceTemplate,
  type ErpTaxInvoiceTemplateConfig,
} from '@/lib/erp-tax-invoice-template'

export type { ErpTaxInvoicePdfDocumentProps }

export type ConfigurableTaxInvoiceProps = ErpTaxInvoicePdfDocumentProps & {
  templateConfig?: ErpTaxInvoiceTemplateConfig | null
  /** e-way bill number when rendering e-way variant */
  ewayBillNo?: string | null
  /** bill = 3 copies; einvoice = 3 copies + IRN / QR / e-way */
  variant?: 'bill' | 'einvoice'
  mrpItemNames?: Set<string>
}

const UNIFIED_COL_W = ['5%', '22%', '10%', '8%', '12%', '12%', '12%', '19%'] as const
const UNIFIED_COLS = [
  'SINO',
  'Description of\nGoods',
  'HSN\nCode',
  'Qty',
  'Gross Wt\n(Kgs)',
  'Net Wt\n(Kgs)',
  'Rate',
  'Amount\n(in Rs.)',
] as const

const styles = StyleSheet.create({
  page: {
    padding: 18,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#000',
    lineHeight: 1.25,
    display: 'flex',
    flexDirection: 'column',
  },
  pageBody: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  headerBox: {
    borderWidth: 1.5,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 6,
    marginBottom: 0,
    position: 'relative',
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flexGrow: 1,
    flexShrink: 1,
    paddingRight: 6,
    alignItems: 'center',
  },
  headerQrCol: {
    width: 96,
    alignItems: 'flex-end',
    paddingLeft: 4,
    paddingRight: 6,
    paddingTop: 2,
  },
  copyTag: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'right',
    marginBottom: 2,
  },
  title: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    color: '#000',
  },
  shopName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    color: '#000',
  },
  centerLine: { fontSize: 7.5, textAlign: 'center', lineHeight: 1.3 },
  taxIdLine: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
    color: '#000',
  },
  fieldLabel: { fontFamily: 'Helvetica-Bold', fontWeight: 'bold', color: '#000' },
  irnBlock: {
    marginTop: 4,
    paddingHorizontal: 2,
    width: '100%',
    alignItems: 'center',
  },
  irnText: {
    fontSize: 6,
    lineHeight: 1.25,
    textAlign: 'center',
  },
  billingBox: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#000', minHeight: 78 },
  billingLeft: { width: '58%', borderRightWidth: 1, borderRightColor: '#000' },
  billingRight: { width: '42%', padding: 6, paddingTop: 8 },
  billingBar: {
    backgroundColor: '#ffffff',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontSize: 7.5,
    fontWeight: 'bold',
  },
  billingBody: { padding: 6, fontSize: 7.5, lineHeight: 1.35 },
  table: { borderWidth: 1, borderTopWidth: 0, borderColor: '#000', flexGrow: 1, display: 'flex', flexDirection: 'column' },
  tableColumnsRow: { flexDirection: 'row', alignSelf: 'stretch', flexGrow: 1, minHeight: 56 },
  tableColumnsRowFixed: { flexDirection: 'row', alignSelf: 'stretch' },
  tableColumn: {
    flexDirection: 'column',
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  tableColumnLast: { borderRightWidth: 0 },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  /** Single header band — one bottom border across all columns. */
  tableHeaderRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    minHeight: 30,
    alignItems: 'flex-end',
  },
  tableHeaderCell: {
    paddingHorizontal: 2,
    paddingBottom: 3,
    paddingTop: 2,
    borderRightWidth: 1,
    borderRightColor: '#000',
    justifyContent: 'flex-end',
    minHeight: 30,
  },
  tableHeaderCellLast: { borderRightWidth: 0 },
  headCellText: {
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  bodyCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  colBodyCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    width: '100%',
  },
  colSpacer: { flexGrow: 1, minHeight: 40 },
  bodyCellText: {
    fontSize: 7,
  },
  summaryRow: { flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderColor: '#000', minHeight: 88 },
  summaryLeft: { width: '58%', borderRightWidth: 1, borderRightColor: '#000', padding: 8, paddingBottom: 12, justifyContent: 'space-between' },
  summaryRight: { width: '42%' },
  totalCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontSize: 7.5,
  },
  totalCellEmpty: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 14 },
  netCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    fontSize: 9.5,
    color: '#000',
  },
  footerRow: { flexDirection: 'row', marginTop: 6, minHeight: 88, paddingTop: 4 },
  termsCol: { width: '50%', fontSize: 6.5, lineHeight: 1.35, paddingRight: 6 },
  bankCol: { width: '28%', fontSize: 7, lineHeight: 1.4, paddingTop: 2 },
  signCol: { width: '22%', fontSize: 7.5, textAlign: 'center', justifyContent: 'flex-end' },
  signLine: { borderTopWidth: 1, borderTopColor: '#000', marginTop: 28, paddingTop: 3, textAlign: 'center' },
  eRef: { marginTop: 6, fontSize: 7 },
  qr: { width: 88, height: 88, objectFit: 'contain' },
  qrPlaceholder: {
    width: 88,
    height: 88,
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
})

/** Join over-split GST address fragments into two compact centered lines. */
function compactCompanyAddressLines(lines: string[]): string[] {
  const parts = (lines || [])
    .map((s) => String(s || '').replace(/,\s*$/, '').trim())
    .filter(Boolean)
  if (parts.length <= 2) return parts
  const line1 = `${parts.slice(0, 2).join(', ')},`
  const line2 = parts.slice(2).join(', ')
  return [line1, line2].filter(Boolean)
}

function formatBillDate(bill: ErpBill): string {
  return formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)
}

function gmToKg(gm: number): number {
  return (Number(gm) || 0) / 1000
}

function lineNetGm(line: ErpBillLine): number {
  return Number(line.originalWeightGm ?? line.weightGm) || 0
}

function lineRatePerKg(line: ErpBillLine): number {
  const wtKg = gmToKg(lineNetGm(line))
  const amt = Number(line.lineTotalInr) || 0
  if (wtKg <= 0) return 0
  return amt / wtKg
}

function linePieceRate(line: ErpBillLine): number {
  const qty = Math.max(1, Number(line.qty) || 1)
  const amt = Number(line.lineTotalInr) || 0
  return amt / qty
}

type ColumnAlign = 'left' | 'center' | 'right'

function columnAlignments(count: number, kind: 'weight' | 'mrp' | 'unified'): ColumnAlign[] {
  if (kind === 'unified' || count >= 8) {
    return (['center', 'left', 'center', 'center', 'right', 'right', 'right', 'right'] as ColumnAlign[]).slice(
      0,
      count,
    )
  }
  if (kind === 'mrp') {
    return (['center', 'left', 'center', 'right', 'right', 'right'] as ColumnAlign[]).slice(0, count)
  }
  return (['center', 'left', 'center', 'right', 'right', 'right', 'right'] as ColumnAlign[]).slice(0, count)
}

/** Column-based table — vertical borders run full height including empty spacer area. */
function renderColumnTable(
  tableKey: string,
  columns: string[],
  widths: readonly string[],
  rows: string[][],
  opts?: { fillRemaining?: boolean },
) {
  const kind: 'weight' | 'mrp' | 'unified' =
    widths.length >= 8 ? 'unified' : widths.length >= 7 ? 'weight' : 'mrp'
  const aligns = columnAlignments(widths.length, kind)
  const last = widths.length - 1
  const rowStyle = opts?.fillRemaining ? styles.tableColumnsRow : styles.tableColumnsRowFixed

  return (
    <View style={{ alignSelf: 'stretch', flexGrow: opts?.fillRemaining ? 1 : 0 }}>
      <View style={styles.tableHeaderRow}>
        {widths.map((w, colIdx) => (
          <View
            key={`${tableKey}-head-${colIdx}`}
            style={[
              styles.tableHeaderCell,
              { width: w },
              ...(colIdx === last ? [styles.tableHeaderCellLast] : []),
            ]}
          >
            <Text style={styles.headCellText}>
              {sanitizePdfText((columns[colIdx] || '').replace(/\\n/g, '\n'))}
            </Text>
          </View>
        ))}
      </View>
      <View style={rowStyle}>
      {widths.map((w, colIdx) => (
        <View
          key={`${tableKey}-col-${colIdx}`}
          style={[
            styles.tableColumn,
            { width: w },
            ...(colIdx === last ? [styles.tableColumnLast] : []),
          ]}
        >
          {rows.map((row, rowIdx) => (
            <View key={`${tableKey}-row-${rowIdx}`} style={styles.colBodyCell}>
              <Text
                style={[
                  styles.bodyCellText,
                  {
                    textAlign:
                      aligns[colIdx] === 'left'
                        ? 'left'
                        : aligns[colIdx] === 'center'
                          ? 'center'
                          : 'right',
                  },
                ]}
              >
                {sanitizePdfText(row[colIdx] || '')}
              </Text>
            </View>
          ))}
          {opts?.fillRemaining ? <View style={styles.colSpacer} /> : null}
        </View>
      ))}
      </View>
    </View>
  )
}

function InvoicePage({
  copyLabel,
  template,
  bill,
  totals,
  gst,
  customerName,
  customerAddress,
  customerMobile,
  compliance,
  lines,
  session,
  ewayBillNo,
  mrpItemNames,
  variant = 'bill',
}: {
  copyLabel: string
  template: ErpTaxInvoiceTemplateConfig
  bill: ErpBill
  totals: ErpQuoteTotals
  gst: ErpGstSettings
  customerName?: string | null
  customerAddress?: string | null
  customerMobile?: string | null
  compliance?: ErpTaxInvoiceCompliance | null
  lines: ErpBillLine[]
  session: Record<string, unknown>
  ewayBillNo?: string | null
  mrpItemNames?: Set<string>
  variant?: 'bill' | 'einvoice'
}) {
  const placeOfSupply =
    String(session.placeOfSupply || gst.placeOfSupply || '').trim() || 'Tamil Nadu'
  const interstate = isInterstateSupply({
    sellerGstin: gst.gstin,
    placeOfSupply,
    buyerGstin: String(session.customerGst || ''),
  })
  const taxable = totals.subtotal
  const gstAmt = totals.gst
  const igst = interstate ? gstAmt : 0
  const cgst = interstate ? 0 : gstAmt / 2
  const sgst = interstate ? 0 : gstAmt / 2
  const rawTotal = taxable + gstAmt
  const roundedTotal = Math.round(rawTotal)
  const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100
  const payLabel = paymentMethodInvoiceLabel(String(session.paymentMethod || ''))
  const shopDisplay = template.shopName || gst.legalName || 'Shop'
  const unifiedRows: string[][] = lines.map((line, idx) => {
    const slNo = `${idx + 1}.`
    const desc = line.invoice_item_name || line.name || 'JEWELLERY'
    const hsn = line.hsn_code || '711311'
    const amt = Number(line.lineTotalInr) || 0
    const mrp = isMrpInvoiceLine(line, mrpItemNames)
    if (mrp) {
      const qty = Math.max(1, Number(line.qty) || 1)
      const rate = linePieceRate(line)
      return [
        slNo,
        desc,
        hsn,
        String(qty),
        '—',
        '—',
        rate > 0 ? rate.toFixed(2) : '—',
        amt.toFixed(2),
      ]
    }
    const grossKg = gmToKg(Number(line.gross_weight) || lineNetGm(line))
    const netKg = gmToKg(lineNetGm(line))
    const rate = lineRatePerKg(line)
    return [
      slNo,
      desc,
      hsn,
      '—',
      grossKg > 0 ? grossKg.toFixed(4) : '—',
      netKg > 0 ? netKg.toFixed(4) : '—',
      rate > 0 ? rate.toFixed(2) : '—',
      amt.toFixed(2),
    ]
  })

  const showQr = !!compliance?.irn
  const addressLines = compactCompanyAddressLines(template.addressLines)
  const toLabel = /:$/.test(template.toLabel.trim()) ? template.toLabel.trim() : `${template.toLabel.trim()}:`
  const placeLabel = /:$/.test(template.placeOfSupplyLabel.trim())
    ? template.placeOfSupplyLabel.trim()
    : `${template.placeOfSupplyLabel.trim()}:`

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageBody}>
      <View style={styles.headerBox}>
        {copyLabel ? <Text style={styles.copyTag}>{copyLabel}</Text> : null}
        <View style={styles.headerMain}>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{sanitizePdfText(template.headerTitle)}</Text>
            <Text style={styles.shopName}>{sanitizePdfText(shopDisplay)}</Text>
            {addressLines.map((line, i) => (
              <Text key={`addr-${i}`} style={styles.centerLine}>
                {sanitizePdfText(line)}
              </Text>
            ))}
            {template.phoneEmailLine ? (
              <Text style={styles.centerLine}>{sanitizePdfText(template.phoneEmailLine)}</Text>
            ) : null}
            <Text style={styles.taxIdLine}>{sanitizePdfText(template.panLine)}</Text>
            <Text style={styles.taxIdLine}>{sanitizePdfText(template.gstinLine)}</Text>
            {compliance?.irn ? (
              <View style={styles.irnBlock}>
                <Text style={styles.irnText}>
                  IRN: {sanitizePdfText(compliance.irn)}
                </Text>
                {compliance.ack_no || compliance.ack_date ? (
                  <Text style={styles.irnText}>
                    {compliance.ack_no ? `Ack No.: ${sanitizePdfText(String(compliance.ack_no))}` : ''}
                    {compliance.ack_no && compliance.ack_date ? '   ' : ''}
                    {compliance.ack_date ? `Ack Date: ${sanitizePdfText(String(compliance.ack_date))}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {showQr ? (
            <View style={styles.headerQrCol}>
              {compliance?.qrImageSrc ? (
                <Image style={styles.qr} src={compliance.qrImageSrc} />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Text style={{ fontSize: 6, textAlign: 'center' }}>QR code</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.billingBox}>
        <View style={styles.billingLeft}>
          <Text style={styles.billingBar}>{sanitizePdfText(template.billingAddressLabel)}</Text>
          <View style={styles.billingBody}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(toLabel)}</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontWeight: 'bold', marginTop: 2 }}>
              {sanitizePdfText(customerName || bill.customer_name || 'Walk-in')}
            </Text>
            {customerAddress ? (
              <Text style={{ marginTop: 3 }}>{sanitizePdfText(customerAddress)}</Text>
            ) : null}
            {customerMobile ? <Text style={{ marginTop: 2 }}>Mob: {sanitizePdfText(customerMobile)}</Text> : null}
          </View>
        </View>
        <View style={styles.billingRight}>
          <Text style={{ fontSize: 8, marginBottom: 4 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(template.billNoLabel)} </Text>
            {sanitizePdfText(bill.bill_number)}
          </Text>
          <Text style={{ fontSize: 8, marginBottom: 12 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(template.dateLabel)} </Text>
            {formatBillDate(bill)}
          </Text>
          {variant === 'einvoice' || ewayBillNo ? (
            <Text style={{ fontSize: 8, marginBottom: 8 }}>
              <Text style={styles.fieldLabel}>E-Way Bill : </Text>
              {sanitizePdfText(ewayBillNo || '')}
            </Text>
          ) : null}
          <Text style={{ fontSize: 7, marginBottom: 2 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(placeLabel)}</Text>
          </Text>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' }}>
            {sanitizePdfText(placeOfSupply)}
          </Text>
        </View>
      </View>

      <View style={styles.table}>
        {unifiedRows.length > 0
          ? renderColumnTable('unified', [...UNIFIED_COLS], [...UNIFIED_COL_W], unifiedRows, {
              fillRemaining: true,
            })
          : null}
      </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <View>
            <Text style={{ fontWeight: 'bold', fontSize: 8 }}>{amountInWordsInr(roundedTotal)}</Text>
            <Text style={{ marginTop: 6, fontSize: 8 }}>{payLabel}</Text>
          </View>
          <Text style={{ fontSize: 7.5, marginTop: 8 }}>{sanitizePdfText(template.partySignatureLabel)}</Text>
        </View>
        <View style={styles.summaryRight}>
          <View style={styles.totalCell}>
            <Text>{template.totalsLabels.total}</Text>
            <Text>{taxable.toFixed(2)}</Text>
          </View>
          {interstate ? (
            <View style={styles.totalCell}>
              <Text>{template.totalsLabels.igst}</Text>
              <Text>{igst.toFixed(2)}</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalCell}>
                <Text>{template.totalsLabels.cgst}</Text>
                <Text>{cgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalCell}>
                <Text>{template.totalsLabels.sgst}</Text>
                <Text>{sgst.toFixed(2)}</Text>
              </View>
              <View style={styles.totalCellEmpty} />
            </>
          )}
          <View style={styles.totalCell}>
            <Text>{template.totalsLabels.roundOff}</Text>
            <Text>{roundOff.toFixed(2)}</Text>
          </View>
          <View style={styles.netCell}>
            <Text style={styles.fieldLabel}>{template.totalsLabels.netAmount}</Text>
            <Text style={styles.fieldLabel}>{roundedTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.termsCol}>
          <Text style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: 3 }}>
            {sanitizePdfText(template.termsTitle)}
          </Text>
          {template.termsLines.map((t, i) => (
            <Text key={`term-${i}`}>
              {i + 1}. {sanitizePdfText(t)}
            </Text>
          ))}
          <Text style={{ marginTop: 4, fontStyle: 'italic' }}>{sanitizePdfText(template.jurisdictionLine)}</Text>
        </View>
        <View style={styles.bankCol}>
          {template.bankLines.map((line, i) => (
            <Text key={`bank-${i}`}>{sanitizePdfText(line)}</Text>
          ))}
        </View>
        <View style={styles.signCol}>
          <Text style={{ fontWeight: 'bold' }}>
            {template.authorisedForPrefix} {sanitizePdfText(shopDisplay)}
          </Text>
          <View style={styles.signLine}>
            <Text>{sanitizePdfText(template.authorisedSignatoryLabel)}</Text>
          </View>
        </View>
      </View>

      {variant === 'einvoice' ? null : (
        <Text style={styles.eRef}>{sanitizePdfText(template.electronicRefLabel)}</Text>
      )}
    </Page>
  )
}

export function ErpConfigurableTaxInvoicePdfDocument(props: ConfigurableTaxInvoiceProps) {
  const mrpNames = props.mrpItemNames || new Set<string>()
  const lines = useMemo(
    () => buildSettlementAdjustedInvoiceLines(props.bill, mrpNames),
    [props.bill, mrpNames],
  )
  const session = (props.bill.session && typeof props.bill.session === 'object'
    ? props.bill.session
    : {}) as Record<string, unknown>

  const template = useMemo(() => {
    const raw = props.templateConfig
      ? normalizeTaxInvoiceTemplate(props.templateConfig)
      : DEFAULT_MARLECHA_TAX_INVOICE_TEMPLATE
    return mergeTemplateWithGstSettings(raw, props.gst, props.bank)
  }, [props.templateConfig, props.gst, props.bank])

  const pageProps = { ...props, lines, session, template, mrpItemNames: mrpNames }

  const copies = [
    template.copyLabels[0] || 'ORIGINAL FOR RECIPIENT',
    template.copyLabels[1] || 'DUPLICATE FOR RECIPIENT',
    template.copyLabels[2] || 'TRIPLICATE FOR SUPPLIER',
  ]

  return (
    <Document>
      <InvoicePage {...pageProps} copyLabel={copies[0]} variant={props.variant || 'bill'} />
      <InvoicePage {...pageProps} copyLabel={copies[1]} variant={props.variant || 'bill'} />
      <InvoicePage {...pageProps} copyLabel={copies[2]} variant={props.variant || 'bill'} />
    </Document>
  )
}

/** @deprecated use ErpConfigurableTaxInvoicePdfDocument */
export function ErpMarlechaTaxInvoicePdfDocument(props: ErpTaxInvoicePdfDocumentProps & { templateConfig?: ErpTaxInvoiceTemplateConfig | null }) {
  return <ErpConfigurableTaxInvoicePdfDocument {...props} />
}

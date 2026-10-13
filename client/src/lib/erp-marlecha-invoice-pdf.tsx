import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { isMrpInvoiceLine } from '@/lib/erp-invoice-defaults'
import { shouldUseWeightSilverNotMrp } from '@/lib/erp-billing-pricing'
import { buildSettlementAdjustedInvoiceLines } from '@/lib/erp-invoice-settlement-display'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { amountInWordsInr } from '@/lib/erp-amount-in-words'
import { formatPdfAddressLines } from '@/lib/erp-customer-address-format'
import { billLinePdfPurityText } from '@/lib/erp-pdf-purity'
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
  /** bill = 3 copies; einvoice = 3 copies + IRN / QR / e-way; approval = Delivery Challan[Issue] */
  variant?: 'bill' | 'einvoice' | 'approval'
  /** Printed in place of payment method on approval challans. */
  approvalNarration?: string | null
  mrpItemNames?: Set<string>
  /** From Print formats — purity column on bill / approval PDF. */
  showPurityInPdf?: boolean
}

const UNIFIED_COL_W = ['5%', '22%', '10%', '8%', '12%', '12%', '12%', '19%'] as const
const UNIFIED_COL_W_WITH_PURITY = ['5%', '20%', '9%', '7%', '10%', '10%', '8%', '10%', '21%'] as const
const UNIFIED_COLS = [
  'SINO',
  'Description of\nGoods',
  'HSN\nCode',
  'Qty',
  'Gross Wt\n(g)',
  'Net Wt\n(g)',
  'Rate',
  'Amount\n(in Rs.)',
] as const
const UNIFIED_COLS_WITH_PURITY = [
  'SINO',
  'Description of\nGoods',
  'HSN\nCode',
  'Qty',
  'Gross Wt\n(g)',
  'Net Wt\n(g)',
  'Purity',
  'Rate',
  'Amount\n(in Rs.)',
] as const

const PDF_BORDER = 1.5

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
    borderWidth: PDF_BORDER,
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
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    color: '#000',
  },
  shopName: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
    color: '#000',
  },
  centerLine: { fontSize: 8.5, textAlign: 'center', lineHeight: 1.3 },
  taxIdLine: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
    color: '#000',
  },
  fieldLabel: {
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    color: '#000',
    fontSize: 8.5,
  },
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
  billingBox: {
    flexDirection: 'row',
    borderWidth: PDF_BORDER,
    borderTopWidth: 0,
    borderColor: '#000',
    minHeight: 78,
  },
  billingLeft: { width: '58%', borderRightWidth: PDF_BORDER, borderRightColor: '#000' },
  billingRight: { width: '42%', padding: 6, paddingTop: 8 },
  billingBar: {
    backgroundColor: '#ffffff',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderBottomWidth: PDF_BORDER,
    borderBottomColor: '#000',
    fontSize: 8.5,
    fontWeight: 'bold',
  },
  billingBody: { padding: 6, fontSize: 8.5, lineHeight: 1.35 },
  billingAddressStack: { flexGrow: 1 },
  billingAddressSection: { flexGrow: 1 },
  billingAddressSectionSplit: { borderBottomWidth: PDF_BORDER, borderBottomColor: '#000' },
  table: {
    borderWidth: PDF_BORDER,
    borderTopWidth: 0,
    borderColor: '#000',
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  tableColumnsRow: { flexDirection: 'row', alignSelf: 'stretch', flexGrow: 1, minHeight: 56 },
  tableColumnsRowFixed: { flexDirection: 'row', alignSelf: 'stretch' },
  tableColumn: {
    flexDirection: 'column',
    borderRightWidth: PDF_BORDER,
    borderRightColor: '#000',
  },
  tableColumnLast: { borderRightWidth: 0 },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: PDF_BORDER,
    borderRightColor: '#000',
    borderBottomWidth: PDF_BORDER,
    borderBottomColor: '#000',
  },
  /** Single header band — one bottom border across all columns. */
  tableHeaderRow: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    borderBottomWidth: PDF_BORDER,
    borderBottomColor: '#000',
    minHeight: 30,
    alignItems: 'flex-end',
  },
  tableHeaderCell: {
    paddingHorizontal: 2,
    paddingBottom: 3,
    paddingTop: 2,
    borderRightWidth: PDF_BORDER,
    borderRightColor: '#000',
    justifyContent: 'flex-end',
    minHeight: 30,
  },
  tableHeaderCellLast: { borderRightWidth: 0 },
  colFooterCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    width: '100%',
    borderTopWidth: PDF_BORDER,
    borderTopColor: '#000',
    minHeight: 22,
    justifyContent: 'center',
  },
  colFooterText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  headCellText: {
    fontSize: 7.5,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.15,
  },
  bodyCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: PDF_BORDER,
    borderRightColor: '#000',
  },
  colBodyCell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    width: '100%',
  },
  colSpacer: { flexGrow: 1, minHeight: 16 },
  bodyCellText: {
    fontSize: 8,
  },
  summaryRow: { flexDirection: 'row', borderWidth: PDF_BORDER, borderTopWidth: 0, borderColor: '#000', minHeight: 72 },
  summaryLeft: {
    width: '58%',
    borderRightWidth: PDF_BORDER,
    borderRightColor: '#000',
    padding: 8,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  summaryRight: { width: '42%' },
  totalCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: PDF_BORDER,
    borderBottomColor: '#000',
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  totalCellEmpty: {
    paddingVertical: 4,
    borderBottomWidth: PDF_BORDER,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  netCell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    fontSize: 10.5,
    color: '#000',
  },
  footerWrap: { marginTop: 26, paddingTop: 2 },
  footerMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  footerBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  footerColLeft: { flex: 1, fontSize: 6.5, lineHeight: 1.35, paddingRight: 8 },
  footerColCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 0,
    paddingBottom: 2,
  },
  footerColRight: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  jurisdictionLine: { fontSize: 6.5, fontStyle: 'italic', lineHeight: 1.35 },
  /** Centers the bank block in the footer column without centering each line separately. */
  bankBlockWrap: {
    alignSelf: 'center',
    alignItems: 'flex-start',
  },
  bankCol: {
    fontSize: 9.5,
    lineHeight: 1.4,
    alignItems: 'flex-start',
  },
  bankLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Left-aligned labels; fixed width keeps colons and values in straight columns (Helvetica prints cleaner than Courier on IFSC). */
  bankLabel: {
    width: 44,
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000',
    textAlign: 'left',
  },
  bankColon: {
    fontSize: 9.5,
    color: '#000',
    width: 11,
    textAlign: 'left',
  },
  bankValue: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000',
    flexShrink: 0,
  },
  signColTop: {
    fontSize: 8.5,
    textAlign: 'center',
    flexDirection: 'column',
    paddingTop: 0,
    width: '100%',
  },
  signColBottom: { fontSize: 8.5, textAlign: 'center', width: '100%' },
  signCompanyLine: {
    fontWeight: 'bold',
    marginTop: -20,
    textAlign: 'center',
  },
  signLine: {
    borderTopWidth: PDF_BORDER,
    borderTopColor: '#000',
    marginTop: 0,
    paddingTop: 4,
    textAlign: 'center',
    width: '100%',
  },
  eRef: { marginTop: 6, fontSize: 7 },
  qr: { width: 88, height: 88, objectFit: 'contain' },
  qrPlaceholder: {
    width: 88,
    height: 88,
    borderWidth: PDF_BORDER,
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

function lineQty(line: ErpBillLine): number {
  return Math.max(1, Number(line.qty) || 1)
}

function lineNetGm(line: ErpBillLine): number {
  return Number(line.originalWeightGm ?? line.weightGm) || 0
}

/** Flat MRP row (no weight columns) — not weight-based silver gift stock. */
function marlechaFlatMrpRow(line: ErpBillLine, mrpItemNames?: Set<string> | null): boolean {
  return isMrpInvoiceLine(line, mrpItemNames) && !shouldUseWeightSilverNotMrp(line)
}

function lineTotalNetGm(line: ErpBillLine): number {
  const per = lineNetGm(line)
  if (per <= 0) return 0
  return Math.round(per * lineQty(line) * 100) / 100
}

function lineTotalGrossGm(line: ErpBillLine): number {
  const per = lineGrossGm(line)
  if (per <= 0) return 0
  return Math.round(per * lineQty(line) * 100) / 100
}

function lineGrossGm(line: ErpBillLine): number {
  const gross = Number(line.gross_weight)
  if (Number.isFinite(gross) && gross > 0) return gross
  return lineNetGm(line)
}

type LineTaxableAlloc = { subtotal: number; net: number }

/**
 * Pre-GST taxable for the Amount column.
 * GST-on bills: line totals are GST-inclusive → divide by 1.03.
 * GST-off bills: lines often still store GST-inclusive net → allocate header taxable pro-rata.
 */
function lineTaxableInr(
  line: ErpBillLine,
  gstOffOnBill: boolean,
  alloc?: LineTaxableAlloc,
): number {
  const total = Number(line.lineTotalInr) || 0
  if (total <= 0) return 0
  if (line.manualCategory === 'shipping') return total
  if (gstOffOnBill && alloc && alloc.net > 0 && alloc.subtotal > 0) {
    const gstGap = alloc.net - alloc.subtotal
    if (gstGap > 0.5) {
      return roundInr2(total * (alloc.subtotal / alloc.net))
    }
    return roundInr2(total)
  }
  return roundInr2(total / 1.03)
}

function lineRatePerGram(line: ErpBillLine, amountInr: number, useTotalNet = false): number {
  const netGm = useTotalNet ? lineTotalNetGm(line) : lineNetGm(line)
  if (netGm <= 0) return 0
  return amountInr / netGm
}

function linePieceRate(line: ErpBillLine): number {
  const qty = Math.max(1, Number(line.qty) || 1)
  const amt = Number(line.lineTotalInr) || 0
  return amt / qty
}

function lineDisplayAmountInr(
  line: ErpBillLine,
  opts: { gstOffOnBill: boolean; isApproval: boolean; mrpItemNames?: Set<string> | null },
): number {
  if (opts.isApproval) return Number(line.lineTotalInr) || 0
  if (marlechaFlatMrpRow(line, opts.mrpItemNames)) return Number(line.lineTotalInr) || 0
  return lineTaxableInr(line, opts.gstOffOnBill)
}

function roundInr2(n: number): number {
  return Math.round(n * 100) / 100
}

type ColumnAlign = 'left' | 'center' | 'right'

function columnAlignments(count: number, kind: 'weight' | 'mrp' | 'unified'): ColumnAlign[] {
  if (kind === 'unified' || count >= 9) {
    return (
      ['center', 'left', 'center', 'center', 'right', 'right', 'center', 'right', 'right'] as ColumnAlign[]
    ).slice(0, count)
  }
  if (count >= 8) {
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
  opts?: { fillRemaining?: boolean; footerCells?: string[] },
) {
  const kind: 'weight' | 'mrp' | 'unified' =
    widths.length >= 9 ? 'unified' : widths.length >= 8 ? 'unified' : widths.length >= 7 ? 'weight' : 'mrp'
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
          {opts?.footerCells?.length ? (
            <View style={styles.colFooterCell}>
              <Text
                style={[
                  styles.colFooterText,
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
                {sanitizePdfText(opts.footerCells[colIdx] || '')}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
      </View>
    </View>
  )
}

type MarlechaBankDetailRow = { label: string; value: string }

function parseMarlechaBankTemplateLine(line: string): MarlechaBankDetailRow | null {
  const t = String(line || '').trim()
  if (!t) return null
  const idx = t.indexOf(':')
  if (idx <= 0) return null
  const label = t.slice(0, idx).trim()
  const value = t.slice(idx + 1).trim()
  if (!label || !value) return null
  return { label, value }
}

function buildMarlechaBankDetailRows(
  bank?: ErpBankSettings | null,
  templateLines?: string[],
): MarlechaBankDetailRow[] {
  if (bank?.bankName || bank?.accountNo || bank?.ifsc || bank?.branch) {
    return [
      bank.bankName ? { label: 'Bank', value: bank.bankName } : null,
      bank.accountNo ? { label: 'A/C No', value: bank.accountNo } : null,
      bank.ifsc ? { label: 'IFSC', value: bank.ifsc } : null,
      bank.branch ? { label: 'Branch', value: bank.branch } : null,
    ].filter((row): row is MarlechaBankDetailRow => !!row)
  }
  return (templateLines || [])
    .map((line) => parseMarlechaBankTemplateLine(line))
    .filter((row): row is MarlechaBankDetailRow => !!row)
}

function BankDetailsBlock({
  bank,
  templateLines,
}: {
  bank?: ErpBankSettings | null
  templateLines?: string[]
}) {
  const rows = buildMarlechaBankDetailRows(bank, templateLines)
  if (!rows.length) return null
  return (
    <View style={styles.bankBlockWrap}>
      <View style={styles.bankCol}>
        {rows.map((row, i) => (
          <View key={`bank-line-${i}`} style={[styles.bankLineRow, ...(i > 0 ? [{ marginTop: 2 }] : [])]}>
            <Text style={styles.bankLabel}>{sanitizePdfText(row.label)}</Text>
            <Text style={styles.bankColon}> : </Text>
            <Text style={styles.bankValue}>{sanitizePdfText(row.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function CustomerAddressBlock({
  toLabel,
  name,
  addressText,
  mobile,
  pan,
  gst,
}: {
  toLabel: string
  name: string
  addressText?: string | null
  mobile?: string | null
  pan?: string | null
  gst?: string | null
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{sanitizePdfText(toLabel)}</Text>
      <Text style={{ fontFamily: 'Helvetica-Bold', fontWeight: 'bold', marginTop: 2 }}>
        {sanitizePdfText(name)}
      </Text>
      {formatPdfAddressLines(addressText).map((line, i) => (
        <Text key={`addr-line-${i}`} style={{ marginTop: i === 0 ? 3 : 1 }}>
          {sanitizePdfText(line)}
        </Text>
      ))}
      {mobile ? <Text style={{ marginTop: 2 }}>MOB: {sanitizePdfText(mobile)}</Text> : null}
      {pan ? <Text style={{ marginTop: 2 }}>PAN NO: {sanitizePdfText(pan)}</Text> : null}
      {gst ? <Text style={{ marginTop: 2 }}>GST NO: {sanitizePdfText(gst)}</Text> : null}
    </>
  )
}

function InvoicePage({
  copyLabel,
  template,
  bill,
  totals,
  gst,
  bank,
  customerName,
  customerAddress,
  customerMobile,
  customerPan,
  customerGst,
  customerHasShippingAddress,
  customerShippingAddress,
  compliance,
  lines,
  session,
  ewayBillNo,
  mrpItemNames,
  variant = 'bill',
  approvalNarration,
  showPurityInPdf = false,
}: {
  copyLabel: string
  template: ErpTaxInvoiceTemplateConfig
  bill: ErpBill
  totals: ErpQuoteTotals
  gst: ErpGstSettings
  bank?: ErpBankSettings
  customerName?: string | null
  customerAddress?: string | null
  customerMobile?: string | null
  customerPan?: string | null
  customerGst?: string | null
  customerHasShippingAddress?: boolean
  customerShippingAddress?: string | null
  compliance?: ErpTaxInvoiceCompliance | null
  lines: ErpBillLine[]
  session: Record<string, unknown>
  ewayBillNo?: string | null
  mrpItemNames?: Set<string>
  variant?: 'bill' | 'einvoice' | 'approval'
  approvalNarration?: string | null
  showPurityInPdf?: boolean
}) {
  const placeOfSupply =
    String(session.placeOfSupply || gst.placeOfSupply || '').trim() || 'Tamil Nadu'
  const interstate = isInterstateSupply({
    sellerGstin: gst.gstin,
    placeOfSupply,
    buyerGstin: String(session.customerGst || customerGst || ''),
  })
  const gstOffOnBill =
    bill.gst_enabled === false ||
    (bill.session &&
      typeof bill.session === 'object' &&
      (bill.session as { gstEnabled?: boolean }).gstEnabled === false)
  const isApproval = variant === 'approval'
  const lineAmountOpts = { gstOffOnBill: !!gstOffOnBill, isApproval, mrpItemNames }
  let taxable = roundInr2(
    lines.reduce((sum, line) => sum + lineDisplayAmountInr(line, lineAmountOpts), 0),
  )
  let gstAmt = totals.gst
  if (gstOffOnBill && totals.net > 0) {
    const net = Math.round(totals.net)
    taxable = roundInr2(net / 1.03)
    gstAmt = roundInr2(net - taxable)
  } else if (!gstOffOnBill) {
    gstAmt = roundInr2(taxable * 0.03)
  } else {
    gstAmt = 0
  }
  const igst = interstate ? gstAmt : 0
  const cgst = interstate ? 0 : gstAmt / 2
  const sgst = interstate ? 0 : gstAmt / 2
  const rawTotal = roundInr2(taxable + gstAmt)
  const roundedTotal = Math.round(Number(bill.total_inr) || totals.net || rawTotal)
  const roundOff = roundInr2(roundedTotal - rawTotal)
  const narrationCaps = String(approvalNarration || session.approvalNarration || '')
    .trim()
    .toUpperCase()
  const payLabel = isApproval
    ? narrationCaps
    : paymentMethodInvoiceLabel(String(session.paymentMethod || ''))
  const headerTitle = isApproval ? 'Delivery Challan[Issue]' : 'TAX INVOICE'
  const shopDisplay = template.shopName || gst.legalName || 'Shop'
  const approvalNetDisplay =
    Math.round(Number(bill.total_inr) || totals.net || roundedTotal || 0)
  const approvalWeightDisplay = totals.weight > 0 ? totals.weight : 0
  const displayNetForAlloc = Math.round(Number(bill.total_inr) || totals.net || roundedTotal)
  const lineTaxAlloc: LineTaxableAlloc | undefined =
    gstOffOnBill && displayNetForAlloc > 0 && taxable > 0 && displayNetForAlloc - taxable > 0.5
      ? { subtotal: taxable, net: displayNetForAlloc }
      : undefined

  const unifiedRows: string[][] = lines.map((line, idx) => {
    const slNo = `${idx + 1}.`
    const desc = line.invoice_item_name || line.name || 'JEWELLERY'
    const hsn = line.hsn_code || '711311'
    const qty = lineQty(line)
    const purityCell = showPurityInPdf ? billLinePdfPurityText(line, lines) : ''
    if (marlechaFlatMrpRow(line, mrpItemNames)) {
      const amt = Number(line.lineTotalInr) || 0
      const rate = linePieceRate(line)
      const base = [
        slNo,
        desc,
        hsn,
        String(qty),
        '—',
        '—',
        rate > 0 ? rate.toFixed(2) : '—',
        amt.toFixed(2),
      ]
      if (!showPurityInPdf) return base
      return [slNo, desc, hsn, String(qty), '—', '—', purityCell, rate > 0 ? rate.toFixed(2) : '—', amt.toFixed(2)]
    }
    const lineAmtInr = isApproval
      ? Number(line.lineTotalInr) || 0
      : lineTaxableInr(line, !!gstOffOnBill, lineTaxAlloc)
    const grossTotal = lineTotalGrossGm(line)
    const netTotal = lineTotalNetGm(line)
    const rate = lineRatePerGram(line, lineAmtInr, true)
    const base = [
      slNo,
      desc,
      hsn,
      String(qty),
      grossTotal > 0 ? grossTotal.toFixed(2) : '—',
      netTotal > 0 ? netTotal.toFixed(2) : '—',
      rate > 0 ? rate.toFixed(2) : '—',
      lineAmtInr > 0 ? lineAmtInr.toFixed(2) : '—',
    ]
    if (!showPurityInPdf) return base
    return [
      slNo,
      desc,
      hsn,
      String(qty),
      grossTotal > 0 ? grossTotal.toFixed(2) : '—',
      netTotal > 0 ? netTotal.toFixed(2) : '—',
      purityCell,
      rate > 0 ? rate.toFixed(2) : '—',
      lineAmtInr > 0 ? lineAmtInr.toFixed(2) : '—',
    ]
  })

  const showQr = !!compliance?.irn
  const addressLines = compactCompanyAddressLines(template.addressLines)
  const toLabel = /:$/.test(template.toLabel.trim()) ? template.toLabel.trim() : `${template.toLabel.trim()}:`
  const placeLabel = /:$/.test(template.placeOfSupplyLabel.trim())
    ? template.placeOfSupplyLabel.trim()
    : `${template.placeOfSupplyLabel.trim()}:`
  const displayName = customerName || bill.customer_name || 'Walk-in'
  const displayMobile = customerMobile || null
  const displayPan = customerPan || null
  const displayGst = customerGst || null
  const showShipping =
    !isApproval &&
    customerHasShippingAddress === true &&
    String(customerShippingAddress || '').trim().length > 0
  const totalQty = lines.reduce((sum, line) => sum + lineQty(line), 0)
  const totalNetWt = roundInr2(lines.reduce((sum, line) => sum + lineTotalNetGm(line), 0))
  const unifiedCols = showPurityInPdf ? [...UNIFIED_COLS_WITH_PURITY] : [...UNIFIED_COLS]
  const unifiedWidths = showPurityInPdf ? [...UNIFIED_COL_W_WITH_PURITY] : [...UNIFIED_COL_W]
  const tableFooterCells =
    !isApproval && unifiedRows.length > 0
      ? showPurityInPdf
        ? [
            '',
            'Total',
            '',
            String(totalQty),
            '',
            totalNetWt > 0 ? totalNetWt.toFixed(3) : '—',
            '',
            '',
            taxable > 0 ? taxable.toFixed(2) : '—',
          ]
        : [
            '',
            'Total',
            '',
            String(totalQty),
            '',
            totalNetWt > 0 ? totalNetWt.toFixed(3) : '—',
            '',
            taxable > 0 ? taxable.toFixed(2) : '—',
          ]
      : undefined

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageBody}>
      <View style={styles.headerBox}>
        {copyLabel ? <Text style={styles.copyTag}>{copyLabel}</Text> : null}
        <View style={styles.headerMain}>
          <View style={styles.headerCenter}>
            <Text style={styles.title}>{sanitizePdfText(headerTitle)}</Text>
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
          <View style={styles.billingAddressStack}>
            <View
              style={[
                styles.billingAddressSection,
                ...(showShipping ? [styles.billingAddressSectionSplit] : []),
              ]}
            >
              <Text style={styles.billingBar}>{sanitizePdfText(template.billingAddressLabel)}</Text>
              <View style={styles.billingBody}>
                <CustomerAddressBlock
                  toLabel={toLabel}
                  name={displayName}
                  addressText={customerAddress}
                  mobile={displayMobile}
                  pan={displayPan}
                  gst={displayGst}
                />
              </View>
            </View>
            {showShipping ? (
              <View style={styles.billingAddressSection}>
                <Text style={styles.billingBar}>Shipping Address</Text>
                <View style={styles.billingBody}>
                  <CustomerAddressBlock
                    toLabel={toLabel}
                    name={displayName}
                    addressText={customerShippingAddress}
                    mobile={displayMobile}
                    pan={displayPan}
                    gst={displayGst}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.billingRight}>
          <Text style={{ fontSize: 9, marginBottom: 4 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(template.billNoLabel)} </Text>
            {sanitizePdfText(bill.bill_number)}
          </Text>
          <Text style={{ fontSize: 9, marginBottom: 12 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(template.dateLabel)} </Text>
            {formatBillDate(bill)}
          </Text>
          {variant === 'einvoice' || ewayBillNo ? (
            <Text style={{ fontSize: 9, marginBottom: 8 }}>
              <Text style={styles.fieldLabel}>E-Way Bill : </Text>
              {sanitizePdfText(ewayBillNo || '')}
            </Text>
          ) : null}
          <Text style={{ fontSize: 8, marginBottom: 2 }}>
            <Text style={styles.fieldLabel}>{sanitizePdfText(placeLabel)}</Text>
          </Text>
          <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' }}>
            {sanitizePdfText(placeOfSupply)}
          </Text>
        </View>
      </View>

      <View style={styles.table}>
        {unifiedRows.length > 0
          ? renderColumnTable('unified', unifiedCols, unifiedWidths, unifiedRows, {
              fillRemaining: true,
              footerCells: tableFooterCells,
            })
          : null}
      </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryLeft}>
          <View>
            {isApproval ? null : (
              <Text style={{ fontWeight: 'bold', fontSize: 9 }}>{amountInWordsInr(roundedTotal)}</Text>
            )}
            {isApproval && payLabel ? (
              <Text
                style={{
                  marginTop: 0,
                  fontSize: 10,
                  fontFamily: 'Helvetica-Bold',
                  fontWeight: 'bold',
                }}
              >
                {sanitizePdfText(payLabel)}
              </Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 8.5, marginTop: 8 }}>{sanitizePdfText(template.partySignatureLabel)}</Text>
        </View>
        <View style={styles.summaryRight}>
          {isApproval ? (
            <>
              <View style={styles.totalCell}>
                <Text style={{ fontWeight: 'bold' }}>Total Weight</Text>
                <Text style={{ fontWeight: 'bold' }}>
                  {approvalWeightDisplay > 0 ? approvalWeightDisplay.toFixed(2) : '—'}
                </Text>
              </View>
              <View style={styles.netCell}>
                <Text style={styles.fieldLabel}>Net Amount</Text>
                <Text style={styles.fieldLabel}>{approvalNetDisplay.toFixed(2)}</Text>
              </View>
            </>
          ) : (
            <>
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
            </>
          )}
        </View>
      </View>

      <View style={styles.footerWrap}>
        <View style={styles.footerMainRow}>
          <View style={styles.footerColLeft}>
            {isApproval ? null : (
              <>
                <Text style={{ fontWeight: 'bold', textDecoration: 'underline', marginBottom: 3 }}>
                  {sanitizePdfText(template.termsTitle)}
                </Text>
                {template.termsLines.map((t, i) => (
                  <Text key={`term-${i}`}>
                    {i + 1}. {sanitizePdfText(t)}
                  </Text>
                ))}
              </>
            )}
          </View>
          <View style={styles.footerColCenter}>
            <BankDetailsBlock bank={bank} templateLines={template.bankLines} />
          </View>
          <View style={styles.footerColRight}>
            <View style={styles.signColTop}>
              <Text style={styles.signCompanyLine}>
                {template.authorisedForPrefix} {sanitizePdfText(shopDisplay)}
              </Text>
            </View>
          </View>
        </View>
        {!isApproval ? (
          <View style={styles.footerBottomRow}>
            <View style={styles.footerColLeft}>
              <Text style={styles.jurisdictionLine}>{sanitizePdfText(template.jurisdictionLine)}</Text>
            </View>
            <View style={styles.footerColCenter} />
            <View style={styles.footerColRight}>
              <View style={styles.signColBottom}>
                <View style={styles.signLine}>
                  <Text>{sanitizePdfText(template.authorisedSignatoryLabel)}</Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.footerBottomRow}>
            <View style={styles.footerColLeft} />
            <View style={styles.footerColCenter} />
            <View style={styles.footerColRight}>
              <View style={styles.signColBottom}>
                <View style={styles.signLine}>
                  <Text>{sanitizePdfText(template.authorisedSignatoryLabel)}</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>

      {variant === 'einvoice' ? (
        <Text style={styles.eRef}>{sanitizePdfText(template.electronicRefLabel)}</Text>
      ) : null}
    </Page>
  )
}

export function ErpConfigurableTaxInvoicePdfDocument(
  props: ConfigurableTaxInvoiceProps & { invoiceCopyIndex?: 0 | 1 | 2 },
) {
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

  const copyIdx = Math.min(2, Math.max(0, props.invoiceCopyIndex ?? 0))

  return (
    <Document>
      <InvoicePage
        {...pageProps}
        copyLabel={copies[copyIdx]}
        variant={props.variant || 'bill'}
        approvalNarration={props.approvalNarration}
        showPurityInPdf={props.showPurityInPdf === true}
      />
    </Document>
  )
}

/** @deprecated use ErpConfigurableTaxInvoicePdfDocument */
export function ErpMarlechaTaxInvoicePdfDocument(props: ErpTaxInvoicePdfDocumentProps & { templateConfig?: ErpTaxInvoiceTemplateConfig | null }) {
  return <ErpConfigurableTaxInvoicePdfDocument {...props} />
}

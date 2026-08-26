import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { groupInvoiceLinesForTax } from '@/lib/erp-invoice-defaults'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export type ErpGstSettings = {
  gstin?: string | null
  legalName?: string | null
  address?: string | null
  phone?: string | null
  placeOfSupply?: string | null
}

export type ErpBankSettings = {
  bankName?: string | null
  accountName?: string | null
  accountNo?: string | null
  ifsc?: string | null
  branch?: string | null
}

export type ErpTaxInvoiceCompliance = {
  irn?: string | null
  ack_no?: string | null
  ack_date?: string | null
  qrImageSrc?: string | null
  sandbox?: boolean
}

export type ErpTaxInvoicePdfDocumentProps = {
  bill: ErpBill
  brandName: string
  totals: ErpQuoteTotals
  gst: ErpGstSettings
  bank: ErpBankSettings
  customerName?: string | null
  customerAddress?: string | null
  customerMobile?: string | null
  customerPan?: string | null
  customerGst?: string | null
  compliance?: ErpTaxInvoiceCompliance | null
  /** customer | office — render one copy per page */
  copyLabel?: 'CUSTOMER COPY' | 'OFFICE COPY'
}

const styles = StyleSheet.create({
  page: {
    padding: 24,
    paddingBottom: 28,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: '#111',
  },
  copyLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  address: {
    fontSize: 7.5,
    textAlign: 'center',
    lineHeight: 1.35,
    marginBottom: 3,
  },
  shopName: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  billNoStar: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontSize: 8,
  },
  metaStrong: { fontWeight: 'bold' },
  billedHeader: {
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 2,
  },
  billedRow: {
    flexDirection: 'row',
    marginBottom: 2,
    fontSize: 7.5,
    lineHeight: 1.35,
  },
  billedLabel: { width: 72, fontWeight: 'bold' },
  billedValue: { flex: 1 },
  table: {
    borderWidth: 1,
    borderColor: '#222',
    marginTop: 6,
    marginBottom: 6,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#f0ebe3',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tableHeadCell: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 6.5,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#222',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  tableCell: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
    borderRightWidth: 1,
    borderRightColor: '#ccc',
    textAlign: 'center',
  },
  tableCellLeft: { textAlign: 'left' },
  tableCellRight: { textAlign: 'right' },
  totalsBlock: {
    marginTop: 4,
    alignSelf: 'flex-end',
    width: '52%',
    fontSize: 7.5,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  totalGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingTop: 3,
    borderTopWidth: 1,
    borderTopColor: '#333',
    fontWeight: 'bold',
    fontSize: 9,
  },
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    fontSize: 7.5,
  },
  signBox: { width: '45%', textAlign: 'center' },
  signLine: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 28,
    paddingTop: 4,
  },
  bankBlock: {
    marginTop: 10,
    fontSize: 7.5,
    lineHeight: 1.45,
  },
  bankLine: { flexDirection: 'row', marginBottom: 1 },
  bankLabel: { width: 72, fontWeight: 'bold' },
  complianceBox: {
    marginTop: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: '#888',
    flexDirection: 'row',
    gap: 8,
  },
  complianceText: { flex: 1, fontSize: 7 },
  qrImage: { width: 72, height: 72, objectFit: 'contain' },
})

const COL_WIDTHS = {
  sl: '5%',
  item: '22%',
  hsn: '10%',
  pcs: '7%',
  wt: '12%',
  purity: '9%',
  rate: '12%',
  total: '23%',
} as const

function formatBillDate(bill: ErpBill): string {
  const raw = bill.bill_date || bill.created_at
  return formatErpDateDdMmYyyy(raw).replace(/\//g, '-')
}

function formatPurityDisplay(purity: number | null | undefined): string {
  if (purity == null) return '—'
  const n = Number(purity)
  if (!Number.isFinite(n)) return String(purity)
  if (n >= 100) return String(n / 10)
  if (n <= 99.9 && n >= 10) return String(n)
  return String(n)
}

function lineItemName(line: ErpBillLine): string {
  return (line.invoice_item_name || line.name || 'JEWELLERY').trim()
}

function lineHsn(line: ErpBillLine): string {
  return (line.hsn_code || '711311').trim()
}

function lineTaxable(line: ErpBillLine, totals: ErpQuoteTotals, lineCount: number): number {
  if (line.lineTotalInr != null && totals.gst > 0 && totals.subtotal > 0) {
    const ratio = line.lineTotalInr / totals.net
    return ratio * totals.subtotal
  }
  return line.lineTotalInr ?? 0
}

function InvoiceCopyPage({
  copyLabel,
  bill,
  brandName,
  totals,
  gst,
  bank,
  customerName,
  customerAddress,
  customerMobile,
  customerPan,
  customerGst,
  compliance,
  lines,
}: ErpTaxInvoicePdfDocumentProps & { lines: ErpBillLine[] }) {
  const gstValue = totals.subtotal
  const cgst = totals.gst / 2
  const sgst = totals.gst / 2
  const rawTotal = gstValue + cgst + sgst
  const roundedTotal = Math.round(rawTotal)
  const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100
  const totalPcs = lines.reduce((s, l) => s + (Number(l.qty) || 1), 0)
  const totalWeight = lines.reduce((s, l) => s + (Number(l.weightGm) || 0), 0)
  const shopDisplay = gst.legalName?.trim() || brandName
  const isTaxInvoice = !!compliance?.irn

  return (
    <Page size="A4" style={styles.page}>
      {copyLabel ? <Text style={styles.copyLabel}>{copyLabel}</Text> : null}
      <Text style={styles.title}>{isTaxInvoice ? 'TAX INVOICE' : 'TAX INVOICE'}</Text>
      {gst.address ? <Text style={styles.address}>{sanitizePdfText(gst.address)}</Text> : null}
      {gst.phone ? <Text style={styles.address}>{sanitizePdfText(gst.phone)}</Text> : null}
      <Text style={styles.shopName}>{sanitizePdfText(shopDisplay)}</Text>
      <Text style={styles.billNoStar}>*{sanitizePdfText(bill.bill_number)}*</Text>
      {gst.gstin ? (
        <Text style={{ ...styles.address, fontWeight: 'bold', marginBottom: 4 }}>{sanitizePdfText(gst.gstin)}</Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text>
          <Text style={styles.metaStrong}>INVOICE No. : </Text>
          {sanitizePdfText(bill.bill_number)}
        </Text>
        <Text>
          <Text style={styles.metaStrong}>BILL DATE </Text>
          {formatBillDate(bill)}
        </Text>
      </View>

      <Text style={styles.billedHeader}>Billed To</Text>
      <View style={styles.billedRow}>
        <Text style={styles.billedLabel}>NAME :</Text>
        <Text style={styles.billedValue}>{sanitizePdfText(customerName || bill.customer_name || '—')}</Text>
      </View>
      {customerAddress ? (
        <View style={styles.billedRow}>
          <Text style={styles.billedLabel}>Address :</Text>
          <Text style={styles.billedValue}>{sanitizePdfText(customerAddress)}</Text>
        </View>
      ) : null}
      {customerMobile ? (
        <View style={styles.billedRow}>
          <Text style={styles.billedLabel}>MOB:</Text>
          <Text style={styles.billedValue}>{sanitizePdfText(customerMobile)}</Text>
        </View>
      ) : null}
      {customerPan ? (
        <View style={styles.billedRow}>
          <Text style={styles.billedLabel}>PAN NO:</Text>
          <Text style={styles.billedValue}>{sanitizePdfText(customerPan)}</Text>
        </View>
      ) : null}
      {customerGst ? (
        <View style={styles.billedRow}>
          <Text style={styles.billedLabel}>GST NO:</Text>
          <Text style={styles.billedValue}>{sanitizePdfText(customerGst)}</Text>
        </View>
      ) : null}

      <View style={styles.table}>
        <View style={styles.tableHead}>
          {[
            { w: COL_WIDTHS.sl, label: 'Sl' },
            { w: COL_WIDTHS.item, label: 'ITEM' },
            { w: COL_WIDTHS.hsn, label: 'HSN' },
            { w: COL_WIDTHS.pcs, label: 'PCS' },
            { w: COL_WIDTHS.wt, label: 'Weight\nIn Gms' },
            { w: COL_WIDTHS.purity, label: 'Purity' },
            { w: COL_WIDTHS.rate, label: 'Rate' },
            { w: COL_WIDTHS.total, label: 'TOTAL' },
          ].map((c) => (
            <Text key={c.label} style={[styles.tableHeadCell, { width: c.w }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {lines.map((line, i) => {
          const taxable = lineTaxable(line, totals, lines.length)
          const rate = line.ratePerGram != null ? Number(line.ratePerGram) : null
          return (
            <View key={`line-${i}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: COL_WIDTHS.sl }]}>{i + 1}</Text>
              <Text style={[styles.tableCell, styles.tableCellLeft, { width: COL_WIDTHS.item }]}>
                {sanitizePdfText(lineItemName(line))}
              </Text>
              <Text style={[styles.tableCell, { width: COL_WIDTHS.hsn }]}>{sanitizePdfText(lineHsn(line))}</Text>
              <Text style={[styles.tableCell, { width: COL_WIDTHS.pcs }]}>{line.qty ?? 1}</Text>
              <Text style={[styles.tableCell, styles.tableCellRight, { width: COL_WIDTHS.wt }]}>
                {line.weightGm != null ? Number(line.weightGm).toFixed(3) : '—'}
              </Text>
              <Text style={[styles.tableCell, { width: COL_WIDTHS.purity }]}>
                {formatPurityDisplay(line.purity)}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellRight, { width: COL_WIDTHS.rate }]}>
                {rate != null && !line.rateLocked ? rate.toFixed(2) : '—'}
              </Text>
              <Text style={[styles.tableCell, styles.tableCellRight, { width: COL_WIDTHS.total, borderRightWidth: 0 }]}>
                {taxable.toFixed(2)}
              </Text>
            </View>
          )
        })}
        <View style={[styles.tableRow, { backgroundColor: '#faf8f4' }]}>
          <Text style={[styles.tableCell, { width: COL_WIDTHS.sl, borderRightWidth: 0 }]} />
          <Text style={[styles.tableCell, styles.tableCellLeft, { width: COL_WIDTHS.item, fontWeight: 'bold' }]}>
            Total
          </Text>
          <Text style={[styles.tableCell, { width: COL_WIDTHS.hsn }]} />
          <Text style={[styles.tableCell, { width: COL_WIDTHS.pcs, fontWeight: 'bold' }]}>{totalPcs}</Text>
          <Text style={[styles.tableCell, styles.tableCellRight, { width: COL_WIDTHS.wt, fontWeight: 'bold' }]}>
            {totalWeight.toFixed(3)}
          </Text>
          <Text style={[styles.tableCell, { width: COL_WIDTHS.purity, borderRightWidth: 0 }]} />
          <Text style={[styles.tableCell, { width: COL_WIDTHS.rate, borderRightWidth: 0 }]} />
          <Text style={[styles.tableCell, styles.tableCellRight, { width: COL_WIDTHS.total, borderRightWidth: 0, fontWeight: 'bold' }]}>
            {gstValue.toFixed(2)}
          </Text>
        </View>
      </View>

      <View style={styles.totalsBlock}>
        <View style={styles.totalRow}>
          <Text>Round off:</Text>
          <Text>{roundOff.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>GST Value:</Text>
          <Text>{gstValue.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>CGST@1.50%:</Text>
          <Text>{cgst.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>SGST@1.50%:</Text>
          <Text>{sgst.toFixed(2)}</Text>
        </View>
        <View style={styles.totalGrand}>
          <Text>Total Amount:</Text>
          <Text>{roundedTotal.toFixed(2)}</Text>
        </View>
      </View>

      {compliance?.irn ? (
        <View style={styles.complianceBox}>
          <View style={styles.complianceText}>
            <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>E-Invoice details</Text>
            <Text>IRN: {sanitizePdfText(compliance.irn)}</Text>
            {compliance.ack_no ? <Text>ACK NO: {sanitizePdfText(compliance.ack_no)}</Text> : null}
            {compliance.ack_date ? <Text>ACK DATE: {sanitizePdfText(compliance.ack_date)}</Text> : null}
            {compliance.sandbox ? <Text style={{ marginTop: 2, fontSize: 6 }}>(Sandbox mode)</Text> : null}
          </View>
          {compliance.qrImageSrc ? (
            <Image style={styles.qrImage} src={compliance.qrImageSrc} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.signRow}>
        <View style={styles.signBox}>
          <View style={styles.signLine}>
            <Text>CUSTOMER SIGNATURE</Text>
          </View>
        </View>
        <View style={styles.signBox}>
          <View style={styles.signLine}>
            <Text>For {sanitizePdfText(shopDisplay)}</Text>
          </View>
        </View>
      </View>

      {(bank.bankName || bank.accountName || bank.accountNo) ? (
        <View style={styles.bankBlock}>
          {bank.bankName ? (
            <View style={styles.bankLine}>
              <Text style={styles.bankLabel}>BANK NAME :</Text>
              <Text>{sanitizePdfText(bank.bankName)}</Text>
            </View>
          ) : null}
          {bank.accountName ? (
            <View style={styles.bankLine}>
              <Text style={styles.bankLabel}>AC NAME :</Text>
              <Text>{sanitizePdfText(bank.accountName)}</Text>
            </View>
          ) : null}
          {bank.accountNo ? (
            <View style={styles.bankLine}>
              <Text style={styles.bankLabel}>AC NO :</Text>
              <Text>{sanitizePdfText(bank.accountNo)}</Text>
            </View>
          ) : null}
          {bank.ifsc ? (
            <View style={styles.bankLine}>
              <Text style={styles.bankLabel}>IFSC CODE :</Text>
              <Text>{sanitizePdfText(bank.ifsc)}</Text>
            </View>
          ) : null}
          {bank.branch ? (
            <View style={styles.bankLine}>
              <Text style={styles.bankLabel}>BRANCH :</Text>
              <Text>{sanitizePdfText(bank.branch)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Page>
  )
}

export function ErpTaxInvoicePdfDocument(props: ErpTaxInvoicePdfDocumentProps) {
  const lines = groupInvoiceLinesForTax(props.bill.lines ?? [])
  const pageProps = useMemo(() => ({ ...props, lines }), [props, lines])

  return (
    <Document>
      <InvoiceCopyPage {...pageProps} copyLabel="CUSTOMER COPY" />
      <InvoiceCopyPage {...pageProps} copyLabel="OFFICE COPY" />
    </Document>
  )
}

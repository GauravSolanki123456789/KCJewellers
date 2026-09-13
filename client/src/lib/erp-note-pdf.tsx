import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { amountInWordsInr } from '@/lib/erp-amount-in-words'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import { enrichReturnBillLinesForExport } from '@/lib/erp-sales-return'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#000',
    lineHeight: 1.35,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  shop: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 14,
  },
  row: { flexDirection: 'row', marginBottom: 5 },
  label: { width: 120, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' },
  value: { flexGrow: 1 },
  box: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginTop: 12,
    marginBottom: 12,
  },
  amount: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  words: { marginTop: 8, fontSize: 8, fontStyle: 'italic' },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 6,
  },
  table: {
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 10,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#f3efe8',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  th: {
    padding: 4,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
    fontSize: 7,
  },
  td: {
    padding: 4,
    fontSize: 7,
  },
  colIdx: { width: '4%' },
  colBill: { width: '8%' },
  colBarcode: { width: '12%' },
  colProduct: { width: '14%' },
  colNet: { width: '7%' },
  colMet: { width: '6%' },
  colBillWt: { width: '7%' },
  colRate: { width: '7%' },
  colMc: { width: '6%' },
  colTax: { width: '8%' },
  colAmt: { width: '9%' },
  colInv: { width: '12%' },
  footer: { marginTop: 24, fontSize: 8, color: '#333' },
})

export type NotePdfKind = 'credit' | 'debit'

type NoteSession = ErpBillSession & {
  reason?: string
  remarks?: string
  againstBills?: string
  taxableInr?: number
  gstInr?: number
  invoiceItemName?: string
  rateMode?: string
  customGoldPerG?: number | null
  customSilverPerG?: number | null
  rateSlab?: string
  originalNet?: number
}

type Props = {
  kind: NotePdfKind
  bill: ErpBill
  shopName?: string | null
  customerMobile?: string | null
  slabSettingsRaw?: unknown
}

function noteInvoiceItems(bill: ErpBill, session: NoteSession): string[] {
  const names = new Set<string>()
  const fromSession = String(session.invoiceItemName || '').trim()
  if (fromSession) names.add(fromSession)
  for (const line of bill.lines || []) {
    const n = String(line.invoice_item_name || '').trim()
    if (n) names.add(n)
  }
  return [...names]
}

function NoteDocument({ kind, bill, shopName, customerMobile, slabSettingsRaw }: Props) {
  const session = (bill.session || {}) as NoteSession
  const title = kind === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'
  const net = Number(bill.total_inr) || 0
  const taxable = Number(session.taxableInr)
  const gst = Number(session.gstInr)
  const showTax = Number.isFinite(taxable) && taxable > 0
  const invoiceItems = noteInvoiceItems(bill, session)
  const lineRows = enrichReturnBillLinesForExport(bill, slabSettingsRaw)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.shop}>{sanitizePdfText(shopName || 'Shop')}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>{kind === 'credit' ? 'Credit note no.' : 'Debit note no.'}</Text>
          <Text style={styles.value}>{sanitizePdfText(bill.bill_number)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{formatErpDateDdMmYyyy(bill.bill_date || bill.created_at)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.value}>{sanitizePdfText(bill.customer_name || 'Walk-in')}</Text>
        </View>
        {customerMobile || session.mobile ? (
          <View style={styles.row}>
            <Text style={styles.label}>Mobile</Text>
            <Text style={styles.value}>{sanitizePdfText(customerMobile || session.mobile || '')}</Text>
          </View>
        ) : null}
        {session.againstBills ? (
          <View style={styles.row}>
            <Text style={styles.label}>Against bill(s)</Text>
            <Text style={styles.value}>{sanitizePdfText(session.againstBills)}</Text>
          </View>
        ) : null}
        {session.rateSlab ? (
          <View style={styles.row}>
            <Text style={styles.label}>Rate slab</Text>
            <Text style={styles.value}>{sanitizePdfText(session.rateSlab)}</Text>
          </View>
        ) : null}
        {session.rateMode ? (
          <View style={styles.row}>
            <Text style={styles.label}>Return pricing</Text>
            <Text style={styles.value}>
              {session.rateMode === 'custom'
                ? sanitizePdfText(
                    `Custom rate${session.customSilverPerG ? ` · Silver ₹${session.customSilverPerG}/g` : ''}${session.customGoldPerG ? ` · Gold ₹${session.customGoldPerG}/g` : ''}`,
                  )
                : 'Same billed rate'}
            </Text>
          </View>
        ) : null}
        {session.reason ? (
          <View style={styles.row}>
            <Text style={styles.label}>Reason</Text>
            <Text style={styles.value}>{sanitizePdfText(session.reason)}</Text>
          </View>
        ) : null}
        {invoiceItems.length ? (
          <View style={styles.row}>
            <Text style={styles.label}>Invoice item</Text>
            <Text style={styles.value}>{sanitizePdfText(invoiceItems.join(', '))}</Text>
          </View>
        ) : null}
        {session.remarks ? (
          <View style={styles.row}>
            <Text style={styles.label}>Remarks</Text>
            <Text style={styles.value}>{sanitizePdfText(session.remarks)}</Text>
          </View>
        ) : null}

        {lineRows.length ? (
          <>
            <Text style={styles.sectionTitle}>Returned products</Text>
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.th, styles.colIdx]}>#</Text>
                <Text style={[styles.th, styles.colBill]}>Bill</Text>
                <Text style={[styles.th, styles.colBarcode]}>Barcode</Text>
                <Text style={[styles.th, styles.colProduct]}>Product</Text>
                <Text style={[styles.th, styles.colNet]}>Net g</Text>
                <Text style={[styles.th, styles.colMet]}>Met %</Text>
                <Text style={[styles.th, styles.colBillWt]}>Bill g</Text>
                <Text style={[styles.th, styles.colRate]}>Rate</Text>
                <Text style={[styles.th, styles.colMc]}>MC</Text>
                <Text style={[styles.th, styles.colTax]}>Taxable</Text>
                <Text style={[styles.th, styles.colAmt]}>Amount</Text>
                <Text style={[styles.th, styles.colInv]}>Invoice item</Text>
              </View>
              {lineRows.map((row, idx) => {
                const src = (row.line as { source_bill_number?: string }).source_bill_number || ''
                const gstLine =
                  (Number(row.breakdown.cgst) || 0) + (Number(row.breakdown.sgst) || 0)
                const taxableLine = Number(row.breakdown.taxable) || 0
                return (
                  <View key={`${src}-${idx}`} style={styles.tableRow} wrap={false}>
                    <Text style={[styles.td, styles.colIdx]}>{idx + 1}</Text>
                    <Text style={[styles.td, styles.colBill]}>{sanitizePdfText(src)}</Text>
                    <Text style={[styles.td, styles.colBarcode]}>
                      {sanitizePdfText(row.line.barcode || row.line.code || '')}
                    </Text>
                    <Text style={[styles.td, styles.colProduct]}>
                      {sanitizePdfText(row.line.name || '')}
                    </Text>
                    <Text style={[styles.td, styles.colNet]}>
                      {row.netWt > 0 ? row.netWt.toFixed(3) : '—'}
                    </Text>
                    <Text style={[styles.td, styles.colMet]}>
                      {row.metSlabPct != null ? `${row.metSlabPct}%` : row.line.purity ?? '—'}
                    </Text>
                    <Text style={[styles.td, styles.colBillWt]}>
                      {row.billWt > 0 ? row.billWt.toFixed(3) : '—'}
                    </Text>
                    <Text style={[styles.td, styles.colRate]}>
                      {row.metalRate > 0 ? row.metalRate.toFixed(2) : '—'}
                    </Text>
                    <Text style={[styles.td, styles.colMc]}>
                      {row.line.mc_rate != null ? String(row.line.mc_rate) : '—'}
                    </Text>
                    <Text style={[styles.td, styles.colTax]}>
                      {taxableLine > 0 ? formatPdfInr(taxableLine) : '—'}
                      {gstLine > 0 ? `\nGST ${formatPdfInr(gstLine)}` : ''}
                    </Text>
                    <Text style={[styles.td, styles.colAmt]}>
                      {formatPdfInr(Number(row.line.lineTotalInr) || Number(row.breakdown.total) || 0)}
                    </Text>
                    <Text style={[styles.td, styles.colInv]}>
                      {sanitizePdfText(row.line.invoice_item_name || '')}
                    </Text>
                  </View>
                )
              })}
            </View>
          </>
        ) : null}

        <View style={styles.box}>
          {showTax ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Taxable amount</Text>
                <Text>{formatPdfInr(taxable)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>GST</Text>
                <Text>{formatPdfInr(gst)}</Text>
              </View>
            </>
          ) : null}
          {session.originalNet != null && session.originalNet > 0 ? (
            <View style={styles.row}>
              <Text style={styles.label}>Original billed net</Text>
              <Text>{formatPdfInr(session.originalNet)}</Text>
            </View>
          ) : null}
          <View style={styles.row}>
            <Text style={[styles.label, styles.amount]}>Net amount</Text>
            <Text style={styles.amount}>{formatPdfInr(net)}</Text>
          </View>
          <Text style={styles.words}>{amountInWordsInr(net)}</Text>
        </View>
        {bill.notes ? <Text style={styles.footer}>{sanitizePdfText(bill.notes)}</Text> : null}
      </Page>
    </Document>
  )
}

export async function downloadCreditDebitNotePdf(opts: Props) {
  const blob = await pdf(<NoteDocument {...opts} />).toBlob()
  const fname = `${opts.bill.bill_number}.pdf`
  await presentPdfBlob(blob, fname, {
    title: opts.kind === 'credit' ? 'Credit note' : 'Debit note',
    text: fname,
    customerMobile: opts.customerMobile || null,
    brandLabel: opts.shopName || undefined,
  })
}

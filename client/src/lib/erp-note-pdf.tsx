import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { amountInWordsInr } from '@/lib/erp-amount-in-words'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import type { ErpBill } from '@/components/reseller/erp/erp-ui'
import type { ErpBillSession } from '@/lib/erp-bill-session'

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
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
    marginBottom: 16,
  },
  row: { flexDirection: 'row', marginBottom: 6 },
  label: { width: 130, fontFamily: 'Helvetica-Bold', fontWeight: 'bold' },
  value: { flexGrow: 1 },
  box: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginTop: 16,
    marginBottom: 16,
  },
  amount: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    fontWeight: 'bold',
  },
  words: { marginTop: 8, fontSize: 9, fontStyle: 'italic' },
  footer: { marginTop: 36, fontSize: 8, color: '#333' },
})

export type NotePdfKind = 'credit' | 'debit'

type NoteSession = ErpBillSession & {
  reason?: string
  remarks?: string
  againstBills?: string
  taxableInr?: number
  gstInr?: number
}

type Props = {
  kind: NotePdfKind
  bill: ErpBill
  shopName?: string | null
  customerMobile?: string | null
}

function NoteDocument({ kind, bill, shopName, customerMobile }: Props) {
  const session = (bill.session || {}) as NoteSession
  const title = kind === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'
  const net = Number(bill.total_inr) || 0
  const taxable = Number(session.taxableInr)
  const gst = Number(session.gstInr)
  const showTax = Number.isFinite(taxable) && taxable > 0

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
        {session.reason ? (
          <View style={styles.row}>
            <Text style={styles.label}>Reason</Text>
            <Text style={styles.value}>{sanitizePdfText(session.reason)}</Text>
          </View>
        ) : null}
        {session.remarks ? (
          <View style={styles.row}>
            <Text style={styles.label}>Remarks</Text>
            <Text style={styles.value}>{sanitizePdfText(session.remarks)}</Text>
          </View>
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

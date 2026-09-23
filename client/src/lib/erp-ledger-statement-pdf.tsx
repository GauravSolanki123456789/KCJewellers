import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import type { CustomerAccountData } from '@/components/reseller/erp/ErpCustomerAccountPanel'
import { formatLedgerTransactionKind, formatPdfInr } from '@/lib/erp-ledger-labels'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  sub: { fontSize: 9, color: '#444', marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 90, fontWeight: 'bold' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingBottom: 4,
    marginTop: 12,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  tableRow: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  c1: { width: '14%' },
  c2: { width: '12%' },
  c3: { width: '14%' },
  c4: { width: '20%' },
  cW: { width: '10%', textAlign: 'right' },
  c5: { width: '10%', textAlign: 'right' },
  c6: { width: '10%', textAlign: 'right' },
  c7: { width: '12%', textAlign: 'right' },
})

function LedgerStatementDocument({ account }: { account: CustomerAccountData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Customer account statement</Text>
        <Text style={styles.sub}>{account.customer.name}</Text>
        {account.customer.mobile ? <Text style={styles.sub}>Mobile: {account.customer.mobile}</Text> : null}
        <View style={styles.row}>
          <Text style={styles.label}>Total billed</Text>
          <Text>{formatPdfInr(account.summary.total_billed_inr)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Total paid</Text>
          <Text>{formatPdfInr(account.summary.total_paid_inr)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Balance due</Text>
          <Text>{formatPdfInr(account.summary.balance_due_inr)}</Text>
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.c1}>Date</Text>
          <Text style={styles.c2}>Type</Text>
          <Text style={styles.c3}>Ref</Text>
          <Text style={styles.c4}>Description</Text>
          <Text style={styles.cW}>Weight</Text>
          <Text style={styles.c5}>Debit</Text>
          <Text style={styles.c6}>Credit</Text>
          <Text style={styles.c7}>Balance</Text>
        </View>
        {account.transactions.map((t, i) => (
          <View key={`${t.ref}-${i}`} style={styles.tableRow}>
            <Text style={styles.c1}>{t.date}</Text>
            <Text style={styles.c2}>{formatLedgerTransactionKind(t.kind)}</Text>
            <Text style={styles.c3}>{t.ref || '—'}</Text>
            <Text style={styles.c4}>{t.description}</Text>
            <Text style={styles.cW}>
              {t.weight_gm && t.weight_gm > 0 ? `${t.weight_gm.toFixed(3)} g` : '—'}
            </Text>
            <Text style={styles.c5}>{t.debit ? formatPdfInr(t.debit) : '—'}</Text>
            <Text style={styles.c6}>{t.credit ? formatPdfInr(t.credit) : '—'}</Text>
            <Text style={styles.c7}>{formatPdfInr(t.balance_inr)}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadCustomerAccountPdf(account: CustomerAccountData) {
  const blob = await pdf(<LedgerStatementDocument account={account} />).toBlob()
  const fname = `ledger-${account.customer.name.replace(/\W+/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: 'Customer account statement',
    text: fname,
    customerMobile: account.customer.mobile ?? null,
  })
}

export type DaybookExportData = {
  date: string
  lane_view?: boolean
  summary: {
    received_inr: number
    paid_out_inr: number
    net_inr: number
    transaction_count: number
  }
  transactions: {
    entry_date: string
    kind: string
    customer_name: string
    payment_mode: string
    reference: string
    amount_inr: number
    received_inr: number
    paid_out_inr: number
    description?: string
  }[]
}

function DaybookDocument({ data }: { data: DaybookExportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Day book</Text>
        <Text style={styles.sub}>{data.date}{data.lane_view ? ' (lane ledger)' : ''}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Received</Text>
          <Text>{formatPdfInr(data.summary.received_inr)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Paid out</Text>
          <Text>{formatPdfInr(data.summary.paid_out_inr)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Net</Text>
          <Text>{formatPdfInr(data.summary.net_inr)}</Text>
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.c1}>Date</Text>
          <Text style={styles.c2}>Type</Text>
          <Text style={styles.c3}>Party</Text>
          <Text style={styles.c4}>Reference</Text>
          <Text style={styles.c5}>Received</Text>
          <Text style={styles.c6}>Paid</Text>
        </View>
        {data.transactions.map((t, i) => (
          <View key={`${t.reference}-${i}`} style={styles.tableRow}>
            <Text style={styles.c1}>{t.entry_date}</Text>
            <Text style={styles.c2}>{formatLedgerTransactionKind(t.kind)}</Text>
            <Text style={styles.c3}>{t.customer_name}</Text>
            <Text style={styles.c4}>{t.reference || '—'}</Text>
            <Text style={styles.c5}>{t.received_inr ? formatPdfInr(t.received_inr) : '—'}</Text>
            <Text style={styles.c6}>{t.paid_out_inr ? formatPdfInr(t.paid_out_inr) : '—'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadDaybookPdf(data: DaybookExportData) {
  const blob = await pdf(<DaybookDocument data={data} />).toBlob()
  const fname = `daybook-${data.date}${data.lane_view ? '-lane' : ''}.pdf`
  await presentPdfBlob(blob, fname, {
    title: 'Day book',
    text: fname,
    customerMobile: null,
  })
}

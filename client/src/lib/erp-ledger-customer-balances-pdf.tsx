import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export type CustomerBalancesPdfRow = {
  name: string
  mobile: string
  gstin: string
  balance_due_inr: number
  bill_numbers: string[]
}

export type CustomerBalancesPdfReport = {
  rows: CustomerBalancesPdfRow[]
  summary: {
    customer_count: number
    total_receivable_inr: number
    total_payable_inr: number
  }
  periodLabel: string
  shopName?: string
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  shopName: { fontSize: 14, fontWeight: 'bold', marginBottom: 4, textAlign: 'center', color: '#1a1814' },
  title: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, textAlign: 'center', color: '#1a1814' },
  sub: { fontSize: 9, color: '#444', marginBottom: 12, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 14 },
  summaryBox: { padding: 8, borderWidth: 0.5, borderColor: '#ccc', minWidth: 120 },
  summaryLabel: { fontSize: 8, color: '#555', marginBottom: 2 },
  summaryVal: { fontSize: 10, fontWeight: 'bold', color: '#1a1814' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#999',
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: 'bold',
  },
  tableRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  cName: { width: '28%' },
  cMobile: { width: '14%' },
  cGst: { width: '16%' },
  cBal: { width: '14%', textAlign: 'right' },
  cBills: { width: '28%', fontSize: 8 },
})

function CustomerBalancesDocument({ report }: { report: CustomerBalancesPdfReport }) {
  const shop = report.shopName?.trim() || 'Customer balances'
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.shopName}>{shop}</Text>
        <Text style={styles.title}>Customer balances</Text>
        <Text style={styles.sub}>{report.periodLabel}</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Customers</Text>
            <Text style={styles.summaryVal}>{report.summary.customer_count}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>They owe you</Text>
            <Text style={styles.summaryVal}>{formatPdfInr(report.summary.total_receivable_inr)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>You owe them</Text>
            <Text style={styles.summaryVal}>{formatPdfInr(report.summary.total_payable_inr)}</Text>
          </View>
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.cName}>Customer</Text>
          <Text style={styles.cMobile}>Mobile</Text>
          <Text style={styles.cGst}>GSTIN</Text>
          <Text style={styles.cBal}>Balance due</Text>
          <Text style={styles.cBills}>Bills</Text>
        </View>
        {report.rows.map((r, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.cName}>{r.name}</Text>
            <Text style={styles.cMobile}>{r.mobile || '—'}</Text>
            <Text style={styles.cGst}>{r.gstin || '—'}</Text>
            <Text style={styles.cBal}>{formatPdfInr(r.balance_due_inr)}</Text>
            <Text style={styles.cBills}>{(r.bill_numbers || []).join(', ') || '—'}</Text>
          </View>
        ))}
      </Page>
    </Document>
  )
}

function buildPeriodLabel(from: string, to: string, onDate: string): string {
  if (onDate) {
    const d = formatErpDateDdMmYyyy(onDate)
    return `As on ${d}`
  }
  const f = from ? formatErpDateDdMmYyyy(from) : '—'
  const t = to ? formatErpDateDdMmYyyy(to) : '—'
  if (f !== '—' && t !== '—') return `${f} to ${t}`
  if (f !== '—') return `From ${f}`
  if (t !== '—') return `To ${t}`
  return `Generated ${formatErpDateDdMmYyyy(new Date().toISOString().slice(0, 10))}`
}

export async function previewCustomerBalancesPdf(
  report: CustomerBalancesPdfReport,
): Promise<void> {
  const blob = await pdf(<CustomerBalancesDocument report={report} />).toBlob()
  const fname = `customer-balances-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: 'Customer balances',
    text: report.periodLabel,
  })
}

export function customerBalancesReportToPdfPayload(
  data: Pick<CustomerBalancesPdfReport, 'rows' | 'summary'>,
  opts: { from: string; to: string; onDate: string; shopName?: string },
): CustomerBalancesPdfReport {
  return {
    rows: data.rows,
    summary: data.summary,
    periodLabel: buildPeriodLabel(opts.from, opts.to, opts.onDate),
    shopName: opts.shopName,
  }
}

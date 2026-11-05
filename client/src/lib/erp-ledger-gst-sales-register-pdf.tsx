import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export type GstSalesRegisterBillRow = {
  bill_number: string
  bill_date: string
  customer_name: string
  item_count: number
  total_inr: number
  status: string
  gst_enabled: boolean
}

export type GstSalesRegisterPdfReport = {
  shopName?: string
  periodLabel: string
  summary: { total: number; totalValue: number; monthCount: number; todayCount: number }
  metal: {
    goldWeightGm: number
    silverWeightGm: number
    goldValueInr: number
    silverValueInr: number
  }
  bills: GstSalesRegisterBillRow[]
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingHorizontal: 32, paddingBottom: 52, fontSize: 9, fontFamily: 'Helvetica' },
  shopName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', color: '#1a1814', marginBottom: 4 },
  title: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  sub: { fontSize: 9, color: '#444', textAlign: 'center', marginBottom: 12 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10, gap: 6 },
  kpi: { borderWidth: 0.5, borderColor: '#bbb', padding: 6, minWidth: '22%' },
  kpiLabel: { fontSize: 7, color: '#555', marginBottom: 2 },
  kpiVal: { fontSize: 10, fontWeight: 'bold' },
  metalTitle: { fontSize: 8, fontWeight: 'bold', marginTop: 8, marginBottom: 4, color: '#333' },
  tableHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#666',
    paddingVertical: 4,
    fontWeight: 'bold',
    backgroundColor: '#f5f2ed',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    paddingVertical: 4,
  },
  cBill: { width: '14%' },
  cDate: { width: '12%' },
  cCust: { width: '32%' },
  cItems: { width: '8%', textAlign: 'right' },
  cNet: { width: '16%', textAlign: 'right' },
  cStat: { width: '12%' },
  cGst: { width: '6%', textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 32,
    right: 32,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
  },
})

function Footer() {
  return (
    <Text
      style={styles.footer}
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      fixed
    />
  )
}

function GstSalesRegisterDocument({ report }: { report: GstSalesRegisterPdfReport }) {
  const shop = report.shopName?.trim() || 'GST sales register'
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.shopName}>{shop}</Text>
        <Text style={styles.title}>GST sales bills register</Text>
        <Text style={styles.sub}>{report.periodLabel}</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Total sales</Text>
            <Text style={styles.kpiVal}>{report.summary.total}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Total value</Text>
            <Text style={styles.kpiVal}>{formatPdfInr(report.summary.totalValue)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>This month</Text>
            <Text style={styles.kpiVal}>{report.summary.monthCount}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Today</Text>
            <Text style={styles.kpiVal}>{report.summary.todayCount}</Text>
          </View>
        </View>
        <Text style={styles.metalTitle}>Metal summary — selected period (GST sales only)</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Gold weight</Text>
            <Text style={styles.kpiVal}>{report.metal.goldWeightGm.toFixed(3)} g</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Silver weight</Text>
            <Text style={styles.kpiVal}>{report.metal.silverWeightGm.toFixed(3)} g</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Gold value</Text>
            <Text style={styles.kpiVal}>{formatPdfInr(report.metal.goldValueInr)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Silver value</Text>
            <Text style={styles.kpiVal}>{formatPdfInr(report.metal.silverValueInr)}</Text>
          </View>
        </View>
        <View style={[styles.tableHeader, { marginTop: 12 }]}>
          <Text style={styles.cBill}>Bill no</Text>
          <Text style={styles.cDate}>Date</Text>
          <Text style={styles.cCust}>Customer</Text>
          <Text style={styles.cItems}>Items</Text>
          <Text style={styles.cNet}>Net total</Text>
          <Text style={styles.cStat}>Status</Text>
          <Text style={styles.cGst}>GST</Text>
        </View>
        {report.bills.map((b, i) => (
          <View key={`${b.bill_number}-${i}`} style={styles.tableRow} wrap={false}>
            <Text style={styles.cBill}>{b.bill_number}</Text>
            <Text style={styles.cDate}>{formatErpDateDdMmYyyy(b.bill_date)}</Text>
            <Text style={styles.cCust}>{b.customer_name || '—'}</Text>
            <Text style={styles.cItems}>{b.item_count}</Text>
            <Text style={styles.cNet}>{formatPdfInr(b.total_inr)}</Text>
            <Text style={styles.cStat}>{String(b.status || '').toUpperCase()}</Text>
            <Text style={styles.cGst}>{b.gst_enabled ? '✓' : '—'}</Text>
          </View>
        ))}
        <Footer />
      </Page>
    </Document>
  )
}

export function buildGstSalesPeriodLabel(from: string, to: string, onDate: string): string {
  if (onDate) return `On ${formatErpDateDdMmYyyy(onDate)}`
  const f = from ? formatErpDateDdMmYyyy(from) : '—'
  const t = to ? formatErpDateDdMmYyyy(to) : '—'
  if (f !== '—' && t !== '—') return `${f} to ${t}`
  if (f !== '—') return `From ${f}`
  if (t !== '—') return `To ${t}`
  return `Generated ${formatErpDateDdMmYyyy(new Date().toISOString().slice(0, 10))}`
}

export async function previewGstSalesRegisterPdf(report: GstSalesRegisterPdfReport): Promise<void> {
  const blob = await pdf(<GstSalesRegisterDocument report={report} />).toBlob()
  await presentPdfBlob(blob, `gst-sales-register-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'GST sales register',
    text: report.periodLabel,
  })
}

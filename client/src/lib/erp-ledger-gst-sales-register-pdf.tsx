import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { sanitizePdfText } from '@/lib/pdf-text-utils'

export type GstSalesRegisterBillRow = {
  bill_number: string
  bill_date: string
  customer_name: string
  item_count: number
  total_inr: number
  status?: string
  gst_enabled?: boolean
}

export type GstSalesRegisterPdfReport = {
  shopName?: string
  periodLabel: string
  /** Shown under shop name in PDF */
  reportTitle?: string
  summary: { total: number; totalValue: number; monthCount: number; todayCount: number }
  metal: {
    goldWeightGm: number
    silverWeightGm: number
    goldValueInr: number
    silverValueInr: number
  }
  bills: GstSalesRegisterBillRow[]
}

const BORDER = '#1a1814'

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 28, paddingBottom: 48, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1814' },
  shopName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  title: { fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  sub: { fontSize: 9, color: '#444', textAlign: 'center', marginBottom: 10 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8, gap: 4 },
  kpi: { borderWidth: 0.75, borderColor: BORDER, padding: 5, minWidth: '22%' },
  kpiLabel: { fontSize: 7, color: '#555', marginBottom: 2 },
  kpiVal: { fontSize: 9, fontWeight: 'bold' },
  metalTitle: { fontSize: 8, fontWeight: 'bold', marginTop: 6, marginBottom: 4, color: '#333' },
  tableOuter: { borderWidth: 1, borderColor: BORDER, marginTop: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f7f4ef' },
  tableRow: { flexDirection: 'row' },
  th: {
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
    fontWeight: 'bold',
  },
  td: {
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
  },
  tdRight: { textAlign: 'right' },
  lastCol: { borderRightWidth: 0 },
  cBill: { width: '14%' },
  cDate: { width: '12%' },
  cCust: { width: '44%' },
  cItems: { width: '10%' },
  cNet: { width: '20%' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
    textAlign: 'center',
    fontSize: 8,
    color: '#666',
  },
})

function Footer() {
  return (
    <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
  )
}

function hasGoldMetal(metal: GstSalesRegisterPdfReport['metal']) {
  return (metal.goldWeightGm || 0) > 0.0005 || (metal.goldValueInr || 0) > 0.005
}

function GstSalesRegisterDocument({ report }: { report: GstSalesRegisterPdfReport }) {
  const shop = report.shopName?.trim() || 'Sales register'
  const reportTitle = report.reportTitle?.trim() || 'Sales bills register'
  const showGold = hasGoldMetal(report.metal)

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.shopName}>{sanitizePdfText(shop)}</Text>
        <Text style={styles.title}>{sanitizePdfText(reportTitle)}</Text>
        <Text style={styles.sub}>{sanitizePdfText(report.periodLabel)}</Text>
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
        <Text style={styles.metalTitle}>Metal summary — selected period</Text>
        <View style={styles.kpiRow}>
          {showGold ? (
            <>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Gold weight</Text>
                <Text style={styles.kpiVal}>{report.metal.goldWeightGm.toFixed(3)} g</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Gold value</Text>
                <Text style={styles.kpiVal}>{formatPdfInr(report.metal.goldValueInr)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Silver weight</Text>
            <Text style={styles.kpiVal}>{report.metal.silverWeightGm.toFixed(3)} g</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Silver value</Text>
            <Text style={styles.kpiVal}>{formatPdfInr(report.metal.silverValueInr)}</Text>
          </View>
        </View>
        <View style={styles.tableOuter}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.cBill]}>Bill no</Text>
            <Text style={[styles.th, styles.cDate]}>Date</Text>
            <Text style={[styles.th, styles.cCust]}>Customer</Text>
            <Text style={[styles.th, styles.cItems, styles.tdRight]}>Items</Text>
            <Text style={[styles.th, styles.cNet, styles.tdRight, styles.lastCol]}>Net total</Text>
          </View>
          {report.bills.map((b, i) => (
            <View key={`${b.bill_number}-${i}`} style={styles.tableRow} wrap={false}>
              <Text style={[styles.td, styles.cBill]}>{sanitizePdfText(b.bill_number)}</Text>
              <Text style={[styles.td, styles.cDate]}>{formatErpDateDdMmYyyy(b.bill_date)}</Text>
              <Text style={[styles.td, styles.cCust]}>{sanitizePdfText(b.customer_name || '—')}</Text>
              <Text style={[styles.td, styles.cItems, styles.tdRight]}>{String(b.item_count)}</Text>
              <Text style={[styles.td, styles.cNet, styles.tdRight, styles.lastCol]}>
                {formatPdfInr(b.total_inr)}
              </Text>
            </View>
          ))}
        </View>
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

export async function previewGstSalesRegisterPdf(
  report: GstSalesRegisterPdfReport,
  opts?: { downloadName?: string; viewerTitle?: string },
): Promise<void> {
  const blob = await pdf(<GstSalesRegisterDocument report={report} />).toBlob()
  const fname = opts?.downloadName || `sales-register-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: opts?.viewerTitle || report.reportTitle || 'Sales bills register',
    text: report.periodLabel,
  })
}

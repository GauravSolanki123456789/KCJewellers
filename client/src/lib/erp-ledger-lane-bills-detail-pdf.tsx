import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import { formatPdfInr } from '@/lib/erp-ledger-labels'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { buildGstSalesPeriodLabel } from '@/lib/erp-ledger-gst-sales-register-pdf'

type BillLine = {
  barcode?: string
  code?: string
  name?: string
  invoice_item_name?: string
  weightGm?: number
  weight_gm?: number
  unitInr?: number
  rate?: number
  lineTotalInr?: number
  line_total_inr?: number
  qty?: number
}

export type LaneBillDetail = {
  source: string
  lane?: string | null
  bill_number: string
  bill_date: string
  customer_name: string
  status: string
  total_inr: number
  lines: BillLine[]
}

export type LaneBillsDetailPdfReport = {
  shopName?: string
  periodLabel: string
  bills: LaneBillDetail[]
}

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 28, paddingBottom: 48, fontSize: 8, fontFamily: 'Helvetica' },
  shopName: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  billHead: { fontSize: 10, fontWeight: 'bold', marginTop: 6, marginBottom: 2 },
  billSub: { fontSize: 8, color: '#444', marginBottom: 6 },
  tableHeader: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#666',
    paddingVertical: 3,
    fontWeight: 'bold',
    backgroundColor: '#f5f2ed',
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingVertical: 3 },
  cIdx: { width: '6%' },
  cBar: { width: '18%' },
  cProd: { width: '32%' },
  cWt: { width: '12%', textAlign: 'right' },
  cRate: { width: '14%', textAlign: 'right' },
  cAmt: { width: '18%', textAlign: 'right' },
  totals: {
    marginTop: 8,
    alignSelf: 'flex-end',
    borderWidth: 0.5,
    borderColor: '#999',
    padding: 8,
    minWidth: 160,
  },
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

function lineAmount(line: BillLine): number {
  const direct = Number(line.lineTotalInr ?? line.line_total_inr)
  if (Number.isFinite(direct) && direct > 0) return direct
  const unit = Number(line.unitInr ?? line.rate) || 0
  const qty = Number(line.qty) || 1
  return unit * qty
}

function BillPage({
  shopName,
  periodLabel,
  bill,
}: {
  shopName: string
  periodLabel: string
  bill: LaneBillDetail
}) {
  const lines = bill.lines?.length ? bill.lines : []
  let totalWt = 0
  for (const l of lines) totalWt += Number(l.weightGm ?? l.weight_gm) || 0
  const laneLabel = bill.source === 'shadow' ? ` · Lane ${bill.lane || '—'}` : ' · Official GST'
  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.shopName}>{shopName}</Text>
      <Text style={{ fontSize: 9, textAlign: 'center', color: '#555', marginBottom: 8 }}>{periodLabel}</Text>
      <Text style={styles.billHead}>{bill.bill_number}</Text>
      <Text style={styles.billSub}>
        {bill.customer_name || '—'} — {formatErpDateDdMmYyyy(bill.bill_date)}
        {laneLabel} — {String(bill.status || '').toUpperCase()}
      </Text>
      <View style={styles.tableHeader}>
        <Text style={styles.cIdx}>#</Text>
        <Text style={styles.cBar}>Barcode</Text>
        <Text style={styles.cProd}>Product</Text>
        <Text style={styles.cWt}>Wt</Text>
        <Text style={styles.cRate}>Rate</Text>
        <Text style={styles.cAmt}>Amount</Text>
      </View>
      {lines.map((line, i) => (
        <View key={i} style={styles.tableRow} wrap={false}>
          <Text style={styles.cIdx}>{i + 1}</Text>
          <Text style={styles.cBar}>{line.barcode || line.code || '—'}</Text>
          <Text style={styles.cProd}>{line.invoice_item_name || line.name || '—'}</Text>
          <Text style={styles.cWt}>{Number(line.weightGm ?? line.weight_gm ?? 0).toFixed(2)}</Text>
          <Text style={styles.cRate}>{Number(line.unitInr ?? line.rate ?? 0).toFixed(2)}</Text>
          <Text style={styles.cAmt}>{formatPdfInr(lineAmount(line))}</Text>
        </View>
      ))}
      <View style={styles.totals}>
        <Text>Items: {lines.length}</Text>
        <Text>Weight: {totalWt.toFixed(2)} g</Text>
        <Text style={{ fontWeight: 'bold', marginTop: 4 }}>Net: {formatPdfInr(bill.total_inr)}</Text>
      </View>
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  )
}

function LaneBillsDetailDocument({ report }: { report: LaneBillsDetailPdfReport }) {
  const shop = report.shopName?.trim() || 'All bills report'
  return (
    <Document>
      {report.bills.map((bill) => (
        <BillPage key={`${bill.source}-${bill.bill_number}`} shopName={shop} periodLabel={report.periodLabel} bill={bill} />
      ))}
    </Document>
  )
}

export async function previewLaneBillsDetailPdf(report: LaneBillsDetailPdfReport): Promise<void> {
  if (!report.bills.length) throw new Error('No bills in this period.')
  const blob = await pdf(<LaneBillsDetailDocument report={report} />).toBlob()
  await presentPdfBlob(blob, `lane-all-bills-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'All bills (lane ledger)',
    text: report.periodLabel,
  })
}

export { buildGstSalesPeriodLabel }

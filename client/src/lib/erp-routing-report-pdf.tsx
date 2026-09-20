import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'

export type RoutingReportSummaryRow = {
  display_name: string | null
  counter_name: string | null
  interactions: number
  sales: number
  no_sales: number
  forwards_only: number
  conversion_pct: number
}

export type RoutingReportDetailedRow = {
  created_at: string
  customer_name: string
  customer_mobile: string | null
  counter_name: string | null
  operator_name: string | null
  outcome_label: string
  bill_number?: string | null
  bill_amount_inr?: number | string | null
  no_sale_reason?: string | null
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4, color: '#1a1814' },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 3 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  cStaff: { width: '22%' },
  cCounter: { width: '18%' },
  cNum: { width: '10%', textAlign: 'right' },
  cConv: { width: '12%', textAlign: 'right' },
  dDate: { width: '14%' },
  dCust: { width: '20%' },
  dCounter: { width: '16%' },
  dStaff: { width: '14%' },
  dOutcome: { width: '18%' },
  dAmt: { width: '10%', textAlign: 'right' },
  section: { marginTop: 14, fontSize: 10, fontWeight: 'bold' },
})

function RoutingReportDocument({
  title,
  from,
  to,
  summary,
  detailed,
  lostReasons,
  generatedAt,
}: {
  title: string
  from: string
  to: string
  summary: RoutingReportSummaryRow[]
  detailed: RoutingReportDetailedRow[]
  lostReasons: { reason: string; count: number }[]
  generatedAt: string
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {from} to {to} · Generated {generatedAt}
        </Text>
        <Text style={styles.section}>Summary by staff & counter</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.cStaff}>Staff</Text>
          <Text style={styles.cCounter}>Counter</Text>
          <Text style={styles.cNum}>Touch</Text>
          <Text style={styles.cNum}>Sales</Text>
          <Text style={styles.cNum}>No sale</Text>
          <Text style={styles.cNum}>Fwd</Text>
          <Text style={styles.cConv}>Conv %</Text>
        </View>
        {summary.map((r, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.cStaff}>{r.display_name || '—'}</Text>
            <Text style={styles.cCounter}>{r.counter_name || '—'}</Text>
            <Text style={styles.cNum}>{r.interactions}</Text>
            <Text style={styles.cNum}>{r.sales}</Text>
            <Text style={styles.cNum}>{r.no_sales}</Text>
            <Text style={styles.cNum}>{r.forwards_only}</Text>
            <Text style={styles.cConv}>{r.conversion_pct}%</Text>
          </View>
        ))}
        {lostReasons.length ? (
          <>
            <Text style={styles.section}>Lost sale reasons</Text>
            {lostReasons.map((r) => (
              <View key={r.reason} style={styles.row}>
                <Text style={{ width: '80%' }}>{r.reason}</Text>
                <Text style={{ width: '20%', textAlign: 'right' }}>{r.count}</Text>
              </View>
            ))}
          </>
        ) : null}
        {detailed.length ? (
          <>
            <Text style={styles.section}>Detailed interactions</Text>
            <View style={[styles.row, styles.head]}>
              <Text style={styles.dDate}>When</Text>
              <Text style={styles.dCust}>Customer</Text>
              <Text style={styles.dCounter}>Counter</Text>
              <Text style={styles.dStaff}>Staff</Text>
              <Text style={styles.dOutcome}>Outcome</Text>
              <Text style={styles.dAmt}>Amount</Text>
            </View>
            {detailed.slice(0, 120).map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.dDate}>
                  {new Date(r.created_at).toLocaleString('en-IN', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Text>
                <Text style={styles.dCust}>{r.customer_name}</Text>
                <Text style={styles.dCounter}>{r.counter_name || '—'}</Text>
                <Text style={styles.dStaff}>{r.operator_name || '—'}</Text>
                <Text style={styles.dOutcome}>{r.outcome_label}</Text>
                <Text style={styles.dAmt}>
                  {r.bill_amount_inr != null && r.bill_amount_inr !== ''
                    ? `₹${r.bill_amount_inr}`
                    : '—'}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </Page>
    </Document>
  )
}

export async function downloadRoutingReportPdf(payload: {
  from: string
  to: string
  summary: RoutingReportSummaryRow[]
  detailed?: RoutingReportDetailedRow[]
  lostReasons: { reason: string; count: number }[]
  view: 'summary' | 'detailed'
}) {
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const blob = await pdf(
    <RoutingReportDocument
      title={
        payload.view === 'detailed'
          ? 'Customer routing report (detailed)'
          : 'Customer routing report (summary)'
      }
      from={payload.from}
      to={payload.to}
      summary={payload.summary}
      detailed={payload.view === 'detailed' ? payload.detailed || [] : []}
      lostReasons={payload.lostReasons}
      generatedAt={generatedAt}
    />,
  ).toBlob()
  await presentPdfBlob(blob, `routing-report-${payload.from}_${payload.to}.pdf`, {
    title: 'Routing report',
  })
}

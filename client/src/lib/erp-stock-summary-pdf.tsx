import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { downloadPdfBlob } from '@/lib/pdf-share'

type SkuRow = { style_code: string; sku: string; count: number; total_weight_g: number; avg_weight_g: number }
type StyleRow = { style_code: string; count: number; total_weight_g: number; avg_weight_g: number; sku_count?: number }
type RangeRow = { label: string; count: number }

export type StockSummaryPdfData = {
  total_pieces: number
  total_weight_g: number
  average_weight_g: number
  min_weight_g: number
  max_weight_g: number
  by_sku: SkuRow[]
  by_style: StyleRow[]
  weight_ranges: RangeRow[]
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  section: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c: { flex: 1 },
})

function StockSummaryDocument({ summary }: { summary: StockSummaryPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Stock summary report</Text>
        <Text>Total pcs: {summary.total_pieces} · Weight: {summary.total_weight_g} g · Avg: {summary.average_weight_g} g</Text>
        <Text style={styles.section}>By SKU</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.c}>Style</Text>
          <Text style={styles.c}>SKU</Text>
          <Text style={styles.c}>Count</Text>
          <Text style={styles.c}>Total g</Text>
          <Text style={styles.c}>Avg g</Text>
        </View>
        {summary.by_sku.map((s) => (
          <View key={`${s.style_code}-${s.sku}`} style={styles.row}>
            <Text style={styles.c}>{s.style_code}</Text>
            <Text style={styles.c}>{s.sku}</Text>
            <Text style={styles.c}>{s.count}</Text>
            <Text style={styles.c}>{s.total_weight_g}</Text>
            <Text style={styles.c}>{s.avg_weight_g}</Text>
          </View>
        ))}
        <Text style={styles.section}>By style</Text>
        {summary.by_style.map((s) => (
          <Text key={s.style_code}>
            {s.style_code}: {s.count} pcs · {s.total_weight_g} g
          </Text>
        ))}
        <Text style={styles.section}>Weight ranges</Text>
        {summary.weight_ranges.map((r) => (
          <Text key={r.label}>
            {r.label}: {r.count}
          </Text>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadStockSummaryPdf(summary: StockSummaryPdfData) {
  const blob = await pdf(<StockSummaryDocument summary={summary} />).toBlob()
  downloadPdfBlob(blob, `stock-summary-${new Date().toISOString().slice(0, 10)}.pdf`)
}

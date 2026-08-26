import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { downloadPdfBlob } from '@/lib/pdf-share'

export type RolReportBlock = {
  style_code: string
  sku: string
  design_sku_id: number
  ranges: {
    label?: string
    target_weight_g: number
    available_qty?: number
    rol_qty: number
    required_qty?: number
  }[]
  total_available: number
  total_required: number
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#555', marginBottom: 12 },
  blockTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 3 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c1: { width: '42%' },
  c2: { width: '14%', textAlign: 'right' },
  c3: { width: '14%', textAlign: 'right' },
  c4: { width: '14%', textAlign: 'right' },
  need: { color: '#b91c1c', fontWeight: 'bold' },
})

function RolReportDocument({ report, generatedAt }: { report: RolReportBlock[]; generatedAt: string }) {
  const totalRequired = report.reduce((s, b) => s + (b.total_required || 0), 0)
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Reorder level (ROL) report</Text>
        <Text style={styles.subtitle}>
          Generated {generatedAt} · {report.length} SKU(s) · {totalRequired} piece(s) required to order
        </Text>
        {report.map((block) => (
          <View key={block.design_sku_id} wrap={false}>
            <Text style={styles.blockTitle}>
              {block.style_code} · {block.sku} — need {block.total_required} pc(s)
            </Text>
            <View style={[styles.row, styles.head]}>
              <Text style={styles.c1}>Weight range</Text>
              <Text style={styles.c2}>Available</Text>
              <Text style={styles.c3}>ROL</Text>
              <Text style={styles.c4}>Required</Text>
            </View>
            {block.ranges.map((r) => (
              <View key={`${block.design_sku_id}-${r.target_weight_g}`} style={styles.row}>
                <Text style={styles.c1}>{r.label || `${r.target_weight_g} g`}</Text>
                <Text style={styles.c2}>{r.available_qty ?? 0}</Text>
                <Text style={styles.c3}>{r.rol_qty}</Text>
                <Text style={[styles.c4, (r.required_qty || 0) > 0 ? styles.need : {}]}>
                  {r.required_qty ?? 0}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </Page>
    </Document>
  )
}

export async function downloadRolReportPdf(report: RolReportBlock[]) {
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const blob = await pdf(<RolReportDocument report={report} generatedAt={generatedAt} />).toBlob()
  downloadPdfBlob(blob, `rol-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}

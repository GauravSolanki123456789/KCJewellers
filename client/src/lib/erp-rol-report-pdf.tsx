import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'

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

export type RolSizeReportRow = {
  style_code: string
  sku: string
  product_name?: string
  size?: string
  available_wt?: number
  rol_wt_g?: number
  required_wt?: number
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica', color: '#1a1814' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#444', marginBottom: 12 },
  blockTitle: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 3 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c1: { width: '42%' },
  c2: { width: '14%', textAlign: 'right' },
  c3: { width: '14%', textAlign: 'right' },
  c4: { width: '14%', textAlign: 'right' },
  s1: { width: '22%' },
  s2: { width: '22%' },
  s3: { width: '12%' },
  s4: { width: '14%', textAlign: 'right' },
  s5: { width: '15%', textAlign: 'right' },
  s6: { width: '15%', textAlign: 'right' },
  need: { color: '#b91c1c', fontWeight: 'bold' },
})

function RolReportDocument({
  report,
  sizeReport,
  generatedAt,
}: {
  report: RolReportBlock[]
  sizeReport: RolSizeReportRow[]
  generatedAt: string
}) {
  const totalRequired = report.reduce((s, b) => s + (b.total_required || 0), 0)
  const totalRequiredWt = sizeReport.reduce((s, r) => s + (Number(r.required_wt) || 0), 0)
  const bits: string[] = [`Generated ${generatedAt}`]
  if (report.length) bits.push(`${report.length} SKU(s) · ${totalRequired} piece(s) to order`)
  if (sizeReport.length) bits.push(`${sizeReport.length} size row(s) · ${totalRequiredWt.toFixed(1)} g to order`)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Reorder level (ROL) report</Text>
        <Text style={styles.subtitle}>{bits.join(' · ')}</Text>
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
        {sizeReport.length ? (
          <View>
            <Text style={styles.blockTitle}>Size / product ROL (grams)</Text>
            <View style={[styles.row, styles.head]}>
              <Text style={styles.s1}>Style · SKU</Text>
              <Text style={styles.s2}>Product</Text>
              <Text style={styles.s3}>Size</Text>
              <Text style={styles.s4}>Avail WT</Text>
              <Text style={styles.s5}>ROL WT</Text>
              <Text style={styles.s6}>Need WT</Text>
            </View>
            {sizeReport.map((r, i) => (
              <View key={`${r.style_code}-${r.sku}-${r.product_name}-${r.size}-${i}`} style={styles.row}>
                <Text style={styles.s1}>
                  {r.style_code} · {r.sku}
                </Text>
                <Text style={styles.s2}>{r.product_name || ''}</Text>
                <Text style={styles.s3}>{r.size || ''}</Text>
                <Text style={styles.s4}>{r.available_wt ?? 0}</Text>
                <Text style={styles.s5}>{r.rol_wt_g ?? 0}</Text>
                <Text style={[styles.s6, (r.required_wt || 0) > 0 ? styles.need : {}]}>
                  {r.required_wt ?? 0}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  )
}

export async function downloadRolReportPdf(
  report: RolReportBlock[],
  sizeReport: RolSizeReportRow[] = [],
) {
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
  const blob = await pdf(
    <RolReportDocument report={report} sizeReport={sizeReport} generatedAt={generatedAt} />,
  ).toBlob()
  await presentPdfBlob(blob, `rol-report-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'ROL report',
  })
}

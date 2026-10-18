import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'

type SkuRow = { style_code: string; sku: string; count: number; total_weight_g: number; avg_weight_g: number }
type StyleRow = { style_code: string; count: number; total_weight_g: number; avg_weight_g: number; sku_count?: number }
type RangeRow = { label: string; count: number }
type MetalRow = { metal_type: string; count: number; total_weight_g: number; avg_weight_g: number }

export type StockSummaryPdfData = {
  total_pieces: number
  total_weight_g: number
  average_weight_g: number
  min_weight_g: number
  max_weight_g: number
  by_sku: SkuRow[]
  by_style: StyleRow[]
  weight_ranges: RangeRow[]
  by_metal?: MetalRow[]
}

export type StockDetailPiecePdf = {
  barcode: string
  style_code: string
  sku: string
  product_name?: string
  size?: string
  avg_weight: number
  gross_weight?: number | null
  purity?: number | null
  mc_rate?: number | null
  mc_type?: string | null
  metal_type?: string
  item_code?: string | null
  status: string
  rfid_tag?: string | null
}

export type StockInHandPdfMeta = {
  reportType: 'summary' | 'detail'
  statusLabel?: string
  filtersLine?: string
  generatedAt?: string
}

const DETAIL_ROWS_PER_PAGE = 38

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  sub: { fontSize: 8, color: '#444', marginBottom: 8 },
  section: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c: { flex: 1 },
  d1: { width: '14%' },
  d2: { width: '8%' },
  d3: { width: '9%' },
  d4: { width: '14%' },
  d5: { width: '16%' },
  d6: { width: '7%' },
  d7: { width: '7%' },
  d8: { width: '7%' },
  d9: { width: '9%' },
  d10: { width: '9%' },
})

function statusLabel(status: string) {
  if (status === 'in_stock') return 'In stock'
  if (status === 'sold') return 'Sold'
  return status.replace(/_/g, ' ')
}

function StockSummaryDocument({ summary }: { summary: StockSummaryPdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Stock in hand — Summary</Text>
        <Text>
          Total pcs: {summary.total_pieces} · Weight: {summary.total_weight_g} g · Avg: {summary.average_weight_g} g
        </Text>
        {summary.by_metal?.length ? (
          <>
            <Text style={styles.section}>By metal</Text>
            {summary.by_metal.map((m) => (
              <Text key={m.metal_type}>
                {m.metal_type}: {m.count} pcs · {m.total_weight_g} g
              </Text>
            ))}
          </>
        ) : null}
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

function DetailTableHead() {
  return (
    <View style={[styles.row, styles.head]}>
      <Text style={styles.d1}>Barcode</Text>
      <Text style={styles.d2}>Metal</Text>
      <Text style={styles.d3}>Style</Text>
      <Text style={styles.d4}>SKU</Text>
      <Text style={styles.d5}>Product</Text>
      <Text style={styles.d6}>Size</Text>
      <Text style={styles.d7}>Wt g</Text>
      <Text style={styles.d8}>Purity</Text>
      <Text style={styles.d9}>MC</Text>
      <Text style={styles.d10}>Status</Text>
    </View>
  )
}

function DetailRow({ p }: { p: StockDetailPiecePdf }) {
  return (
    <View style={styles.row}>
      <Text style={styles.d1}>{p.barcode}</Text>
      <Text style={styles.d2}>{p.metal_type || '—'}</Text>
      <Text style={styles.d3}>{p.style_code}</Text>
      <Text style={styles.d4}>{p.sku}</Text>
      <Text style={styles.d5}>{p.product_name || '—'}</Text>
      <Text style={styles.d6}>{p.size || '—'}</Text>
      <Text style={styles.d7}>{p.avg_weight}</Text>
      <Text style={styles.d8}>{p.purity ?? '—'}</Text>
      <Text style={styles.d9}>{p.mc_rate ?? '—'}</Text>
      <Text style={styles.d10}>{statusLabel(p.status)}</Text>
    </View>
  )
}

function StockDetailDocument({
  summary,
  pieces,
  meta,
}: {
  summary: StockSummaryPdfData
  pieces: StockDetailPiecePdf[]
  meta?: StockInHandPdfMeta
}) {
  const chunks: StockDetailPiecePdf[][] = []
  for (let i = 0; i < pieces.length; i += DETAIL_ROWS_PER_PAGE) {
    chunks.push(pieces.slice(i, i + DETAIL_ROWS_PER_PAGE))
  }
  if (chunks.length === 0) chunks.push([])

  const sub = [
    meta?.filtersLine,
    meta?.statusLabel ? `Status: ${meta.statusLabel}` : null,
    meta?.generatedAt ? `Generated: ${String(meta.generatedAt).slice(0, 19).replace('T', ' ')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Stock in hand — Detailed (every piece)</Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        <Text>
          {pieces.length} piece(s) · {summary.total_weight_g} g total · avg {summary.average_weight_g} g · min/max{' '}
          {summary.min_weight_g}/{summary.max_weight_g} g
        </Text>
        <Text style={styles.section}>Piece list</Text>
        <DetailTableHead />
        {chunks[0].map((p) => (
          <DetailRow key={p.barcode} p={p} />
        ))}
        {chunks.length > 1 ? (
          <Text style={styles.sub}>Continued on next page… ({pieces.length} pieces total)</Text>
        ) : null}
      </Page>
      {chunks.slice(1).map((chunk, pageIdx) => (
        <Page key={pageIdx + 1} size="A4" style={styles.page}>
          <Text style={styles.title}>Stock detail — continued ({pageIdx + 2}/{chunks.length})</Text>
          <DetailTableHead />
          {chunk.map((p) => (
            <DetailRow key={p.barcode} p={p} />
          ))}
        </Page>
      ))}
    </Document>
  )
}

export async function downloadStockSummaryPdf(summary: StockSummaryPdfData) {
  const blob = await pdf(<StockSummaryDocument summary={summary} />).toBlob()
  await presentPdfBlob(blob, `stock-summary-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'Stock summary',
  })
}

export async function downloadStockDetailPdf(
  summary: StockSummaryPdfData,
  pieces: StockDetailPiecePdf[],
  meta?: StockInHandPdfMeta,
) {
  const blob = await pdf(<StockDetailDocument summary={summary} pieces={pieces} meta={meta} />).toBlob()
  await presentPdfBlob(blob, `stock-detail-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'Stock detail',
  })
}

export async function downloadStockInHandPdf(opts: {
  reportType: 'summary' | 'detail'
  summary: StockSummaryPdfData
  pieces?: StockDetailPiecePdf[]
  meta?: Omit<StockInHandPdfMeta, 'reportType'>
}) {
  if (opts.reportType === 'detail') {
    await downloadStockDetailPdf(opts.summary, opts.pieces || [], {
      reportType: 'detail',
      ...opts.meta,
    })
    return
  }
  await downloadStockSummaryPdf(opts.summary)
}

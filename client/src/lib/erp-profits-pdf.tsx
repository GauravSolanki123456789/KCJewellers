import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'

export type ProfitSummaryPdf = {
  total_pieces: number
  total_weight_g: number
  sold_taxable: number
  cost_total: number
  gst_inr: number
  profit: number
  avg_profit: number
  by_sku: {
    style_code: string
    sku: string
    count: number
    total_weight_g: number
    sold_taxable: number
    cost_total: number
    profit: number
  }[]
  by_style: {
    style_code: string
    count: number
    total_weight_g: number
    sold_taxable: number
    cost_total: number
    profit: number
  }[]
  by_metal?: {
    metal_type: string
    count: number
    total_weight_g: number
    sold_taxable: number
    cost_total: number
    profit: number
  }[]
}

export type ProfitDetailPdf = {
  barcode: string
  bill_number: string
  bill_date: string | null
  style_code: string
  sku: string
  product_name: string
  metal_type: string
  avg_weight: number
  pv_rate: number
  sold_rate: number
  cost_total: number
  sold_taxable: number
  profit: number
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 13, fontWeight: 'bold', marginBottom: 4, color: '#1a1814' },
  sub: { fontSize: 8, color: '#444', marginBottom: 8 },
  section: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4, color: '#1a1814' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c: { flex: 1, color: '#1a1814' },
  d1: { width: '12%', color: '#1a1814' },
  d2: { width: '10%', color: '#1a1814' },
  d3: { width: '10%', color: '#1a1814' },
  d4: { width: '10%', color: '#1a1814' },
  d5: { width: '16%', color: '#1a1814' },
  d6: { width: '8%', color: '#1a1814' },
  d7: { width: '10%', color: '#1a1814' },
  d8: { width: '12%', color: '#1a1814' },
  d9: { width: '12%', color: '#1a1814' },
})

function inr(n: number) {
  return `Rs ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
}

function SummaryDoc({
  summary,
  filtersLine,
  generatedAt,
}: {
  summary: ProfitSummaryPdf
  filtersLine?: string
  generatedAt?: string
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        <Text style={styles.title}>Profits — Summary</Text>
        <Text style={styles.sub}>
          {[filtersLine, generatedAt ? `Generated: ${String(generatedAt).slice(0, 19).replace('T', ' ')}` : '']
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Text>
          Pcs: {summary.total_pieces} · Wt: {summary.total_weight_g} g · Sold: {inr(summary.sold_taxable)} · Cost:{' '}
          {inr(summary.cost_total)} · Profit: {inr(summary.profit)}
        </Text>
        {summary.by_metal?.length ? (
          <>
            <Text style={styles.section}>By metal</Text>
            {summary.by_metal.map((m) => (
              <Text key={m.metal_type}>
                {m.metal_type}: {m.count} pcs · {inr(m.profit)}
              </Text>
            ))}
          </>
        ) : null}
        <Text style={styles.section}>By SKU</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.c}>Style</Text>
          <Text style={styles.c}>SKU</Text>
          <Text style={styles.c}>Pcs</Text>
          <Text style={styles.c}>Wt g</Text>
          <Text style={styles.c}>Sold</Text>
          <Text style={styles.c}>Cost</Text>
          <Text style={styles.c}>Profit</Text>
        </View>
        {summary.by_sku.map((s) => (
          <View key={`${s.style_code}-${s.sku}`} style={styles.row}>
            <Text style={styles.c}>{s.style_code}</Text>
            <Text style={styles.c}>{s.sku}</Text>
            <Text style={styles.c}>{s.count}</Text>
            <Text style={styles.c}>{s.total_weight_g}</Text>
            <Text style={styles.c}>{inr(s.sold_taxable)}</Text>
            <Text style={styles.c}>{inr(s.cost_total)}</Text>
            <Text style={styles.c}>{inr(s.profit)}</Text>
          </View>
        ))}
        <Text style={styles.section}>By style</Text>
        {summary.by_style.map((s) => (
          <Text key={s.style_code}>
            {s.style_code}: {s.count} pcs · {inr(s.profit)}
          </Text>
        ))}
      </Page>
    </Document>
  )
}

const DETAIL_ROWS = 28

function DetailDoc({
  summary,
  pieces,
  filtersLine,
  generatedAt,
}: {
  summary: ProfitSummaryPdf
  pieces: ProfitDetailPdf[]
  filtersLine?: string
  generatedAt?: string
}) {
  const chunks: ProfitDetailPdf[][] = []
  for (let i = 0; i < pieces.length; i += DETAIL_ROWS) chunks.push(pieces.slice(i, i + DETAIL_ROWS))
  if (!chunks.length) chunks.push([])
  const sub = [
    filtersLine,
    `${pieces.length} piece(s) · Profit ${inr(summary.profit)}`,
    generatedAt ? `Generated: ${String(generatedAt).slice(0, 19).replace('T', ' ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const Head = () => (
    <View style={[styles.row, styles.head]}>
      <Text style={styles.d1}>Barcode</Text>
      <Text style={styles.d2}>Bill</Text>
      <Text style={styles.d3}>Style</Text>
      <Text style={styles.d4}>SKU</Text>
      <Text style={styles.d5}>Product</Text>
      <Text style={styles.d6}>Wt</Text>
      <Text style={styles.d7}>Sold</Text>
      <Text style={styles.d8}>Cost</Text>
      <Text style={styles.d9}>Profit</Text>
    </View>
  )

  return (
    <Document>
      {chunks.map((chunk, idx) => (
        <Page key={idx} size="A4" style={styles.page} orientation="landscape">
          <Text style={styles.title}>{idx === 0 ? 'Profits — Detailed' : `Profits — continued (${idx + 1})`}</Text>
          {idx === 0 ? <Text style={styles.sub}>{sub}</Text> : null}
          <Head />
          {chunk.map((p) => (
            <View key={p.barcode} style={styles.row}>
              <Text style={styles.d1}>{p.barcode}</Text>
              <Text style={styles.d2}>{p.bill_number}</Text>
              <Text style={styles.d3}>{p.style_code}</Text>
              <Text style={styles.d4}>{p.sku}</Text>
              <Text style={styles.d5}>{p.product_name || '—'}</Text>
              <Text style={styles.d6}>{p.avg_weight}</Text>
              <Text style={styles.d7}>{inr(p.sold_taxable)}</Text>
              <Text style={styles.d8}>{inr(p.cost_total)}</Text>
              <Text style={styles.d9}>{inr(p.profit)}</Text>
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}

export async function downloadProfitsPdf(opts: {
  reportType: 'summary' | 'detail'
  summary: ProfitSummaryPdf
  pieces?: ProfitDetailPdf[]
  filtersLine?: string
  generatedAt?: string
}) {
  const blob =
    opts.reportType === 'detail'
      ? await pdf(
          <DetailDoc
            summary={opts.summary}
            pieces={opts.pieces || []}
            filtersLine={opts.filtersLine}
            generatedAt={opts.generatedAt}
          />,
        ).toBlob()
      : await pdf(
          <SummaryDoc summary={opts.summary} filtersLine={opts.filtersLine} generatedAt={opts.generatedAt} />,
        ).toBlob()
  await presentPdfBlob(blob, `profits-${opts.reportType}-${new Date().toISOString().slice(0, 10)}.pdf`, {
    title: 'Profits',
  })
}

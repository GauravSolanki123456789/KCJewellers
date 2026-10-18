import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import {
  computeStockCheckWeightSummary,
  formatStockCheckWeightGm,
  stockCheckPieceWeightGm,
  type StockCheckScopeBarcode,
  type StockCheckScanRow,
} from '@/lib/erp-stock-check-storage'

export type StockCheckFloorSummary = {
  floor: string
  box: string
  inScope: number
  found: number
  missing: number
  scopeWtGm: number
  scannedWtGm: number
  pendingWtGm: number
}

export type StockCheckReportData = {
  title: string
  subtitle: string
  scopeCount: number
  uniqueFound: number
  uniqueMissing: number
  notInScope: number
  weightSummary: { totalScopeGm: number; scannedGm: number; pendingGm: number }
  scanned: StockCheckScanRow[]
  scopeBarcodes: StockCheckScopeBarcode[]
  floorSummary: StockCheckFloorSummary[]
}

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: 'Helvetica' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  sub: { fontSize: 9, color: '#444', marginBottom: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stat: { fontSize: 9 },
  section: { fontSize: 10, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd', paddingVertical: 2 },
  head: { fontWeight: 'bold', backgroundColor: '#f5f5f5' },
  c1: { width: '18%' },
  c2: { width: '12%' },
  c3: { width: '16%' },
  c4: { width: '18%' },
  c5: { width: '18%' },
  c6: { width: '18%' },
  fb1: { width: '16%' },
  fb2: { width: '14%' },
  fb3: { width: '10%', textAlign: 'right' },
  fb4: { width: '10%', textAlign: 'right' },
  fb5: { width: '10%', textAlign: 'right' },
  fb6: { width: '12%', textAlign: 'right' },
  fb7: { width: '12%', textAlign: 'right' },
  fb8: { width: '12%', textAlign: 'right' },
  s1: { width: '14%' },
  s2: { width: '12%' },
  s3: { width: '12%' },
  s4: { width: '18%' },
  s5: { width: '18%' },
  s6: { width: '12%' },
  s7: { width: '14%' },
})

const SCOPE_DETAIL_ROWS_PER_PAGE = 36

export type StockCheckScopeDetailRow = {
  barcode: string
  scanned: boolean
  wtGm: number
  sku: string
  product_name: string
  floor_name: string
  box_code: string
}

export function buildScopeDetailRows(
  scopeBarcodes: StockCheckScopeBarcode[],
  scanned: StockCheckScanRow[],
): StockCheckScopeDetailRow[] {
  const foundSet = new Set(scanned.filter((s) => s.found).map((s) => s.barcode.toUpperCase()))
  return [...scopeBarcodes]
    .sort((a, b) => a.barcode.localeCompare(b.barcode))
    .map((m) => ({
      barcode: m.barcode,
      scanned: foundSet.has(m.barcode.toUpperCase()),
      wtGm: stockCheckPieceWeightGm(m),
      sku: m.sku || '',
      product_name: m.product_name || '',
      floor_name: m.floor_name || '',
      box_code: m.box_code || '',
    }))
}

function ScopeDetailHead() {
  return (
    <View style={[styles.row, styles.head]}>
      <Text style={styles.s1}>Barcode</Text>
      <Text style={styles.s2}>Scan</Text>
      <Text style={styles.s3}>Wt (g)</Text>
      <Text style={styles.s4}>SKU</Text>
      <Text style={styles.s5}>Product</Text>
      <Text style={styles.s6}>Floor</Text>
      <Text style={styles.s7}>Box</Text>
    </View>
  )
}

function ScopeDetailRow({ row }: { row: StockCheckScopeDetailRow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.s1}>{row.barcode}</Text>
      <Text style={styles.s2}>{row.scanned ? 'Scanned' : 'Pending'}</Text>
      <Text style={styles.s3}>{formatStockCheckWeightGm(row.wtGm)}</Text>
      <Text style={styles.s4}>{row.sku}</Text>
      <Text style={styles.s5}>{row.product_name}</Text>
      <Text style={styles.s6}>{row.floor_name || '—'}</Text>
      <Text style={styles.s7}>{row.box_code || '—'}</Text>
    </View>
  )
}

function StockCheckDocument({ report }: { report: StockCheckReportData }) {
  const scopeDetail = buildScopeDetailRows(report.scopeBarcodes, report.scanned)
  const detailChunks: StockCheckScopeDetailRow[][] = []
  for (let i = 0; i < scopeDetail.length; i += SCOPE_DETAIL_ROWS_PER_PAGE) {
    detailChunks.push(scopeDetail.slice(i, i + SCOPE_DETAIL_ROWS_PER_PAGE))
  }
  if (detailChunks.length === 0) detailChunks.push([])

  const notInScope = report.scanned.filter((s) => !s.found)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{report.title}</Text>
        <Text style={styles.sub}>{report.subtitle}</Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>In scope: {report.scopeCount}</Text>
          <Text style={styles.stat}>Found: {report.uniqueFound}</Text>
          <Text style={styles.stat}>Missing: {report.uniqueMissing}</Text>
          <Text style={styles.stat}>Not in scope scans: {report.notInScope}</Text>
          <Text style={styles.stat}>
            Wt scanned (g): {formatStockCheckWeightGm(report.weightSummary.scannedGm)}
          </Text>
          <Text style={styles.stat}>
            Wt pending (g): {formatStockCheckWeightGm(report.weightSummary.pendingGm)}
          </Text>
          <Text style={styles.stat}>
            Wt in scope (g): {formatStockCheckWeightGm(report.weightSummary.totalScopeGm)}
          </Text>
        </View>

        <Text style={styles.section}>Floor / box summary</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.fb1}>Floor</Text>
          <Text style={styles.fb2}>Box</Text>
          <Text style={styles.fb3}>Pcs</Text>
          <Text style={styles.fb4}>Found</Text>
          <Text style={styles.fb5}>Miss</Text>
          <Text style={styles.fb6}>Scope g</Text>
          <Text style={styles.fb7}>Scan g</Text>
          <Text style={styles.fb8}>Pend g</Text>
        </View>
        {report.floorSummary.map((f) => (
          <View key={`${f.floor}-${f.box}`} style={styles.row}>
            <Text style={styles.fb1}>{f.floor || '—'}</Text>
            <Text style={styles.fb2}>{f.box || '—'}</Text>
            <Text style={styles.fb3}>{f.inScope}</Text>
            <Text style={styles.fb4}>{f.found}</Text>
            <Text style={styles.fb5}>{f.missing}</Text>
            <Text style={styles.fb6}>{formatStockCheckWeightGm(f.scopeWtGm)}</Text>
            <Text style={styles.fb7}>{formatStockCheckWeightGm(f.scannedWtGm)}</Text>
            <Text style={styles.fb8}>{formatStockCheckWeightGm(f.pendingWtGm)}</Text>
          </View>
        ))}

        {scopeDetail.length > 0 ? (
          <Text style={styles.sub}>
            Detailed piece list ({scopeDetail.length}) starts on the next page — every barcode in scope.
          </Text>
        ) : null}
      </Page>

      {detailChunks.map((chunk, pageIdx) => (
        <Page key={`scope-${pageIdx}`} size="A4" style={styles.page}>
          <Text style={styles.title}>Every piece in scope</Text>
          <Text style={styles.sub}>
            Page {pageIdx + 1} of {detailChunks.length} · {scopeDetail.length} pieces total
          </Text>
          <ScopeDetailHead />
          {chunk.map((row) => (
            <ScopeDetailRow key={row.barcode} row={row} />
          ))}
        </Page>
      ))}

      {notInScope.length > 0 ? (
        <Page size="A4" style={styles.page}>
          <Text style={styles.section}>Scans not in scope ({notInScope.length})</Text>
          <View style={[styles.row, styles.head]}>
            <Text style={styles.c1}>Barcode</Text>
            <Text style={styles.c2}>Wt (g)</Text>
            <Text style={styles.c3}>SKU</Text>
            <Text style={styles.c4}>Product</Text>
            <Text style={styles.c5}>Scanned at</Text>
            <Text style={styles.c6}>—</Text>
          </View>
          {notInScope.map((s) => (
            <View key={s.id} style={styles.row}>
              <Text style={styles.c1}>{s.barcode}</Text>
              <Text style={styles.c2}>{formatStockCheckWeightGm(s.weight_gm ?? 0)}</Text>
              <Text style={styles.c3}>{s.sku || ''}</Text>
              <Text style={styles.c4}>{s.product_name || ''}</Text>
              <Text style={styles.c5}>{new Date(s.scannedAt).toLocaleString('en-IN')}</Text>
              <Text style={styles.c6} />
            </View>
          ))}
        </Page>
      ) : null}
    </Document>
  )
}

export function buildFloorSummary(
  scopeBarcodes: StockCheckScopeBarcode[],
  scanned: StockCheckScanRow[],
): StockCheckFloorSummary[] {
  const scannedSet = new Set(scanned.filter((s) => s.found).map((s) => s.barcode))
  const groups = new Map<string, StockCheckFloorSummary>()
  for (const m of scopeBarcodes) {
    const floor = m.floor_name || '—'
    const box = m.box_code || '—'
    const key = `${floor}|||${box}`
    const g =
      groups.get(key) || {
        floor,
        box,
        inScope: 0,
        found: 0,
        missing: 0,
        scopeWtGm: 0,
        scannedWtGm: 0,
        pendingWtGm: 0,
      }
    const w = stockCheckPieceWeightGm(m)
    g.inScope += 1
    g.scopeWtGm += w
    if (scannedSet.has(m.barcode.toUpperCase())) {
      g.found += 1
      g.scannedWtGm += w
    } else {
      g.missing += 1
      g.pendingWtGm += w
    }
    groups.set(key, g)
  }
  for (const g of groups.values()) {
    g.scopeWtGm = Math.round(g.scopeWtGm * 1000) / 1000
    g.scannedWtGm = Math.round(g.scannedWtGm * 1000) / 1000
    g.pendingWtGm = Math.round(g.pendingWtGm * 1000) / 1000
  }
  return [...groups.values()].sort((a, b) =>
    `${a.floor}${a.box}`.localeCompare(`${b.floor}${b.box}`),
  )
}

export async function previewStockCheckPdf(report: StockCheckReportData) {
  const blob = await pdf(<StockCheckDocument report={report} />).toBlob()
  const fname = `stock-check-${new Date().toISOString().slice(0, 10)}.pdf`
  await presentPdfBlob(blob, fname, {
    title: report.title,
    text: report.subtitle,
  })
}

export function buildReportData(opts: {
  title?: string
  scopeLabel: string
  scopeBarcodes: StockCheckScopeBarcode[]
  scans: StockCheckScanRow[]
}): StockCheckReportData {
  const scanned = opts.scans
  const scannedSet = new Set(scanned.map((s) => s.barcode))
  const uniqueFound = scanned.filter((s) => s.found).length
  const uniqueMissing = opts.scopeBarcodes.filter(
    (m) => !scannedSet.has(m.barcode.toUpperCase()),
  ).length
  const notInScope = scanned.filter((s) => !s.found).length
  const weightSummary = computeStockCheckWeightSummary(opts.scopeBarcodes, scanned)
  return {
    title: opts.title || 'Stock checking report',
    subtitle: `${opts.scopeLabel} · ${new Date().toLocaleString('en-IN')}`,
    scopeCount: opts.scopeBarcodes.length,
    uniqueFound,
    uniqueMissing,
    notInScope,
    weightSummary,
    scanned,
    scopeBarcodes: opts.scopeBarcodes,
    floorSummary: buildFloorSummary(opts.scopeBarcodes, scanned),
  }
}

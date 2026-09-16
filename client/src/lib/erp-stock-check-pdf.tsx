import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { presentPdfBlob } from '@/lib/pdf-share'
import type { StockCheckScopeBarcode, StockCheckScanRow } from '@/lib/erp-stock-check-storage'

export type StockCheckFloorSummary = {
  floor: string
  box: string
  inScope: number
  found: number
  missing: number
}

export type StockCheckReportData = {
  title: string
  subtitle: string
  scopeCount: number
  uniqueFound: number
  uniqueMissing: number
  notInScope: number
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
  fb1: { width: '25%' },
  fb2: { width: '25%' },
  fb3: { width: '12%', textAlign: 'right' },
  fb4: { width: '12%', textAlign: 'right' },
  fb5: { width: '12%', textAlign: 'right' },
})

function StockCheckDocument({ report }: { report: StockCheckReportData }) {
  const scannedSet = new Set(report.scanned.map((s) => s.barcode))
  const missing = report.scopeBarcodes.filter((m) => !scannedSet.has(m.barcode.toUpperCase()))

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
        </View>

        <Text style={styles.section}>Floor / box summary</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.fb1}>Floor</Text>
          <Text style={styles.fb2}>Box</Text>
          <Text style={styles.fb3}>In scope</Text>
          <Text style={styles.fb4}>Found</Text>
          <Text style={styles.fb5}>Missing</Text>
        </View>
        {report.floorSummary.map((f) => (
          <View key={`${f.floor}-${f.box}`} style={styles.row}>
            <Text style={styles.fb1}>{f.floor || '—'}</Text>
            <Text style={styles.fb2}>{f.box || '—'}</Text>
            <Text style={styles.fb3}>{f.inScope}</Text>
            <Text style={styles.fb4}>{f.found}</Text>
            <Text style={styles.fb5}>{f.missing}</Text>
          </View>
        ))}

        <Text style={styles.section}>Scanned ({report.scanned.length})</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.c1}>Barcode</Text>
          <Text style={styles.c2}>Status</Text>
          <Text style={styles.c3}>SKU</Text>
          <Text style={styles.c4}>Product</Text>
          <Text style={styles.c5}>Floor</Text>
          <Text style={styles.c6}>Box</Text>
        </View>
        {report.scanned.map((s) => {
          const meta = report.scopeBarcodes.find(
            (m) => m.barcode.toUpperCase() === s.barcode.toUpperCase(),
          )
          return (
            <View key={s.id} style={styles.row}>
              <Text style={styles.c1}>{s.barcode}</Text>
              <Text style={styles.c2}>{s.found ? 'FOUND' : 'NOT IN SCOPE'}</Text>
              <Text style={styles.c3}>{s.sku || meta?.sku || ''}</Text>
              <Text style={styles.c4}>{s.product_name || meta?.product_name || ''}</Text>
              <Text style={styles.c5}>{meta?.floor_name || ''}</Text>
              <Text style={styles.c6}>{meta?.box_code || ''}</Text>
            </View>
          )
        })}

        <Text style={styles.section}>Missing from scope ({missing.length})</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.c1}>Barcode</Text>
          <Text style={styles.c3}>SKU</Text>
          <Text style={styles.c4}>Product</Text>
          <Text style={styles.c5}>Floor</Text>
          <Text style={styles.c6}>Box</Text>
        </View>
        {missing.slice(0, 120).map((m) => (
          <View key={m.barcode} style={styles.row}>
            <Text style={styles.c1}>{m.barcode}</Text>
            <Text style={styles.c3}>{m.sku || ''}</Text>
            <Text style={styles.c4}>{m.product_name || ''}</Text>
            <Text style={styles.c5}>{m.floor_name || ''}</Text>
            <Text style={styles.c6}>{m.box_code || ''}</Text>
          </View>
        ))}
      </Page>
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
    const g = groups.get(key) || { floor, box, inScope: 0, found: 0, missing: 0 }
    g.inScope += 1
    if (scannedSet.has(m.barcode.toUpperCase())) g.found += 1
    else g.missing += 1
    groups.set(key, g)
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
  return {
    title: opts.title || 'Stock checking report',
    subtitle: `${opts.scopeLabel} · ${new Date().toLocaleString('en-IN')}`,
    scopeCount: opts.scopeBarcodes.length,
    uniqueFound,
    uniqueMissing,
    notInScope,
    scanned,
    scopeBarcodes: opts.scopeBarcodes,
    floorSummary: buildFloorSummary(opts.scopeBarcodes, scanned),
  }
}

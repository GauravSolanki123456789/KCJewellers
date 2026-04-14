import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { OrderSnapshotLine } from '@/lib/order-snapshot'
import { snapshotLineTitle } from '@/lib/order-snapshot'

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'Helvetica', backgroundColor: '#020617', color: '#e2e8f0' },
  brand: { fontSize: 16, color: '#fbbf24', fontWeight: 'bold' },
  title: { fontSize: 11, color: '#94a3b8', marginTop: 4, marginBottom: 14 },
  th: { fontSize: 7, color: '#64748b', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#1e293b', paddingVertical: 6 },
  td: { fontSize: 8, color: '#cbd5e1', paddingRight: 4 },
  subItem: { fontSize: 6.5, color: '#64748b', marginTop: 2 },
  thumb: { width: 36, height: 36, objectFit: 'cover', borderRadius: 4 },
  thumbBox: { width: '10%', paddingRight: 4, justifyContent: 'flex-start' },
  colMain: { width: '42%', flexDirection: 'column' },
  colBc: { width: '22%' },
  colWt: { width: '14%', textAlign: 'right' },
  colQty: { width: '12%', textAlign: 'right' },
  headRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 5, marginBottom: 2 },
  foot: { marginTop: 16, fontSize: 7, color: '#475569', lineHeight: 1.4 },
})

export type AdminOrderPdfLine = OrderSnapshotLine & { pdfImageSrc?: string }

function statusLabel(raw: string | undefined): string {
  if (!raw) return 'New'
  const u = raw.toUpperCase()
  const map: Record<string, string> = {
    PENDING: 'New',
    NEW: 'New',
    ACCEPTED: 'Accepted',
    READY: 'Ready',
    DISPATCHED: 'Dispatched',
    DELIVERED: 'Delivered',
    SHIPPED: 'Dispatched',
    CANCELLED: 'Cancelled',
  }
  return map[u] || raw
}

/** Subline only — barcode / weight / qty are table columns (avoid duplicate text). */
function lineMeta(line: OrderSnapshotLine): string {
  const parts: string[] = []
  if (line.style_code) parts.push(`Style: ${line.style_code}`)
  const sku = line.sku != null ? String(line.sku).trim() : ''
  const bc = line.barcode != null ? String(line.barcode).trim() : ''
  if (sku && !(bc && sku === bc)) parts.push(`SKU ${sku}`)
  if (line.metal_type) parts.push(String(line.metal_type))
  return parts.join(' · ')
}

/** Packing list: no customer block, no prices, no order meta line — internal reference only. */
export function AdminOrderPdfDocument({
  orderId,
  lines,
  generatedAtLabel,
}: {
  orderId: number
  lines: AdminOrderPdfLine[]
  generatedAtLabel: string
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>KC Jewellers</Text>
        <Text style={styles.title}>Order summary (admin) · #{orderId}</Text>

        <View style={styles.headRow}>
          <Text style={[styles.th, styles.thumbBox]}> </Text>
          <Text style={[styles.th, styles.colMain]}>Item</Text>
          <Text style={[styles.th, styles.colBc]}>Barcode</Text>
          <Text style={[styles.th, styles.colWt]}>Wt (g)</Text>
          <Text style={[styles.th, styles.colQty]}>Qty</Text>
        </View>

        {lines.length === 0 ? (
          <Text style={[styles.td, { marginTop: 6 }]}>No line items in snapshot.</Text>
        ) : (
          lines.map((line, i) => {
            const qty = Math.max(1, Math.floor(Number(line.qty) || 1))
            const meta = lineMeta(line)
            const title = snapshotLineTitle(line)
            const displayTitle = title && title.trim() !== '' ? title : '—'
            const bc =
              line.barcode != null && String(line.barcode).trim() !== ''
                ? String(line.barcode).trim()
                : line.sku != null && String(line.sku).trim() !== ''
                  ? String(line.sku).trim()
                  : '—'
            return (
              <View key={`${line.barcode || line.sku || 'row'}-${i}`} style={styles.tr} wrap={false}>
                <View style={styles.thumbBox}>
                  {line.pdfImageSrc ? (
                    <Image style={styles.thumb} src={line.pdfImageSrc} />
                  ) : (
                    <View style={{ width: 36, height: 36, backgroundColor: '#1e293b', borderRadius: 4 }} />
                  )}
                </View>
                <View style={styles.colMain}>
                  <Text style={[styles.td, { paddingRight: 0 }]} hyphenationCallback={() => []}>
                    {displayTitle}
                  </Text>
                  {meta ? (
                    <Text style={styles.subItem} hyphenationCallback={() => []}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.td, styles.colBc]} hyphenationCallback={() => []}>
                  {bc}
                </Text>
                <Text style={[styles.td, styles.colWt]}>
                  {line.net_wt_g != null ? Number(line.net_wt_g).toFixed(2) : '—'}
                </Text>
                <Text style={[styles.td, styles.colQty]}>{qty}</Text>
              </View>
            )
          })
        )}

        <Text style={styles.foot}>
          Generated {generatedAtLabel} · KC Jewellers — internal packing / reference. Not a tax invoice unless
          separately issued.
        </Text>
      </Page>
    </Document>
  )
}

export function formatDeliveryStatusForPdf(deliveryStatus: string | undefined): string {
  return statusLabel(deliveryStatus)
}

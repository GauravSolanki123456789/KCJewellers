import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'

const styles = StyleSheet.create({
  page: {
    padding: 28,
    backgroundColor: '#020617',
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 12,
  },
  brand: { fontSize: 18, color: '#fbbf24', fontWeight: 'bold' },
  sub: { fontSize: 9, color: '#94a3b8', marginTop: 4 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '30%',
    minWidth: 120,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 8,
  },
  thumbWrap: {
    width: '100%',
    height: 110,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: 110,
    objectFit: 'cover',
    borderRadius: 6,
  },
  thumbPlaceholder: {
    fontSize: 28,
    color: '#475569',
    fontWeight: 'bold',
  },
  code: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 9, color: '#e2e8f0', marginBottom: 4, minHeight: 22 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' },
  price: { fontSize: 11, color: '#fbbf24', fontWeight: 'bold' },
  gst: { fontSize: 7, color: '#64748b' },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 28,
    right: 28,
    fontSize: 7,
    color: '#475569',
    textAlign: 'center',
  },
})

function displayName(p: Item) {
  return (
    (p as { name?: string }).name ||
    p.item_name ||
    p.short_name ||
    String(p.barcode || p.sku || '')
  )
}

function markedUpTotal(item: Item, rates: unknown, markupPct: number) {
  const b = calculateBreakdown(item, rates, (item as { gst_rate?: number }).gst_rate ?? 3)
  const m = Math.max(0, markupPct)
  return b.total * (1 + m / 100)
}

export type CatalogPdfDocumentProps = {
  products: ItemWithPdfImage[]
  rates: unknown[]
  markupPercentage: number
  brandName?: string
}

const PER_PAGE = 9

export function CatalogPdfDocument({
  products,
  rates,
  markupPercentage,
  brandName = 'KC Jewellers',
}: CatalogPdfDocumentProps) {
  const chunks: ItemWithPdfImage[][] = []
  for (let i = 0; i < products.length; i += PER_PAGE) {
    chunks.push(products.slice(i, i + PER_PAGE))
  }
  if (chunks.length === 0) chunks.push([])

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          {pageIndex === 0 && (
            <View style={styles.header}>
              <Text style={styles.brand}>{brandName}</Text>
              <Text style={styles.sub}>
                Catalogue · {products.length} item{products.length !== 1 ? 's' : ''}
                {markupPercentage > 0 ? ` · ${markupPercentage}% markup incl.` : ''}
              </Text>
            </View>
          )}
          <View style={styles.grid}>
            {chunk.map((raw, i) => {
              const p = raw as ItemWithPdfImage
              const name = displayName(p)
              /** Only embedded PNG data URLs — remote URLs fail silently in react-pdf. */
              const img = p.pdfImageSrc
              const total = markedUpTotal(p, rates, markupPercentage)
              const code = String(p.barcode || p.sku || '')
              return (
                <View
                  key={`${code}-${pageIndex}-${i}`}
                  style={styles.card}
                  wrap={false}
                >
                  <View style={styles.thumbWrap}>
                    {img ? (
                      <Image style={styles.thumb} src={img} />
                    ) : (
                      <Text style={styles.thumbPlaceholder}>{name.charAt(0)}</Text>
                    )}
                  </View>
                  {code ? (
                    <Text style={styles.code} hyphenationCallback={() => []}>
                      {code}
                    </Text>
                  ) : null}
                  <Text style={styles.title} hyphenationCallback={() => []}>
                    {name}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.price}>₹{Math.round(total).toLocaleString('en-IN')}</Text>
                    <Text style={styles.gst}>incl. GST</Text>
                  </View>
                </View>
              )
            })}
          </View>
          <Text style={styles.footer} fixed>
            {brandName} · Page {pageIndex + 1} of {chunks.length}
          </Text>
        </Page>
      ))}
    </Document>
  )
}

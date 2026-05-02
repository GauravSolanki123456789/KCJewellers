import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import {
  calculateBreakdown,
  getItemWeightWithGrossFallback,
  type Item,
} from '@/lib/pricing'
import { getProductSelectionKey } from '@/lib/catalog-product-filters'
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
    /* `gap` is not reliably supported in all @react-pdf layout builds */
  },
  card: {
    width: '31%',
    minWidth: 118,
    marginBottom: 8,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 8,
  },
  thumbWrap: {
    width: '100%',
    height: 100,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: 100,
    objectFit: 'cover',
    borderRadius: 6,
  },
  thumbPlaceholder: {
    fontSize: 28,
    color: '#475569',
    fontWeight: 'bold',
  },
  title: { fontSize: 8, color: '#e2e8f0', marginBottom: 2, marginTop: 2 },
  metaLabel: { fontSize: 6, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
  /**
   * Use Helvetica + fontWeight — `fontFamily: "Helvetica-Bold"` is invalid in react-pdf
   * and can render blank glyphs in the PDF (label inherited Helvetica and still showed).
   */
  barcodeValue: {
    fontSize: 11,
    color: '#fbbf24',
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    marginBottom: 3,
  },
  weightLine: { fontSize: 8, color: '#94a3b8', marginBottom: 2 },
  weightMuted: { fontSize: 8, color: '#475569' },
  priceLine: {
    fontSize: 11,
    color: '#fbbf24',
    fontFamily: 'Helvetica',
    fontWeight: 'bold',
    marginTop: 2,
    marginBottom: 2,
  },
  priceMuted: { fontSize: 6, color: '#64748b', marginBottom: 2 },
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

/** RESELLER brochure PDF: show marked-up prices (same basis as shared web catalogue). */
export type CatalogPdfResellerPricing = {
  rates: unknown
  markupPercentage: number
}

export type CatalogPdfDocumentProps = {
  products: ItemWithPdfImage[]
  brandName?: string
  resellerPdfPricing?: CatalogPdfResellerPricing | null
}

function formatMarkedUpInclGst(item: Item, rates: unknown, markupPct: number): string {
  const gst = Number((item as { gst_rate?: number }).gst_rate ?? 3) || 3
  const b = calculateBreakdown(item, rates, gst)
  const total = b.total * (1 + Math.max(0, markupPct) / 100)
  return `₹${Math.round(total).toLocaleString('en-IN')} incl. GST`
}

const PER_PAGE = 9

export function CatalogPdfDocument({
  products,
  brandName = 'KC Jewellers',
  resellerPdfPricing = null,
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
              </Text>
            </View>
          )}
          <View style={styles.grid}>
            {chunk.map((raw, i) => {
              const p = raw as ItemWithPdfImage
              const name = displayName(p)
              /** Only embedded PNG data URLs — remote URLs fail silently in react-pdf. */
              const img = p.pdfImageSrc
              /** Same key as ProductCard / catalogue selection (`barcode ?? sku ?? id`). */
              const barcode = getProductSelectionKey(p)
              const weight = getItemWeightWithGrossFallback(p)
              const key = `${barcode || String(p.id ?? i)}-${pageIndex}-${i}`
              const barcodeText =
                barcode && String(barcode).trim() !== '' ? String(barcode) : '-'
              const weightText =
                weight != null && !Number.isNaN(Number(weight))
                  ? `${Number(weight).toFixed(2)} gm`
                  : '-'
              const showPrices =
                resellerPdfPricing &&
                resellerPdfPricing.rates != null
              const priceLabel =
                showPrices
                  ? formatMarkedUpInclGst(
                      p,
                      resellerPdfPricing.rates,
                      resellerPdfPricing.markupPercentage,
                    )
                  : null
              const markupPct = showPrices
                ? Math.max(0, Number(resellerPdfPricing.markupPercentage) || 0)
                : 0
              return (
                <View key={key} style={styles.card}>
                  <View style={styles.thumbWrap}>
                    {img ? (
                      <Image style={styles.thumb} src={img} />
                    ) : (
                      <Text style={styles.thumbPlaceholder}>{name.charAt(0)}</Text>
                    )}
                  </View>
                  <Text style={styles.metaLabel}>Barcode</Text>
                  <Text style={styles.barcodeValue}>{barcodeText}</Text>
                  <Text style={styles.weightLine}>
                    Weight · {weightText}
                  </Text>
                  {priceLabel ? (
                    <>
                      <Text style={styles.priceLine}>{priceLabel}</Text>
                      {markupPct > 0 ? (
                        <Text style={styles.priceMuted}>
                          +{markupPct}% vs storefront incl. GST
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                  <Text style={styles.title}>{name}</Text>
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

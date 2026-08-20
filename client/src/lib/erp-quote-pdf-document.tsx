import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'
import { getKcPdfPalette, type KcPdfPalette } from '@/lib/kc-pdf-palette'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { billingMcPdfText, billingWastageDisplay } from '@/lib/erp-billing-display'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { parseMetalSlabFraction } from '@/lib/erp-piece-slab-pricing'

type PdfCol = { key: string; label: string; w: string }

function isSilverMetal(line: ErpBillLine): boolean {
  return String(line.metal_type || '').toLowerCase().startsWith('silver')
}

function metalSlabPctDisplay(line: ErpBillLine, slab: ErpRateSlab): string {
  let raw: unknown = null
  if (slab === 'W') raw = line.metal_slab_w_pct ?? line.metal_slab_r_pct
  else if (slab === 'F') raw = line.metal_slab_f_pct ?? line.metal_slab_w_pct ?? line.metal_slab_r_pct
  else raw = line.metal_slab_r_pct
  if (raw == null || raw === '') return ''
  const frac = parseMetalSlabFraction(raw)
  if (frac >= 0.999) return ''
  return `${Math.round(frac * 100)}%`
}

function buildPdfColumns(lines: ErpBillLine[], rateSlab: ErpRateSlab): PdfCol[] {
  const hasGold = lines.some((l) => !isSilverMetal(l))
  const showGross = lines.some((l) => l.gross_weight != null && Number(l.gross_weight) > 0)
  const showSlabDetail = rateSlab === 'W' || rateSlab === 'F'
  const showSlabPct =
    showSlabDetail && lines.some((l) => metalSlabPctDisplay(l, rateSlab) !== '')
  const showNetOrig =
    showSlabDetail &&
    lines.some((l) => {
      const orig = l.originalWeightGm ?? l.weightGm
      return orig != null && Number(orig) > 0
    })
  const showBagWt = lines.some((l) => l.bag_wt != null && Number(l.bag_wt) > 0)
  const showBags = lines.some((l) => String(l.bags || '').trim())

  const cols: PdfCol[] = [
    { key: 'barcode', label: 'Barcode', w: '9%' },
    { key: 'sku', label: 'SKU', w: '5%' },
    { key: 'style', label: 'Style', w: '6%' },
    { key: 'name', label: 'Product', w: '9%' },
    { key: 'size', label: 'Size', w: '4%' },
  ]
  if (showGross) cols.push({ key: 'gross', label: 'Gross', w: '5%' })
  if (showNetOrig) cols.push({ key: 'netOrig', label: 'Net Wt', w: '5%' })
  if (showSlabPct) cols.push({ key: 'slabPct', label: 'Met %', w: '4%' })
  cols.push({ key: 'wt', label: showSlabDetail && showSlabPct ? 'Bill Wt' : 'Wt', w: '5%' })
  if (hasGold) cols.push({ key: 'purity', label: 'Pur', w: '4%' })
  cols.push(
    { key: 'wast', label: 'W%', w: '3%' },
    { key: 'rate', label: 'Rate', w: '5%' },
    { key: 'mc', label: 'MC', w: '5%' },
    { key: 'mct', label: 'MCType', w: '5%' },
    { key: 'pcs', label: 'PCS', w: '3%' },
  )
  if (showBagWt) cols.push({ key: 'bagWt', label: 'Bag Wt', w: '4%' })
  if (showBags) cols.push({ key: 'bags', label: 'Bags', w: '4%' })
  cols.push(
    { key: 'box', label: 'Box', w: '4%' },
    { key: 'stone', label: 'Stone', w: '4%' },
    { key: 'metal', label: 'Metal', w: '5%' },
    { key: 'fixed', label: 'Fixed', w: '4%' },
    { key: 'amt', label: 'Amount', w: '7%' },
  )
  return cols
}

function buildStyles(p: KcPdfPalette) {
  return StyleSheet.create({
    page: {
      padding: 18,
      paddingBottom: 20,
      backgroundColor: p.pageBg,
      fontFamily: 'Helvetica',
      fontSize: 8,
    },
    header: {
      marginBottom: 8,
      borderBottomWidth: 2,
      borderBottomColor: p.accent,
      paddingBottom: 6,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    headerMain: { flex: 1 },
    rateUnfixBadge: {
      borderWidth: 1,
      borderColor: p.accent,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: p.cardBg,
    },
    rateUnfixText: {
      fontSize: 9,
      fontWeight: 'bold',
      color: p.accent,
      letterSpacing: 0.5,
    },
    brand: { fontSize: 15, color: p.brand, fontWeight: 'bold' },
    sub: { fontSize: 8.5, color: p.subMuted, marginTop: 3 },
    tableTitle: {
      backgroundColor: p.accent,
      paddingVertical: 4,
      paddingHorizontal: 6,
      marginBottom: 0,
    },
    tableTitleText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
    headRow: {
      flexDirection: 'row',
      backgroundColor: p.headerRule,
      borderBottomWidth: 1,
      borderBottomColor: p.cardBorder,
    },
    headCell: {
      paddingVertical: 4,
      paddingHorizontal: 2,
      fontSize: 6.5,
      fontWeight: 'bold',
      color: '#fff',
    },
    bodyRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: p.cardBorder,
    },
    bodyRowAlt: { backgroundColor: p.cardBg },
    bodyCell: {
      paddingVertical: 3,
      paddingHorizontal: 2,
      fontSize: 6.5,
      fontWeight: 'bold',
      color: p.textPrimary,
    },
    bodyCellAmt: {
      paddingVertical: 3,
      paddingHorizontal: 2,
      fontSize: 7,
      color: p.accent,
      fontWeight: 'bold',
    },
    summaryWrap: {
      marginTop: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'flex-end',
    },
    summaryChip: {
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      backgroundColor: p.cardBg,
      minWidth: 72,
    },
    summaryLabel: { fontSize: 6.5, color: p.metaLabel, textTransform: 'uppercase', fontWeight: 'bold' },
    summaryValue: { fontSize: 10, fontWeight: 'bold', color: p.textPrimary, marginTop: 2 },
    summaryNet: {
      borderWidth: 2,
      borderColor: p.accent,
      borderRadius: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: p.pageBg,
    },
    summaryNetValue: { fontSize: 12, fontWeight: 'bold', color: p.accent },
    photosTitle: {
      marginTop: 12,
      marginBottom: 6,
      fontSize: 10,
      fontWeight: 'bold',
      color: p.textPrimary,
      letterSpacing: 0.5,
    },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photoCard: {
      width: '30%',
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: p.cardBg,
    },
    photoThumb: { width: '100%', height: 88, objectFit: 'contain', backgroundColor: p.thumbBg },
    photoBody: { padding: 4 },
    photoName: { fontSize: 7, fontWeight: 'bold', color: p.brand },
    photoMeta: { fontSize: 6, color: p.textSecondary, marginTop: 2 },
    photoAmt: { fontSize: 7.5, fontWeight: 'bold', color: p.accent, marginTop: 2 },
  })
}

function cell(
  line: ErpBillLine,
  key: string,
  rateSlab: ErpRateSlab,
  ratesUnfixed: boolean,
): string {
  if (ratesUnfixed && (key === 'amt' || key === 'rate')) return ''

  switch (key) {
    case 'barcode':
      return line.barcode || line.code || '—'
    case 'sku':
      return line.sku || '—'
    case 'style':
      return line.style_code || '—'
    case 'name':
      return line.name || '—'
    case 'size':
      return line.size || '—'
    case 'gross':
      return line.gross_weight != null ? `${line.gross_weight}` : '—'
    case 'netOrig': {
      const orig = line.originalWeightGm ?? line.weightGm
      return orig != null ? `${orig}` : '—'
    }
    case 'slabPct':
      return metalSlabPctDisplay(line, rateSlab) || '—'
    case 'wt':
      return line.weightGm != null ? `${line.weightGm}` : '—'
    case 'purity':
      if (isSilverMetal(line)) return '—'
      return line.purity != null ? String(line.purity) : '—'
    case 'wast':
      return String(billingWastageDisplay(line, rateSlab) || '—')
    case 'rate':
      if (line.rateLocked) return ''
      return line.ratePerGram != null ? String(line.ratePerGram) : '—'
    case 'mc':
      return billingMcPdfText(line, rateSlab)
    case 'mct':
      return line.mc_type || '—'
    case 'pcs':
      return String(line.qty ?? 1)
    case 'bagWt':
      return line.bag_wt != null ? `${line.bag_wt}` : '—'
    case 'bags':
      return String(line.bags || '').trim() || '—'
    case 'box':
      return line.box_charges != null ? String(line.box_charges) : '0'
    case 'stone':
      return line.stone_charges != null ? String(line.stone_charges) : '0'
    case 'metal':
      return line.metal_type || '—'
    case 'fixed':
      return line.fixed_price != null && line.fixed_price > 0 ? String(line.fixed_price) : '—'
    case 'amt':
      if (ratesUnfixed) return ''
      return line.lineTotalInr != null
        ? `Rs.${Math.round(line.lineTotalInr).toLocaleString('en-IN')}`
        : '—'
    default:
      return '—'
  }
}

function moneyOrBlank(ratesUnfixed: boolean, n: number): string {
  if (ratesUnfixed) return ''
  return `Rs.${Math.round(n).toLocaleString('en-IN')}`
}

export type ErpQuotePdfDocumentProps = {
  bill: ErpBill
  brandName: string
  kcThemeId?: string | null
  products: ItemWithPdfImage[]
  totals: ErpQuoteTotals
  customerName?: string | null
  ratesUnfixed?: boolean
  documentKind?: 'quote' | 'invoice'
  gstin?: string | null
}

export function ErpQuotePdfDocument({
  bill,
  brandName,
  kcThemeId,
  products,
  totals,
  customerName,
  ratesUnfixed = false,
  documentKind = 'quote',
  gstin,
}: ErpQuotePdfDocumentProps) {
  const palette = useMemo(() => getKcPdfPalette(kcThemeId || undefined), [kcThemeId])
  const styles = useMemo(() => buildStyles(palette), [palette])
  const lines = bill.lines ?? []
  const rateSlab = ((bill.session as { rateSlab?: ErpRateSlab } | null)?.rateSlab ?? 'R') as ErpRateSlab
  const cols = useMemo(() => buildPdfColumns(lines, rateSlab), [lines, rateSlab])
  const isInvoice = documentKind === 'invoice'
  const docLabel = isInvoice ? 'Tax Invoice' : 'Quotation'
  const tableTitle = isInvoice ? 'Invoice details — full breakdown' : 'Order summary — full details'
  const photoEntries = useMemo(
    () =>
      products
        .map((p, i) => ({ p, line: lines[i], i }))
        .filter(({ p }) => Boolean(p.pdfImageSrc)),
    [products, lines],
  )

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.brand}>{sanitizePdfText(brandName)}</Text>
            <Text style={styles.sub}>
              {docLabel} {bill.bill_number}
              {customerName ? ` · ${sanitizePdfText(customerName)}` : ''} · {lines.length} line
              {lines.length !== 1 ? 's' : ''} · {totals.count} pc{totals.count !== 1 ? 's' : ''}
              {isInvoice && gstin ? ` · GSTIN ${sanitizePdfText(gstin)}` : ''}
            </Text>
          </View>
          {ratesUnfixed ? (
            <View style={styles.rateUnfixBadge}>
              <Text style={styles.rateUnfixText}>RATE UNFIX</Text>
            </View>
          ) : totals.advancePaid != null && totals.advancePaid > 0 ? (
            <View style={styles.rateUnfixBadge}>
              <Text style={styles.rateUnfixText}>ADVANCE PAID</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tableTitle}>
          <Text style={styles.tableTitleText}>{tableTitle}</Text>
        </View>
        <View style={styles.headRow}>
          <Text style={[styles.headCell, { width: '3%' }]}>#</Text>
          {cols.map((c) => (
            <Text key={c.key} style={[styles.headCell, { width: c.w }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {lines.map((line, i) => (
          <View key={`row-${i}`} style={[styles.bodyRow, i % 2 === 1 ? styles.bodyRowAlt : {}]}>
            <Text style={[styles.bodyCell, { width: '3%' }]}>{i + 1}</Text>
            {cols.map((c) => (
              <Text
                key={c.key}
                style={[c.key === 'amt' ? styles.bodyCellAmt : styles.bodyCell, { width: c.w }]}
              >
                {sanitizePdfText(cell(line, c.key, rateSlab, ratesUnfixed))}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.summaryWrap}>
          {[
            { label: 'Items', value: String(totals.count) },
            { label: 'Total weight', value: `${totals.weight.toFixed(2)}g` },
            ...(ratesUnfixed
              ? []
              : [
                  { label: 'Subtotal', value: moneyOrBlank(false, totals.subtotal) },
                  { label: 'GST (3%)', value: moneyOrBlank(false, totals.gst) },
                ]),
          ].map((s) => (
            <View key={s.label} style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>{s.label}</Text>
              <Text style={styles.summaryValue}>{s.value}</Text>
            </View>
          ))}
          {!ratesUnfixed && totals.advancePaid != null && totals.advancePaid > 0 ? (
            <>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryLabel}>Advance paid</Text>
                <Text style={styles.summaryValue}>
                  Rs.{Math.round(totals.advancePaid).toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={styles.summaryChip}>
                <Text style={styles.summaryLabel}>Amount to pay</Text>
                <Text style={styles.summaryValue}>
                  Rs.{Math.round(totals.balanceDue ?? 0).toLocaleString('en-IN')}
                </Text>
              </View>
            </>
          ) : null}
          {!ratesUnfixed && totals.mcDiscount != null && totals.mcDiscount > 0 ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>MC discount</Text>
              <Text style={styles.summaryValue}>
                Rs.{Math.round(totals.mcDiscount).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}
          {!ratesUnfixed && totals.billingDiscount != null && totals.billingDiscount !== 0 ? (
            <>
              {totals.collectedAmount != null ? (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryLabel}>Collected</Text>
                  <Text style={styles.summaryValue}>
                    Rs.{Math.round(totals.collectedAmount).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}
              {totals.cashDiscount != null && totals.cashDiscount !== 0 ? (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryLabel}>Cash discount</Text>
                  <Text style={styles.summaryValue}>
                    Rs.{Math.round(totals.cashDiscount).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}
              <View style={styles.summaryChip}>
                <Text style={styles.summaryLabel}>Total discount</Text>
                <Text style={styles.summaryValue}>
                  Rs.{Math.round(totals.billingDiscount).toLocaleString('en-IN')}
                </Text>
              </View>
            </>
          ) : !ratesUnfixed && totals.mcDiscount != null && totals.mcDiscount > 0 ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>Total discount</Text>
              <Text style={styles.summaryValue}>
                Rs.{Math.round(totals.mcDiscount).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}
          {!ratesUnfixed ? (
            <View style={styles.summaryNet}>
              <Text style={styles.summaryLabel}>Net total</Text>
              <Text style={styles.summaryNetValue}>{moneyOrBlank(false, totals.net)}</Text>
            </View>
          ) : null}
        </View>

        {photoEntries.length > 0 ? (
          <>
            <Text style={styles.photosTitle}>PRODUCT PHOTOS</Text>
            <View style={styles.photoGrid}>
              {photoEntries.map(({ p, line, i }) => {
                const name = sanitizePdfText(line?.name || p.item_name || 'Item')
                const ref = line?.barcode || line?.code || p.barcode || '—'
                const wt = line?.weightGm != null ? `${line.weightGm} gm` : ''
                const amt =
                  !ratesUnfixed && line?.lineTotalInr != null
                    ? `Rs.${Math.round(line.lineTotalInr).toLocaleString('en-IN')}`
                    : ''
                return (
                  <View key={`photo-${i}`} style={styles.photoCard}>
                    <Image style={styles.photoThumb} src={p.pdfImageSrc!} />
                    <View style={styles.photoBody}>
                      <Text style={styles.photoName}>{name}</Text>
                      <Text style={styles.photoMeta}>Ref: {ref}{wt ? ` · ${wt}` : ''}</Text>
                      {amt ? <Text style={styles.photoAmt}>{amt}</Text> : null}
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  )
}

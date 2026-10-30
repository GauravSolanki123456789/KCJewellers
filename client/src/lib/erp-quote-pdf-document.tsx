import { useMemo } from 'react'
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import type { ErpBill, ErpBillLine } from '@/components/reseller/erp/erp-ui'
import type { ItemWithPdfImage } from '@/lib/pdf-embed-images'
import { getKcPdfPalette, type KcPdfPalette } from '@/lib/kc-pdf-palette'
import { sanitizePdfText } from '@/lib/pdf-text-utils'
import type { ErpQuoteTotals } from '@/lib/erp-quote-pdf'
import { shouldShowPaymentModeOnEstimatePdf } from '@/lib/erp-quote-pdf'
import { billingWastageDisplay } from '@/lib/erp-billing-display'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { pieceSlabMetalFraction } from '@/lib/erp-piece-slab-pricing'
import {
  formatMetalSlabPctForDisplay,
  lineShowsPartialMetalSlabPctInPdf,
} from '@/lib/erp-metal-slab-field'
import {
  billingMcPdfCatalogColumn,
  billingMcPdfSlabRColumn,
  computeMcValueForPdf,
  groupBillLinesForSummaryPdf,
  lineShowsMcRPdfColumn,
} from '@/lib/erp-quote-pdf-summary'
import { isPiecePricedBillLine, parseSlabSettingsFromUser } from '@/lib/erp-billing-pricing'
import { parseResellerSlabSettings, type ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { giftMrpFixedColumnDisplay } from '@/lib/erp-gift-mrp-pricing'
import { formatErpPdfPurity } from '@/lib/erp-pdf-purity'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'

export type ErpQuotePdfLayoutMode = 'detailed' | 'summary'

type PdfCol = { key: string; label: string; w: string }

function paymentMethodPdfLabel(method?: string | null): string {
  const m = String(method || '').toLowerCase()
  if (m === 'bank') return 'Bank / RTGS'
  if (m === 'cash') return 'Cash'
  if (m === 'upi') return 'UPI'
  if (m === 'gpay') return 'GPay'
  if (m === 'card') return 'Card'
  if (m === 'mixed') return 'Mixed'
  return method ? String(method) : '—'
}

/** Pure weight for PDF: Net Wt × Metal(%). */
function pdfPureWtDisplay(line: ErpBillLine, rateSlab: ErpRateSlab): string {
  const netRaw = line.originalWeightGm ?? line.weightGm
  if (netRaw == null || !Number.isFinite(Number(netRaw))) return '—'
  const net = Number(netRaw)
  const frac = pieceSlabMetalFraction(line, rateSlab)
  if (frac >= 0.999) return net.toFixed(2)
  return (Math.round(net * frac * 100) / 100).toFixed(2)
}

/** Billable gross weight for PDF Wt column (net + wastage %), display only. */
function pdfBillWtGrossDisplay(line: ErpBillLine, rateSlab: ErpRateSlab): string {
  const netRaw = line.originalWeightGm ?? line.weightGm
  if (netRaw == null || !Number.isFinite(Number(netRaw))) return '—'
  const net = Number(netRaw)
  const wastRaw = billingWastageDisplay(line, rateSlab)
  const wast = typeof wastRaw === 'number' ? wastRaw : Number(wastRaw)
  if (Number.isFinite(wast) && wast > 0) {
    return (net * (1 + wast / 100)).toFixed(3)
  }
  return `${net}`
}

function metalSlabPctDisplay(line: ErpBillLine, slab: ErpRateSlab): string {
  return formatMetalSlabPctForDisplay(line, slab)
}

function isEmptyPdfCell(val: string, key: string): boolean {
  const s = val.trim()
  if (!s || s === '—' || s === '-') return true
  if (key === 'box' || key === 'stone' || key === 'fixed') return s === '0' || s === '0.0'
  if (key === 'wast') return s === '0' || s === '0.00'
  return false
}

function buildPdfColumns(
  lines: ErpBillLine[],
  rateSlab: ErpRateSlab,
  ratesUnfixed: boolean,
  slabSettings?: ResellerSlabSettings | null,
  showPurityColumn = false,
): PdfCol[] {
  const showSlabPct = lines.some((l) => lineShowsPartialMetalSlabPctInPdf(l, rateSlab))

  const rateUnfixAlways = new Set(['rate', 'mcValue', 'amt'])
  const hasMetalRate = lines.some((l) => {
    if (l.manualCategory === 'gift' || l.mrpMode || isPiecePricedBillLine(l)) return false
    return (
      Number(l.ratePerGram) > 0 ||
      (String(l.metal_type || '').toLowerCase().startsWith('silver') &&
        (Number(l.originalWeightGm ?? l.weightGm) || 0) > 0)
    )
  })
  const showMcR =
    rateSlab === 'R' && lines.some((line) => lineShowsMcRPdfColumn(line, rateSlab, slabSettings))

  const candidates: PdfCol[] = [
    { key: 'barcode', label: 'Barcode', w: '11%' },
    { key: 'sku', label: 'SKU', w: '8%' },
    { key: 'style', label: 'Style', w: '7%' },
    { key: 'name', label: 'Product', w: '10%' },
    { key: 'size', label: 'Size', w: '4%' },
    { key: 'gross', label: 'Gross', w: '5%' },
    { key: 'bagWt', label: 'Bag Wt', w: '4%' },
    { key: 'netOrig', label: 'Net Wt', w: '5%' },
    ...(showSlabPct ? [{ key: 'slabPct', label: 'Metal(%)', w: '4%' }] : []),
    { key: 'wast', label: 'W%', w: '3%' },
    ...(showSlabPct ? [{ key: 'wt', label: 'Pure Wt', w: '5%' }] : []),
    ...(showPurityColumn ? [{ key: 'purity', label: 'Purity', w: '5%' }] : []),
    { key: 'rate', label: 'Rate', w: '5%' },
    { key: 'mc', label: 'MC', w: '5%' },
    ...(showMcR ? [{ key: 'mcR', label: 'MC R', w: '4%' }] : []),
    { key: 'pcs', label: 'PCS', w: '3%' },
    { key: 'mcValue', label: 'MCValue', w: '5%' },
    { key: 'mct', label: 'MCType', w: '5%' },
    { key: 'bags', label: 'Bags', w: '4%' },
    { key: 'box', label: 'Box', w: '4%' },
    { key: 'stone', label: 'Stone', w: '4%' },
    { key: 'metal', label: 'Metal', w: '5%' },
    { key: 'fixed', label: 'Fixed', w: '4%' },
    { key: 'amt', label: 'Amount', w: '9%' },
  ]

  const visible = candidates.filter((col) => {
    if (col.key === 'purity' && showPurityColumn) return true
    if (ratesUnfixed && rateUnfixAlways.has(col.key)) return true
    if (col.key === 'rate' && hasMetalRate) return true
    return lines.some((line) => {
      const val = cell(line, col.key, rateSlab, ratesUnfixed, slabSettings)
      return !isEmptyPdfCell(val, col.key)
    })
  })

  /** Row # uses 3%; spread remaining width evenly when purity column is on (many cols stay readable). */
  const indexColPct = 3
  const widthBudget = 100 - indexColPct
  if (showPurityColumn && visible.length > 0) {
    const each = widthBudget / visible.length
    return visible.map((col) => ({ ...col, w: `${each.toFixed(2)}%` }))
  }

  const total = visible.reduce((s, c) => s + parseFloat(c.w), 0)
  if (total <= 0) return visible
  let out = visible.map((col) => {
    const pct = (parseFloat(col.w) / total) * 100
    return { ...col, w: `${pct.toFixed(1)}%` }
  })
  const amtIdx = out.findIndex((c) => c.key === 'amt')
  if (amtIdx >= 0) {
    const minAmt = 9
    const cur = parseFloat(out[amtIdx]!.w)
    if (cur < minAmt) {
      const steal = minAmt - cur
      out[amtIdx] = { ...out[amtIdx]!, w: `${minAmt.toFixed(1)}%` }
      const others = out.filter((_, i) => i !== amtIdx)
      const oSum = others.reduce((s, c) => s + parseFloat(c.w), 0)
      if (oSum > steal) {
        out = out.map((col, i) => {
          if (i === amtIdx) return col
          const shrink = (parseFloat(col.w) / oSum) * steal
          return { ...col, w: `${Math.max(2.5, parseFloat(col.w) - shrink).toFixed(1)}%` }
        })
      }
    }
  }
  return out
}

/** Estimate line table: show SKU/metal/MC type in caps; keep currency lines as-is. */
function formatEstimatePdfTableCell(text: string, colKey: string): string {
  const s = String(text ?? '').trim()
  if (!s || s === '—') return text
  if (colKey === 'amt') return text
  return s.toLocaleUpperCase('en-IN')
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
    headerAside: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    headerDocMeta: { alignItems: 'flex-end', maxWidth: 220 },
    headerDocMetaBold: {
      fontSize: 9.5,
      fontWeight: 'bold',
      color: p.textPrimary,
      textAlign: 'right',
    },
    headerDocMetaLine: {
      fontSize: 8,
      color: p.textSecondary,
      textAlign: 'right',
      marginTop: 2,
    },
    tableTitle: {
      backgroundColor: p.accent,
      paddingVertical: 4,
      paddingHorizontal: 6,
      marginBottom: 0,
    },
    tableTitleText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
    /** Estimate only — outline title bar (saves ink vs solid accent fill). */
    estimatePage: {
      paddingTop: 24,
    },
    estimateTableTitle: {
      backgroundColor: p.pageBg,
      paddingVertical: 5,
      paddingHorizontal: 6,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: p.textPrimary,
      borderBottomWidth: 0,
    },
    estimateTableTitleText: {
      color: p.textPrimary,
      fontSize: 9,
      fontWeight: 'bold',
    },
    estimateTableOuter: {
      borderWidth: 1,
      borderColor: p.textPrimary,
    },
    estimateGridCell: {
      borderRightWidth: 0.75,
      borderBottomWidth: 0.75,
      borderColor: p.textPrimary,
    },
    headRow: {
      flexDirection: 'row',
      backgroundColor: p.cardBg,
      borderBottomWidth: 1.5,
      borderBottomColor: p.accent,
    },
    headRowGrid: {
      flexDirection: 'row',
      backgroundColor: p.cardBg,
      borderBottomWidth: 0,
    },
    headCell: {
      paddingVertical: 4,
      paddingHorizontal: 2,
      fontSize: 7,
      fontWeight: 'bold',
      color: p.textPrimary,
    },
    headCellStack: {
      paddingVertical: 2,
      paddingHorizontal: 2,
      justifyContent: 'center',
    },
    headCellStackLine: {
      fontSize: 6.5,
      fontWeight: 'bold',
      color: p.textPrimary,
      lineHeight: 1.15,
    },
    bodyRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: p.cardBorder,
    },
    bodyRowGrid: {
      flexDirection: 'row',
      borderBottomWidth: 0,
    },
    bodyRowAlt: { backgroundColor: p.cardBg },
    bodyCell: {
      paddingVertical: 3,
      paddingHorizontal: 2,
      fontSize: 6,
      fontWeight: 'bold',
      color: p.textPrimary,
      flexWrap: 'wrap',
    },
    bodyCellWrap: {
      paddingVertical: 3,
      paddingHorizontal: 2,
      justifyContent: 'flex-start',
    },
    bodyCellAmt: {
      paddingVertical: 3,
      paddingHorizontal: 1,
      fontSize: 6.5,
      color: p.textPrimary,
      fontWeight: 'bold',
      textAlign: 'right',
    },
    bodyCellAmtWrap: {
      paddingVertical: 3,
      paddingHorizontal: 1,
      justifyContent: 'center',
      alignItems: 'flex-end',
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
  slabSettings?: ResellerSlabSettings | null,
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
      if (lineShowsPartialMetalSlabPctInPdf(line, rateSlab)) return pdfPureWtDisplay(line, rateSlab)
      return '—'
    case 'purity':
      return formatErpPdfPurity(line.purity) || ''
    case 'wast':
      return String(billingWastageDisplay(line, rateSlab) || '—')
    case 'rate': {
      if (line.manualCategory === 'gift' || line.mrpMode || isPiecePricedBillLine(line)) return '—'
      const r = Number(line.ratePerGram)
      if (Number.isFinite(r) && r > 0) return String(line.ratePerGram)
      if (line.rateLocked) return ''
      return '—'
    }
    case 'mc':
      return billingMcPdfCatalogColumn(line, rateSlab, true, slabSettings)
    case 'mcR':
      return billingMcPdfSlabRColumn(line, rateSlab, slabSettings)
    case 'mct':
      return line.mc_type || '—'
    case 'mcValue': {
      if (ratesUnfixed) return ''
      const groupedMc = line.displayMcInr
      if (groupedMc != null && groupedMc > 0 && String(line.barcode || '').includes(' items')) {
        return String(Math.round(groupedMc))
      }
      const mv = computeMcValueForPdf(line, rateSlab, slabSettings)
      return mv != null ? String(mv) : '—'
    }
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
      if (line.manualCategory === 'gift' || line.mrpMode || isPiecePricedBillLine(line)) return '—'
      return line.metal_type || '—'
    case 'fixed': {
      const settings: ResellerSlabSettings =
        slabSettings ?? parseResellerSlabSettings(null)
      const v = giftMrpFixedColumnDisplay(line, rateSlab, settings)
      if (v === '' || v == null) return '—'
      return String(v)
    }
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
  customerMobile?: string | null
  ratesUnfixed?: boolean
  documentKind?: 'quote' | 'invoice'
  gstin?: string | null
  layoutMode?: ErpQuotePdfLayoutMode
  slabSettingsRaw?: unknown
  /** From Print formats → Estimate (default false). */
  showEstimatePdfPhotos?: boolean
  /** From Print formats — purity column (default false). */
  showPurityInPdf?: boolean
  /** When minus 3% silver on entry is ON — hide total discount chips on estimate PDF. */
  hideTotalDiscountOnEstimatePdf?: boolean
}

export function ErpQuotePdfDocument({
  bill,
  brandName,
  kcThemeId,
  products,
  totals,
  customerName,
  customerMobile,
  ratesUnfixed = false,
  documentKind = 'quote',
  gstin,
  layoutMode = 'detailed',
  slabSettingsRaw,
  showEstimatePdfPhotos = false,
  showPurityInPdf = false,
  hideTotalDiscountOnEstimatePdf = false,
}: ErpQuotePdfDocumentProps) {
  const palette = useMemo(() => getKcPdfPalette(kcThemeId || undefined), [kcThemeId])
  const styles = useMemo(() => buildStyles(palette), [palette])
  const rawLines = bill.lines ?? []
  const rateSlab = ((bill.session as { rateSlab?: ErpRateSlab } | null)?.rateSlab ?? 'R') as ErpRateSlab
  const slabSettings = useMemo(
    () => parseSlabSettingsFromUser(slabSettingsRaw),
    [slabSettingsRaw],
  )
  const lines = useMemo(() => {
    if (layoutMode !== 'summary') return rawLines
    return groupBillLinesForSummaryPdf(rawLines, rateSlab)
  }, [rawLines, layoutMode, rateSlab])
  const cols = useMemo(
    () => buildPdfColumns(lines, rateSlab, ratesUnfixed, slabSettings, showPurityInPdf),
    [lines, rateSlab, ratesUnfixed, slabSettings, showPurityInPdf],
  )
  const isInvoice = documentKind === 'invoice'
  const docLabel = isInvoice ? 'Tax Invoice' : 'Quotation'
  const tableTitle =
    layoutMode === 'summary'
      ? isInvoice
        ? 'Invoice summary — grouped by product'
        : 'Order summary — grouped by product'
      : isInvoice
        ? 'Invoice details — full breakdown'
        : 'Order summary — full details'
  const customerHeader = useMemo(() => {
    const name = sanitizePdfText(customerName || bill.customer_name || '').trim()
    const mobile = String(customerMobile || bill.session?.mobile || '')
      .replace(/\D/g, '')
    if (name && mobile) return `${name} / ${mobile}`
    if (name) return name
    if (mobile) return mobile
    return ''
  }, [customerName, customerMobile, bill.customer_name, bill.session?.mobile])

  const estimateBillNo = sanitizePdfText(String(bill.bill_number || '').trim())
  const estimateDate = formatErpDateDdMmYyyy(bill.created_at ?? null)

  const photoEntries = useMemo(
    () =>
      products
        .map((p, i) => ({ p, line: rawLines[i], i }))
        .filter(({ p }) => Boolean(p.pdfImageSrc)),
    [products, rawLines],
  )

  return (
    <Document>
      <Page size="A4" style={!isInvoice ? [styles.page, styles.estimatePage] : styles.page}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.brand}>{sanitizePdfText(brandName)}</Text>
            {isInvoice ? (
              <Text style={styles.sub}>
                {docLabel} {bill.bill_number}
                {customerHeader ? ` · ${customerHeader}` : ''}
                {gstin ? ` · GSTIN ${sanitizePdfText(gstin)}` : ''}
              </Text>
            ) : customerHeader ? (
              <Text style={styles.sub}>{customerHeader}</Text>
            ) : null}
          </View>
          <View style={styles.headerAside}>
            {ratesUnfixed ? (
              <View style={styles.rateUnfixBadge}>
                <Text style={styles.rateUnfixText}>RATE UNFIX</Text>
              </View>
            ) : totals.advancePaid != null && totals.advancePaid > 0 ? (
              <View style={styles.rateUnfixBadge}>
                <Text style={styles.rateUnfixText}>ADVANCE PAID</Text>
              </View>
            ) : null}
            {!isInvoice ? (
              <View style={styles.headerDocMeta}>
                {estimateBillNo ? (
                  <Text style={styles.headerDocMetaBold}>{estimateBillNo}</Text>
                ) : null}
                {estimateDate && estimateDate !== '—' ? (
                  <Text style={styles.headerDocMetaBold}>DATE : {estimateDate}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        <View style={!isInvoice ? styles.estimateTableTitle : styles.tableTitle}>
          <Text style={!isInvoice ? styles.estimateTableTitleText : styles.tableTitleText}>
            {tableTitle}
          </Text>
        </View>
        <View style={!isInvoice ? styles.estimateTableOuter : undefined}>
          <View style={!isInvoice ? styles.headRowGrid : styles.headRow}>
            <Text
              style={[
                styles.headCell,
                { width: '3%' },
                ...(!isInvoice ? [styles.estimateGridCell, { fontSize: 8 }] : []),
              ]}
            >
              #
            </Text>
            {cols.map((c) =>
              c.key === 'mcValue' ? (
                <View
                  key={c.key}
                  style={[
                    styles.headCellStack,
                    { width: c.w },
                    ...(!isInvoice ? [styles.estimateGridCell] : []),
                  ]}
                >
                  <Text style={[styles.headCellStackLine, ...(!isInvoice ? [{ fontSize: 7.5 }] : [])]}>
                    MC
                  </Text>
                  <Text style={[styles.headCellStackLine, ...(!isInvoice ? [{ fontSize: 7.5 }] : [])]}>
                    Value
                  </Text>
                </View>
              ) : (
                <Text
                  key={c.key}
                  style={[
                    styles.headCell,
                    { width: c.w },
                    ...(c.key === 'purity' ? [{ textAlign: 'center' as const }] : []),
                    ...(!isInvoice ? [styles.estimateGridCell, { fontSize: 8 }] : []),
                  ]}
                >
                  {c.label}
                </Text>
              ),
            )}
          </View>
          {lines.map((line, i) => (
            <View
              key={`row-${i}`}
              wrap={false}
              style={[
                !isInvoice ? styles.bodyRowGrid : styles.bodyRow,
                i % 2 === 1 ? styles.bodyRowAlt : {},
              ]}
            >
              <Text
                style={[
                  styles.bodyCell,
                  { width: '3%' },
                  ...(!isInvoice ? [styles.estimateGridCell, { fontSize: 7 }] : []),
                ]}
              >
                {i + 1}
              </Text>
              {cols.map((c) => {
                const raw = sanitizePdfText(cell(line, c.key, rateSlab, ratesUnfixed, slabSettings))
                const text = !isInvoice ? formatEstimatePdfTableCell(raw, c.key) : raw
                const dense = c.key === 'barcode' || c.key === 'sku' || c.key === 'style' || c.key === 'name'
                const centered = c.key === 'purity' || c.key === 'pcs' || c.key === 'wast'
                return (
                  <View
                    key={c.key}
                    style={[
                      c.key === 'amt' ? styles.bodyCellAmtWrap : styles.bodyCellWrap,
                      { width: c.w },
                      ...(!isInvoice ? [styles.estimateGridCell] : []),
                    ]}
                  >
                    <Text
                      style={[
                        c.key === 'amt' ? styles.bodyCellAmt : styles.bodyCell,
                        ...(dense
                          ? [{ fontSize: !isInvoice ? 6.5 : 5.5, lineHeight: 1.15 }]
                          : !isInvoice
                            ? [{ fontSize: 7 }]
                            : []),
                        ...(centered ? [{ textAlign: 'center' as const }] : []),
                      ]}
                    >
                      {text}
                    </Text>
                  </View>
                )
              })}
            </View>
          ))}
        </View>

        <View style={styles.summaryWrap}>
          {[
            { label: 'Items', value: String(totals.count) },
            { label: 'Total weight', value: `${totals.weight.toFixed(2)}g` },
            ...(ratesUnfixed
              ? []
              : [
                  { label: 'Subtotal', value: moneyOrBlank(false, totals.subtotal) },
                  ...(totals.gst > 0
                    ? [{ label: 'GST (3%)', value: moneyOrBlank(false, totals.gst) }]
                    : []),
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
          {!hideTotalDiscountOnEstimatePdf && !ratesUnfixed && totals.mcDiscount != null && totals.mcDiscount > 0 ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>MC discount</Text>
              <Text style={styles.summaryValue}>
                Rs.{Math.round(totals.mcDiscount).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}
          {!hideTotalDiscountOnEstimatePdf && !ratesUnfixed && totals.billingDiscount != null && totals.billingDiscount !== 0 ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>Total discount</Text>
              <Text style={styles.summaryValue}>
                Rs.{Math.round(totals.billingDiscount).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : !hideTotalDiscountOnEstimatePdf && !ratesUnfixed && totals.mcDiscount != null && totals.mcDiscount > 0 ? (
            <View style={styles.summaryChip}>
              <Text style={styles.summaryLabel}>Total discount</Text>
              <Text style={styles.summaryValue}>
                Rs.{Math.round(totals.mcDiscount).toLocaleString('en-IN')}
              </Text>
            </View>
          ) : null}
          {!ratesUnfixed && totals.paymentMethod ? (
            <>
              {shouldShowPaymentModeOnEstimatePdf(totals.paymentMethod) ? (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryLabel}>Payment mode</Text>
                  <Text style={styles.summaryValue}>{paymentMethodPdfLabel(totals.paymentMethod)}</Text>
                </View>
              ) : null}
              {totals.collectedAmount != null && totals.collectedAmount > 0 ? (
                <View style={styles.summaryChip}>
                  <Text style={styles.summaryLabel}>Collected</Text>
                  <Text style={styles.summaryValue}>
                    Rs.{Math.round(totals.collectedAmount).toLocaleString('en-IN')}
                  </Text>
                </View>
              ) : null}
              {totals.paymentMethod === 'mixed' ? (
                <>
                  {totals.mixedCash != null && totals.mixedCash > 0 ? (
                    <View style={styles.summaryChip}>
                      <Text style={styles.summaryLabel}>Cash</Text>
                      <Text style={styles.summaryValue}>
                        Rs.{Math.round(totals.mixedCash).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ) : null}
                  {totals.mixedOnline != null && totals.mixedOnline > 0 ? (
                    <View style={styles.summaryChip}>
                      <Text style={styles.summaryLabel}>Online</Text>
                      <Text style={styles.summaryValue}>
                        Rs.{Math.round(totals.mixedOnline).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ) : null}
                  {totals.mixedCard != null && totals.mixedCard > 0 ? (
                    <View style={styles.summaryChip}>
                      <Text style={styles.summaryLabel}>Card</Text>
                      <Text style={styles.summaryValue}>
                        Rs.{Math.round(totals.mixedCard).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {!ratesUnfixed ? (
            <View style={styles.summaryNet}>
              <Text style={styles.summaryLabel}>Net total</Text>
              <Text style={styles.summaryNetValue}>{moneyOrBlank(false, totals.net)}</Text>
            </View>
          ) : null}
        </View>

        {showEstimatePdfPhotos && photoEntries.length > 0 ? (
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

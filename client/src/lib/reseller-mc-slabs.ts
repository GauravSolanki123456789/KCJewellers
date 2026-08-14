import type { SharedCatalogPublicProduct } from '@/lib/shared-catalog-api'

export type UploadedMcSlabRow = {
  sku: string
  styleCode: string
  wtFrom: number
  wtTo: number
  mcType: string
  metalType?: string | null
  rates: Record<string, number>
}

export type UploadedMcSlabOption = {
  key: string
  label: string
}

export type UploadedMcLookup = {
  mc: number
  mcType: string
  slabKey: string
}

export const UPLOADED_MC_SLAB_LABELS: Record<string, string> = {
  slab_c: 'Slab C',
  slab_c1: 'Slab C1',
  slab_1: 'Slab 1',
  slab_2: 'Slab 2',
  slab_3: 'Slab 3',
  slab_r1: 'Slab R1',
  slab_r: 'Slab R',
  r_quote: 'R Quote',
}

function normKey(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function parseWeightGm(product: SharedCatalogPublicProduct | null | undefined): number | null {
  if (!product) return null
  const net = Number(product.net_weight)
  if (Number.isFinite(net) && net > 0) return net
  const gross = Number(product.gross_weight)
  if (Number.isFinite(gross) && gross > 0) return gross
  const wd = String(product.weight_display || '').replace(/[^\d.]/g, '')
  const parsed = Number(wd)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function normCatalogKey(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
}

function isSkuWildcard(rowSku: string): boolean {
  const t = normKey(rowSku)
  return !t || t === 'ALL' || t === '*' || t === 'ANY' || t === 'ALL SKUS' || t === 'ALL SKU'
}

function skuMatches(rowSku: string, product: SharedCatalogPublicProduct): boolean {
  if (isSkuWildcard(rowSku)) return true
  const target = normKey(rowSku)
  if (!target) return false
  const candidates = [
    product.subcategory_name,
    product.subcategory_slug,
    product.sku,
    product.design_group,
    product.barcode,
  ]
    .map((x) => normKey(String(x ?? '')))
    .filter(Boolean)
  return candidates.some((c) => c === target || c.includes(target) || target.includes(c))
}

function styleMatches(rowStyle: string, product: SharedCatalogPublicProduct): boolean {
  const target = normCatalogKey(rowStyle)
  if (!target) return false
  const styleSlug = String(rowStyle || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
  const subSlug = String(product.subcategory_slug || '').trim().toLowerCase()
  if (styleSlug && subSlug && subSlug.includes(styleSlug)) return true

  const candidates = [
    product.style_name,
    product.subcategory_name,
    product.subcategory_slug,
    product.design_group,
  ]
    .map((x) => normCatalogKey(String(x ?? '')))
    .filter(Boolean)
  return candidates.some((c) => c === target || c.includes(target) || target.includes(c))
}

function metalMatches(rowMetal: string | null | undefined, product: SharedCatalogPublicProduct): boolean {
  if (!rowMetal) return true
  const rm = normKey(rowMetal)
  const pm = normKey(String(product.metal_type || 'silver'))
  if (rm === 'SILVER') return pm.includes('SILVER')
  if (rm === 'GOLD') return pm.includes('GOLD')
  return pm.includes(rm) || rm.includes(pm)
}

export function lookupUploadedMcRate(
  rows: UploadedMcSlabRow[] | null | undefined,
  product: SharedCatalogPublicProduct | null | undefined,
  slabKey: string | null | undefined,
): UploadedMcLookup | null {
  const key = String(slabKey || '').trim().toLowerCase()
  if (!key || !rows?.length || !product) return null
  const weight = parseWeightGm(product)
  if (weight == null) return null

  let best: UploadedMcLookup | null = null
  let bestScore = -1

  for (const row of rows) {
    if (!styleMatches(row.styleCode, product)) continue
    if (!skuMatches(row.sku, product)) continue
    if (!metalMatches(row.metalType, product)) continue
    if (weight < row.wtFrom || weight > row.wtTo) continue
    const mc = row.rates?.[key]
    if (mc == null || !Number.isFinite(Number(mc))) continue

    let score = 0
    if (!isSkuWildcard(row.sku)) score += 100
    const span = Math.max(0.001, row.wtTo - row.wtFrom)
    score += Math.max(0, 50 - Math.min(span, 50))

    if (score > bestScore) {
      bestScore = score
      best = {
        mc: Number(mc),
        mcType: row.mcType || 'MC/GM',
        slabKey: key,
      }
    }
  }
  return best
}

export function slabOptionsFromUploadedRows(rows: UploadedMcSlabRow[]): UploadedMcSlabOption[] {
  const keys = Object.keys(UPLOADED_MC_SLAB_LABELS)
  return keys
    .filter((key) => rows.some((row) => row.rates?.[key] != null))
    .map((key) => ({ key, label: UPLOADED_MC_SLAB_LABELS[key] || key }))
}

/** Parse Excel sheet rows (header + data) into validated slab rows — client-side before PUT. */
export function parseMcSlabSheetRows(sheetRows: unknown[][]): {
  rows: UploadedMcSlabRow[]
  slabOptions: UploadedMcSlabOption[]
} {
  if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
    throw new Error('Excel must have a header row and at least one data row')
  }

  const headerRow = sheetRows[0].map((c) => String(c ?? '').trim())
  const normHeader = (h: string) =>
    h
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
  const map = new Map<string, number>()
  headerRow.forEach((h, i) => {
    const k = normHeader(h)
    if (k) map.set(k, i)
  })

  const col = (...names: string[]) => {
    for (const name of names) {
      const idx = map.get(normHeader(name))
      if (idx != null) return idx
    }
    return -1
  }

  const iSku = col('SKU')
  const iStyle = col('STYLECODE', 'STYLE CODE', 'STYLE_CODE')
  const iFrom = col('WT_FROM', 'WT FROM')
  const iTo = col('WT_TO', 'WT TO')
  const iMcType = col('MCTYPE', 'MC TYPE')
  const iMetal = col('METALTYPE', 'METAL TYPE')

  if (iSku < 0 || iStyle < 0 || iFrom < 0 || iTo < 0) {
    throw new Error('Missing required columns: SKU, StyleCode, WT_FROM, WT_TO')
  }

  const slabColByKey = new Map<string, number>()
  headerRow.forEach((h, i) => {
    const nh = normHeader(h)
    for (const [key, label] of Object.entries(UPLOADED_MC_SLAB_LABELS)) {
      if (nh === normHeader(label) || nh === normHeader(key.replace(/_/g, ' '))) {
        slabColByKey.set(key, i)
      }
    }
    if (nh === 'R QUOTE') slabColByKey.set('r_quote', i)
  })

  if (slabColByKey.size === 0) {
    throw new Error('No slab columns found (e.g. SLAB C, SLAB 2, SLAB R)')
  }

  const parseNum = (v: unknown) => {
    if (v == null || v === '') return null
    const n = Number(String(v).replace(/,/g, '').trim())
    return Number.isFinite(n) ? n : null
  }

  const rows: UploadedMcSlabRow[] = []
  for (let r = 1; r < sheetRows.length; r++) {
    const line = sheetRows[r]
    if (!line?.length) continue
    const sku = String(line[iSku] ?? '').trim()
    const styleCode = String(line[iStyle] ?? '').trim()
    const wtFrom = parseNum(line[iFrom])
    const wtTo = parseNum(line[iTo])
    if (!sku || !styleCode || wtFrom == null || wtTo == null) continue

    const rates: Record<string, number> = {}
    for (const [key, colIdx] of slabColByKey.entries()) {
      const v = parseNum(line[colIdx])
      if (v != null) rates[key] = v
    }
    if (Object.keys(rates).length === 0) continue

    rows.push({
      sku,
      styleCode,
      wtFrom,
      wtTo,
      mcType: iMcType >= 0 ? String(line[iMcType] ?? '').trim() || 'MC/GM' : 'MC/GM',
      metalType: iMetal >= 0 ? String(line[iMetal] ?? '').trim() || null : null,
      rates,
    })
  }

  if (rows.length === 0) {
    throw new Error('No valid rows — check SKU, StyleCode, weights, and slab columns')
  }

  return { rows, slabOptions: slabOptionsFromUploadedRows(rows) }
}

export function formatUploadedMcDisplay(lookup: UploadedMcLookup | null): {
  mcLine: string | null
  mcTypeLine: string | null
} {
  if (!lookup) return { mcLine: null, mcTypeLine: null }
  return {
    mcLine: `MC: ${lookup.mc}`,
    mcTypeLine: `MCTYPE: ${lookup.mcType}`,
  }
}

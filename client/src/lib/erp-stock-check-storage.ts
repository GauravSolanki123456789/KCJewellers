export type StockCheckScopeBarcode = {
  barcode: string
  sku?: string | null
  style_code?: string | null
  product_name?: string | null
  size?: string | null
  /** Net / billable weight (g) from stock piece */
  avg_weight?: number | null
  gross_weight?: number | null
  floor_name?: string | null
  box_code?: string | null
}

export type StockCheckScanRow = {
  id: string
  barcode: string
  found: boolean
  sku?: string | null
  product_name?: string | null
  weight_gm?: number | null
  scannedAt: number
}

export type StockCheckDraft = {
  id: string
  name: string
  savedAt: string
  scopeLabel: string
  scopeBarcodes: StockCheckScopeBarcode[]
  scans: StockCheckScanRow[]
}

export type StockCheckArchive = {
  id: string
  label: string
  finishedAt: string
  scopeCount: number
  scopeBarcodes: StockCheckScopeBarcode[]
  scans: StockCheckScanRow[]
  stats: {
    uniqueFound: number
    uniqueMissing: number
    notInScope: number
  }
}

export type StockCheckWorkspacePersist = {
  selectedFloorIds: string[]
  selectedBoxIds: string[]
  scopeAll: boolean
  scopeBarcodes: StockCheckScopeBarcode[]
  scopeLoaded: boolean
  scopeLabel: string
  scans: StockCheckScanRow[]
}

const WORKSPACE_KEY = 'kc-stock-check-workspace-v2'
const DRAFTS_KEY = 'kc-stock-check-drafts-v2'
const ARCHIVE_KEY = 'kc-stock-check-archive-v2'

export function loadWorkspacePersist(): StockCheckWorkspacePersist | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WORKSPACE_KEY)
    return raw ? (JSON.parse(raw) as StockCheckWorkspacePersist) : null
  } catch {
    return null
  }
}

export function saveWorkspacePersist(data: StockCheckWorkspacePersist) {
  sessionStorage.setItem(WORKSPACE_KEY, JSON.stringify(data))
}

export function loadDrafts(): StockCheckDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    return raw ? (JSON.parse(raw) as StockCheckDraft[]) : []
  } catch {
    return []
  }
}

export function saveDrafts(list: StockCheckDraft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(0, 80)))
}

export function loadArchive(): StockCheckArchive[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    return raw ? (JSON.parse(raw) as StockCheckArchive[]) : []
  } catch {
    return []
  }
}

export function saveArchive(list: StockCheckArchive[]) {
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 80)))
}

export function uniqueScans(rows: StockCheckScanRow[]): StockCheckScanRow[] {
  const seen = new Set<string>()
  const out: StockCheckScanRow[] = []
  for (const s of rows) {
    if (seen.has(s.barcode)) continue
    seen.add(s.barcode)
    out.push(s)
  }
  return out
}

/** Weight (g) used in reports — prefers net avg_weight, then gross. */
export function stockCheckPieceWeightGm(meta: Pick<StockCheckScopeBarcode, 'avg_weight' | 'gross_weight'>): number {
  const avg = meta.avg_weight != null ? Number(meta.avg_weight) : NaN
  if (Number.isFinite(avg) && avg > 0) return avg
  const gross = meta.gross_weight != null ? Number(meta.gross_weight) : NaN
  if (Number.isFinite(gross) && gross > 0) return gross
  return 0
}

export function formatStockCheckWeightGm(w: number): string {
  if (!Number.isFinite(w) || w <= 0) return '0.000'
  return w.toFixed(3)
}

export type StockCheckWeightSummary = {
  totalScopeGm: number
  scannedGm: number
  pendingGm: number
}

export function computeStockCheckWeightSummary(
  scopeBarcodes: Map<string, StockCheckScopeBarcode> | StockCheckScopeBarcode[],
  scans: StockCheckScanRow[],
): StockCheckWeightSummary {
  const rows = scopeBarcodes instanceof Map ? [...scopeBarcodes.values()] : scopeBarcodes
  const scannedSet = new Set(
    uniqueScans(scans)
      .filter((s) => s.found)
      .map((s) => s.barcode.toUpperCase()),
  )
  let totalScopeGm = 0
  let scannedGm = 0
  let pendingGm = 0
  for (const meta of rows) {
    const code = String(meta.barcode || '').trim().toUpperCase()
    const w = stockCheckPieceWeightGm(meta)
    totalScopeGm += w
    if (scannedSet.has(code)) scannedGm += w
    else pendingGm += w
  }
  return {
    totalScopeGm: Math.round(totalScopeGm * 1000) / 1000,
    scannedGm: Math.round(scannedGm * 1000) / 1000,
    pendingGm: Math.round(pendingGm * 1000) / 1000,
  }
}

export function mergeScopeMaps(
  existing: Map<string, StockCheckScopeBarcode>,
  incoming: StockCheckScopeBarcode[],
): Map<string, StockCheckScopeBarcode> {
  const map = new Map(existing)
  for (const row of incoming) {
    const code = String(row.barcode || '').trim().toUpperCase()
    if (code) map.set(code, { ...row, barcode: code })
  }
  return map
}

export function scopeToArray(map: Map<string, StockCheckScopeBarcode>): StockCheckScopeBarcode[] {
  return [...map.values()]
}

export function scopeFromArray(rows: StockCheckScopeBarcode[]): Map<string, StockCheckScopeBarcode> {
  const map = new Map<string, StockCheckScopeBarcode>()
  for (const row of rows) {
    const code = String(row.barcode || '').trim().toUpperCase()
    if (code) map.set(code, row)
  }
  return map
}

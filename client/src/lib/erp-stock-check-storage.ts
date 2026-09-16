export type StockCheckScopeBarcode = {
  barcode: string
  sku?: string | null
  style_code?: string | null
  product_name?: string | null
  size?: string | null
  floor_name?: string | null
  box_code?: string | null
}

export type StockCheckScanRow = {
  id: string
  barcode: string
  found: boolean
  sku?: string | null
  product_name?: string | null
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

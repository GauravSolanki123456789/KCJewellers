/**
 * `orders.items_snapshot_json` — lines saved at checkout from `web_products` + cart.
 * Server sets: barcode, sku, item_name, style_code, image_url, metal_type, net_wt_g?, qty, price, breakdown.
 * Legacy rows may omit fields; parser fills display fallbacks.
 */

export type OrderSnapshotLine = {
  barcode?: string
  sku?: string | null
  item_name?: string
  /** Category / style label from catalogue */
  style_code?: string | null
  image_url?: string | null
  metal_type?: string | null
  net_wt_g?: number | null
  qty?: number
  price?: number
  breakdown?: unknown
  /** legacy */
  name?: string
}

export function parseOrderItemsSnapshot(raw: unknown): OrderSnapshotLine[] {
  let arr: unknown = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(arr)) return []
  return arr.map((row): OrderSnapshotLine => {
    if (!row || typeof row !== 'object') {
      return { item_name: 'Item', qty: 1, price: 0 }
    }
    const r = row as Record<string, unknown>
    const nameField = String(r.name ?? '').trim()
    let title = String(r.item_name ?? '').trim()
    if (!title || title === 'Item') title = nameField || title
    if (!title) title = String(r.short_name ?? '').trim()
    if (!title) title = 'Item'
    const bc = r.barcode ?? r.sku ?? ''
    const barcode = bc != null && String(bc).trim() !== '' ? String(bc).trim() : ''
    let net_wt_g: number | null = null
    if (r.net_wt_g != null && r.net_wt_g !== '') {
      const n = Number(r.net_wt_g)
      if (!Number.isNaN(n)) net_wt_g = n
    }
    return {
      barcode,
      sku: r.sku != null ? String(r.sku) : null,
      item_name: title,
      style_code: r.style_code != null ? String(r.style_code) : null,
      image_url: r.image_url != null ? String(r.image_url) : null,
      metal_type: r.metal_type != null ? String(r.metal_type) : null,
      net_wt_g,
      qty: Math.max(1, Math.floor(Number(r.qty) || 1)),
      price: Number(r.price) || 0,
      breakdown: r.breakdown,
    }
  })
}

export function snapshotItemsQtySum(lines: OrderSnapshotLine[]): number {
  return lines.reduce((s, i) => s + (Number(i.qty) || 1), 0)
}

export function snapshotLineTitle(line: OrderSnapshotLine): string {
  return line.item_name?.trim() || 'Item'
}

/**
 * `orders.items_snapshot_json` — lines saved at checkout from `web_products` + cart.
 * Server sets: barcode, sku, item_name, style_code, image_url, metal_type, net_wt_g?, qty, price, breakdown.
 * Legacy rows may omit fields; parser fills display fallbacks.
 */

export type OrderSnapshotLine = {
  /** `web_products.id` when present — used to enrich legacy snapshots server-side */
  product_id?: number
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
  /** Cart / Razorpay payloads */
  target_id?: string
  metadata?: { product_name?: string }
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
    const meta =
      r.metadata && typeof r.metadata === 'object'
        ? (r.metadata as Record<string, unknown>)
        : null
    const metaName = meta ? String(meta.product_name ?? '').trim() : ''
    const nameField = String(r.name ?? '').trim()
    let title = String(r.item_name ?? '').trim()
    if (!title || title === 'Item') title = nameField || title
    if (!title) title = metaName
    if (!title) title = String(r.short_name ?? '').trim()
    if (!title) title = String(r.sku ?? '').trim()
    if (!title) title = String(r.target_id ?? '').trim()
    if (!title) title = 'Item'
    const bc = r.barcode ?? r.sku ?? r.target_id ?? ''
    let barcode = bc != null && String(bc).trim() !== '' ? String(bc).trim() : ''
    if (!barcode) {
      const tid = r.target_id != null ? String(r.target_id).trim() : ''
      if (tid) barcode = tid
    }
    if (!barcode && r.sku != null) {
      const sk = String(r.sku).trim()
      if (sk) barcode = sk
    }
    let net_wt_g: number | null = null
    const nwRaw = r.net_wt_g ?? r.net_weight ?? r.net_wt ?? r.weight
    if (nwRaw != null && nwRaw !== '') {
      const n = Number(nwRaw)
      if (!Number.isNaN(n)) net_wt_g = n
    }
    const productIdRaw = r.product_id
    let product_id: number | undefined
    if (productIdRaw != null && productIdRaw !== '') {
      const pi = Number(productIdRaw)
      if (!Number.isNaN(pi) && pi > 0) product_id = pi
    }
    return {
      ...(product_id != null ? { product_id } : {}),
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
  const n = line.item_name?.trim()
  if (n && n !== 'Item') return n
  const sku = line.sku?.trim()
  if (sku) return sku
  const bc = line.barcode?.trim()
  if (bc) return bc
  const st = line.style_code?.trim()
  if (st) return st
  return 'Item'
}

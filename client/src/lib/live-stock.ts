/** Customer-facing stock label from uploaded PCS / web_products.quantity. */
export function formatLiveStockLabel(qty: number): string {
  const q = Math.max(0, Math.floor(Number(qty) || 0))
  if (q <= 0) return 'Make on order'
  if (q === 1) return '1 pc available'
  if (q <= 3) return `Only ${q} pcs available`
  return `Quantity: ${q}`
}

export function parseProductStockQty(raw: unknown): number {
  const n = parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

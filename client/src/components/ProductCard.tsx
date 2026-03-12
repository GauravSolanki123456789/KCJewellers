'use client'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, type Item } from '@/lib/pricing'

type ProductCardProps = { product: Item; rates?: unknown[] }

export default function ProductCard({ product, rates = [] }: ProductCardProps) {
  const cart = useCart()
  const displayName = (product as { name?: string }).name || product.item_name || product.short_name || 'Item'
  const weight = product.net_wt || product.net_weight || product.weight
  const identifier = product.barcode || product.sku || String(product.id || '')
  const { total } = calculateBreakdown(product, rates, product.gst_rate ?? 3)

  return (
    <Link href={`/products/${encodeURIComponent(identifier)}`} className="rounded-xl bg-slate-800/50 border border-white/10 hover:border-yellow-500/30 p-3 flex flex-col gap-2 transition-all overflow-hidden">
      <div className="aspect-square rounded-lg bg-slate-800/80 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl text-yellow-500/40 font-bold">{displayName.charAt(0)}</span>
        )}
      </div>
      <div className="text-sm text-slate-500 truncate">{(product as { style_code?: string }).style_code || product.sku || ''}</div>
      <div className="text-base font-semibold text-slate-200 line-clamp-2">{displayName}</div>
      {weight != null && <div className="text-sm text-slate-400">Wt: {weight} gm</div>}
      <div className="text-yellow-500/90 font-medium tabular-nums">
        ₹{Math.round(total).toLocaleString('en-IN')}
        <span className="ml-1 text-xs text-slate-500 font-normal">incl. GST</span>
      </div>
      <button
        className="mt-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-slate-950 rounded-lg text-sm font-medium transition-colors"
        onClick={(e) => {
          e.preventDefault()
          cart.add(product)
        }}
      >
        Add to Cart
      </button>
    </Link>
  )
}

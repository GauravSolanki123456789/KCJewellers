'use client'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { calculateBreakdown, type Item } from '@/lib/pricing'

type ProductCardProps = { product: Item; rates?: unknown[] }

export default function ProductCard({ product, rates = [] }: ProductCardProps) {
  const cart = useCart()
  const weight = product.net_wt || product.net_weight || product.weight
  const identifier = product.barcode || product.sku || String(product.id || '')
  const styleCode = (product as { style_code?: string }).style_code || product.sku || ''
  const { total } = calculateBreakdown(product, rates, product.gst_rate ?? 3)

  return (
    <Link
      href={`/products/${encodeURIComponent(identifier)}`}
      className="group flex flex-col rounded-xl overflow-hidden bg-slate-900 border border-white/8 hover:border-amber-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5"
    >
      {/* Image area — object-contain so the full product photo is visible */}
      <div className="relative aspect-square bg-white dark:bg-slate-950 overflow-hidden rounded-t-xl">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={identifier}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-900">
            <span className="text-5xl font-bold text-amber-500/20">
              {(styleCode || identifier).charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Details panel */}
      <div className="flex flex-col gap-1 p-3 flex-1">
        {styleCode && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            {styleCode}
          </p>
        )}

        {/* Barcode as primary identifier */}
        <p className="text-sm font-bold text-slate-100 tracking-tight truncate">
          {identifier}
        </p>

        {weight != null && (
          <p className="text-xs text-slate-400">Wt: {weight} gm</p>
        )}

        <p className="text-base font-medium text-amber-500 tabular-nums mt-auto pt-1">
          ₹{Math.round(total).toLocaleString('en-IN')}
          <span className="ml-1 text-[10px] text-slate-500 font-normal">incl. GST</span>
        </p>

        <button
          className="mt-2 w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 text-xs font-semibold transition-colors duration-200"
          onClick={(e) => {
            e.preventDefault()
            cart.add(product)
          }}
        >
          Add to Cart
        </button>
      </div>
    </Link>
  )
}

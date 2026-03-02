'use client'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'
import { type Item } from '@/lib/pricing'

export default function ProductCard({ product }: { product: Item }) {
  const cart = useCart()
  const displayName = product.item_name || product.short_name || 'Item'
  const weight = product.net_wt || product.net_weight || product.weight
  const identifier = product.barcode || String(product.id || '')
  
  return (
    <Link href={`/products/${encodeURIComponent(identifier)}`} className="glass-card p-3 flex flex-col gap-2">
      <div className="text-sm opacity-80">{product.style_code || product.sku || 'Item'}</div>
      <div className="text-lg font-semibold">{displayName}</div>
      {weight != null && <div className="text-sm">Wt: {weight} gm</div>}
      <div className="mt-2">
        <button 
          className="px-3 py-1 gold-bg text-black rounded" 
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

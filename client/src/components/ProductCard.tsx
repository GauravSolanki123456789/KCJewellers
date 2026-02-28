'use client'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'

export default function ProductCard({ product }: { product: any }) {
  const cart = useCart()
  return (
    <Link href={`/products/${encodeURIComponent(product.barcode || product.id)}`} className="glass-card p-3 flex flex-col gap-2">
      <div className="text-sm opacity-80">{product.style_code || product.sku || 'Item'}</div>
      <div className="text-lg font-semibold">{product.item_name || product.short_name}</div>
      <div className="text-sm">Wt: {product.net_wt || product.weight} gm</div>
      <div className="mt-2">
        <button className="px-3 py-1 gold-bg text-black rounded" onClick={(e) => { e.preventDefault(); cart.add(product) }}>Add to Cart</button>
      </div>
    </Link>
  )
}

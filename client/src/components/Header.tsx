'use client'
import Link from 'next/link'
import { useCart } from '@/context/CartContext'

export default function Header() {
  const { items, openCart } = useCart()
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  return (
    <div className="flex items-center justify-between p-4">
      <Link href="/" className="text-xl font-bold gold-text">KC Jewellers</Link>
      <div className="flex items-center gap-3">
        <Link href="/category/gold" className="text-sm">Gold</Link>
        <Link href="/category/silver" className="text-sm">Silver</Link>
        <Link href="/category/gifts" className="text-sm">Gifts</Link>
        <button type="button" onClick={openCart} className="glass-card px-3 py-1">🛒 {count}</button>
      </div>
    </div>
  )
}

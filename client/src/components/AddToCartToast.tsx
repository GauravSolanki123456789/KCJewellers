'use client'

import { useEffect, useState } from 'react'
import { useCart } from '@/context/CartContext'
import { ShoppingBag, X } from 'lucide-react'

export default function AddToCartToast() {
  const { lastAdded, clearLastAdded } = useCart()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (lastAdded) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        clearLastAdded()
      }, 2500)
      return () => clearTimeout(timer)
    }
  }, [lastAdded, clearLastAdded])

  if (!lastAdded || !visible) return null

  const name = lastAdded.item_name || lastAdded.short_name || 'Item'

  return (
    <div className="fixed left-1/2 top-14 z-[9998] -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300 md:top-4">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/95 backdrop-blur-md border border-amber-500/30 shadow-xl shadow-black/30 min-w-[280px] max-w-[90vw]">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <ShoppingBag className="size-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-100 text-sm">Added to cart</p>
          <p className="text-slate-400 text-xs truncate">{name}</p>
        </div>
        <button
          onClick={() => {
            setVisible(false)
            clearLastAdded()
          }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

'use client'
import '@/lib/axios'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { subscribeLiveRates } from '@/lib/socket'
import { calculateBreakdown } from '@/lib/pricing'

type ProductLite = { barcode?: string, id?: string, gst_rate?: number }
type CartItem = { id: string, item: ProductLite, qty: number, price: number, breakdown: unknown }

const CartCtx = createContext<{
  items: CartItem[]
  add: (p: ProductLite) => void
  remove: (id: string) => void
  setQty: (id: string, qty: number) => void
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
}>({ items: [], add: () => {}, remove: () => {}, setQty: () => {}, isCartOpen: false, openCart: () => {}, closeCart: () => {} })

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [items, setItems] = useState<CartItem[]>(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('cart.v1') : null
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.map((ci: any) => {
        const id = String(ci?.id || '')
        const qty = Math.max(1, Number(ci?.qty || 1))
        const price = Number(ci?.price || 0)
        const item: ProductLite = ci?.item ?? {}
        const breakdown: unknown = ci?.breakdown ?? {}
        return { id, qty, price, item, breakdown }
      }).filter((ci: CartItem) => ci.id)
    } catch {
      return []
    }
  })
  const [lastRates, setLastRates] = useState<unknown[]>([])
  useEffect(() => {
    localStorage.setItem('cart.v1', JSON.stringify(items))
  }, [items])
  useEffect(() => {
    const off = subscribeLiveRates((p) => {
      const rates = p?.rates || []
      setLastRates(rates)
      setItems(prev => prev.map(ci => {
        const b = calculateBreakdown(ci.item as any, rates, ci.item.gst_rate)
        const delta = Math.abs(b.total - ci.price) / (ci.price || 1)
        if (delta > 0.02) return { ...ci, price: b.total, breakdown: b }
        return ci
      }))
    })
    return off
  }, [])
  const add = useCallback((p: ProductLite) => {
    const b = calculateBreakdown(p as any, lastRates, p.gst_rate)
    const ci: CartItem = { id: String(p.barcode || p.id), item: p, qty: 1, price: b.total, breakdown: b }
    setItems(prev => {
      const exists = prev.find(x => x.id === ci.id)
      if (exists) {
        const updated = { ...exists, qty: exists.qty + 1 }
        const freshB = calculateBreakdown(exists.item as any, lastRates, exists.item.gst_rate)
        updated.price = freshB.total
        updated.breakdown = freshB
        return prev.map(x => x.id === ci.id ? updated : x)
      }
      return [...prev, ci]
    })
  }, [lastRates])
  const remove = useCallback((id: string) => setItems(prev => prev.filter(x => x.id !== id)), [])
  const setQty = useCallback((id: string, qty: number) => {
    const n = Math.max(1, qty)
    setItems(prev => prev.map(x => x.id === id ? { ...x, qty: n } : x))
  }, [])
  const openCart = useCallback(() => setIsCartOpen(true), [])
  const closeCart = useCallback(() => setIsCartOpen(false), [])
  const value = useMemo(() => ({ items, add, remove, setQty, isCartOpen, openCart, closeCart }), [items, add, remove, setQty, isCartOpen, openCart, closeCart])
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>
}

export function useCart() {
  return useContext(CartCtx)
}

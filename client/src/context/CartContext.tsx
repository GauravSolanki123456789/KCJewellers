'use client'
import '@/lib/axios'
import axios from '@/lib/axios'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { subscribeLiveRates } from '@/lib/socket'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import { CART_LOCAL_STORAGE_KEY } from '@/lib/routes'
import { ratesApiQueryForStorefront, shouldSubscribeGlobalLiveRates } from '@/lib/storefront-domain'
import { KC_RATES_UPDATED_EVENT } from '@/lib/reseller-rates-events'
import { useCustomerTier } from '@/context/CustomerTierContext'
import { useCatalogPricingSettings } from '@/context/CatalogPricingSettingsContext'

/**
 * ProductLite extends Item to ensure all product fields are available in cart items.
 * This prevents type errors when accessing item_name, short_name, style_code, etc.
 */
type ProductLite = Item
type CartItem = { id: string, item: ProductLite, qty: number, price: number, breakdown: unknown }

const CartCtx = createContext<{
  items: CartItem[]
  add: (p: ProductLite) => void
  /** Set line quantity in one update (B2B bulk order). */
  addWithQty: (p: ProductLite, qty: number) => void
  remove: (id: string) => void
  setQty: (id: string, qty: number) => void
  /** Clear all lines (e.g. after WhatsApp order handoff). */
  clearAll: () => void
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
  lastAdded: ProductLite | null
  clearLastAdded: () => void
  ratesReady: boolean
}>({ items: [], add: () => {}, addWithQty: () => {}, remove: () => {}, setQty: () => {}, clearAll: () => {}, isCartOpen: false, openCart: () => {}, closeCart: () => {}, lastAdded: null, clearLastAdded: () => {}, ratesReady: false })

function loadCartFromStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  const raw = localStorage.getItem(CART_LOCAL_STORAGE_KEY)
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
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { wholesalePricing } = useCustomerTier()
  const { pricingOptions } = useCatalogPricingSettings()
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [lastAdded, setLastAdded] = useState<ProductLite | null>(null)
  const [items, setItems] = useState<CartItem[]>([])
  const [lastRates, setLastRates] = useState<unknown[]>([])
  const [ratesSource, setRatesSource] = useState<string | null>(null)
  const [ratesReady, setRatesReady] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setItems(loadCartFromStorage())
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated) return
    localStorage.setItem(CART_LOCAL_STORAGE_KEY, JSON.stringify(items))
  }, [items, isHydrated])

  const applyRates = useCallback((rates: unknown[]) => {
    setLastRates(rates)
    setRatesReady(rates.length > 0)
    setItems(prev => prev.map(ci => {
      const b = calculateBreakdown(ci.item, rates, ci.item.gst_rate, wholesalePricing, pricingOptions)
      const delta = Math.abs(b.total - ci.price) / (ci.price || 1)
      if (delta > 0.02) return { ...ci, price: b.total, breakdown: b }
      return ci
    }))
  }, [wholesalePricing, pricingOptions])

  const fetchDisplayRates = useCallback(() => {
    axios
      .get(`/api/rates/display${ratesApiQueryForStorefront()}`)
      .then((res) => {
        const rates = res.data?.rates || []
        const source = res.data?.source != null ? String(res.data.source) : null
        setRatesSource(source)
        if (rates.length > 0) applyRates(rates)
      })
      .catch(() => {})
  }, [applyRates])

  useEffect(() => {
    fetchDisplayRates()
  }, [fetchDisplayRates])

  useEffect(() => {
    const onRatesUpdated = () => fetchDisplayRates()
    window.addEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated)
    return () => window.removeEventListener(KC_RATES_UPDATED_EVENT, onRatesUpdated)
  }, [fetchDisplayRates])

  useEffect(() => {
    if (!shouldSubscribeGlobalLiveRates(ratesSource)) return
    const off = subscribeLiveRates((p) => {
      const rates = p?.rates || []
      if (rates.length > 0) applyRates(rates)
    })
    return off
  }, [applyRates, ratesSource])

  useEffect(() => {
    setItems((prev) =>
      prev.map((ci) => {
        const b = calculateBreakdown(
          ci.item,
          lastRates,
          ci.item.gst_rate,
          wholesalePricing,
          pricingOptions,
        )
        return { ...ci, price: b.total, breakdown: b }
      }),
    )
  }, [pricingOptions, wholesalePricing, lastRates])
  const add = useCallback((p: ProductLite) => {
    const b = calculateBreakdown(p, lastRates, p.gst_rate, wholesalePricing, pricingOptions)
    const ci: CartItem = { id: String(p.barcode || p.id || ''), item: p, qty: 1, price: b.total, breakdown: b }
    setLastAdded(p)
    axios.post('/api/analytics/track', {
      action_type: 'add_to_cart',
      target_id: p.barcode || p.sku || String(p.id || ''),
      metadata: { product_name: p.item_name || p.short_name || 'Product' },
    }).catch(() => {})
    setItems(prev => {
      const exists = prev.find(x => x.id === ci.id)
      if (exists) {
        const updated = { ...exists, qty: exists.qty + 1 }
        const freshB = calculateBreakdown(exists.item, lastRates, exists.item.gst_rate, wholesalePricing, pricingOptions)
        updated.price = freshB.total
        updated.breakdown = freshB
        return prev.map(x => x.id === ci.id ? updated : x)
      }
      return [...prev, ci]
    })
  }, [lastRates, wholesalePricing, pricingOptions])

  const addWithQty = useCallback((p: ProductLite, qty: number) => {
    const q = Math.max(1, Math.min(9999, Math.floor(Number(qty) || 1)))
    const id = String(p.barcode || p.id || '')
    if (!id) return
    const b = calculateBreakdown(p, lastRates, p.gst_rate, wholesalePricing, pricingOptions)
    setLastAdded(p)
    axios.post('/api/analytics/track', {
      action_type: 'add_to_cart',
      target_id: p.barcode || p.sku || String(p.id || ''),
      metadata: { product_name: p.item_name || p.short_name || 'Product', qty: q },
    }).catch(() => {})
    setItems((prev) => {
      const exists = prev.find((x) => x.id === id)
      if (exists) {
        const freshB = calculateBreakdown(exists.item, lastRates, exists.item.gst_rate, wholesalePricing, pricingOptions)
        return prev.map((x) =>
          x.id === id ? { ...x, qty: q, price: freshB.total, breakdown: freshB } : x,
        )
      }
      return [...prev, { id, item: p, qty: q, price: b.total, breakdown: b }]
    })
  }, [lastRates, wholesalePricing, pricingOptions])
  const remove = useCallback((id: string) => setItems(prev => prev.filter(x => x.id !== id)), [])
  const clearAll = useCallback(() => setItems([]), [])
  /** qty below 1 removes the line (minus at quantity 1 matches Remove). */
  const setQty = useCallback((id: string, qty: number) => {
    if (qty < 1) {
      setItems((prev) => prev.filter((x) => x.id !== id))
      return
    }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, qty } : x)))
  }, [])
  const openCart = useCallback(() => setIsCartOpen(true), [])
  const closeCart = useCallback(() => setIsCartOpen(false), [])
  const clearLastAdded = useCallback(() => setLastAdded(null), [])
  const value = useMemo(() => ({ items, add, addWithQty, remove, setQty, clearAll, isCartOpen, openCart, closeCart, lastAdded, clearLastAdded, ratesReady }), [items, add, addWithQty, remove, setQty, clearAll, isCartOpen, openCart, closeCart, lastAdded, clearLastAdded, ratesReady])
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>
}

export function useCart() {
  return useContext(CartCtx)
}

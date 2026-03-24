'use client'
import axios from "@/lib/axios"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { CATALOG_PATH, CATALOG_SCROLL_TO_KEY, CATALOG_PRODUCT_ORDER_KEY } from "@/lib/routes"
import BreakdownModal from "@/components/BreakdownModal"
import HoverZoomImage from "@/components/HoverZoomImage"
import { calculateBreakdown, getItemWeight, isDiamondItem, type Item } from "@/lib/pricing"
import { trackProductView, trackAddToCart } from "@/components/GoogleAnalytics"
import { getSocket } from "@/lib/socket"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { useCart } from "@/context/CartContext"

type RateRow = { metal_type?: string, display_rate?: number, sell_rate?: number }
export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const { id } = React.use(params)
  const [product, setProduct] = useState<Item | null>(null)
  const [open, setOpen] = useState(false)
  const [b, setB] = useState<ReturnType<typeof calculateBreakdown> | null>(null)
  const cart = useCart()
  const productRef = useRef<Item | null>(null)
  const [catalogNav, setCatalogNav] = useState<{
    prevBarcode: string | null
    nextBarcode: string | null
    position: number
    total: number
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(CATALOG_PRODUCT_ORDER_KEY)
      if (!raw) {
        setCatalogNav(null)
        return
      }
      const barcodes: string[] = JSON.parse(raw)
      if (!Array.isArray(barcodes) || barcodes.length === 0) {
        setCatalogNav(null)
        return
      }
      const current = String(id || '').trim()
      const idx = barcodes.findIndex((b) => String(b).trim() === current)
      if (idx < 0) {
        setCatalogNav(null)
        return
      }
      setCatalogNav({
        prevBarcode: idx > 0 ? String(barcodes[idx - 1]).trim() : null,
        nextBarcode: idx < barcodes.length - 1 ? String(barcodes[idx + 1]).trim() : null,
        position: idx + 1,
        total: barcodes.length,
      })
    } catch {
      setCatalogNav(null)
    }
  }, [id])

  useEffect(() => {
    const load = async () => {
      const safeId = String(id || '').slice(0, 64)
      const res = await axios.get('/api/products', { params: { barcode: safeId, limit: 1 } })
      const item = Array.isArray(res.data?.items) ? res.data.items[0] : (res.data?.[0] || null)
      setProduct(item)
      productRef.current = item
      const dr = await axios.get('/api/rates/display')
      if (item) {
        setB(calculateBreakdown(item, dr.data?.rates || []))
        trackProductView(item.barcode || String(item.id || ''), item.item_name || item.short_name || 'Product')
        // First-party analytics: view_product
        axios.post('/api/analytics/track', {
          action_type: 'view_product',
          target_id: item.barcode || item.sku || String(item.id || ''),
          metadata: { product_name: item.item_name || item.short_name || 'Product' },
        }).catch(() => {})
      }
    }
    load()
    const s = getSocket()
    const on = (p: { rates?: RateRow[] }) => {
      const cur = productRef.current
      if (cur) setB(calculateBreakdown(cur, p?.rates || []))
    }
    s.on("live-rate", on)
    return () => { s.off("live-rate", on) }
  }, [id])

  const handleBackToCatalog = useCallback(() => {
    const barcode = product?.barcode || product?.sku || String(product?.id ?? id ?? '')
    if (typeof window !== 'undefined' && barcode && barcode.length > 0) {
      try {
        sessionStorage.setItem(CATALOG_SCROLL_TO_KEY, barcode)
      } catch {
        /* ignore */
      }
    }
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const referrer = document.referrer || ''
        const origin = window.location.origin || ''
        const isInternalNav = referrer && (referrer.startsWith(origin) || referrer.includes(CATALOG_PATH))
        if (isInternalNav && window.history.length > 1) {
          router.back()
          return
        }
      }
    } catch {
      /* fall through to default */
    }
    router.push(CATALOG_PATH)
  }, [router, product, id])

  const goToProduct = useCallback(
    (barcode: string) => {
      router.push(`/products/${encodeURIComponent(barcode)}`)
    },
    [router],
  )

  useEffect(() => {
    if (!catalogNav) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft' && catalogNav.prevBarcode) {
        e.preventDefault()
        goToProduct(catalogNav.prevBarcode)
      }
      if (e.key === 'ArrowRight' && catalogNav.nextBarcode) {
        e.preventDefault()
        goToProduct(catalogNav.nextBarcode)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [catalogNav, goToProduct])

  // Breakdown recompute occurs in socket handler and after initial load
  if (!product) return <div className="min-h-screen bg-slate-950 p-4 flex items-center justify-center"><div className="text-slate-400 animate-pulse">Loading…</div></div>

  const displayName = product.item_name || product.short_name || 'Product'
  const imageUrl = product.image_url
  const styleCode = product.style_code || ''
  const sku = product.sku || product.barcode || ''
  const netWeight = getItemWeight(product)
  const purity = product.purity ?? null
  const metalType = product.metal_type ?? null
  const isDiamond = isDiamondItem(product)
  const barcode = product.barcode || product.sku || String(product.id || '')
  const hasDiscount = (b?.discountPercent ?? 0) > 0
  const thumbnails = imageUrl ? [imageUrl] : []

  const handleAddToCart = () => {
    cart.add({ ...product, id: product.id ? String(product.id) : product.barcode })
    cart.openCart()
    trackAddToCart(product.barcode || String(product.id || ''), product.item_name || product.short_name || 'Product', b?.total || 0)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="p-4 max-w-6xl mx-auto mt-8 pb-24 md:pb-8">
      <button
        type="button"
        onClick={handleBackToCatalog}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" />
        Back to Catalogue
      </button>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Left column — Image with thumbnails */}
        <div className="space-y-3">
          {catalogNav && catalogNav.total > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 md:hidden">
              <span className="tabular-nums font-medium text-slate-400">
                {catalogNav.position} / {catalogNav.total}
              </span>
              <span className="text-slate-600">in catalogue</span>
            </div>
          )}
          <div className="relative w-full aspect-square md:aspect-[4/5] bg-[#0B1120] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
            {catalogNav && catalogNav.total > 1 && (
              <>
                {catalogNav.prevBarcode && (
                  <button
                    type="button"
                    aria-label="Previous product"
                    onClick={() => goToProduct(catalogNav.prevBarcode!)}
                    className="absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full bg-slate-950/75 text-amber-400 shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-slate-900/90 hover:text-amber-300 active:scale-95"
                  >
                    <ChevronLeft className="size-6 md:size-7" strokeWidth={2.5} />
                  </button>
                )}
                {catalogNav.nextBarcode && (
                  <button
                    type="button"
                    aria-label="Next product"
                    onClick={() => goToProduct(catalogNav.nextBarcode!)}
                    className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-11 w-11 md:h-12 md:w-12 items-center justify-center rounded-full bg-slate-950/75 text-amber-400 shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition hover:bg-slate-900/90 hover:text-amber-300 active:scale-95"
                  >
                    <ChevronRight className="size-6 md:size-7" strokeWidth={2.5} />
                  </button>
                )}
              </>
            )}
            {hasDiscount && (
              <span className="absolute top-3 right-3 z-10 px-3 py-1 rounded-lg bg-amber-500 text-slate-950 text-sm font-bold">
                {Math.round(b?.discountPercent ?? 0)}% OFF
              </span>
            )}
            {imageUrl ? (
              <>
                <div className="absolute inset-0">
                  <HoverZoomImage>
                    <Image
                      src={imageUrl}
                      alt={displayName}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-contain"
                    />
                  </HoverZoomImage>
                </div>
                <span className="absolute bottom-3 left-3 text-[10px] text-slate-500 uppercase tracking-wider">
                  Hover to zoom
                </span>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl font-bold text-slate-600 select-none">
                  {displayName.charAt(0)}
                </span>
              </div>
            )}
          </div>
          {catalogNav && catalogNav.total > 1 && (
            <p className="hidden md:flex items-center justify-center gap-2 text-xs text-slate-500">
              <span className="tabular-nums">
                Product {catalogNav.position} of {catalogNav.total}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-600">Use arrows on image or ← → keys</span>
            </p>
          )}
          {thumbnails.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {thumbnails.map((src, i) => (
                <button
                  key={i}
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-[#0B1120] border border-slate-700 hover:border-amber-500/50 transition-colors"
                >
                  <Image src={src} alt="" width={64} height={64} className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right column — Details */}
        <div className="flex flex-col">
          {/* Barcode, Name */}
          {barcode && (
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">{barcode}</span>
          )}
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-100 mt-1 tracking-tight">
            {displayName}
          </h1>
          {styleCode && (
            <span className="text-sm text-slate-500 mt-1">{styleCode}{sku ? ` · ${sku}` : ''}</span>
          )}

          {/* Price */}
          <div className="mt-6">
            {hasDiscount && (
              <span className="line-through text-slate-500 text-xl mr-2">
                ₹{Math.round(b?.originalTotal ?? 0).toLocaleString('en-IN')}
              </span>
            )}
            <span className="text-3xl md:text-4xl font-bold text-amber-500 tabular-nums">
              ₹{Math.round(b?.total || 0).toLocaleString('en-IN')}
            </span>
            <span className="ml-2 text-base font-normal text-slate-500">incl. GST</span>
          </div>

          {/* Diamond Specifications — only for diamond products */}
          {isDiamond && (
            <div className="mt-6 rounded-xl bg-slate-900/60 border border-amber-500/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/80">
                <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Diamond Specifications</h3>
              </div>
              <div className="grid grid-cols-2 gap-px bg-slate-800/50">
                {(product as { diamond_carat?: string }).diamond_carat && (
                  <div className="bg-slate-900/80 px-4 py-3">
                    <span className="text-xs text-slate-500 block">Carat</span>
                    <span className="text-slate-100 font-medium">{(product as { diamond_carat?: string }).diamond_carat}</span>
                  </div>
                )}
                {(product as { diamond_cut?: string }).diamond_cut && (
                  <div className="bg-slate-900/80 px-4 py-3">
                    <span className="text-xs text-slate-500 block">Cut</span>
                    <span className="text-slate-100 font-medium">{(product as { diamond_cut?: string }).diamond_cut}</span>
                  </div>
                )}
                {(product as { diamond_color?: string }).diamond_color && (
                  <div className="bg-slate-900/80 px-4 py-3">
                    <span className="text-xs text-slate-500 block">Color</span>
                    <span className="text-slate-100 font-medium">{(product as { diamond_color?: string }).diamond_color}</span>
                  </div>
                )}
                {(product as { diamond_clarity?: string }).diamond_clarity && (
                  <div className="bg-slate-900/80 px-4 py-3">
                    <span className="text-xs text-slate-500 block">Clarity</span>
                    <span className="text-slate-100 font-medium">{(product as { diamond_clarity?: string }).diamond_clarity}</span>
                  </div>
                )}
              </div>
              {(product as { certificate_url?: string }).certificate_url && (
                <div className="p-4 border-t border-slate-800/80">
                  <a
                    href={(product as { certificate_url?: string }).certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-semibold hover:bg-amber-500/30 transition-colors"
                  >
                    View Authenticity Certificate
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Specifications */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {netWeight != null && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Net Weight</span>
                <span className="text-slate-100 font-medium">{Number(netWeight).toFixed(2)} gm</span>
              </div>
            )}
            {purity != null && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Purity</span>
                <span className="text-slate-100 font-medium">{String(purity)}</span>
              </div>
            )}
            {metalType && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Metal Type</span>
                <span className="text-slate-100 font-medium capitalize">{String(metalType)}</span>
              </div>
            )}
            {barcode && (
              <div className="rounded-lg bg-slate-900/60 border border-slate-800/80 px-4 py-3">
                <span className="text-xs text-slate-500 uppercase tracking-wider block">Barcode</span>
                <span className="text-slate-100 font-medium font-mono text-sm">{barcode}</span>
              </div>
            )}
          </div>

          {/* Action buttons — stacked on mobile for visibility */}
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors order-2 sm:order-1"
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
            <button
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-600 hover:border-slate-500 bg-slate-800/50 hover:bg-slate-800 text-slate-100 font-semibold transition-colors order-1 sm:order-2"
              onClick={() => setOpen(true)}
            >
              View Breakdown
            </button>
          </div>
        </div>
      </div>

      {/* Mobile: Sticky Add to Cart bar — always visible at bottom */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 p-4 pb-6 pt-3 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 safe-area-pb">
        <button
          className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-base transition-colors shadow-lg"
          onClick={handleAddToCart}
        >
          Add to Cart — ₹{Math.round(b?.total || 0).toLocaleString('en-IN')}
        </button>
      </div>
      {b && (
        <BreakdownModal
          open={open}
          onClose={() => setOpen(false)}
          breakdown={b}
          productName={displayName}
          isDiamond={isDiamond}
        />
      )}
      </div>
    </div>
  )
}

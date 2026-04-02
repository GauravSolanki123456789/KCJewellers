'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CHECKOUT_PATH } from '@/lib/routes'
import { useCart } from '@/context/CartContext'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { getItemWeight, isDiamondItem } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import {
  detectImageSurfaceTone,
  shouldAnalyzeImageSurface,
  type ImageSurfaceTone,
} from '@/lib/detect-image-surface'
import { blendClassForSurface } from '@/lib/product-image-blend'

type Breakdown = { metal?: number; mc?: number; stone?: number; cgst?: number; sgst?: number; taxable?: number; total?: number; rate_per_gram?: number; net_weight?: number }

type CartDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

function CartItemImage({ src, alt }: { src: string; alt: string }) {
  const [hasImageError, setHasImageError] = useState(false)
  const [surfaceTone, setSurfaceTone] = useState<ImageSurfaceTone | null>(null)
  useEffect(() => {
    setSurfaceTone(null)
  }, [src])
  if (hasImageError) {
    return (
      <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center">
        <span className="text-xl font-bold text-slate-500">{alt.charAt(0)}</span>
      </div>
    )
  }
  return (
    <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-lg overflow-hidden bg-slate-800 isolate">
      <img
        src={src}
        alt={alt}
        className={cn(
          'w-full h-full object-contain',
          blendClassForSurface(surfaceTone),
        )}
        onLoad={(e) => {
          const el = e.currentTarget
          if (shouldAnalyzeImageSurface(el)) {
            setSurfaceTone(detectImageSurfaceTone(el))
          }
        }}
        onError={() => setHasImageError(true)}
      />
    </div>
  )
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const router = useRouter()
  const { items, remove, setQty, ratesReady } = useCart()
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hasMetalItems = items.some((ci) => !isDiamondItem(ci.item))
  const canProceed = !hasMetalItems || ratesReady
  const hasZeroMetalCost = hasMetalItems && items.some((ci) => {
    if (isDiamondItem(ci.item)) return false
    const b = (ci.breakdown || {}) as Breakdown
    return (b.metal || 0) <= 0
  })
  const checkoutDisabled = !canProceed || hasZeroMetalCost

  const handleCheckout = () => {
    if (checkoutDisabled) return
    if (!auth.isAuthenticated) {
      onClose()
      openLoginModal(CHECKOUT_PATH)
      return
    }
    onClose()
    router.push('/checkout')
  }

  const grandTotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 md:bg-transparent ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel - full screen on mobile, sidebar on desktop */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-full sm:max-w-md md:w-96 bg-slate-900 border-l border-slate-800 transform transition-transform duration-300 shadow-2xl flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800 safe-area-pt">
          <h2 className="text-lg font-semibold text-slate-200">Your Cart</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Close cart"
          >
            <X className="size-5" />
          </button>
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          <p className="text-slate-300 text-sm mb-4">
            See breakdown of Metal, MC, GST for each item
          </p>
          <p className="text-slate-500 text-xs mb-2">
            Have a promo code? Apply it at checkout.
          </p>
          {items.length === 0 ? (
            <div className="py-12 text-center text-slate-300">No items in cart</div>
          ) : (
            <div className="space-y-3">
              {items.map((ci) => {
                const b = (ci.breakdown || {}) as Breakdown
                const isExpanded = expandedId === ci.id
                const lineTotal = ci.price * ci.qty
                const displayName = ci.item.item_name || ci.item.short_name || 'Item'
                const imageUrl = ci.item.image_url
                return (
                  <div
                    key={ci.id}
                    data-cart-item-id={ci.id}
                    className="rounded-lg border border-white/10 bg-slate-800/30 overflow-hidden"
                  >
                    <div className="p-4 flex gap-3 sm:gap-4">
                      {/* Product thumbnail */}
                      {imageUrl ? (
                        <CartItemImage src={imageUrl} alt={displayName} />
                      ) : (
                        <div className="w-16 h-16 md:w-20 md:h-20 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center">
                          <span className="text-xl font-bold text-slate-500">{displayName.charAt(0)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col gap-3">
                        <div>
                          <div className="font-semibold text-white truncate">
                            {displayName}
                          </div>
                          {getItemWeight(ci.item) != null && (
                            <div className="text-sm text-slate-400 mt-0.5">
                              Weight: {Number(getItemWeight(ci.item)).toFixed(2)} gm
                            </div>
                          )}
                          <div className="text-sm text-amber-400 font-medium mt-0.5">
                            {ratesReady || isDiamondItem(ci.item) ? (
                              <>
                                ₹{Math.round(lineTotal).toLocaleString('en-IN')}
                                <span className="text-slate-300 font-normal ml-1">
                                  (₹{Math.round(ci.price)} × {ci.qty})
                                </span>
                              </>
                            ) : (
                              <span className="inline-block w-20 h-4 bg-slate-600/50 rounded animate-pulse" aria-hidden="true" />
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center shrink-0 text-white"
                          onClick={() => setQty(ci.id, ci.qty - 1)}
                          aria-label={ci.qty <= 1 ? 'Remove from cart' : 'Decrease quantity'}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-medium tabular-nums text-white">{ci.qty}</span>
                        <button
                          className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center shrink-0 text-white"
                          onClick={() => setQty(ci.id, ci.qty + 1)}
                        >
                          +
                        </button>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm ml-auto"
                          onClick={() => remove(ci.id)}
                        >
                          Remove
                        </button>
                      </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ci.id)}
                      className="w-full px-4 py-2 flex items-center justify-between text-sm text-slate-300 hover:text-white hover:bg-white/5 border-t border-white/5"
                    >
                      <span>View breakdown (Metal, MC, GST)</span>
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2 text-sm">
                        {!isDiamondItem(ci.item) && (
                          <>
                            <div className="flex justify-between text-slate-200">
                              <span>
                                Metal Cost
                                {(() => {
                                  const br = b as { rate_per_gram?: number; net_weight?: number }
                                  const rpg = br?.rate_per_gram
                                  const nw = br?.net_weight
                                  return rpg != null && nw != null && rpg > 0
                                    ? ` (₹${Math.round(rpg).toLocaleString('en-IN')}/g × ${Number(nw).toFixed(2)}g)`
                                    : ''
                                })()}
                              </span>
                              <span className="tabular-nums">
                                {ratesReady ? `₹${Math.round((b.metal || 0) * ci.qty).toLocaleString('en-IN')}` : (
                                  <span className="inline-block w-12 h-4 bg-slate-600/50 rounded animate-pulse" aria-hidden="true" />
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-200">
                              <span>Making Charges</span>
                              <span className="tabular-nums">₹{Math.round((b.mc || 0) * ci.qty).toLocaleString('en-IN')}</span>
                            </div>
                            {(b.stone || 0) > 0 && (
                              <div className="flex justify-between text-slate-200">
                                <span>Stone Cost</span>
                                <span className="tabular-nums">₹{Math.round((b.stone || 0) * ci.qty).toLocaleString('en-IN')}</span>
                              </div>
                            )}
                          </>
                        )}
                        {isDiamondItem(ci.item) && (
                          <div className="flex justify-between text-slate-200">
                            <span>Price</span>
                            <span className="tabular-nums">₹{Math.round((b.taxable || 0) * ci.qty).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-200">
                          <span>CGST</span>
                          <span className="tabular-nums">₹{Math.round((b.cgst || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-slate-200">
                          <span>SGST</span>
                          <span className="tabular-nums">₹{Math.round((b.sgst || 0) * ci.qty).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between font-medium text-white pt-2 border-t border-white/5">
                          <span>Line Total</span>
                          <span className="tabular-nums text-amber-400">₹{Math.round(lineTotal).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-slate-800 space-y-3 safe-area-pb">
            <div className="flex justify-between text-lg font-semibold text-white">
              <span>Grand Total</span>
              <span className="text-amber-400 tabular-nums">
                {checkoutDisabled && hasMetalItems ? (
                  <span className="inline-block w-16 h-5 bg-slate-600/50 rounded animate-pulse" aria-hidden="true" />
                ) : (
                  `₹${Math.round(grandTotal).toLocaleString('en-IN')}`
                )}
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutDisabled}
              className="w-full py-3 gold-bg text-slate-950 font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50"
            >
              {checkoutDisabled && hasMetalItems
                ? 'Loading prices…'
                : auth.isAuthenticated
                  ? 'Proceed to Checkout'
                  : 'Sign In to Checkout'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

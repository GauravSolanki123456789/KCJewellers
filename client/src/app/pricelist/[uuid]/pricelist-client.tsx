'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, MessageCircle, Minus, Plus, ZoomIn } from 'lucide-react'
import {
  fetchPublicPricelist,
  formatSlabKeyLabel,
  type PricelistPublicProduct,
  type PricelistPublicResponse,
} from '@/lib/reseller-pricelist'
import { normalizeCatalogImageSrc, normalizeResellerLogoUrl } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'

const MAX_PIECE_QTY = 999

type NavLevel =
  | { level: 'categories' }
  | { level: 'subcategories'; category: string }
  | { level: 'products'; category: string; subcategory: string }

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function buildWhatsAppMessage(
  business: string,
  picks: { product: PricelistPublicProduct; qty: number }[],
  slabKey: string | null,
): string {
  const totalPcs = picks.reduce((s, p) => s + p.qty, 0)
  const lines = picks.map(({ product: p, qty }) => {
    const parts = [p.subcategory_name, p.product_name]
    if (p.avg_weight != null) parts.push(`${p.avg_weight} gm`)
    if (p.selected_slab_rate != null && slabKey) {
      parts.push(`${formatSlabKeyLabel(slabKey)}: ₹${p.selected_slab_rate}`)
    }
    const qtyPart = qty > 1 ? ` × ${qty} pcs` : ''
    return `• ${parts.filter(Boolean).join(' · ')}${qtyPart}`
  })
  return `${business || 'Pricelist'} — ${totalPcs} pc${totalPcs === 1 ? '' : 's'} · ${picks.length} line${picks.length === 1 ? '' : 's'}\n\n${lines.join('\n')}`
}

function totalPieces(qtyMap: Map<number, number>): number {
  let n = 0
  for (const q of qtyMap.values()) n += q
  return n
}

export default function PricelistPublicClient() {
  const params = useParams()
  const uuid = String(params?.uuid || '').trim()
  const [data, setData] = useState<PricelistPublicResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quantities, setQuantities] = useState<Map<number, number>>(() => new Map())
  const [nav, setNav] = useState<NavLevel>({ level: 'categories' })
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetchPublicPricelist(uuid)
        if (!cancelled) setData(res)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uuid])

  const categoryRows = useMemo(() => {
    if (!data?.products?.length) return []
    const map = new Map<string, number>()
    for (const p of data.products) {
      map.set(p.category_name, (map.get(p.category_name) || 0) + 1)
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  }, [data])

  const subcategoryRows = useMemo(() => {
    if (nav.level === 'categories' || !data?.products) return []
    const cat = nav.level === 'subcategories' ? nav.category : nav.category
    const map = new Map<string, number>()
    for (const p of data.products) {
      if (p.category_name !== cat) continue
      map.set(p.subcategory_name, (map.get(p.subcategory_name) || 0) + 1)
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }))
  }, [data, nav])

  const filteredProducts = useMemo(() => {
    if (!data?.products) return []
    if (nav.level === 'categories') return data.products
    if (nav.level === 'subcategories') {
      return data.products.filter((p) => p.category_name === nav.category)
    }
    return data.products.filter(
      (p) => p.category_name === nav.category && p.subcategory_name === nav.subcategory,
    )
  }, [data, nav])

  const toggleProduct = useCallback((id: number) => {
    setQuantities((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, 1)
      return next
    })
  }, [])

  const setQty = useCallback((id: number, qty: number) => {
    const q = Math.max(1, Math.min(MAX_PIECE_QTY, Math.floor(qty)))
    setQuantities((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.set(id, q)
      else next.set(id, q)
      return next
    })
    setQtyDraft((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }, [])

  const picks = useMemo(() => {
    if (!data?.products) return []
    return data.products
      .filter((p) => quantities.has(p.id))
      .map((p) => ({ product: p, qty: quantities.get(p.id) ?? 1 }))
  }, [data, quantities])

  const whatsappHref = useMemo(() => {
    if (!picks.length) return ''
    const msg = buildWhatsAppMessage(
      data?.owner_business_name || 'Pricelist',
      picks,
      data?.selected_slab_key || null,
    )
    return `https://wa.me/?text=${encodeURIComponent(msg)}`
  }, [picks, data])

  const navTitle = useMemo(() => {
    if (nav.level === 'categories') return 'Browse categories'
    if (nav.level === 'subcategories') return nav.category
    return nav.subcategory
  }, [nav])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf8f4]">
        <Loader2 className="size-8 animate-spin text-[#1a1814]/40" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#faf8f4] px-4 text-center">
        <p className="text-lg font-semibold text-[#1a1814]">Pricelist unavailable</p>
        <p className="mt-2 text-sm text-[#1a1814]/60">{error || 'Link expired or not found'}</p>
      </div>
    )
  }

  const logo = normalizeResellerLogoUrl(data.owner_logo_url)
  const expired = data.expired
  const lineCount = quantities.size
  const pieceCount = totalPieces(quantities)

  return (
    <div className="min-h-screen bg-[#faf8f4] pb-28 text-[#1a1814]">
      <header className="border-b border-[#e8e4df] bg-white/95 px-4 py-6 text-center backdrop-blur-sm">
        {logo ? (
          <Image
            src={logo}
            alt=""
            width={120}
            height={48}
            className="mx-auto mb-3 h-12 w-auto object-contain"
            unoptimized
          />
        ) : null}
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Shared pricelist</h1>
        <p className="mt-2 text-sm text-[#1a1814]/60">
          Tap to shortlist — set qty on each line — share on WhatsApp
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#e8e4df] bg-[#f7f4ef] px-3 py-1 text-xs text-[#1a1814]/70">
          <Clock className="size-3.5" />
          {expired ? 'Expired' : `Valid until ${formatWhen(data.expires_at)}`}
        </div>
        {data.selected_slab_key ? (
          <p className="mt-2 text-xs font-medium text-amber-900/80">
            Slab: {formatSlabKeyLabel(data.selected_slab_key)}
          </p>
        ) : null}
      </header>

      <div className="sticky top-0 z-10 border-b border-[#e8e4df] bg-[#faf8f4]/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          {nav.level !== 'categories' ? (
            <button
              type="button"
              onClick={() => {
                if (nav.level === 'products') {
                  setNav({ level: 'subcategories', category: nav.category })
                } else {
                  setNav({ level: 'categories' })
                }
              }}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-xl border border-[#e8e4df] bg-white px-3 text-xs font-semibold text-[#1a1814]"
            >
              <ChevronLeft className="size-4" />
              Back
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a1814]">{navTitle}</p>
        </div>
      </div>

      {nav.level === 'categories' ? (
        <main className="mx-auto max-w-lg space-y-2 p-4">
          {categoryRows.map((row) => (
            <button
              key={row.name}
              type="button"
              onClick={() => setNav({ level: 'subcategories', category: row.name })}
              className="flex w-full min-h-[56px] items-center justify-between rounded-2xl border border-[#e8e4df] bg-white px-4 py-3 text-left shadow-sm transition hover:border-emerald-600/30 active:scale-[0.99]"
            >
              <span className="font-semibold text-[#1a1814]">{row.name}</span>
              <span className="flex items-center gap-2 text-sm text-[#1a1814]/55">
                {row.count}
                <ChevronRight className="size-4" />
              </span>
            </button>
          ))}
        </main>
      ) : null}

      {nav.level === 'subcategories' ? (
        <main className="mx-auto max-w-lg space-y-2 p-4">
          {subcategoryRows.map((row) => (
            <button
              key={row.name}
              type="button"
              onClick={() =>
                setNav({
                  level: 'products',
                  category: nav.category,
                  subcategory: row.name,
                })
              }
              className="flex w-full min-h-[56px] items-center justify-between rounded-2xl border border-[#e8e4df] bg-white px-4 py-3 text-left shadow-sm transition hover:border-emerald-600/30 active:scale-[0.99]"
            >
              <span className="font-semibold text-[#1a1814]">{row.name}</span>
              <span className="flex items-center gap-2 text-sm text-[#1a1814]/55">
                {row.count}
                <ChevronRight className="size-4" />
              </span>
            </button>
          ))}
        </main>
      ) : null}

      {nav.level === 'products' ? (
        <main className="mx-auto grid max-w-5xl grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:gap-4">
          {filteredProducts.map((p) => {
            const qty = quantities.get(p.id) ?? 0
            const selected = qty > 0
            const img = normalizeCatalogImageSrc(p.image_url)
            const draft = qtyDraft[p.id]
            return (
              <article
                key={p.id}
                className={cn(
                  'overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition',
                  selected ? 'border-emerald-600 ring-2 ring-emerald-600/25' : 'border-[#e8e4df]',
                  expired && 'opacity-60',
                )}
              >
                <button
                  type="button"
                  disabled={expired}
                  onClick={() => toggleProduct(p.id)}
                  className="relative block w-full aspect-square bg-[#f0ebe3]"
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[#1a1814]/25">
                      <ZoomIn className="size-8" />
                    </div>
                  )}
                  <span
                    className={cn(
                      'absolute left-2 top-2 flex size-7 items-center justify-center rounded-full border-2 bg-white/95',
                      selected ? 'border-emerald-600 text-emerald-700' : 'border-[#e8e4df] text-transparent',
                    )}
                  >
                    {selected ? <Check className="size-4" strokeWidth={3} /> : null}
                  </span>
                </button>
                <div className="space-y-2 p-2.5">
                  <div>
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-[#1a1814]">
                      {p.product_name}
                    </p>
                    {p.avg_weight != null ? (
                      <p className="text-sm font-semibold text-amber-800">{p.avg_weight} gm</p>
                    ) : null}
                    {p.selected_slab_rate != null ? (
                      <p className="text-xs text-[#1a1814]/70">
                        {data.selected_slab_key ? formatSlabKeyLabel(data.selected_slab_key) : 'Rate'}: ₹
                        {p.selected_slab_rate.toLocaleString('en-IN')}
                      </p>
                    ) : null}
                  </div>
                  {selected ? (
                    <div
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#e8e4df] bg-[#f7f4ef] px-2 py-1.5"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/50">
                        Qty
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          disabled={qty <= 1}
                          onClick={() => setQty(p.id, qty - 1)}
                          className="flex size-9 items-center justify-center rounded-lg border border-[#e8e4df] bg-white text-[#1a1814] disabled:opacity-40"
                        >
                          <Minus className="size-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_PIECE_QTY}
                          value={draft ?? String(qty)}
                          onChange={(e) =>
                            setQtyDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          onBlur={() => {
                            const raw = qtyDraft[p.id]
                            if (raw == null) return
                            const n = parseInt(raw, 10)
                            if (Number.isFinite(n) && n >= 1) setQty(p.id, n)
                            else setQtyDraft((prev) => {
                              const copy = { ...prev }
                              delete copy[p.id]
                              return copy
                            })
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                          className="w-12 rounded-lg border border-[#e8e4df] bg-white px-1 py-1.5 text-center text-sm font-semibold tabular-nums text-[#1a1814]"
                        />
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          disabled={qty >= MAX_PIECE_QTY}
                          onClick={() => setQty(p.id, qty + 1)}
                          className="flex size-9 items-center justify-center rounded-lg border border-[#e8e4df] bg-white text-[#1a1814] disabled:opacity-40"
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </main>
      ) : null}

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e8e4df] bg-white/95 px-4 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <p className="text-sm text-[#1a1814]/70">
            {lineCount === 0 ? (
              'Shortlist items to share'
            ) : (
              <>
                <span className="font-semibold text-emerald-800">{pieceCount}</span>{' '}
                {pieceCount === 1 ? 'pc' : 'pcs'} · {lineCount} line{lineCount === 1 ? '' : 's'}
              </>
            )}
          </p>
          <a
            href={whatsappHref || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (!picks.length || expired) e.preventDefault()
            }}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold',
              picks.length && !expired
                ? 'bg-emerald-600 text-white'
                : 'cursor-not-allowed bg-[#e8e4df] text-[#1a1814]/45',
            )}
          >
            <MessageCircle className="size-4" />
            WhatsApp ({pieceCount})
          </a>
        </div>
      </footer>
    </div>
  )
}

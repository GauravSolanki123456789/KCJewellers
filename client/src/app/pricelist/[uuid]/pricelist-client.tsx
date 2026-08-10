'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { Check, Clock, Loader2, MessageCircle, ZoomIn } from 'lucide-react'
import {
  fetchPublicPricelist,
  formatSlabKeyLabel,
  type PricelistPublicProduct,
  type PricelistPublicResponse,
} from '@/lib/reseller-pricelist'
import { normalizeCatalogImageSrc, normalizeResellerLogoUrl } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'

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
  picks: PricelistPublicProduct[],
  slabKey: string | null,
): string {
  const lines = picks.map((p) => {
    const parts = [p.subcategory_name, p.product_name]
    if (p.avg_weight != null) parts.push(`${p.avg_weight} gm`)
    if (p.selected_slab_rate != null && slabKey) {
      parts.push(`${formatSlabKeyLabel(slabKey)}: ₹${p.selected_slab_rate}`)
    }
    return `• ${parts.filter(Boolean).join(' · ')}`
  })
  return `${business || 'Pricelist'} — ${picks.length} item${picks.length === 1 ? '' : 's'}\n\n${lines.join('\n')}`
}

export default function PricelistPublicClient() {
  const params = useParams()
  const uuid = String(params?.uuid || '').trim()
  const [data, setData] = useState<PricelistPublicResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState('all')

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

  const tabs = useMemo(() => {
    if (!data?.products?.length) return [{ key: 'all', label: 'All', count: 0 }]
    const map = new Map<string, { label: string; count: number }>()
    for (const p of data.products) {
      const key = `${p.category_name} — ${p.subcategory_name}`
      const prev = map.get(key)
      if (prev) prev.count += 1
      else map.set(key, { label: key, count: 1 })
    }
    return [
      { key: 'all', label: 'All', count: data.products.length },
      ...[...map.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count })),
    ]
  }, [data])

  const filtered = useMemo(() => {
    if (!data?.products) return []
    if (activeTab === 'all') return data.products
    return data.products.filter((p) => `${p.category_name} — ${p.subcategory_name}` === activeTab)
  }, [data, activeTab])

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const picks = useMemo(() => {
    if (!data?.products) return []
    return data.products.filter((p) => selected.has(p.id))
  }, [data, selected])

  const whatsappHref = useMemo(() => {
    if (!picks.length) return ''
    const msg = buildWhatsAppMessage(
      data?.owner_business_name || 'Pricelist',
      picks,
      data?.selected_slab_key || null,
    )
    return `https://wa.me/?text=${encodeURIComponent(msg)}`
  }, [picks, data])

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

  return (
    <div className="min-h-screen bg-[#faf8f4] pb-24 text-[#1a1814]">
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
          Tap cards to shortlist — then share on WhatsApp
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

      <div className="sticky top-0 z-10 border-b border-[#e8e4df] bg-[#faf8f4]/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition',
                activeTab === t.key
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-[#1a1814]/75 ring-1 ring-[#e8e4df]',
              )}
            >
              {t.label} {t.count}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto grid max-w-5xl grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:gap-4">
        {filtered.map((p) => {
          const on = selected.has(p.id)
          const img = normalizeCatalogImageSrc(p.image_url)
          return (
            <button
              key={p.id}
              type="button"
              disabled={expired}
              onClick={() => toggle(p.id)}
              className={cn(
                'relative overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition',
                on ? 'border-emerald-600 ring-2 ring-emerald-600/30' : 'border-[#e8e4df]',
                expired && 'opacity-60',
              )}
            >
              <div className="relative aspect-square bg-[#f0ebe3]">
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
                    on ? 'border-emerald-600 text-emerald-700' : 'border-[#e8e4df] text-transparent',
                  )}
                >
                  {on ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
              </div>
              <div className="space-y-0.5 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1a1814]/45">
                  {p.subcategory_name}
                </p>
                <p className="line-clamp-2 text-sm font-medium leading-snug">{p.product_name}</p>
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
            </button>
          )
        })}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e8e4df] bg-white/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <p className="text-sm text-[#1a1814]/70">
            {picks.length} shortlisted
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
            WhatsApp ({picks.length})
          </a>
        </div>
      </footer>
    </div>
  )
}

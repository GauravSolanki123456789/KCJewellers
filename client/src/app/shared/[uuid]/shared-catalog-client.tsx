'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Clock, Gem, Sparkles } from 'lucide-react'
import { fetchSharedCatalogByUuid, type SharedCatalogPublicProduct } from '@/lib/shared-catalog-api'
import { calculateBreakdown, type Item } from '@/lib/pricing'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { getSiteUrl } from '@/lib/site'
import { CATALOG_PATH } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { catalogProductImageClass } from '@/lib/product-image-classes'
import { productImageViewportWrapperClass } from '@/lib/flat-product-image'
import { productImageWellClass } from '@/lib/product-image-theme'

function toItem(p: SharedCatalogPublicProduct): Item {
  return {
    ...p,
    item_name: (p.name as string) || undefined,
    gst_rate: 3,
  }
}

function markedUpTotal(item: Item, rates: unknown, markupPct: number) {
  const b = calculateBreakdown(item, rates, (item as { gst_rate?: number }).gst_rate ?? 3)
  return b.total * (1 + Math.max(0, markupPct) / 100)
}

function metalIcon(metal: string) {
  const m = (metal || '').toLowerCase()
  if (m.includes('diamond')) return Gem
  if (m.includes('gold')) return Sparkles
  return Sparkles
}

export default function SharedCatalogClient() {
  const params = useParams()
  const uuid = typeof params?.uuid === 'string' ? params.uuid : ''
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<Awaited<
    ReturnType<typeof fetchSharedCatalogByUuid>
  > | null>(null)

  useEffect(() => {
    if (!uuid) {
      setLoading(false)
      setError('Invalid link')
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchSharedCatalogByUuid(uuid)
        if (cancelled) return
        setPayload(data)
      } catch (e: unknown) {
        if (cancelled) return
        let msg: string | null = null
        if (e && typeof e === 'object' && 'response' in e) {
          const err = (e as { response?: { data?: { error?: unknown } } }).response?.data?.error
          msg = typeof err === 'string' ? err : null
        }
        setError(msg || 'Could not load this catalogue.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uuid])

  const site = getSiteUrl()

  const rows = useMemo(() => {
    if (!payload || (payload as { expired?: boolean }).expired || !('products' in payload)) return []
    const markup = Number((payload as { markupPercentage?: number }).markupPercentage) || 0
    const rates = (payload as { rates?: unknown }).rates ?? []
    const products = (payload as { products?: SharedCatalogPublicProduct[] }).products ?? []
    return products.map((p) => {
      const item = toItem(p)
      const total = markedUpTotal(item, rates, markup)
      return { item, product: p, total, markup }
    })
  }, [payload])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col items-center justify-center px-6">
        <div className="h-12 w-12 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
        <p className="mt-6 text-sm text-slate-400">Opening catalogue…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-medium text-slate-200">{error}</p>
        <Link
          href={CATALOG_PATH}
          className="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
        >
          Browse full catalogue
        </Link>
      </div>
    )
  }

  if (payload && 'expired' in payload && payload.expired) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#0f172a] to-[#020617] text-slate-100 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/40 p-8 shadow-2xl backdrop-blur-sm">
          <Clock className="mx-auto size-12 text-amber-500/80" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">This catalogue link has expired</h1>
          <p className="mt-2 text-sm text-slate-400 leading-relaxed">
            Ask KC Jewellers for a fresh link, or explore the live catalogue on our website.
          </p>
          <Link
            href={CATALOG_PATH}
            className="mt-8 inline-flex rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            View catalogue
          </Link>
          <p className="mt-6 text-xs text-slate-600">{site}</p>
        </div>
      </div>
    )
  }

  if (!payload || !('products' in payload)) {
    return null
  }

  const markupPct = Number((payload as { markupPercentage?: number }).markupPercentage) || 0
  const expiresAt = (payload as { expiresAt?: string }).expiresAt
  const expDate = expiresAt ? new Date(expiresAt) : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#020617] via-[#0f172a] to-[#020617] text-slate-100 pb-16 pt-10 md:pt-14">
      <header className="mx-auto max-w-6xl px-4 text-center md:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-500/90">
          KC Jewellers
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
          Shared catalogue
        </h1>
        {markupPct > 0 && (
          <p className="mt-2 text-sm text-slate-400">
            Prices include <span className="font-semibold text-amber-400/90">{markupPct}%</span> on
            our live rate (incl. GST).
          </p>
        )}
        {expDate && !Number.isNaN(expDate.getTime()) && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/50 px-3 py-1 text-xs text-slate-500">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            Valid until {expDate.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
      </header>

      <main className="mx-auto mt-10 max-w-6xl px-4 md:px-8">
        {rows.length === 0 ? (
          <p className="text-center text-slate-500">No products in this share.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
            {rows.map(({ item, product, total }) => {
              const name =
                (product.name as string) ||
                item.item_name ||
                String(product.barcode || product.sku || '')
              const img = normalizeCatalogImageSrc(product.image_url)
              const MetalIc = metalIcon(String(product.metal_type || ''))
              const code = String(product.barcode || product.sku || '')
              return (
                <li
                  key={code}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-950/50 shadow-lg shadow-black/20"
                >
                  <div
                    className={cn(
                      'relative isolate aspect-[4/5] overflow-hidden',
                      productImageWellClass,
                    )}
                  >
                    {img ? (
                      <div className={productImageViewportWrapperClass()}>
                        <Image
                          src={img}
                          alt={name}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className={cn(
                            catalogProductImageClass(null),
                            'object-cover',
                          )}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center bg-slate-900">
                        <MetalIc className="size-14 text-slate-700" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    {product.style_name && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {String(product.style_name)}
                      </span>
                    )}
                    <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100">
                      {name}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{code}</span>
                    <div className="mt-auto pt-2">
                      <span className="text-lg font-semibold tabular-nums text-amber-400">
                        ₹{Math.round(total).toLocaleString('en-IN')}
                      </span>
                      <span className="ml-1.5 text-[11px] text-slate-500">incl. GST</span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      <footer className="mx-auto mt-14 max-w-6xl px-4 text-center text-xs text-slate-600 md:px-8">
        <p>Pricing is indicative — visit {site} or contact us to confirm.</p>
      </footer>
    </div>
  )
}

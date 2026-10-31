'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, ReceiptIndianRupee, RotateCcw, Save, Search } from 'lucide-react'
import Link from 'next/link'
import { PROFILE_PATH } from '@/lib/routes'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'

type MetalTab = 'gifting' | 'silver'
type PriceMode = 'fixed_mrp' | 'wastage_mc'

type OwnPriceProduct = {
  id: number
  sku?: string | null
  barcode?: string | null
  name?: string | null
  size?: string | null
  image_url?: string | null
  metal_type?: string | null
  mc_type?: string | null
  mc_rate?: number | null
  wastage_pct?: number | null
  catalog_fixed_price?: number | null
  net_weight?: number | null
  style_code?: string | null
  sku_code?: string | null
  override_mode?: PriceMode | string | null
  override_fixed_price?: number | null
  override_wastage_pct?: number | null
  override_mc_rate?: number | null
  override_mc_type?: string | null
  has_override?: boolean
}

type Draft = {
  mode: PriceMode
  fixed_price: string
  wastage_pct: string
  mc_rate: string
  mc_type: string
}

const PAGE = 50
const inputCls =
  'kc-upload-input min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50'
const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60'
const btnGhost =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60'

function numStr(v: number | string | null | undefined): string {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : ''
}

function isGiftMetal(metalType: string | null | undefined): boolean {
  const mt = String(metalType || '').toLowerCase()
  return mt.includes('gift') || mt.includes('gifting') || mt.includes('plated') || mt.includes('brooch')
}

function draftFromProduct(p: OwnPriceProduct, tab: MetalTab): Draft {
  const gift = tab === 'gifting' || isGiftMetal(p.metal_type)
  const savedMode = String(p.override_mode || '').toLowerCase()
  const mode: PriceMode = gift
    ? 'fixed_mrp'
    : savedMode === 'fixed_mrp'
      ? 'fixed_mrp'
      : 'wastage_mc'
  return {
    mode,
    fixed_price: numStr(p.override_fixed_price ?? (p.has_override ? null : p.catalog_fixed_price)),
    wastage_pct: numStr(p.override_wastage_pct ?? p.wastage_pct),
    mc_rate: numStr(p.override_mc_rate ?? p.mc_rate),
    mc_type: String(p.override_mc_type || p.mc_type || 'MC/GM'),
  }
}

function draftKey(d: Draft): string {
  return `${d.mode}|${d.fixed_price.trim()}|${d.wastage_pct.trim()}|${d.mc_rate.trim()}|${d.mc_type}`
}

function apiError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error
    if (msg) return msg
  }
  return fallback
}

export function ResellerOwnPricesPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [metal, setMetal] = useState<MetalTab>('gifting')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [products, setProducts] = useState<OwnPriceProduct[]>([])
  const [drafts, setDrafts] = useState<Record<number, Draft>>({})
  const [savedKeys, setSavedKeys] = useState<Record<number, string>>({})
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 280)
    return () => window.clearTimeout(t)
  }, [query])

  const load = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const { data: status } = await axios.get<{ enabled?: boolean }>('/api/reseller/own-prices/status')
        const on = !!status.enabled
        setEnabled(on)
        if (!on) {
          setProducts([])
          setTotal(0)
          return
        }
        const { data } = await axios.get<{ products?: OwnPriceProduct[]; total?: number }>(
          '/api/reseller/own-prices/products',
          {
            params: {
              metal,
              q: search || undefined,
              mine: mineOnly ? '1' : undefined,
              limit: PAGE,
              offset,
            },
          },
        )
        const rows = Array.isArray(data.products) ? data.products : []
        setTotal(Number(data.total || 0))
        setProducts((prev) => (append ? [...prev, ...rows] : rows))
        setDrafts((prev) => {
          const next = append ? { ...prev } : {}
          for (const p of rows) {
            if (append && next[p.id]) continue
            next[p.id] = draftFromProduct(p, metal)
          }
          return next
        })
        setSavedKeys((prev) => {
          const next = append ? { ...prev } : {}
          for (const p of rows) {
            if (append && next[p.id]) continue
            next[p.id] = draftKey(draftFromProduct(p, metal))
          }
          return next
        })
      } catch (e) {
        setError(apiError(e, 'Could not load products'))
        if (!append) {
          setProducts([])
          setTotal(0)
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [metal, search, mineOnly],
  )

  useEffect(() => {
    void load(0, false)
  }, [load])

  const dirtyIds = useMemo(() => {
    return products.filter((p) => drafts[p.id] && draftKey(drafts[p.id]) !== savedKeys[p.id]).map((p) => p.id)
  }, [products, drafts, savedKeys])

  const patchDraft = (id: number, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const payloadFor = (id: number, clear = false) => {
    const d = drafts[id]
    const p = products.find((row) => row.id === id)
    const gift = metal === 'gifting' || isGiftMetal(p?.metal_type)
    const mode: PriceMode = gift ? 'fixed_mrp' : d?.mode || 'fixed_mrp'
    return {
      product_id: id,
      clear,
      mode,
      fixed_price: d?.fixed_price ?? '',
      wastage_pct: d?.wastage_pct ?? '',
      mc_rate: d?.mc_rate ?? '',
      mc_type: d?.mc_type ?? '',
    }
  }

  const markSaved = (id: number, nextProduct?: Partial<OwnPriceProduct>) => {
    const d = drafts[id]
    if (!d) return
    setProducts((prev) =>
      prev.map((p) => (p.id === id && nextProduct ? { ...p, ...nextProduct } : p)),
    )
    setSavedKeys((prev) => ({ ...prev, [id]: draftKey(d) }))
  }

  const saveOne = async (id: number) => {
    setSavingId(id)
    setError(null)
    setFlash(null)
    try {
      await axios.put(`/api/reseller/own-prices/products/${id}`, payloadFor(id))
      const d = drafts[id]
      if (!d) return
      markSaved(id, {
        has_override: true,
        override_mode: d.mode,
        override_fixed_price: Number(d.fixed_price) || null,
        override_wastage_pct: Number(d.wastage_pct) || null,
        override_mc_rate: Number(d.mc_rate) || null,
        override_mc_type: d.mc_type,
      })
      setFlash('Saved')
      window.setTimeout(() => setFlash(null), 1800)
    } catch (e) {
      setError(apiError(e, 'Save failed'))
    } finally {
      setSavingId(null)
    }
  }

  const revertOne = async (id: number) => {
    setSavingId(id)
    setError(null)
    setFlash(null)
    try {
      await axios.put(`/api/reseller/own-prices/products/${id}`, payloadFor(id, true))
      const p = products.find((row) => row.id === id)
      if (p) {
        const fresh: OwnPriceProduct = {
          ...p,
          has_override: false,
          override_mode: null,
          override_fixed_price: null,
          override_wastage_pct: null,
          override_mc_rate: null,
          override_mc_type: null,
        }
        const d = draftFromProduct(fresh, metal)
        setProducts((prev) => prev.map((row) => (row.id === id ? fresh : row)))
        setDrafts((prev) => ({ ...prev, [id]: d }))
        setSavedKeys((prev) => ({ ...prev, [id]: draftKey(d) }))
      }
      setFlash('Catalogue price restored')
      window.setTimeout(() => setFlash(null), 1800)
    } catch (e) {
      setError(apiError(e, 'Could not restore catalogue price'))
    } finally {
      setSavingId(null)
    }
  }

  const saveAll = async () => {
    if (!dirtyIds.length) return
    setSavingAll(true)
    setError(null)
    setFlash(null)
    try {
      const { data } = await axios.put<{ saved?: number }>('/api/reseller/own-prices/bulk', {
        items: dirtyIds.map((id) => payloadFor(id)),
      })
      for (const id of dirtyIds) {
        const d = drafts[id]
        if (!d) continue
        markSaved(id, {
          has_override: true,
          override_mode: d.mode,
          override_fixed_price: Number(d.fixed_price) || null,
          override_wastage_pct: Number(d.wastage_pct) || null,
          override_mc_rate: Number(d.mc_rate) || null,
          override_mc_type: d.mc_type,
        })
      }
      setFlash(`Saved ${data.saved ?? dirtyIds.length} prices`)
      window.setTimeout(() => setFlash(null), 2200)
    } catch (e) {
      setError(apiError(e, 'Bulk save failed'))
    } finally {
      setSavingAll(false)
    }
  }

  if (enabled === false) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-6 py-10 text-center shadow-sm">
        <ReceiptIndianRupee className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h2 className="mt-4 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Own prices not enabled
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Ask KC admin to turn on &quot;Let reseller keep their own prices&quot; in B2B clients → Edit
          reseller.
        </p>
        <Link
          href={PROFILE_PATH}
          className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]"
        >
          Back to profile →
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-2 gap-2">
          {([
            ['gifting', 'Gift items'],
            ['silver', 'Silver'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMetal(key)}
              className={`min-h-[44px] rounded-xl text-sm font-semibold transition ${
                metal === key
                  ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                  : 'border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative mt-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-jewelry-black,#1a1814)]/40" />
          <input
            className={`${inputCls} pl-9`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU, size…"
            aria-label="Search products"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${
              mineOnly
                ? 'border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                : 'border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]/70'
            }`}
          >
            Your prices only
          </button>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            {total} {total === 1 ? 'product' : 'products'}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {flash ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      ) : null}

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/50">
          <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
        </div>
      ) : !products.length ? (
        <p className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
          No products in this list.
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => {
            const d = drafts[p.id] || draftFromProduct(p, metal)
            const gift = metal === 'gifting' || isGiftMetal(p.metal_type)
            const dirty = draftKey(d) !== savedKeys[p.id]
            const img = p.image_url ? normalizeCatalogImageSrc(p.image_url) || p.image_url : ''
            return (
              <li
                key={p.id}
                className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3 shadow-sm sm:p-4"
              >
                <div className="flex gap-3">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="size-16 shrink-0 rounded-xl object-cover sm:size-20"
                    />
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]/25 sm:size-20">
                      <ReceiptIndianRupee className="size-6" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug text-[var(--color-jewelry-black,#1a1814)]">
                        {p.name || p.sku || 'Product'}
                      </p>
                      {p.has_override ? (
                        <span className="rounded-full bg-[var(--kc-accent,#c41e3a)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--kc-accent,#c41e3a)]">
                          Yours
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      {[p.style_code, p.sku_code, p.sku, p.size && `Size ${p.size}`, p.metal_type]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {p.catalog_fixed_price ? (
                      <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        Catalogue MRP ₹{Number(p.catalog_fixed_price).toLocaleString('en-IN')}
                      </p>
                    ) : p.net_weight ? (
                      <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        {p.net_weight} g · Wastage {numStr(p.wastage_pct) || '0'}% · MC {numStr(p.mc_rate) || '—'}
                      </p>
                    ) : null}
                  </div>
                </div>

                {!gift ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => patchDraft(p.id, { mode: 'fixed_mrp' })}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold ${
                        d.mode === 'fixed_mrp'
                          ? 'bg-[var(--color-jewelry-black,#1a1814)] text-white'
                          : 'border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]'
                      }`}
                    >
                      MRP
                    </button>
                    <button
                      type="button"
                      onClick={() => patchDraft(p.id, { mode: 'wastage_mc' })}
                      className={`min-h-[40px] rounded-xl text-xs font-semibold ${
                        d.mode === 'wastage_mc'
                          ? 'bg-[var(--color-jewelry-black,#1a1814)] text-white'
                          : 'border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)]'
                      }`}
                    >
                      Wastage + MC
                    </button>
                  </div>
                ) : null}

                {gift || d.mode === 'fixed_mrp' ? (
                  <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                    MRP
                    <input
                      className={`${inputCls} mt-1`}
                      inputMode="decimal"
                      value={d.fixed_price}
                      onChange={(e) => patchDraft(p.id, { fixed_price: e.target.value })}
                    />
                  </label>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                      Wastage %
                      <input
                        className={`${inputCls} mt-1`}
                        inputMode="decimal"
                        value={d.wastage_pct}
                        onChange={(e) => patchDraft(p.id, { wastage_pct: e.target.value })}
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                      MC
                      <input
                        className={`${inputCls} mt-1`}
                        inputMode="decimal"
                        value={d.mc_rate}
                        onChange={(e) => patchDraft(p.id, { mc_rate: e.target.value })}
                      />
                    </label>
                    <label className="col-span-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50 sm:col-span-1">
                      MC type
                      <select
                        className={`${inputCls} mt-1`}
                        value={d.mc_type}
                        onChange={(e) => patchDraft(p.id, { mc_type: e.target.value })}
                      >
                        <option value="MC/GM">MC/GM</option>
                        <option value="MC/PC">MC/PC</option>
                      </select>
                    </label>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={savingId === p.id || !dirty}
                    onClick={() => void saveOne(p.id)}
                  >
                    {savingId === p.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save
                  </button>
                  {p.has_override ? (
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={savingId === p.id}
                      onClick={() => void revertOne(p.id)}
                    >
                      <RotateCcw className="size-4" />
                      Catalogue price
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!loading && products.length < total ? (
        <button
          type="button"
          className={`${btnGhost} w-full`}
          disabled={loadingMore}
          onClick={() => void load(products.length, true)}
        >
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
          Load more
        </button>
      ) : null}

      {dirtyIds.length ? (
        <div className="fixed inset-x-0 bottom-[var(--kc-mobile-nav-stack,0px)] z-30 border-t border-[var(--color-slate-700,#e8e4df)] bg-white/95 px-4 py-3 backdrop-blur-sm md:bottom-0">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
              {dirtyIds.length} unsaved
            </p>
            <button type="button" className={btnPrimary} disabled={savingAll} onClick={() => void saveAll()}>
              {savingAll ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

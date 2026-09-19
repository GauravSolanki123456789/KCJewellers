'use client'

import { useCallback, useMemo, useState } from 'react'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'
import {
  createPricelistProductInline,
  formatSlabKeyLabel,
  patchPricelistProduct,
  type PricelistProduct,
} from '@/lib/reseller-pricelist'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { cn } from '@/lib/utils'
import { ImagePlus, Loader2, Save } from 'lucide-react'

type Props = {
  product: PricelistProduct
  subcategoryName: string
  slabKeys: string[]
  onPhotoClick: (productId: number) => void
  photoBusy: boolean
  onSaved: (product: PricelistProduct) => void
  onError: (msg: string) => void
}

export function PricelistInlineProductRow({
  product,
  subcategoryName,
  slabKeys,
  onPhotoClick,
  photoBusy,
  onSaved,
  onError,
}: Props) {
  const keys = useMemo(
    () => (slabKeys.length ? slabKeys : ['1', 'r', 'w']),
    [slabKeys],
  )
  const [editingRates, setEditingRates] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avgWeight, setAvgWeight] = useState(
    product.avg_weight != null ? String(product.avg_weight) : '',
  )
  const [slabDraft, setSlabDraft] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const k of keys) {
      const v = product.slab_rates?.[k]
      out[k] = v != null && Number.isFinite(Number(v)) ? String(v) : ''
    }
    return out
  })

  const saveRates = useCallback(async () => {
    setBusy(true)
    onError('')
    try {
      const avgRaw = avgWeight.trim()
      const avgNum = avgRaw ? parseFloat(avgRaw.replace(/,/g, '')) : null
      const slab_rates: Record<string, number> = {}
      for (const k of keys) {
        const raw = slabDraft[k]?.trim()
        if (!raw) continue
        const n = parseFloat(raw.replace(/,/g, ''))
        if (Number.isFinite(n)) slab_rates[k] = n
      }
      const { product: updated } = await patchPricelistProduct(product.id, {
        avg_weight: avgNum != null && Number.isFinite(avgNum) ? avgNum : null,
        slab_rates,
      })
      onSaved(updated)
      setEditingRates(false)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      onError(msg || 'Could not save rates')
    } finally {
      setBusy(false)
    }
  }, [avgWeight, slabDraft, keys, product.id, onSaved, onError])

  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={normalizeCatalogImageSrc(product.image_url) || product.image_url}
            alt=""
            className="size-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]/25">
            <ImagePlus className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
            {product.product_name}
          </p>
          <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
            {subcategoryName} · Photo: <code className="text-[10px]">{product.product_slug}.webp</code>
            {product.avg_weight != null ? ` · ${product.avg_weight} gm` : ''}
          </p>
          {!editingRates && keys.some((k) => product.slab_rates?.[k] != null) ? (
            <p className="mt-0.5 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/55">
              {keys
                .filter((k) => product.slab_rates?.[k] != null)
                .map((k) => `${formatSlabKeyLabel(k)}: ${product.slab_rates[k]}`)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <button
          type="button"
          disabled={photoBusy}
          onClick={() => onPhotoClick(product.id)}
          className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] disabled:opacity-60"
        >
          {photoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
          Upload photo
        </button>
        <button
          type="button"
          onClick={() => setEditingRates((v) => !v)}
          className={cn(
            'inline-flex min-h-[40px] items-center justify-center rounded-xl border px-3 text-xs font-semibold',
            editingRates
              ? 'border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/[0.06] text-[var(--color-jewelry-black,#1a1814)]'
              : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]',
          )}
        >
          {editingRates ? 'Close rates' : 'Edit rates'}
        </button>
      </div>
      {editingRates ? (
        <div className="w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3 sm:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                Avg wt (g)
              </label>
              <input
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 text-sm text-[var(--color-jewelry-black,#1a1814)]"
                value={avgWeight}
                onChange={(e) => setAvgWeight(e.target.value)}
                inputMode="decimal"
              />
            </div>
            {keys.map((k) => (
              <div key={k}>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
                  {formatSlabKeyLabel(k)}
                </label>
                <input
                  className="mt-1 w-full min-h-[40px] rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 text-sm text-[var(--color-jewelry-black,#1a1814)]"
                  value={slabDraft[k] ?? ''}
                  onChange={(e) => setSlabDraft((prev) => ({ ...prev, [k]: e.target.value }))}
                  inputMode="decimal"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveRates()}
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save rates
          </button>
        </div>
      ) : null}
    </li>
  )
}

type AddProps = {
  subcategoryName: string
  categoryId: number
  suggestionNames: string[]
  onAdded: () => void
  onError: (msg: string) => void
}

export function PricelistAddProductInline({
  subcategoryName,
  categoryId,
  suggestionNames,
  onAdded,
  onError,
}: AddProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const commit = async (raw: string) => {
    const product_name = raw.trim()
    if (!product_name) return
    setBusy(true)
    onError('')
    try {
      const res = await createPricelistProductInline(categoryId, {
        subcategory_name: subcategoryName,
        product_name,
      })
      if (!(res.created > 0)) {
        onError('Could not add product — check name and try again')
        return
      }
      setName('')
      setOpen(false)
      onAdded()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      onError(msg || 'Could not add product')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <li className="border-t border-[var(--color-slate-700,#e8e4df)]/50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]/75 hover:border-[var(--kc-accent,#c41e3a)]/35"
        >
          <PlusIcon />
          Add item
        </button>
      </li>
    )
  }

  return (
    <li className="border-t border-[var(--color-slate-700,#e8e4df)]/50 px-3 py-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
        Add to {subcategoryName}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ErpBillingSuggestField
            value={name}
            placeholder="Product name…"
            options={suggestionNames}
            allowCreate
            preserveCase
            autoFocus
            onChange={setName}
            onCommit={(v) => void commit(v)}
          />
        </div>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void commit(name)}
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false)
            setName('')
          }}
          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
        >
          Cancel
        </button>
      </div>
    </li>
  )
}

function PlusIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

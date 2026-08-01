'use client'

import type { ResellerSlabFormState, SlabTierForm } from '@/lib/reseller-catalog-slab-form'

type SlabKey = 'slab_r' | 'slab_w' | 'slab_f'

const SLAB_BLOCKS: { key: SlabKey; label: string; showSilverOffset: boolean; showWastage: boolean }[] = [
  { key: 'slab_r', label: 'Slab R (Retail)', showSilverOffset: true, showWastage: false },
  { key: 'slab_w', label: 'Slab W (Wholesale MC)', showSilverOffset: false, showWastage: false },
  { key: 'slab_f', label: 'Slab F (Wholesale + wastage)', showSilverOffset: false, showWastage: true },
]

type Props = {
  form: ResellerSlabFormState
  onChange: (next: ResellerSlabFormState) => void
  variant?: 'admin' | 'light'
  disabled?: boolean
}

function fieldClass(variant: 'admin' | 'light') {
  return variant === 'admin'
    ? 'w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100'
    : 'w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-sm text-[var(--color-jewelry-black,#1a1814)]'
}

function labelClass(variant: 'admin' | 'light') {
  return variant === 'admin'
    ? 'mb-1 block text-[10px] text-slate-500'
    : 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45'
}

function blockClass(variant: 'admin' | 'light') {
  return variant === 'admin'
    ? 'mb-4 last:mb-0 rounded-lg border border-slate-800/80 p-3'
    : 'mb-4 last:mb-0 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]/60 p-3 sm:p-4'
}

function titleClass(variant: 'admin' | 'light') {
  return variant === 'admin'
    ? 'mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/90'
    : 'mb-3 text-xs font-bold uppercase tracking-wide text-[var(--kc-accent,#c41e3a)]'
}

function updateTier(
  form: ResellerSlabFormState,
  key: SlabKey,
  patch: Partial<SlabTierForm>,
): ResellerSlabFormState {
  return { ...form, [key]: { ...form[key], ...patch } }
}

export function ResellerCatalogSlabSettingsPanel({
  form,
  onChange,
  variant = 'light',
  disabled = false,
}: Props) {
  return (
    <div className="space-y-1">
      {SLAB_BLOCKS.map(({ key, label, showSilverOffset, showWastage }) => (
        <div key={key} className={blockClass(variant)}>
          <p className={titleClass(variant)}>{label}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <label className="block">
              <span className={labelClass(variant)}>MC disc %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                disabled={disabled}
                value={form[key].mc_discount_pct}
                onChange={(e) => onChange(updateTier(form, key, { mc_discount_pct: e.target.value }))}
                className={fieldClass(variant)}
              />
            </label>
            {showSilverOffset ? (
              <label className="block">
                <span className={labelClass(variant)}>Silver −₹/g</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={disabled}
                  value={form[key].silver_rate_offset_per_g}
                  onChange={(e) =>
                    onChange(updateTier(form, key, { silver_rate_offset_per_g: e.target.value }))
                  }
                  className={fieldClass(variant)}
                />
              </label>
            ) : showWastage ? (
              <label className="block">
                <span className={labelClass(variant)}>Wastage −pts</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  disabled={disabled}
                  value={form[key].wastage_discount_pct}
                  onChange={(e) =>
                    onChange(updateTier(form, key, { wastage_discount_pct: e.target.value }))
                  }
                  className={fieldClass(variant)}
                />
              </label>
            ) : (
              <div className="hidden sm:block" aria-hidden />
            )}
            <label className="block">
              <span className={labelClass(variant)}>Gift / MRP disc %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                disabled={disabled}
                value={form[key].gift_discount_pct}
                onChange={(e) => onChange(updateTier(form, key, { gift_discount_pct: e.target.value }))}
                className={fieldClass(variant)}
              />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className={labelClass(variant)}>Margin %</span>
              <input
                type="number"
                min={0}
                max={1000}
                step={0.5}
                disabled={disabled}
                value={form[key].margin_pct}
                onChange={(e) => onChange(updateTier(form, key, { margin_pct: e.target.value }))}
                className={fieldClass(variant)}
                placeholder="0"
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

export const RESELLER_CATALOG_SLAB_HELP =
  'Defaults for Slab R / W / F when you create WhatsApp catalogue links and on your custom-domain storefront (Slab R margin). MC and gift discounts are percentages; Slab R silver offset is ₹ subtracted from today\'s 999 silver ₹/g. Margin % adds to the final price — use when discounts are 0.'

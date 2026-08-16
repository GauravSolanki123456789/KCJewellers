'use client'

import type { ResellerSlabFormState, SlabTierForm } from '@/lib/reseller-catalog-slab-form'

type SlabKey = 'slab_r' | 'slab_w' | 'slab_f' | 'gold_slab_r' | 'gold_slab_w' | 'gold_slab_f'

const SILVER_BLOCKS: { key: SlabKey; label: string; showSilverOffset: boolean; showWastage: boolean }[] = [
  { key: 'slab_r', label: 'Slab R (Retail)', showSilverOffset: true, showWastage: false },
  { key: 'slab_w', label: 'Slab W (Wholesale MC)', showSilverOffset: false, showWastage: false },
  { key: 'slab_f', label: 'Slab F (Wholesale + wastage)', showSilverOffset: false, showWastage: true },
]

const GOLD_BLOCKS: { key: SlabKey; label: string; showGoldOffset: boolean; showWastage: boolean; discountField: 'wastage_disc' | 'none' }[] = [
  { key: 'gold_slab_r', label: 'Gold Slab R (Retail)', showGoldOffset: true, showWastage: false, discountField: 'wastage_disc' },
  { key: 'gold_slab_w', label: 'Gold Slab W (Wholesale MC)', showGoldOffset: false, showWastage: false, discountField: 'wastage_disc' },
  { key: 'gold_slab_f', label: 'Gold Slab F (Wholesale + wastage)', showGoldOffset: false, showWastage: true, discountField: 'none' },
]

type Props = {
  form: ResellerSlabFormState
  onChange: (next: ResellerSlabFormState) => void
  variant?: 'admin' | 'light'
  disabled?: boolean
  /** When set, show only silver/gift or gold slab blocks. */
  metalScope?: 'silver' | 'gold' | 'all'
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

function sectionTitleClass(variant: 'admin' | 'light') {
  return variant === 'admin'
    ? 'mb-3 text-sm font-semibold text-slate-200'
    : 'mb-2 text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]'
}

function updateTier(
  form: ResellerSlabFormState,
  key: SlabKey,
  patch: Partial<SlabTierForm>,
): ResellerSlabFormState {
  return { ...form, [key]: { ...form[key], ...patch } }
}

function TierGrid({
  form,
  onChange,
  blockKey,
  label,
  variant,
  disabled,
  rateOffsetKey,
  showRateOffset,
  showWastage,
  discountField = 'gift',
}: {
  form: ResellerSlabFormState
  onChange: (next: ResellerSlabFormState) => void
  blockKey: SlabKey
  label: string
  variant: 'admin' | 'light'
  disabled?: boolean
  rateOffsetKey: 'silver_rate_offset_per_g' | 'gold_rate_offset_per_g'
  showRateOffset: boolean
  showWastage: boolean
  /** Gold blocks use wastage disc % instead of gift / MRP disc. Use `none` when Wastage −pts is shown. */
  discountField?: 'gift' | 'wastage_disc' | 'none'
}) {
  const rateLabel = rateOffsetKey === 'gold_rate_offset_per_g' ? 'Gold −₹/g' : 'Silver −₹/g'
  return (
    <div className={blockClass(variant)}>
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
            value={form[blockKey].mc_discount_pct}
            onChange={(e) => onChange(updateTier(form, blockKey, { mc_discount_pct: e.target.value }))}
            className={fieldClass(variant)}
          />
        </label>
        {showRateOffset ? (
          <label className="block">
            <span className={labelClass(variant)}>{rateLabel}</span>
            <input
              type="number"
              min={0}
              step={1}
              disabled={disabled}
              value={form[blockKey][rateOffsetKey]}
              onChange={(e) => onChange(updateTier(form, blockKey, { [rateOffsetKey]: e.target.value }))}
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
              value={form[blockKey].wastage_discount_pct}
              onChange={(e) =>
                onChange(updateTier(form, blockKey, { wastage_discount_pct: e.target.value }))
              }
              className={fieldClass(variant)}
            />
          </label>
        ) : (
          <div className="hidden sm:block" aria-hidden />
        )}
        {discountField === 'none' ? (
          <div className="hidden sm:block" aria-hidden />
        ) : (
        <label className="block">
          <span className={labelClass(variant)}>
            {discountField === 'wastage_disc' ? 'Wastage disc %' : 'Gift / MRP disc %'}
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            disabled={disabled}
            value={
              discountField === 'wastage_disc'
                ? form[blockKey].wastage_discount_pct
                : form[blockKey].gift_discount_pct
            }
            onChange={(e) =>
              onChange(
                updateTier(
                  form,
                  blockKey,
                  discountField === 'wastage_disc'
                    ? { wastage_discount_pct: e.target.value }
                    : { gift_discount_pct: e.target.value },
                ),
              )
            }
            className={fieldClass(variant)}
          />
        </label>
        )}
        <label className="col-span-2 block sm:col-span-1">
          <span className={labelClass(variant)}>Margin %</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={0.5}
            disabled={disabled}
            value={form[blockKey].margin_pct}
            onChange={(e) => onChange(updateTier(form, blockKey, { margin_pct: e.target.value }))}
            className={fieldClass(variant)}
            placeholder="0"
          />
        </label>
      </div>
    </div>
  )
}

export function ResellerCatalogSlabSettingsPanel({
  form,
  onChange,
  variant = 'light',
  disabled = false,
  metalScope = 'all',
}: Props) {
  const showSilver = metalScope === 'all' || metalScope === 'silver'
  const showGold = metalScope === 'all' || metalScope === 'gold'

  return (
    <div className="space-y-1">
      {showSilver ? (
        <div>
          {metalScope === 'all' ? (
            <p className={sectionTitleClass(variant)}>Silver &amp; gift items</p>
          ) : null}
          {SILVER_BLOCKS.map(({ key, label, showSilverOffset, showWastage }) => (
            <TierGrid
              key={key}
              form={form}
              onChange={onChange}
              blockKey={key}
              label={label}
              variant={variant}
              disabled={disabled}
              rateOffsetKey="silver_rate_offset_per_g"
              showRateOffset={showSilverOffset}
              showWastage={showWastage}
            />
          ))}
        </div>
      ) : null}
      {showGold ? (
        <div className={showSilver && metalScope === 'all' ? 'mt-6 border-t border-[var(--color-slate-700,#e8e4df)] pt-5' : ''}>
          {metalScope === 'all' ? (
            <p className={sectionTitleClass(variant)}>Gold products</p>
          ) : null}
          {GOLD_BLOCKS.map(({ key, label, showGoldOffset, showWastage, discountField }) => (
            <TierGrid
              key={key}
              form={form}
              onChange={onChange}
              blockKey={key}
              label={label}
              variant={variant}
              disabled={disabled}
              rateOffsetKey="gold_rate_offset_per_g"
              showRateOffset={showGoldOffset}
              showWastage={showWastage}
              discountField={discountField}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const RESELLER_CATALOG_SLAB_HELP =
  'Defaults for Slab R / W / F when you create WhatsApp catalogue links, on your storefront, and in Jewellery ERP billing. Silver & gift items use the first block; gold jewellery uses the gold block. MC discount is a percentage; gold slabs use wastage disc % (points off wastage — on Slab R this reduces MC derived from wastage). Slab R offsets subtract ₹/g from today\'s live rate. Margin % adds to the final price — use when discounts are 0.'

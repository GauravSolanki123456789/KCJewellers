'use client'

import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'
import { styleOptionsForCatalog } from '@/components/reseller/erp/ErpBillingStyleSkuCell'
import {
  filterSkusForStyle,
  findStyleForSku,
  isGiftManualLine,
  uniqueSkusFromCatalog,
  type DesignBillingStyle,
} from '@/lib/erp-billing-shortcuts'
import { findDesignOptionLabel } from '@/lib/erp-catalog-product'
import { giftMrpSlabPrice } from '@/lib/erp-gift-mrp-pricing'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { X } from 'lucide-react'

const WEIGHT_BAND: { key: keyof ErpBillLine; label: string }[] = [
  { key: 'weightGm', label: 'NETWT' },
  { key: 'gross_weight', label: 'GROSS' },
  { key: 'bags', label: 'BAGS' },
  { key: 'bag_wt', label: 'BAGWT' },
  { key: 'purity', label: 'PURITY' },
  { key: 'wastage_pct', label: 'WAST%' },
  { key: 'ratePerGram', label: 'RATE' },
]

const CHARGE_BAND: { key: keyof ErpBillLine; label: string }[] = [
  { key: 'mc_rate', label: 'MC' },
  { key: 'mc_type', label: 'MCTYPE' },
  { key: 'qty', label: 'PCS' },
  { key: 'box_charges', label: 'BOX' },
  { key: 'stone_charges', label: 'FINISH' },
  { key: 'metal_type', label: 'METAL' },
  { key: 'fixed_price', label: 'FIXED' },
]

const NUMERIC_KEYS = new Set<keyof ErpBillLine>([
  'weightGm',
  'gross_weight',
  'bag_wt',
  'bags',
  'purity',
  'wastage_pct',
  'ratePerGram',
  'mc_rate',
  'qty',
  'box_charges',
  'stone_charges',
  'fixed_price',
])

type Props = {
  line: ErpBillLine
  idx: number
  lineKey: string
  catalog: DesignBillingStyle[]
  highlight?: boolean
  manualFocus: { lineKey: string; field: keyof ErpBillLine } | null
  cellValue: (key: keyof ErpBillLine) => string
  inputRef: (field: keyof ErpBillLine, el: HTMLInputElement | null) => void
  onSkuChange: (v: string) => void
  onStyleChange: (v: string) => void
  onSkuCommit: (sku: string, style: string) => void
  onStyleCommit: (style: string) => void
  onProductChange: (name: string) => void
  onProductCommit: (name: string, imageUrl?: string | null) => void
  onSizeChange: (label: string) => void
  onSizeCommit: (label: string) => void
  onNumericChange: (field: keyof ErpBillLine, raw: string) => void
  onNumericBlur: (field: keyof ErpBillLine) => void
  onAdvance: (field: keyof ErpBillLine) => void
  onPatch: (patch: Partial<ErpBillLine>) => void
  onDelete: () => void
  rowRef: (el: HTMLTableRowElement | null) => void
  rateSlab: ErpRateSlab
  slabSettings: ResellerSlabSettings
}

export function ErpBillingStackedRow({
  line,
  idx,
  lineKey,
  catalog,
  highlight,
  manualFocus,
  cellValue,
  inputRef,
  onSkuChange,
  onStyleChange,
  onSkuCommit,
  onStyleCommit,
  onProductChange,
  onProductCommit,
  onSizeChange,
  onSizeCommit,
  onNumericChange,
  onNumericBlur,
  onAdvance,
  onPatch,
  onDelete,
  rowRef,
  rateSlab,
  slabSettings,
}: Props) {
  const gift = isGiftManualLine(line)
  const skuValue = String(line.sku || '')
  const styleValue = String(line.style_code || '')
  const skuOptions = uniqueSkusFromCatalog(catalog).map((x) => x.sku)
  const styleOptions = styleOptionsForCatalog(catalog, styleValue)
  const productOptions = (line.designProductOptions || []).map((p) => p.name)
  const sizeOptions = (line.designSizeOptions || []).map((s) => s.size_label)
  const focused = (field: keyof ErpBillLine) =>
    manualFocus?.lineKey === lineKey && manualFocus.field === field

  const bandInput = (field: keyof ErpBillLine, readOnly = false) => {
    const numeric = NUMERIC_KEYS.has(field)
    return (
      <input
        ref={(el) => inputRef(field, el)}
        autoFocus={focused(field)}
        type="text"
        inputMode={numeric ? 'decimal' : 'text'}
        readOnly={readOnly}
        className="w-full min-w-0 rounded-full border border-emerald-300 bg-white px-2 py-1.5 text-xs tabular-nums text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)]/50"
        value={cellValue(field)}
        onChange={(e) => {
          if (readOnly) return
          onNumericChange(field, e.target.value)
        }}
        onBlur={() => {
          if (readOnly) return
          onNumericBlur(field)
        }}
        onFocus={(e) => {
          e.currentTarget.select()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault()
            onAdvance(field)
          }
        }}
      />
    )
  }

  return (
    <tr
      ref={rowRef}
      className={`border-b border-[var(--color-slate-700,#e8e4df)]/50 ${
        highlight ? 'bg-amber-100 ring-2 ring-amber-400 ring-inset' : 'bg-emerald-50/40'
      }`}
    >
      <td className="align-top px-2 py-3 text-sm font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
        {idx + 1}
      </td>
      <td colSpan={22} className="px-2 py-2">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
              SKU
              <ErpBillingSuggestField
                value={skuValue}
                placeholder="SKU…"
                options={skuOptions.length ? skuOptions : filterSkusForStyle(catalog, styleValue, skuValue)}
                autoFocus={focused('sku')}
                inputRef={(el) => inputRef('sku', el)}
                onChange={onSkuChange}
                onCommit={(v) => {
                  const style = findStyleForSku(catalog, v) || styleValue
                  onSkuCommit(v, style)
                }}
              />
            </label>
            <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
              Style
              <ErpBillingSuggestField
                value={styleValue}
                placeholder="Style…"
                options={styleOptions}
                autoFocus={focused('style_code')}
                inputRef={(el) => inputRef('style_code', el)}
                onChange={onStyleChange}
                onCommit={onStyleCommit}
              />
            </label>
            <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
              Product
              <ErpBillingSuggestField
                value={String(line.name || '')}
                placeholder="Product…"
                options={productOptions}
                autoFocus={focused('name')}
                inputRef={(el) => inputRef('name', el)}
                onChange={onProductChange}
                onCommit={(name) => {
                  const hit = (line.designProductOptions || []).find(
                    (p) => p.name.trim().toUpperCase() === name.trim().toUpperCase(),
                  )
                  onProductCommit(name, hit?.image_url)
                }}
              />
            </label>
            <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
              Inv.item
              <input
                ref={(el) => inputRef('invoice_item_name', el)}
                className="mt-0.5 w-full rounded-xl border border-emerald-300 bg-white px-2 py-1.5 text-xs text-[var(--color-jewelry-black,#1a1814)]"
                value={String(line.invoice_item_name || '')}
                readOnly
              />
            </label>
            <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
              HSN
              <input
                className="mt-0.5 w-full rounded-xl border border-emerald-300 bg-white px-2 py-1.5 text-xs text-[var(--color-jewelry-black,#1a1814)]"
                value={String(line.hsn_code || '')}
                readOnly
              />
            </label>
            {sizeOptions.length > 0 ? (
              <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-accent,#8b1e2d)]">
                Size
                <ErpBillingSuggestField
                  value={String(line.size || '')}
                  placeholder="Size…"
                  options={sizeOptions}
                  autoFocus={focused('size')}
                  inputRef={(el) => inputRef('size', el)}
                  onChange={onSizeChange}
                  onCommit={onSizeCommit}
                />
              </label>
            ) : null}
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <p className="text-sm font-bold tabular-nums text-emerald-700">
                {formatErpInr(line.lineTotalInr ?? 0)}
              </p>
              <button type="button" className="text-rose-500" onClick={onDelete}>
                <X className="size-4" />
              </button>
            </div>
          </div>

          {!gift ? (
            <>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {WEIGHT_BAND.map((f) => (
                  <label
                    key={f.key}
                    className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                  >
                    {f.label}
                    {bandInput(f.key)}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {CHARGE_BAND.filter((f) => {
                  if (f.key === 'stone_charges') return (line.designFinishOptions?.length ?? 0) >= 2
                  if (f.key === 'box_charges') return (line.designBoxOptions?.length ?? 0) >= 2
                  return true
                }).map((f) => (
                  <label
                    key={f.key}
                    className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                  >
                    {f.label}
                    {f.key === 'metal_type' ? (
                      <p className="rounded-full border border-emerald-200 bg-white px-2 py-1.5 text-xs capitalize text-[var(--color-jewelry-black,#1a1814)]">
                        {line.metal_type || 'silver'}
                      </p>
                    ) : f.key === 'box_charges' && (line.designBoxOptions?.length ?? 0) >= 2 ? (
                      <ErpBillingSuggestField
                        value={line.packaging_label || ''}
                        placeholder="Box…"
                        options={line.designBoxOptions!.map((o) => o.label)}
                        preserveCase
                        autoFocus={focused('box_charges')}
                        inputRef={(el) => inputRef('box_charges', el)}
                        onChange={(v) => {
                          if (!v.trim()) {
                            onPatch({ packaging_label: null, box_charges: 0 })
                            return
                          }
                          onPatch({ packaging_label: v })
                        }}
                        onCommit={(label) => {
                          if (!label.trim()) {
                            onPatch({ packaging_label: null, box_charges: 0 })
                            return
                          }
                          const hit = findDesignOptionLabel(line.designBoxOptions, label)
                          const wt = Number(line.weightGm ?? line.originalWeightGm ?? 0) || 0
                          const patch: Partial<ErpBillLine> = {
                            packaging_label: hit?.label ?? label,
                            box_charges: hit?.box_charges ?? 0,
                          }
                          if ((line.mrpMode || wt <= 0) && hit?.fixed_price != null) {
                            const list = hit.fixed_price
                            const slabPrice = giftMrpSlabPrice(list, rateSlab, slabSettings)
                            patch.fixed_price = slabPrice
                            patch.unitInr = slabPrice
                            patch.mrpListPrice = list
                          }
                          onPatch(patch)
                          onAdvance('box_charges')
                        }}
                      />
                    ) : f.key === 'stone_charges' && (line.designFinishOptions?.length ?? 0) >= 2 ? (
                      <ErpBillingSuggestField
                        value={line.finish_label || ''}
                        placeholder="Finish…"
                        options={line.designFinishOptions!.map((o) => o.label)}
                        preserveCase
                        autoFocus={focused('stone_charges')}
                        inputRef={(el) => inputRef('stone_charges', el)}
                        onChange={(v) => {
                          if (!v.trim()) {
                            onPatch({
                              finish_label: null,
                              stone_charges: 0,
                              fixed_price: null,
                              unitInr: null,
                              mrpListPrice: null,
                            })
                            return
                          }
                          onPatch({ finish_label: v })
                        }}
                        onCommit={(label) => {
                          if (!label.trim()) {
                            onPatch({
                              finish_label: null,
                              stone_charges: 0,
                              fixed_price: null,
                              unitInr: null,
                              mrpListPrice: null,
                            })
                            return
                          }
                          const hit = findDesignOptionLabel(line.designFinishOptions, label)
                          const list = Number(hit?.fixed_price ?? 0)
                          const slabPrice =
                            list > 0 ? giftMrpSlabPrice(list, rateSlab, slabSettings) : null
                          onPatch({
                            finish_label: hit?.label ?? label,
                            stone_charges: hit?.stone_charges ?? 0,
                            fixed_price: slabPrice,
                            unitInr: slabPrice,
                            mrpListPrice: list > 0 ? list : null,
                            mrpMode: list > 0 ? true : line.mrpMode,
                          })
                          onAdvance('stone_charges')
                        }}
                      />
                    ) : (
                      bandInput(f.key)
                    )}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {(line.designFinishOptions?.length ?? 0) >= 2 ||
              (line.designBoxOptions?.length ?? 0) >= 2 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(line.designFinishOptions?.length ?? 0) >= 2 ? (
                    <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      Finish
                      <ErpBillingSuggestField
                        value={line.finish_label || ''}
                        placeholder="GP / Standard…"
                        options={line.designFinishOptions!.map((o) => o.label)}
                        preserveCase
                        autoFocus={focused('stone_charges')}
                        inputRef={(el) => inputRef('stone_charges', el)}
                        onChange={(v) => {
                          if (!v.trim()) {
                            onPatch({
                              finish_label: null,
                              stone_charges: 0,
                              fixed_price: null,
                              unitInr: null,
                              mrpListPrice: null,
                            })
                            return
                          }
                          onPatch({ finish_label: v })
                        }}
                        onCommit={(label) => {
                          if (!label.trim()) {
                            onPatch({
                              finish_label: null,
                              stone_charges: 0,
                              fixed_price: null,
                              unitInr: null,
                              mrpListPrice: null,
                            })
                            return
                          }
                          const hit = findDesignOptionLabel(line.designFinishOptions, label)
                          const list = Number(hit?.fixed_price ?? 0)
                          const slabPrice =
                            list > 0 ? giftMrpSlabPrice(list, rateSlab, slabSettings) : null
                          onPatch({
                            finish_label: hit?.label ?? label,
                            stone_charges: hit?.stone_charges ?? 0,
                            fixed_price: slabPrice,
                            unitInr: slabPrice,
                            mrpMode: list > 0 ? true : line.mrpMode,
                            mrpListPrice: list > 0 ? list : null,
                          })
                          onAdvance('stone_charges')
                        }}
                      />
                    </label>
                  ) : null}
                  {(line.designBoxOptions?.length ?? 0) >= 2 ? (
                    <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                      Box
                      <ErpBillingSuggestField
                        value={line.packaging_label || ''}
                        placeholder="With / without box…"
                        options={line.designBoxOptions!.map((o) => o.label)}
                        preserveCase
                        autoFocus={focused('box_charges')}
                        inputRef={(el) => inputRef('box_charges', el)}
                        onChange={(v) => {
                          if (!v.trim()) {
                            onPatch({ packaging_label: null, box_charges: 0 })
                            return
                          }
                          onPatch({ packaging_label: v })
                        }}
                        onCommit={(label) => {
                          if (!label.trim()) {
                            onPatch({ packaging_label: null, box_charges: 0 })
                            return
                          }
                          const hit = findDesignOptionLabel(line.designBoxOptions, label)
                          const patch: Partial<ErpBillLine> = {
                            packaging_label: hit?.label ?? label,
                            box_charges: hit?.box_charges ?? 0,
                          }
                          if (hit?.fixed_price != null) {
                            const list = hit.fixed_price
                            const slabPrice = giftMrpSlabPrice(list, rateSlab, slabSettings)
                            patch.fixed_price = slabPrice
                            patch.unitInr = slabPrice
                            patch.mrpListPrice = list
                          }
                          onPatch(patch)
                          onAdvance('box_charges')
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="grid max-w-xs grid-cols-2 gap-2">
                <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  PCS
                  {bandInput('qty')}
                </label>
                <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  FIXED
                  {bandInput('fixed_price')}
                </label>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

'use client'

import { useMemo, useState } from 'react'
import {
  downloadStockExcelBuilderFile,
  type StockExcelBuilderDefaults,
} from '@/lib/erp-stock-excel-builder'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react'

const FIELD_ROWS: { key: keyof StockExcelBuilderDefaults; label: string; placeholder?: string }[] = [
  { key: 'sku', label: 'SKU', placeholder: 'DOLLAR' },
  { key: 'style_code', label: 'Style', placeholder: 'IMPORTED' },
  { key: 'product_name', label: 'Product', placeholder: 'AYAPPA' },
  { key: 'item_code', label: 'Item code', placeholder: 'AYAPPA' },
  { key: 'size', label: 'Size' },
  { key: 'avg_weight', label: 'Wt (g)' },
  { key: 'gross_weight', label: 'Gross' },
  { key: 'bag_wt', label: 'Bag Wt' },
  { key: 'purity', label: 'Purity', placeholder: '75' },
  { key: 'wastage_pct', label: 'Wast %' },
  { key: 'mc_rate', label: 'MC' },
  { key: 'mc_rate_slab_r', label: 'MC R' },
  { key: 'mc_rate_slab_w', label: 'MC W' },
  { key: 'mc_rate_slab_f', label: 'MC F' },
  { key: 'metal_slab_r_pct', label: 'Met R%', placeholder: '100' },
  { key: 'metal_slab_w_pct', label: 'Met W%', placeholder: '94' },
  { key: 'metal_slab_f_pct', label: 'Met F%', placeholder: '92' },
  { key: 'mc_type', label: 'MCType', placeholder: 'MC/GM' },
  { key: 'pcs', label: 'PCS', placeholder: '1' },
  { key: 'box_charges', label: 'Box charges' },
  { key: 'stone_charges', label: 'Stone charges' },
  { key: 'stone_wt', label: 'Stone Wt' },
  { key: 'metal_type', label: 'Metal', placeholder: 'SILVER' },
  { key: 'bags', label: 'Bags' },
  { key: 'fixed_price', label: 'Fixed price' },
  { key: 'chain_wt_only', label: 'Chain' },
  { key: 'pendant_wt_only', label: 'Pendant' },
  { key: 'earring_wt_only', label: 'Earring' },
]

type Props = {
  existingSkus?: string[]
  existingStyles?: string[]
  existingProducts?: string[]
}

export function ErpStockExcelBuilder({ existingSkus = [], existingStyles = [], existingProducts = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [rowCount, setRowCount] = useState('17')
  const [defaults, setDefaults] = useState<StockExcelBuilderDefaults>({
    mc_type: 'MC/GM',
    pcs: 1,
    metal_type: 'SILVER',
  })

  const filename = useMemo(() => {
    const base = defaults.product_name || defaults.item_code || defaults.sku || 'stock'
    return `${String(base).replace(/\s+/g, '_')}_${rowCount}.xlsx`
  }, [defaults, rowCount])

  const setField = (key: keyof StockExcelBuilderDefaults, value: string) => {
    setDefaults((prev) => ({ ...prev, [key]: value }))
  }

  const createExcel = () => {
    const n = parseInt(rowCount, 10)
    if (!Number.isFinite(n) || n < 1) {
      alert('Enter how many rows you need (1–500).')
      return
    }
    downloadStockExcelBuilderFile(defaults, n, filename)
  }

  return (
    <div className={erpCardCls}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <FileSpreadsheet className="size-4 text-emerald-700" />
          Build Excel template (no upload file needed)
        </span>
        {open ? <ChevronUp className="size-4 opacity-50" /> : <ChevronDown className="size-4 opacity-50" />}
      </button>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            Fill defaults below, set row count, then create Excel with auto barcodes. Upload the file like any stock
            Excel — edit weights in the sheet or use the in-app editor.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_ROWS.map(({ key, label, placeholder }) => (
              <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                {label}
                {key === 'sku' && existingSkus.length ? (
                  <select
                    className={`${erpInputCls} mt-1 text-xs`}
                    value={String(defaults.sku ?? '')}
                    onChange={(e) => setField('sku', e.target.value)}
                  >
                    <option value="">Type new…</option>
                    {existingSkus.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : key === 'style_code' && existingStyles.length ? (
                  <select
                    className={`${erpInputCls} mt-1 text-xs`}
                    value={String(defaults.style_code ?? '')}
                    onChange={(e) => setField('style_code', e.target.value)}
                  >
                    <option value="">Type new…</option>
                    {existingStyles.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : key === 'product_name' && existingProducts.length ? (
                  <select
                    className={`${erpInputCls} mt-1 text-xs`}
                    value={String(defaults.product_name ?? '')}
                    onChange={(e) => {
                      setField('product_name', e.target.value)
                      if (!defaults.item_code) setField('item_code', e.target.value)
                    }}
                  >
                    <option value="">Type new…</option>
                    {existingProducts.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={`${erpInputCls} mt-1 text-xs`}
                    placeholder={placeholder}
                    value={String(defaults[key] ?? '')}
                    onChange={(e) => setField(key, e.target.value)}
                  />
                )}
              </label>
            ))}
            <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
              How many rows?
              <input
                className={`${erpInputCls} mt-1 text-xs`}
                inputMode="numeric"
                value={rowCount}
                onChange={(e) => setRowCount(e.target.value)}
                placeholder="17"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnPrimary} onClick={createExcel}>
              <FileSpreadsheet className="size-4" />
              Create Excel
            </button>
            <button type="button" className={erpBtnGhost} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

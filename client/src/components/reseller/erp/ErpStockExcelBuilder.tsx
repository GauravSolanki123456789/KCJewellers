'use client'

import { useMemo, useState } from 'react'
import {
  downloadStockExcelBuilderFile,
  type StockExcelBuilderBlock,
  type StockExcelBuilderDefaults,
} from '@/lib/erp-stock-excel-builder'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { FileSpreadsheet, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

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
  { key: 'image_url', label: 'Image', placeholder: 'https://…' },
  { key: 'bags', label: 'Bags' },
  { key: 'fixed_price', label: 'Fixed price' },
  { key: 'chain_wt_only', label: 'Chain' },
  { key: 'pendant_wt_only', label: 'Pendant' },
  { key: 'earring_wt_only', label: 'Earring' },
]

const DEFAULT_BLOCK: StockExcelBuilderDefaults = {
  mc_type: 'MC/GM',
  pcs: 1,
  metal_type: 'SILVER',
}

type BlockState = {
  id: string
  defaults: StockExcelBuilderDefaults
  rowCount: string
}

function newBlock(id: string, copy?: StockExcelBuilderDefaults): BlockState {
  return {
    id,
    defaults: copy ? { ...copy } : { ...DEFAULT_BLOCK },
    rowCount: '10',
  }
}

type Props = {
  existingSkus?: string[]
  existingStyles?: string[]
  existingProducts?: string[]
}

export function ErpStockExcelBuilder({ existingSkus = [], existingStyles = [], existingProducts = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [blocks, setBlocks] = useState<BlockState[]>(() => [newBlock('b1')])

  const totalRows = useMemo(
    () => blocks.reduce((n, b) => n + (parseInt(b.rowCount, 10) || 0), 0),
    [blocks],
  )

  const filename = useMemo(() => {
    const names = blocks
      .map((b) => b.defaults.product_name || b.defaults.item_code || b.defaults.sku)
      .filter(Boolean)
      .slice(0, 3)
    const base = names.length ? names.join('_') : 'stock'
    return `${String(base).replace(/\s+/g, '_')}_${totalRows || 1}.xlsx`
  }, [blocks, totalRows])

  const setBlockField = (blockId: string, key: keyof StockExcelBuilderDefaults, value: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, defaults: { ...b.defaults, [key]: value } } : b,
      ),
    )
  }

  const setBlockRows = (blockId: string, value: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, rowCount: value } : b)))
  }

  const addBlock = () => {
    const last = blocks[blocks.length - 1]?.defaults
    setBlocks((prev) => [...prev, newBlock(`b${Date.now()}`, last)])
  }

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== blockId)))
  }

  const createExcel = () => {
    const payload: StockExcelBuilderBlock[] = []
    for (const b of blocks) {
      const n = parseInt(b.rowCount, 10)
      if (!Number.isFinite(n) || n < 1) {
        alert('Each product block needs a valid row count (1–500).')
        return
      }
      if (!b.defaults.product_name?.trim() && !b.defaults.item_code?.trim()) {
        alert('Each block needs at least a Product or Item code.')
        return
      }
      payload.push({ defaults: b.defaults, rowCount: n })
    }
    downloadStockExcelBuilderFile(payload, filename)
  }

  const renderField = (
    block: BlockState,
    key: keyof StockExcelBuilderDefaults,
    label: string,
    placeholder?: string,
  ) => {
    const listId = `${block.id}-${key}-list`
    const value = String(block.defaults[key] ?? '')

    if (key === 'sku' && existingSkus.length) {
      return (
        <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          {label}
          <input
            className={`${erpInputCls} mt-1 text-xs`}
            list={listId}
            placeholder={placeholder || 'Type or pick SKU…'}
            value={value}
            onChange={(e) => setBlockField(block.id, 'sku', e.target.value.toUpperCase())}
          />
          <datalist id={listId}>
            {existingSkus.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )
    }

    if (key === 'style_code' && existingStyles.length) {
      return (
        <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          {label}
          <input
            className={`${erpInputCls} mt-1 text-xs`}
            list={listId}
            placeholder={placeholder || 'Type or pick style…'}
            value={value}
            onChange={(e) => setBlockField(block.id, 'style_code', e.target.value.toUpperCase())}
          />
          <datalist id={listId}>
            {existingStyles.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )
    }

    if (key === 'product_name' && existingProducts.length) {
      return (
        <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          {label}
          <input
            className={`${erpInputCls} mt-1 text-xs`}
            list={listId}
            placeholder={placeholder || 'Type or pick product…'}
            value={value}
            onChange={(e) => {
              const v = e.target.value
              setBlockField(block.id, 'product_name', v)
              if (!block.defaults.item_code) setBlockField(block.id, 'item_code', v)
            }}
          />
          <datalist id={listId}>
            {existingProducts.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      )
    }

    return (
      <label key={key} className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
        {label}
        <input
          className={`${erpInputCls} mt-1 text-xs`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setBlockField(block.id, key, e.target.value)}
        />
      </label>
    )
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
          Build Excel template
        </span>
        {open ? <ChevronUp className="size-4 opacity-50" /> : <ChevronDown className="size-4 opacity-50" />}
      </button>
      {open ? (
        <div className="mt-3 space-y-4 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]/40 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Product block {idx + 1}
                  {block.defaults.product_name ? ` · ${block.defaults.product_name}` : ''}
                </p>
                {blocks.length > 1 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700"
                    onClick={() => removeBlock(block.id)}
                  >
                    <Trash2 className="size-3" />
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {FIELD_ROWS.map(({ key, label, placeholder }) => renderField(block, key, label, placeholder))}
                <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
                  How many rows?
                  <input
                    className={`${erpInputCls} mt-1 text-xs`}
                    inputMode="numeric"
                    value={block.rowCount}
                    onChange={(e) => setBlockRows(block.id, e.target.value)}
                    placeholder="17"
                  />
                </label>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} onClick={addBlock}>
              <Plus className="size-4" />
              Add another product (e.g. Lakshmi, Saraswati…)
            </button>
            <button type="button" className={erpBtnPrimary} onClick={createExcel}>
              <FileSpreadsheet className="size-4" />
              Create Excel ({totalRows} row{totalRows !== 1 ? 's' : ''})
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

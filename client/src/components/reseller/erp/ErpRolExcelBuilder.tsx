'use client'

import { useMemo, useState } from 'react'
import {
  downloadRolExcelFromBlocks,
  downloadRolExcelTemplate,
  type RolExcelBuilderBlock,
} from '@/lib/erp-rol-excel'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { ChevronDown, ChevronUp, FileSpreadsheet, Plus, Trash2 } from 'lucide-react'

function emptyBlock(): RolExcelBuilderBlock {
  return {
    style_code: '',
    sku: '',
    product_name: '',
    sizes: '',
    rol_wt_g: '',
    rowCount: '1',
  }
}

export function ErpRolExcelBuilder() {
  const [open, setOpen] = useState(false)
  const [blocks, setBlocks] = useState<RolExcelBuilderBlock[]>(() => [emptyBlock()])

  const totalRows = useMemo(() => {
    return blocks.reduce((n, b) => {
      const sizes = b.sizes.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean)
      if (sizes.length) return n + sizes.length
      return n + (parseInt(b.rowCount, 10) || 0)
    }, 0)
  }, [blocks])

  const setField = (i: number, key: keyof RolExcelBuilderBlock, value: string) => {
    setBlocks((prev) => prev.map((b, j) => (j === i ? { ...b, [key]: value } : b)))
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
          {blocks.map((b, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]/40 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Product block {i + 1}
                  {b.product_name ? ` · ${b.product_name}` : ''}
                </p>
                {blocks.length > 1 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700"
                    onClick={() => setBlocks((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-3" />
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['style_code', 'Style', 'BABY BRACELET'],
                    ['sku', 'SKU', 'SACHIN'],
                    ['product_name', 'Product name', 'SCHBR0001-120'],
                    ['sizes', 'Sizes (comma-separated)', '5, 5.5, 6'],
                    ['rol_wt_g', 'ROL WT set (g)', '750'],
                    ['rowCount', 'Rows (if no sizes)', '1'],
                  ] as const
                ).map(([key, label, ph]) => (
                  <label
                    key={key}
                    className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45"
                  >
                    {label}
                    <input
                      className={`${erpInputCls} mt-1 text-xs`}
                      placeholder={ph}
                      value={b[key]}
                      onChange={(e) =>
                        setField(
                          i,
                          key,
                          key === 'style_code' || key === 'sku'
                            ? e.target.value.toUpperCase()
                            : e.target.value,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={erpBtnGhost} onClick={() => setBlocks((p) => [...p, emptyBlock()])}>
              <Plus className="size-4" />
              Add product block
            </button>
            <button
              type="button"
              className={erpBtnPrimary}
              onClick={() =>
                downloadRolExcelFromBlocks(
                  blocks,
                  `rol-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
                )
              }
            >
              <FileSpreadsheet className="size-4" />
              Create Excel ({totalRows} row{totalRows !== 1 ? 's' : ''})
            </button>
            <button type="button" className={erpBtnGhost} onClick={() => downloadRolExcelTemplate()}>
              Download blank template
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

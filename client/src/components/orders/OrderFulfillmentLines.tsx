'use client'

import { Package } from 'lucide-react'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { parseOrderItemsSnapshot, snapshotLineTitle, type OrderSnapshotLine } from '@/lib/order-snapshot'
import { cn } from '@/lib/utils'

function LineMeta({ line }: { line: OrderSnapshotLine }) {
  const parts: string[] = []
  if (line.style_code) parts.push(line.style_code)
  if (line.sku) parts.push(`SKU ${line.sku}`)
  if (line.barcode) parts.push(`Barcode ${line.barcode}`)
  const wt =
    line.net_wt_g != null && !Number.isNaN(Number(line.net_wt_g))
      ? `${Number(line.net_wt_g).toFixed(2)} g`
      : null
  if (wt) parts.push(wt)
  if (line.metal_type) parts.push(String(line.metal_type))
  return (
    <p className="text-[11px] text-slate-500 truncate">{parts.join(' · ') || '—'}</p>
  )
}

export function OrderFulfillmentLines({
  snapshot,
  className,
  dense,
}: {
  snapshot: unknown
  className?: string
  /** Tighter rows (e.g. B2B expandable) */
  dense?: boolean
}) {
  const lines = parseOrderItemsSnapshot(snapshot)
  if (lines.length === 0) {
    return <p className="text-sm text-slate-500">No line items in snapshot.</p>
  }
  return (
    <ul className={cn('space-y-3', className)}>
      {lines.map((line, idx) => {
        const src = normalizeCatalogImageSrc(line.image_url || undefined)
        const qty = Number(line.qty) || 1
        const lineTotal = (Number(line.price) || 0) * qty
        return (
          <li
            key={`${line.barcode}-${idx}`}
            className={cn(
              'flex gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3',
              dense && 'p-2.5',
            )}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                className={cn(
                  'rounded-md object-cover border border-white/10 bg-slate-800 shrink-0',
                  dense ? 'size-14 sm:size-16' : 'size-16 sm:size-[4.5rem]',
                )}
              />
            ) : (
              <div
                className={cn(
                  'rounded-md border border-white/10 bg-slate-800 flex items-center justify-center shrink-0 text-slate-600',
                  dense ? 'size-14 sm:size-16' : 'size-16 sm:size-[4.5rem]',
                )}
              >
                <Package className="size-6" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('font-medium text-slate-100 leading-snug', dense ? 'text-sm' : 'text-[15px]')}>
                {snapshotLineTitle(line)}
              </p>
              <LineMeta line={line} />
              <p className="text-xs text-slate-400 mt-1">
                Qty {qty}
                {lineTotal > 0 ? (
                  <span className="tabular-nums text-slate-300"> · ₹{Math.round(lineTotal).toLocaleString('en-IN')}</span>
                ) : null}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Compact preview for order list table: first line + thumb, +N more. */
export function OrderItemsColumnPeek({ snapshot }: { snapshot: unknown }) {
  const lines = parseOrderItemsSnapshot(snapshot)
  if (lines.length === 0) {
    return <span className="text-slate-600">—</span>
  }
  const first = lines[0]
  const src = normalizeCatalogImageSrc(first.image_url || undefined)
  const title = snapshotLineTitle(first)
  const more = lines.length - 1
  return (
    <div className="flex items-start gap-2.5 max-w-[min(100%,260px)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="size-10 sm:size-11 rounded-lg object-cover border border-white/10 shrink-0"
        />
      ) : (
        <div className="size-10 sm:size-11 rounded-lg bg-slate-800/80 border border-white/10 shrink-0 flex items-center justify-center">
          <Package className="size-4 text-slate-600" aria-hidden />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm text-slate-200 leading-tight line-clamp-2" title={title}>
          {title}
        </p>
        {more > 0 ? (
          <p className="text-[11px] text-slate-500 mt-0.5">
            +{more} more {more === 1 ? 'line' : 'lines'}
          </p>
        ) : (
          <p className="text-[11px] text-slate-600 mt-0.5 truncate" title={first.barcode || ''}>
            {first.barcode ? `#${first.barcode}` : null}
          </p>
        )}
      </div>
    </div>
  )
}

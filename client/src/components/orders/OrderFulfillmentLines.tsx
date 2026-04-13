'use client'

import { useState } from 'react'
import { Package } from 'lucide-react'
import { normalizeCatalogImageSrc } from '@/lib/normalize-image-url'
import { parseOrderItemsSnapshot, snapshotLineTitle, type OrderSnapshotLine } from '@/lib/order-snapshot'
import { cn } from '@/lib/utils'

function LineMeta({ line, dense }: { line: OrderSnapshotLine; dense?: boolean }) {
  const parts: string[] = []
  const sku = line.sku != null ? String(line.sku).trim() : ''
  const bc = line.barcode != null ? String(line.barcode).trim() : ''
  const skuDupBarcode = sku !== '' && bc !== '' && sku === bc
  if (line.style_code) parts.push(`Style: ${line.style_code}`)
  if (sku && !skuDupBarcode) parts.push(`SKU ${sku}`)
  if (line.barcode) parts.push(`Barcode ${line.barcode}`)
  const wt =
    line.net_wt_g != null && !Number.isNaN(Number(line.net_wt_g))
      ? `${Number(line.net_wt_g).toFixed(2)} g`
      : null
  if (wt) parts.push(wt)
  if (line.metal_type) parts.push(String(line.metal_type))
  return (
    <p className={cn('text-slate-500 truncate', dense ? 'text-[10px]' : 'text-[11px]')}>{parts.join(' · ') || '—'}</p>
  )
}

function LineThumb({ src, dense }: { src: string; dense?: boolean }) {
  const [failed, setFailed] = useState(false)
  const box = cn(
    'rounded-md border border-white/10 bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 overflow-hidden',
    dense ? 'size-12 sm:size-14' : 'size-16 sm:size-[4.5rem]',
  )
  if (!src || failed) {
    return (
      <div className={box}>
        <Package className={dense ? 'size-5' : 'size-6'} aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className={cn(
        'rounded-md object-cover border border-white/10 bg-slate-800 shrink-0',
        dense ? 'size-12 sm:size-14' : 'size-16 sm:size-[4.5rem]',
      )}
      onError={() => setFailed(true)}
    />
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
    <ul className={cn(dense ? 'space-y-2' : 'space-y-3', className)}>
      {lines.map((line, idx) => {
        const src = normalizeCatalogImageSrc(line.image_url || undefined)
        const qty = Number(line.qty) || 1
        const lineTotal = (Number(line.price) || 0) * qty
        return (
          <li
            key={`${line.barcode}-${idx}`}
            className={cn(
              'rounded-lg border border-white/10 bg-slate-900/40',
              dense
                ? 'flex gap-2.5 p-2.5 sm:grid sm:grid-cols-[3.5rem_1fr_auto] sm:items-center sm:gap-3'
                : 'flex gap-3 p-3',
            )}
          >
            <LineThumb src={src} dense={dense} />
            <div className="min-w-0 flex-1">
              <p className={cn('font-medium text-slate-100 leading-snug', dense ? 'text-sm' : 'text-[15px]')}>
                {snapshotLineTitle(line)}
              </p>
              <LineMeta line={line} dense={dense} />
              <p className={cn('text-slate-400', dense ? 'text-[11px] mt-0.5' : 'text-xs mt-1')}>
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

function PeekThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="size-10 rounded-md bg-slate-800/80 border border-white/10 shrink-0 flex items-center justify-center">
        <Package className="size-4 text-slate-600" aria-hidden />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-10 rounded-md object-cover border border-white/10 shrink-0"
      onError={() => setFailed(true)}
    />
  )
}

/** Compact preview for order list table: first line + thumb, +N more. */
export function OrderItemsColumnPeek({
  snapshot,
  compact,
}: {
  snapshot: unknown
  /** Tighter profile / mobile rows */
  compact?: boolean
}) {
  const lines = parseOrderItemsSnapshot(snapshot)
  if (lines.length === 0) {
    return <span className="text-slate-600">—</span>
  }
  const first = lines[0]
  const src = normalizeCatalogImageSrc(first.image_url || undefined)
  const title = snapshotLineTitle(first)
  const more = lines.length - 1
  const fSku = first.sku != null ? String(first.sku).trim() : ''
  const fBc = first.barcode != null ? String(first.barcode).trim() : ''
  const skuPeek = fSku && !(fBc && fSku === fBc) ? `SKU ${fSku}` : null
  const metaBits = [first.style_code ? `Style: ${first.style_code}` : null, skuPeek].filter(Boolean) as string[]
  return (
    <div className={cn('flex items-start gap-2.5', compact ? 'max-w-none' : 'max-w-[min(100%,260px)]')}>
      <PeekThumb src={src} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-slate-200 leading-tight line-clamp-2', compact ? 'text-xs' : 'text-sm')} title={title}>
          {title}
        </p>
        {more > 0 ? (
          <p className="text-[11px] text-slate-500 mt-0.5">
            +{more} more {more === 1 ? 'line' : 'lines'}
          </p>
        ) : (
          <>
            {metaBits.length > 0 ? (
              <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={metaBits.join(' · ')}>
                {metaBits.join(' · ')}
              </p>
            ) : first.barcode ? (
              <p className="text-[11px] text-slate-600 mt-0.5 truncate">Barcode {first.barcode}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

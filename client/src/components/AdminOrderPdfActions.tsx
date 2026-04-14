'use client'

import { useState, useRef, useCallback } from 'react'
import { FileDown, Share2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  adminOrderPdfFilename,
  buildAdminOrderPdfBlob,
  orderPdfCacheKey,
  type AdminOrderPdfSource,
} from '@/lib/build-admin-order-pdf'
import { downloadPdfBlob, sharePdfBlob } from '@/lib/pdf-share'

type Props = {
  order: AdminOrderPdfSource
  /** Icon-first buttons for dense tables (tooltips + aria-labels). */
  compact?: boolean
  className?: string
}

export function AdminOrderPdfActions({ order, compact, className }: Props) {
  const [busy, setBusy] = useState<'dl' | 'share' | null>(null)
  const filename = adminOrderPdfFilename(order.id)

  /** Reuse blob when download + share share the same order data; dedupe parallel builds. */
  const cacheRef = useRef<{ key: string; blob: Blob } | null>(null)
  const inflightRef = useRef<Map<string, Promise<Blob>>>(new Map())

  const getOrBuildPdfBlob = useCallback(async (): Promise<Blob> => {
    const key = orderPdfCacheKey(order)
    const hit = cacheRef.current
    if (hit?.key === key) return hit.blob

    let p = inflightRef.current.get(key)
    if (!p) {
      p = (async () => {
        try {
          const blob = await buildAdminOrderPdfBlob(order)
          cacheRef.current = { key, blob }
          return blob
        } finally {
          inflightRef.current.delete(key)
        }
      })()
      inflightRef.current.set(key, p)
    }
    return p
  }, [order])

  const run = async (mode: 'dl' | 'share') => {
    if (busy) return
    setBusy(mode)
    try {
      const blob = await getOrBuildPdfBlob()
      if (mode === 'dl') {
        downloadPdfBlob(blob, filename)
      } else {
        await sharePdfBlob(blob, filename, {
          title: `KC Jewellers — Order #${order.id}`,
          text: `KC Jewellers — Order #${order.id} (${filename})`,
          fallbackWhatsAppText: `KC Jewellers — Order #${order.id} (${filename}). Attach the PDF you just saved, then share on WhatsApp.`,
        })
      }
    } catch {
      alert('Could not create the PDF. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const baseBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[44px] sm:min-h-0'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="group" aria-label="Order PDF actions">
      <button
        type="button"
        onClick={() => void run('dl')}
        disabled={!!busy}
        className={cn(
          baseBtn,
          compact ? 'px-3 py-2.5' : 'px-3.5 py-2.5',
          'border-amber-500/35 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15',
        )}
        title="Download order PDF"
        aria-label="Download order PDF"
      >
        {busy === 'dl' ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <FileDown className="size-4 shrink-0" />}
        {!compact ? <span>{busy === 'dl' ? 'Preparing…' : 'Download PDF'}</span> : null}
      </button>
      <button
        type="button"
        onClick={() => void run('share')}
        disabled={!!busy}
        className={cn(
          baseBtn,
          compact ? 'px-3 py-2.5' : 'px-3.5 py-2.5',
          'border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50',
        )}
        title="Share order PDF (WhatsApp)"
        aria-label="Share order PDF on WhatsApp"
      >
        {busy === 'share' ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          <Share2 className="size-4 shrink-0" />
        )}
        {!compact ? <span>{busy === 'share' ? 'Preparing…' : 'WhatsApp share'}</span> : null}
      </button>
    </div>
  )
}

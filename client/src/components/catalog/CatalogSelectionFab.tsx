'use client'

import { MessageCircle } from 'lucide-react'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'

type Props = {
  onGenerateClick: () => void
}

export default function CatalogSelectionFab({ onGenerateClick }: Props) {
  const { catalogBuilderMode, selectedProductIds } = useCatalogBuilder()
  const n = selectedProductIds.length
  if (!catalogBuilderMode || n === 0) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-8"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg flex-1 items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/95 px-4 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-md md:gap-4 md:px-5">
        <MessageCircle className="size-4 shrink-0 text-emerald-400/90 md:size-5" aria-hidden />
        <p className="min-w-0 flex-1 text-center text-xs text-slate-200 md:text-sm">
          <span className="font-semibold tabular-nums text-amber-400">{n}</span>
          <span className="text-slate-400"> item{n !== 1 ? 's' : ''} selected</span>
        </p>
        <button
          type="button"
          onClick={onGenerateClick}
          className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 active:scale-[0.98] md:px-4 md:text-sm"
        >
          Generate WhatsApp Catalog
        </button>
      </div>
    </div>
  )
}

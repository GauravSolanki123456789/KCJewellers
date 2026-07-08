'use client'

import { MessageCircle } from 'lucide-react'
import { useCatalogBuilder } from '@/context/CatalogBuilderContext'

type Props = {
  onGenerateClick: () => void
}

export default function CatalogSelectionFab({ onGenerateClick }: Props) {
  const {
    catalogBuilderMode,
    selectedProductIds,
    maxSelectable,
    selectionAtLimit,
    catalogLimits,
  } = useCatalogBuilder()
  const n = selectedProductIds.length
  if (!catalogBuilderMode || n === 0) return null

  const dailyBlocked =
    !catalogLimits.dailyLimitUnlimited && !catalogLimits.canGenerate && n > 0
  const maxLabel =
    maxSelectable != null && maxSelectable > 0 ? ` · max ${maxSelectable}` : ''

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[var(--kc-mobile-nav-stack)] md:pb-8"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex max-w-lg flex-1 flex-col gap-2 rounded-2xl border border-slate-700/80 bg-slate-950/95 px-4 py-2.5 shadow-2xl shadow-black/40 backdrop-blur-md md:gap-3 md:px-5">
        {selectionAtLimit ? (
          <p className="text-center text-[11px] text-amber-300/90">
            Selection limit reached ({maxSelectable} products). Remove items to add more.
          </p>
        ) : null}
        {dailyBlocked ? (
          <p className="text-center text-[11px] text-rose-300/90">
            Daily catalogue limit reached ({catalogLimits.dailyLimit}/day). Try again tomorrow.
          </p>
        ) : null}
        <div className="flex items-center gap-3 md:gap-4">
          <MessageCircle className="size-4 shrink-0 text-emerald-400/90 md:size-5" aria-hidden />
          <p className="min-w-0 flex-1 text-center text-xs text-slate-200 md:text-sm">
            <span className="font-semibold tabular-nums gold-text">{n}</span>
            <span className="text-slate-400">
              {' '}
              item{n !== 1 ? 's' : ''} selected{maxLabel}
            </span>
          </p>
          <button
            type="button"
            disabled={dailyBlocked}
            onClick={onGenerateClick}
            className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 active:scale-[0.98] min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50 md:px-4 md:py-2 md:text-sm md:min-h-0"
          >
            <span className="sm:hidden">Generate Catalog</span>
            <span className="hidden sm:inline">Generate WhatsApp Catalog</span>
          </button>
        </div>
      </div>
    </div>
  )
}

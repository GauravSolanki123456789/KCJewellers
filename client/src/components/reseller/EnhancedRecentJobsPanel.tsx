'use client'

import { Clock, ImageIcon, Loader2, RefreshCw } from 'lucide-react'
import type { EnhancedRecentJob } from '@/lib/reseller-enhanced-pictures'

function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 48) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 14) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function statusMeta(job: EnhancedRecentJob) {
  const batchLabel = job.batch_state
    ? job.batch_state.replace(/^JOB_STATE_/, '').replace(/_/g, ' ').toLowerCase()
    : null

  if (job.status === 'completed') {
    return {
      label: job.attached_sku ? 'Attached' : 'Ready',
      tone: 'emerald' as const,
      hint: job.attached_sku ? `Linked to ${job.attached_sku}` : 'Tap to view & download',
    }
  }
  if (job.status === 'failed') {
    return {
      label: 'Failed',
      tone: 'rose' as const,
      hint: job.error_message || 'Credit refunded if charged',
    }
  }
  if (job.status === 'batch_queued' || job.status === 'batch_processing') {
    return {
      label: batchLabel ? `Batch · ${batchLabel}` : 'In batch queue',
      tone: 'amber' as const,
      hint: 'Usually ready in a few minutes · tap to track',
    }
  }
  if (job.status === 'processing') {
    return {
      label: 'Processing',
      tone: 'amber' as const,
      hint: 'Generating studio shot…',
    }
  }
  return {
    label: job.status.replace(/_/g, ' '),
    tone: 'slate' as const,
    hint: 'Tap for details',
  }
}

const toneClasses = {
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200/80',
  rose: 'bg-rose-50 text-rose-800 ring-rose-200/80',
  slate: 'bg-[var(--color-slate-900,#f7f4ef)] text-[var(--color-jewelry-black,#1a1814)]/70 ring-[var(--color-slate-700,#e8e4df)]',
}

type Props = {
  jobs: EnhancedRecentJob[]
  loading: boolean
  refreshing: boolean
  activeJobId?: number | null
  templateLabels?: Record<string, string>
  onRefresh: () => void
  onSelect: (job: EnhancedRecentJob) => void
}

export function EnhancedRecentJobsPanel({
  jobs,
  loading,
  refreshing,
  activeJobId,
  templateLabels = {},
  onRefresh,
  onSelect,
}: Props) {
  const pendingCount = jobs.filter((j) =>
    ['batch_queued', 'batch_processing', 'processing'].includes(j.status),
  ).length

  return (
    <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Recent studio jobs
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            {pendingCount > 0
              ? `${pendingCount} in progress · batch jobs save ~50%`
              : 'Your last generations — return anytime to download or attach'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-2.5 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)] disabled:opacity-50"
          aria-label="Refresh recent jobs"
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[72px] animate-pulse rounded-xl bg-[var(--color-slate-900,#f7f4ef)]"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#faf8f4)] px-4 py-8 text-center">
          <ImageIcon className="mx-auto size-8 text-[var(--color-jewelry-black,#1a1814)]/20" />
          <p className="mt-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
            No studio jobs yet
          </p>
          <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Generate your first enhanced photo — it will appear here.
          </p>
        </div>
      ) : (
        <ul className="mt-4 max-h-[min(420px,55vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
          {jobs.map((job) => {
            const meta = statusMeta(job)
            const thumb = job.result_image_url || job.source_image_url
            const title =
              job.barcode_stem ||
              job.download_filename?.replace(/\.[^.]+$/, '') ||
              `Job #${job.id}`
            const templateLabel =
              templateLabels[job.template_key] ||
              job.template_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            const isActive = activeJobId === job.id
            const isPending = ['batch_queued', 'batch_processing', 'processing'].includes(job.status)

            return (
              <li key={job.id}>
                <button
                  type="button"
                  onClick={() => onSelect(job)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                    isActive
                      ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/6 shadow-sm'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#faf8f4)] hover:border-[var(--color-jewelry-black,#1a1814)]/15 hover:bg-white'
                  }`}
                >
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <ImageIcon className="size-5 text-[var(--color-jewelry-black,#1a1814)]/25" />
                      </div>
                    )}
                    {isPending ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                        <Loader2 className="size-5 animate-spin text-white" />
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-mono text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {title}
                      </p>
                      <span
                        className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${toneClasses[meta.tone]}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                      {templateLabel} · {job.photo_type === 'back' ? 'Back' : 'Front'}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                      {meta.hint}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-jewelry-black,#1a1814)]/40">
                      <Clock className="size-3" />
                      {formatRelativeTime(job.created_at)}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

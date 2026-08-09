'use client'

import { Clock, ImageIcon, Loader2, RefreshCw, Square, Trash2 } from 'lucide-react'
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

function isPendingJob(job: EnhancedRecentJob) {
  return ['batch_queued', 'batch_processing', 'processing', 'pending'].includes(job.status)
}

function formatBatchStateLabel(state: string | null | undefined) {
  if (!state) return null
  return state
    .replace(/^JOB_STATE_/, '')
    .replace(/^BATCH_STATE_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
}

function statusMeta(job: EnhancedRecentJob) {
  const batchLabel = formatBatchStateLabel(job.batch_state)

  if (job.status === 'cancelled') {
    return {
      label: 'Stopped',
      tone: 'slate' as const,
      hint: 'You stopped this job · credit refunded',
    }
  }
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
      hint: 'Usually ready in a few minutes · tap Stop to cancel',
    }
  }
  if (job.status === 'processing') {
    return {
      label: 'Processing',
      tone: 'amber' as const,
      hint: 'Generating studio shot… tap Stop to cancel',
    }
  }
  return {
    label: (job.status || 'unknown').replace(/_/g, ' '),
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
  actionJobId?: number | null
  templateLabels?: Record<string, string>
  onRefresh: () => void
  onSelect: (job: EnhancedRecentJob) => void
  onCancel: (job: EnhancedRecentJob) => void
  onDelete: (job: EnhancedRecentJob) => void
}

export function EnhancedRecentJobsPanel({
  jobs,
  loading,
  refreshing,
  activeJobId,
  actionJobId,
  templateLabels = {},
  onRefresh,
  onSelect,
  onCancel,
  onDelete,
}: Props) {
  const pendingCount = jobs.filter((j) => isPendingJob(j)).length

  return (
    <section className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/50">
            Recent studio jobs
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            {pendingCount > 0
              ? `${pendingCount} in progress · Stop or delete anytime`
              : 'Remove jobs you do not need — deleted images are excluded from ZIP download'}
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
              (job.template_key && templateLabels[job.template_key]) ||
              (job.template_key
                ? job.template_key.replace(/-/g, ' ').replace(/\b\w/g, (c) => (c ? c.toUpperCase() : ''))
                : 'Studio')
            const isActive = activeJobId === job.id
            const isPending = isPendingJob(job)
            const isBusy = actionJobId === job.id

            return (
              <li key={job.id}>
                <div
                  className={`flex items-stretch gap-1 rounded-xl border transition ${
                    isActive
                      ? 'border-[var(--kc-accent,#c41e3a)] bg-[var(--kc-accent,#c41e3a)]/6 shadow-sm'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#faf8f4)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(job)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-white/70"
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white">
                      {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
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
                      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-jewelry-black,#1a1814)]/40 sm:hidden">
                        <Clock className="size-3" />
                        {formatRelativeTime(job.created_at)}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-jewelry-black,#1a1814)]/40">
                        <Clock className="size-3" />
                        {formatRelativeTime(job.created_at)}
                      </p>
                    </div>
                  </button>

                  <div className="flex shrink-0 flex-col justify-center gap-1.5 py-2 pr-2">
                    {isPending ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onCancel(job)}
                        className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-bold uppercase tracking-wide text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 sm:min-w-[72px]"
                        aria-label={`Stop job ${title}`}
                        title="Stop processing and refund credit"
                      >
                        {isBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Square className="size-3.5 fill-current" />
                            <span className="hidden sm:inline">Stop</span>
                          </>
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onDelete(job)}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold uppercase tracking-wide text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 sm:min-w-[72px]"
                      aria-label={`Delete job ${title}`}
                      title="Remove from list and ZIP download"
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="size-3.5" />
                          <span className="hidden sm:inline">Delete</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

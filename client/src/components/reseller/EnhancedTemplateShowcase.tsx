'use client'

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EnhancedTemplateShowcase as ShowcaseData } from '@/lib/reseller-enhanced-pictures'

type Props = {
  data: ShowcaseData
  /** Admin preview may show placeholder when no sample image */
  sampleImageUrl?: string | null
  resultImageUrl?: string | null
  className?: string
  compact?: boolean
}

export default function EnhancedTemplateShowcase({
  data,
  sampleImageUrl,
  resultImageUrl,
  className,
  compact = false,
}: Props) {
  const highlights = Array.isArray(data.workflow_highlights)
    ? data.workflow_highlights.filter(Boolean)
    : []
  const sample = sampleImageUrl || data.sample_source_image_url || null
  const result = resultImageUrl || data.sample_result_image_url || null
  const showImages = !!(sample || result)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white',
        className,
      )}
    >
      <div className={cn('grid gap-0', compact ? 'grid-cols-1' : showImages ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]' : 'grid-cols-1')}>
        {showImages ? (
          <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#faf8f4)] p-4 lg:border-b-0 lg:border-r">
            {sample ? (
              <div className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-jewelry-black,#1a1814)]/45">
                  <Sparkles className="size-3 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
                  {data.sample_label || 'Reference sample'}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sample}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="mx-auto aspect-square max-h-56 w-full rounded-xl object-contain ring-1 ring-[var(--color-slate-700,#e8e4df)]"
                />
              </div>
            ) : null}
            {result ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-jewelry-black,#1a1814)]/45">
                  {data.output_label || 'Studio result'}
                </p>
                {data.output_subtitle ? (
                  <p className="mt-0.5 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
                    {data.output_subtitle}
                  </p>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="mt-2 aspect-square max-h-56 w-full rounded-xl object-contain ring-1 ring-emerald-500/25"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-jewelry-black,#1a1814)]/45">
              System capabilities
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  Resolutions
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--kc-accent,#c41e3a)]">
                  {data.system_resolutions || '2K, 4K High Definition'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  Ratios
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--kc-accent,#c41e3a)]">
                  {data.system_ratios || '1:1'}
                </p>
              </div>
            </div>
          </div>

          {highlights.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-jewelry-black,#1a1814)]/45">
                Workflow highlights
              </p>
              <ul className="mt-2 space-y-2">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]"
                  >
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--kc-accent,#c41e3a)]"
                      aria-hidden
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.footer_note ? (
            <p className="border-t border-[var(--color-slate-700,#e8e4df)] pt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              {data.footer_note}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

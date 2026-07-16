'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  MessageCircle,
} from 'lucide-react'
import {
  catalogInquirySourceLabel,
  catalogInquiryStatusMeta,
  buildCustomerFollowUpWhatsAppMessage,
  customerWhatsAppHref,
  formatCatalogInr,
  formatCatalogWhen,
  formatCustomerMobileDisplay,
  type CatalogInquiryRow,
  type CatalogInquiryStatus,
} from '@/lib/catalog-inquiry-shared'

type Props = {
  inquiry: CatalogInquiryRow
  expanded?: boolean
  onToggle?: () => void
  showReseller?: boolean
  onStatusChange?: (id: number, status: CatalogInquiryStatus) => Promise<void>
  statusBusyId?: number | null
  theme?: 'admin' | 'reseller'
}

export default function CatalogInquiryCard({
  inquiry,
  expanded = false,
  onToggle,
  showReseller = false,
  onStatusChange,
  statusBusyId = null,
  theme = 'admin',
}: Props) {
  const [localBusy, setLocalBusy] = useState(false)
  const lines = inquiry.lines ?? []
  const SourceIcon = inquiry.source.toLowerCase() === 'pdf' ? FileText : MessageCircle
  const statusMeta = catalogInquiryStatusMeta(inquiry.inquiry_status)
  const busy = statusBusyId === inquiry.id || localBusy
  const customerMobileDisplay = formatCustomerMobileDisplay(inquiry.customer_mobile)
  const followUpBrand = inquiry.reseller_label?.trim() || 'our store'
  const customerWaHref = customerWhatsAppHref(
    inquiry.customer_mobile,
    buildCustomerFollowUpWhatsAppMessage({
      brandLabel: followUpBrand,
      customerName: inquiry.customer_name,
      totalPieces: inquiry.total_pieces,
      lineCount: inquiry.line_count,
      totalInr: inquiry.total_inr,
      lines: inquiry.lines,
      catalogUrl: inquiry.catalog_url,
    }),
  )

  const handleStatus = async (status: CatalogInquiryStatus) => {
    if (!onStatusChange || busy) return
    setLocalBusy(true)
    try {
      await onStatusChange(inquiry.id, status)
    } finally {
      setLocalBusy(false)
    }
  }

  const shell =
    theme === 'admin'
      ? 'border-slate-800 bg-slate-900/40'
      : 'border-[var(--color-slate-700,#e8e4df)] bg-white'

  return (
    <li className={cn('overflow-hidden rounded-2xl border', shell)}>
      <button
        type="button"
        className="flex w-full min-h-[56px] flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                theme === 'admin'
                  ? 'border-slate-700 bg-slate-800 text-slate-300'
                  : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]/70',
              )}
            >
              <SourceIcon className="size-3" />
              {catalogInquirySourceLabel(inquiry.source)}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                statusMeta.className,
              )}
            >
              {statusMeta.label}
            </span>
            <span className="text-xs text-slate-500">{formatCatalogWhen(inquiry.created_at)}</span>
          </div>
          {inquiry.customer_name || customerMobileDisplay ? (
            <p
              className={cn(
                'mt-1 truncate text-sm font-medium',
                theme === 'admin'
                  ? 'text-slate-100'
                  : 'text-[var(--color-jewelry-black,#1a1814)]',
              )}
            >
              {inquiry.customer_name?.trim() || 'Customer'}
              {customerMobileDisplay ? (
                <span
                  className={cn(
                    'font-normal',
                    theme === 'admin' ? 'text-slate-400' : 'text-[var(--color-jewelry-black,#1a1814)]/55',
                  )}
                >
                  {' '}
                  · {customerMobileDisplay}
                </span>
              ) : null}
            </p>
          ) : null}
          {showReseller ? (
            <p className="mt-1 truncate text-sm font-medium text-slate-100">
              {inquiry.reseller_label ?? 'Unknown reseller'}
              {inquiry.reseller_domain ? (
                <span className="font-normal text-slate-500"> · {inquiry.reseller_domain}</span>
              ) : null}
            </p>
          ) : null}
          <p
            className={cn(
              'mt-0.5 text-xs',
              theme === 'admin' ? 'text-slate-400' : 'text-[var(--color-jewelry-black,#1a1814)]/55',
            )}
          >
            {inquiry.total_pieces} pcs · {inquiry.line_count} line
            {inquiry.line_count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={cn(
              'text-lg font-semibold tabular-nums',
              inquiry.inquiry_status === 'no_sale'
                ? 'text-slate-500 line-through'
                : theme === 'admin'
                  ? 'text-emerald-400'
                  : 'text-[var(--kc-accent,#c41e3a)]',
            )}
          >
            {formatCatalogInr(inquiry.total_inr)}
          </span>
          {onToggle ? (
            expanded ? (
              <ChevronUp className="size-5 text-slate-500" />
            ) : (
              <ChevronDown className="size-5 text-slate-500" />
            )
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div
          className={cn(
            'border-t px-4 py-3',
            theme === 'admin' ? 'border-slate-800/80' : 'border-[var(--color-slate-700,#e8e4df)]',
          )}
        >
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">No line details saved.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line, idx) => (
                <li
                  key={`${inquiry.id}-${idx}`}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm',
                    theme === 'admin'
                      ? 'border-slate-800/80 bg-slate-950/40'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'font-medium',
                          theme === 'admin'
                            ? 'text-slate-100'
                            : 'text-[var(--color-jewelry-black,#1a1814)]',
                        )}
                      >
                        {line.name ?? 'Item'}
                      </p>
                      {line.code ? (
                        <p className="text-xs text-slate-500">Ref: {line.code}</p>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        'shrink-0 font-medium tabular-nums',
                        theme === 'admin'
                          ? 'text-emerald-400'
                          : 'text-[var(--kc-accent,#c41e3a)]',
                      )}
                    >
                      {formatCatalogInr(line.lineTotalInr ?? null)}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Qty {line.qty ?? 1}
                    {line.unitInr != null ? <> × {formatCatalogInr(line.unitInr)} incl. GST</> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {onStatusChange ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(['pending', 'completed', 'no_sale'] as const).map((status) => {
                const active = (inquiry.inquiry_status || 'pending') === status
                const meta = catalogInquiryStatusMeta(status)
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={busy || active}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleStatus(status)
                    }}
                    className={cn(
                      'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60',
                      active ? meta.className : 'border-slate-600/50 text-slate-400 hover:border-slate-500',
                    )}
                  >
                    {busy && statusBusyId === inquiry.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                    {meta.label}
                  </button>
                )
              })}
            </div>
          ) : null}

          {customerWaHref ? (
            <a
              href={customerWaHref}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition sm:w-auto',
                theme === 'admin'
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : 'bg-[var(--kc-accent,#c41e3a)] hover:opacity-90',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              WhatsApp customer
            </a>
          ) : null}

          {inquiry.catalog_url ? (
            <a
              href={inquiry.catalog_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'mt-3 inline-flex min-h-[40px] items-center gap-1.5 text-xs transition',
                theme === 'admin'
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-[var(--kc-accent,#c41e3a)] hover:opacity-80',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3.5" />
              Open catalogue link
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export async function patchCatalogInquiryStatus(
  apiPath: 'admin' | 'reseller',
  id: number,
  status: CatalogInquiryStatus,
): Promise<void> {
  const base =
    apiPath === 'admin'
      ? `/api/admin/reseller-catalog-inquiries/${id}/status`
      : `/api/reseller/catalog-inquiries/${id}/status`
  await axios.patch(base, { status })
}

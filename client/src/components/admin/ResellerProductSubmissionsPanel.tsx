'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  productImageUrl,
  submissionImageDiskKey,
  submissionPreviewImageUrl,
  submissionStatusLabel,
  submissionStatusTone,
  type ResellerProductSubmission,
  type ResellerSubmissionStatus,
} from '@/lib/reseller-products'
import { catalogImageUrlAlternates } from '@/lib/normalize-image-url'
import { optimizedCatalogThumbSrc } from '@/lib/catalog-image-next'
import { KC_ADMIN_INBOX_REFRESH_EVENT } from '@/lib/admin-inbox-summary'
import { ResellerProductEditModal } from '@/components/reseller/ResellerProductEditModal'
import { Check, ChevronDown, ChevronRight, Loader2, Package, Pencil, Trash2, X } from 'lucide-react'

const FILTERS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: '', label: 'All' },
] as const

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ResellerProductSubmissionsPanel() {
  const [rows, setRows] = useState<ResellerProductSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('pending')
  const [actingId, setActingId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editRow, setEditRow] = useState<ResellerProductSubmission | null>(null)
  const [expandedApprovedBatchIds, setExpandedApprovedBatchIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter ? { submission_status: filter } : {}
      const res = await axios.get<ResellerProductSubmission[]>('/api/admin/reseller-product-submissions', {
        params,
      })
      setRows(Array.isArray(res.data) ? res.data : [])
      setSelected(new Set())
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const pendingRows = useMemo(() => rows.filter((r) => r.submission_status === 'pending'), [rows])
  const pendingIds = useMemo(() => pendingRows.map((r) => r.id), [pendingRows])

  /** Group pending rows by Excel batch (batch_id) for batch-wise admin review. */
  const pendingGroups = useMemo(() => {
    const map = new Map<string, { batchId: string; label: string; rows: ResellerProductSubmission[] }>()
    for (const row of pendingRows) {
      const batchId = row.batch_id || `single-${row.id}`
      const label = row.batch_label || (row.batch_id ? 'Excel batch' : 'Single product')
      const existing = map.get(batchId)
      if (existing) existing.rows.push(row)
      else map.set(batchId, { batchId: row.batch_id || batchId, label, rows: [row] })
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.rows[0]?.batch_submitted_at || b.rows[0]?.created_at || 0).getTime() -
        new Date(a.rows[0]?.batch_submitted_at || a.rows[0]?.created_at || 0).getTime(),
    )
  }, [pendingRows])

  const approvedGroups = useMemo(() => {
    const approved = rows.filter((r) => r.submission_status === 'approved' && r.batch_id)
    const map = new Map<string, { batchId: string; label: string; rows: ResellerProductSubmission[] }>()
    for (const row of approved) {
      const batchId = row.batch_id as string
      const label = row.batch_label || 'Excel batch'
      const existing = map.get(batchId)
      if (existing) existing.rows.push(row)
      else map.set(batchId, { batchId, label, rows: [row] })
    }
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.rows[0]?.created_at || 0).getTime() - new Date(a.rows[0]?.created_at || 0).getTime(),
    )
  }, [rows])

  const approvedOrphanRows = useMemo(
    () => rows.filter((r) => r.submission_status === 'approved' && !r.batch_id),
    [rows],
  )

  const toggleApprovedBatch = (batchId: string) => {
    setExpandedApprovedBatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllPending = () => {
    setSelected(new Set(pendingIds))
  }

  const approve = async (id: number) => {
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/${id}/approve`, {})
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Approve failed')
    } finally {
      setActingId(null)
    }
  }

  const bulkApprove = async () => {
    const ids = [...selected].filter((id) => pendingRows.some((r) => r.id === id))
    if (!ids.length) return
    if (!window.confirm(`Approve ${ids.length} product(s)? They will go live on the public KC site.`)) return
    setActingId(-1)
    try {
      await axios.post('/api/admin/reseller-product-submissions/bulk-approve', { ids })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Bulk approve failed')
    } finally {
      setActingId(null)
    }
  }

  const republishBatch = async (batchId: string, count: number) => {
    if (!batchId || batchId.startsWith('single-')) return
    if (
      !window.confirm(
        `Re-sync all ${count} approved products in this batch? This updates catalogue placement and hides duplicate gift rows (e.g. old GOLD NOTE copies).`,
      )
    ) {
      return
    }
    setActingId(-3)
    try {
      const res = await axios.post<{ republished?: { id: number }[]; errors?: { error: string }[] }>(
        `/api/admin/reseller-product-submissions/batch/${batchId}/republish`,
        {},
      )
      const n = res.data.republished?.length ?? 0
      const errN = res.data.errors?.length ?? 0
      alert(
        errN > 0
          ? `Re-synced ${n} product(s). ${errN} row(s) had errors.`
          : `Re-synced ${n} product(s). Duplicate placements in wrong SKU should now be hidden.`,
      )
      await load()
    } catch {
      alert('Batch re-sync failed')
    } finally {
      setActingId(null)
    }
  }

  const approveBatch = async (batchId: string, count: number) => {
    if (!batchId || batchId.startsWith('single-')) return
    if (!window.confirm(`Approve all ${count} products in this Excel batch? They will go live on kcjewellers.co.in.`)) return
    setActingId(-2)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/batch/${batchId}/approve`, {})
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Batch approve failed')
    } finally {
      setActingId(null)
    }
  }

  const deleteBatch = async (batchId: string, count: number, opts?: { approved?: boolean }) => {
    if (!batchId || batchId.startsWith('single-')) return
    const approved = opts?.approved === true
    if (
      !window.confirm(
        approved
          ? `Delete this Excel batch (${count} live products)? Products will be hidden from the catalogue and their uploaded photos will be removed from the server.`
          : `Delete all ${count} items in this Excel batch? Uploaded photos for these products will be removed.`,
      )
    )
      return
    setActingId(-4)
    try {
      await axios.delete(`/api/admin/reseller-product-submissions/batch/${batchId}`, {
        params: approved ? { delete_live_product: '1' } : {},
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      alert(msg || 'Batch delete failed')
    } finally {
      setActingId(null)
    }
  }

  const reject = async (id: number) => {
    const notes = window.prompt('Rejection note (optional):') ?? ''
    setActingId(id)
    try {
      await axios.post(`/api/admin/reseller-product-submissions/${id}/reject`, {
        review_notes: notes || undefined,
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Reject failed')
    } finally {
      setActingId(null)
    }
  }

  const remove = async (id: number, live: boolean) => {
    if (!window.confirm(live ? 'Delete submission and hide live product?' : 'Delete this submission?')) return
    setActingId(id)
    try {
      await axios.delete(`/api/admin/reseller-product-submissions/${id}`, {
        params: live ? { delete_live_product: '1' } : {},
      })
      window.dispatchEvent(new Event(KC_ADMIN_INBOX_REFRESH_EVENT))
      await load()
    } catch {
      alert('Delete failed')
    } finally {
      setActingId(null)
    }
  }

  return (
    <section className="kc-reseller-upload-panel relative mb-8 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            <Package className="size-5 text-[var(--kc-accent,#c41e3a)]" />
            Reseller product uploads
          </h2>
          <p className="kc-upload-hint mt-1 text-xs">
            Approve to publish on kcjewellers.co.in (style category auto-published). Edit or delete anytime.
          </p>
        </div>
        {selected.size > 0 && filter === 'pending' ? (
          <button
            type="button"
            disabled={actingId === -1}
            onClick={() => void bulkApprove()}
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {actingId === -1 ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Approve {selected.size} selected
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setFilter(key)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === key
                ? 'bg-[var(--kc-accent,#c41e3a)]/12 text-[var(--color-jewelry-black,#1a1814)] ring-1 ring-[var(--kc-accent,#c41e3a)]/35'
                : 'bg-white text-[var(--color-jewelry-black,#1a1814)]/65 hover:bg-[var(--color-slate-900,#f7f4ef)]'
            }`}
          >
            {label}
          </button>
        ))}
        {filter === 'pending' && pendingIds.length > 1 ? (
          <button
            type="button"
            onClick={selectAllPending}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 underline-offset-2 hover:underline"
          >
            Select all pending
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-8 animate-spin text-slate-500" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No reseller product submissions.</p>
      ) : filter === 'pending' ? (
        <div className="space-y-6">
          {pendingGroups.map((group) => {
            const isExcelBatch = group.batchId && !group.batchId.startsWith('single-')
            return (
              <div key={group.batchId} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 sm:p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{group.label}</p>
                    <p className="text-xs text-slate-500">
                      {group.rows.length} product{group.rows.length === 1 ? '' : 's'}
                      {group.rows[0]?.submitter_business_name
                        ? ` · ${group.rows[0].submitter_business_name}`
                        : ''}
                      {group.rows[0]?.batch_submitted_at
                        ? ` · sent ${formatWhen(group.rows[0].batch_submitted_at)}`
                        : ''}
                    </p>
                  </div>
                  {isExcelBatch ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={actingId === -2}
                        onClick={() => void approveBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {actingId === -2 ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                        Approve entire batch
                      </button>
                      <button
                        type="button"
                        disabled={actingId === -4}
                        onClick={() => void deleteBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-60"
                      >
                        {actingId === -4 ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Delete entire batch
                      </button>
                    </div>
                  ) : null}
                </div>
                <ul className="space-y-3">
                  {group.rows.map((row) => (
                    <AdminSubmissionRow
                      key={row.id}
                      row={row}
                      acting={actingId === row.id}
                      selected={selected.has(row.id)}
                      onToggleSelect={() => toggleSelect(row.id)}
                      onApprove={() => void approve(row.id)}
                      onReject={() => void reject(row.id)}
                      onEdit={() => setEditRow(row)}
                      onDelete={() => void remove(row.id, row.submission_status === 'approved')}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : filter === 'approved' && (approvedGroups.length > 0 || approvedOrphanRows.length > 0) ? (
        <div className="space-y-3">
          {approvedGroups.map((group) => {
            const open = expandedApprovedBatchIds.has(group.batchId)
            return (
              <div key={group.batchId} className="rounded-xl border border-slate-800 bg-slate-950/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleApprovedBatch(group.batchId)}
                  className="flex w-full items-start justify-between gap-3 p-3 text-left sm:p-4"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    {open ? (
                      <ChevronDown className="mt-0.5 size-4 shrink-0 text-amber-400/80" aria-hidden />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-amber-400/80" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{group.label}</p>
                      <p className="text-xs text-slate-500">
                        {group.rows.length} live product{group.rows.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-amber-300/90">{open ? 'Hide' : 'Open'}</span>
                </button>
                {open ? (
                  <div className="border-t border-slate-800 px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className="mb-3 flex flex-wrap justify-end gap-2 pt-3">
                      <button
                        type="button"
                        disabled={actingId === -3}
                        onClick={() => void republishBatch(group.batchId, group.rows.length)}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 disabled:opacity-60"
                      >
                        {actingId === -3 ? <Loader2 className="size-3.5 animate-spin" /> : null}
                        Re-sync batch placements
                      </button>
                      <button
                        type="button"
                        disabled={actingId === -4}
                        onClick={() => void deleteBatch(group.batchId, group.rows.length, { approved: true })}
                        className="flex min-h-[36px] items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:opacity-60"
                      >
                        {actingId === -4 ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        Delete entire batch
                      </button>
                    </div>
                    <ul className="space-y-3">
                      {group.rows.map((row) => (
                        <AdminSubmissionRow
                          key={row.id}
                          row={row}
                          acting={actingId === row.id}
                          selected={selected.has(row.id)}
                          onToggleSelect={() => toggleSelect(row.id)}
                          onApprove={() => void approve(row.id)}
                          onReject={() => void reject(row.id)}
                          onEdit={() => setEditRow(row)}
                          onDelete={() => void remove(row.id, row.submission_status === 'approved')}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          })}
          {approvedOrphanRows.length > 0 ? (
            <ul className="space-y-3">
              {approvedOrphanRows.map((row) => (
                <AdminSubmissionRow
                  key={row.id}
                  row={row}
                  acting={actingId === row.id}
                  selected={selected.has(row.id)}
                  onToggleSelect={() => toggleSelect(row.id)}
                  onApprove={() => void approve(row.id)}
                  onReject={() => void reject(row.id)}
                  onEdit={() => setEditRow(row)}
                  onDelete={() => void remove(row.id, true)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <AdminSubmissionRow
              key={row.id}
              row={row}
              acting={actingId === row.id}
              selected={selected.has(row.id)}
              onToggleSelect={() => toggleSelect(row.id)}
              onApprove={() => void approve(row.id)}
              onReject={() => void reject(row.id)}
              onEdit={() => setEditRow(row)}
              onDelete={() => void remove(row.id, row.submission_status === 'approved')}
            />
          ))}
        </ul>
      )}

      {editRow ? (
        <ResellerProductEditModal
          open
          adminMode
          row={editRow}
          isLiveEdit={editRow.submission_status === 'approved'}
          onClose={() => setEditRow(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </section>
  )
}

function AdminSubmissionRow({
  row,
  acting,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onEdit,
  onDelete,
}: {
  row: ResellerProductSubmission
  acting: boolean
  selected: boolean
  onToggleSelect: () => void
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const diskKey = submissionImageDiskKey(row)
  const displayCode = diskKey || row.barcode || row.sku || ''
  const status = row.submission_status as ResellerSubmissionStatus
  const isPending = status === 'pending'

  return (
    <li className="kc-upload-card flex gap-3 rounded-2xl p-3 shadow-sm sm:p-4">
      {isPending ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="mt-1 size-4 shrink-0 rounded border-slate-600"
          aria-label="Select for bulk approve"
        />
      ) : (
        <span className="mt-1 size-4 shrink-0" />
      )}
      <SubmissionThumb row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium text-[var(--color-jewelry-black,#1a1814)]">
              {row.product_name || displayCode}
            </p>
            <p className="kc-upload-hint text-xs">
              {row.style_code} › {row.sku}
              {row.metal_type ? ` · ${row.metal_type}` : ''}
              {row.fixed_price != null && Number(row.fixed_price) > 0 ? ` · ₹${row.fixed_price}` : ''}
            </p>
            <p className="kc-upload-hint text-xs">
              {row.submitter_business_name || row.submitter_email || `User #${row.submitted_by_user_id}`} ·{' '}
              {formatWhen(row.created_at)}
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${submissionStatusTone(status)}`}
          >
            {submissionStatusLabel(status)}
          </span>
        </div>
        {row.review_notes ? <p className="mt-2 text-xs text-rose-400">{row.review_notes}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isPending ? (
            <>
              <ActionBtn tone="emerald" onClick={onApprove} disabled={acting} icon={Check} label="Approve & go live" />
              <ActionBtn tone="rose" onClick={onReject} disabled={acting} icon={X} label="Reject" />
            </>
          ) : null}
          <ActionBtn tone="slate" onClick={onEdit} disabled={acting} icon={Pencil} label="Edit" />
          <ActionBtn tone="slate" onClick={onDelete} disabled={acting} icon={Trash2} label="Delete" />
        </div>
      </div>
    </li>
  )
}

function SubmissionThumb({ row }: { row: ResellerProductSubmission }) {
  const [idx, setIdx] = useState(0)
  const candidates = useMemo(() => {
    const primary = submissionPreviewImageUrl(row)
    const disk = submissionImageDiskKey(row)
    const bySku = disk ? productImageUrl(disk) : ''
    const urls = [
      primary,
      bySku,
      ...catalogImageUrlAlternates(primary),
      ...(bySku ? catalogImageUrlAlternates(bySku) : []),
    ].filter(Boolean)
    return [...new Set(urls)]
  }, [row])
  const raw = candidates[idx] || ''
  const src = raw ? optimizedCatalogThumbSrc(raw, 160, 84) || raw : ''
  if (!src) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-[var(--color-slate-700,#e8e4df)] sm:size-20">
        <Package className="size-6 text-[var(--color-jewelry-black,#1a1814)]/25" />
      </div>
    )
  }
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-[var(--color-slate-700,#e8e4df)] sm:size-20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="size-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => {
          if (idx < candidates.length - 1) setIdx((i) => i + 1)
        }}
      />
    </div>
  )
}

function ActionBtn({
  onClick,
  disabled,
  icon: Icon,
  label,
  tone,
}: {
  onClick: () => void
  disabled: boolean
  icon: typeof Check
  label: string
  tone: 'emerald' | 'rose' | 'slate'
}) {
  const cls =
    tone === 'emerald'
      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
      : tone === 'rose'
        ? 'bg-rose-600 text-white hover:bg-rose-500'
        : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#f7f4ef)]'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${cls}`}
    >
      {disabled ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {label}
    </button>
  )
}


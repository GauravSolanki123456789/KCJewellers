'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from '@/lib/axios'
import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Hammer,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import {
  clearErpOrderDraft,
  loadErpOrderDraft,
  saveErpOrderDraft,
} from '@/lib/erp-order-draft'
import { BarcodeLookupField } from '@/components/reseller/erp/ResellerErpWorkspaces'
import { ErpOrderLineCard } from '@/components/reseller/erp/ErpOrderLineCard'
import { ErpOrderMediaControls } from '@/components/reseller/erp/ErpOrderMediaControls'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpBillLine,
  type ErpKarigar,
  type ErpOrderJob,
  type ErpOrderJobHistoryEvent,
  type ErpOrderJobStatus,
  type ErpProductHit,
} from '@/components/reseller/erp/erp-ui'

const JOB_STATUS_LABEL: Record<ErpOrderJobStatus, string> = {
  in_shop: 'In shop',
  with_karigar: 'With karigar',
  returned: 'Returned',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const JOB_STATUS_STYLE: Record<ErpOrderJobStatus, string> = {
  in_shop: 'border-slate-300 bg-slate-50 text-slate-700',
  with_karigar: 'border-amber-300 bg-amber-50 text-amber-900',
  returned: 'border-sky-300 bg-sky-50 text-sky-900',
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  cancelled: 'border-rose-300 bg-rose-50 text-rose-800',
}

const HISTORY_ACTION_LABEL: Record<string, string> = {
  created: 'Registered',
  handed_to: 'Handed to karigar',
  returned: 'Returned to shop',
  transferred: 'Transferred',
  transferred_from: 'Previous karigar',
  completed: 'Completed',
  cancelled: 'Cancelled',
  note: 'Note',
  line_handed_to: 'Item handed to karigar',
  line_transferred: 'Item transferred',
  line_returned: 'Item returned',
  line_on_hold: 'Item on hold',
  line_completed: 'Item completed',
}

const FILTER_TABS: { id: 'all' | ErpOrderJobStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in_shop', label: 'In shop' },
  { id: 'with_karigar', label: 'With karigar' },
  { id: 'returned', label: 'Returned' },
  { id: 'completed', label: 'Done' },
]

function StatusBadge({ status }: { status: ErpOrderJobStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${JOB_STATUS_STYLE[status]}`}
    >
      {JOB_STATUS_LABEL[status]}
    </span>
  )
}

function HistoryTimeline({ events }: { events: ErpOrderJobHistoryEvent[] }) {
  if (!events.length) return null
  const sorted = [...events].reverse()
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-[var(--color-slate-700,#e8e4df)] pl-3">
      {sorted.map((ev, i) => (
        <li key={`${ev.at}-${i}`} className="relative text-xs">
          <span className="absolute -left-[1.05rem] top-1.5 size-2 rounded-full bg-[var(--kc-accent,#c41e3a)]/70" />
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            {HISTORY_ACTION_LABEL[ev.action] || ev.action}
            {ev.line_name ? (
              <span className="font-normal text-[var(--color-jewelry-black,#1a1814)]/70"> · {ev.line_name}</span>
            ) : null}
            {!ev.line_name && ev.karigar_name ? (
              <span className="font-normal text-[var(--color-jewelry-black,#1a1814)]/70"> · {ev.karigar_name}</span>
            ) : ev.line_name && ev.karigar_name ? (
              <span className="font-normal text-[var(--color-jewelry-black,#1a1814)]/70"> · {ev.karigar_name}</span>
            ) : null}
          </p>
          <p className="text-[var(--color-jewelry-black,#1a1814)]/50">
            {ev.at ? new Date(ev.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
          </p>
          {ev.notes ? <p className="mt-0.5 text-[var(--color-jewelry-black,#1a1814)]/65">{ev.notes}</p> : null}
        </li>
      ))}
    </ol>
  )
}

function KarigarSelect({
  karigars,
  value,
  onChange,
  placeholder = 'Select karigar',
}: {
  karigars: ErpKarigar[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <select
      className={erpInputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {karigars.map((k) => (
        <option key={k.id} value={String(k.id)}>
          {k.name}
          {k.specialty ? ` · ${k.specialty}` : ''}
        </option>
      ))}
    </select>
  )
}

function OrderJobCard({
  job,
  karigars,
  onRefresh,
}: {
  job: ErpOrderJob
  karigars: ErpKarigar[]
  onRefresh: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [karigarId, setKarigarId] = useState('')
  const [transferKarigarId, setTransferKarigarId] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [workDesc, setWorkDesc] = useState(job.work_description || '')
  const [actionErr, setActionErr] = useState('')

  const jobClosed = ['completed', 'cancelled'].includes(job.status)
  const hasLines = (job.lines?.length ?? 0) > 0
  const transferKarigars = karigars.filter((k) => k.id !== job.current_karigar_id)

  const runAction = async (path: string, body?: Record<string, unknown>) => {
    if (busy) return
    setBusy(true)
    setActionErr('')
    try {
      await axios.patch(`/api/reseller/erp/order-jobs/${job.id}/${path}`, body || {})
      setActionNotes('')
      setKarigarId('')
      setTransferKarigarId('')
      await onRefresh()
    } catch (e) {
      setActionErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const canHandTo = !jobClosed && !hasLines && (job.status === 'in_shop' || job.status === 'returned')
  const canReturn = !jobClosed && !hasLines && job.status === 'with_karigar'
  const canTransfer = !jobClosed && !hasLines && job.status === 'with_karigar'
  const canComplete = !jobClosed && job.status !== 'with_karigar'
  const canCancel = !jobClosed

  const deleteOrder = async () => {
    if (busy) return
    if (
      !window.confirm(
        `Delete ${job.bill_number}? This removes the order and karigar tracking. The order number can be reused.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/bills/${job.bill_id}`)
      await onRefresh()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const orderMedia = job.order_media || { imageUrls: [], voiceNoteUrl: null }

  return (
    <li className={erpCardCls}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{job.bill_number}</p>
            <StatusBadge status={job.status} />
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
            {job.customer_name || 'Walk-in'} · {formatErpInr(job.total_inr ?? 0)}
            {job.current_karigar_name ? ` · ${job.current_karigar_name}` : ''}
          </p>
          {hasLines ? (
            <p className="mt-0.5 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
              {job.lines!.length} item{job.lines!.length === 1 ? '' : 's'}
              {job.lines!.filter((l) => l.lineStatus === 'with_karigar').length > 0
                ? ` · ${job.lines!.filter((l) => l.lineStatus === 'with_karigar').length} with karigar`
                : ''}
            </p>
          ) : null}
          {job.due_date ? (
            <p className="text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
              Due {formatErpDateDdMmYyyy(job.due_date)}
            </p>
          ) : null}
        </div>
        {open ? (
          <ChevronUp className="size-5 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
        ) : (
          <ChevronDown className="size-5 shrink-0 text-[var(--color-jewelry-black,#1a1814)]/40" />
        )}
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
          <ErpOrderMediaControls
            billId={job.bill_id}
            imageUrls={orderMedia.imageUrls}
            voiceNoteUrl={orderMedia.voiceNoteUrl}
            onUpdated={onRefresh}
          />

          {hasLines ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                Products in this order
              </p>
              <ul className="space-y-2">
                {job.lines!.map((line) => (
                  <ErpOrderLineCard
                    key={line.lineKey || line.name}
                    billId={job.bill_id}
                    line={line}
                    karigars={karigars}
                    onRefresh={onRefresh}
                    jobClosed={jobClosed}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {job.notes ? (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
              <span className="font-semibold">Notes:</span> {job.notes}
            </p>
          ) : null}

          <HistoryTimeline events={job.history || []} />

          {(canHandTo || canReturn || canTransfer || canComplete || canCancel) && !hasLines ? (
            <div className="space-y-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                Order actions
              </p>

              {canHandTo && karigars.length > 0 ? (
                <>
                  <KarigarSelect karigars={karigars} value={karigarId} onChange={setKarigarId} />
                  <input
                    className={erpInputCls}
                    placeholder="Work description (e.g. polish, setting)"
                    value={workDesc}
                    onChange={(e) => setWorkDesc(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || !karigarId}
                    className={`${erpBtnPrimary} w-full`}
                    onClick={() =>
                      void runAction('hand-to', {
                        karigar_id: Number(karigarId),
                        work_description: workDesc || undefined,
                        notes: actionNotes || undefined,
                      })
                    }
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Hammer className="size-4" />}
                    Hand to karigar
                  </button>
                </>
              ) : null}

              {canReturn ? (
                <button
                  type="button"
                  disabled={busy}
                  className={`${erpBtnGhost} w-full border-sky-200 text-sky-900`}
                  onClick={() => void runAction('return', { notes: actionNotes || undefined })}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                  Mark returned to shop
                </button>
              ) : null}

              {canTransfer ? (
                <>
                  <KarigarSelect
                    karigars={transferKarigars}
                    value={transferKarigarId}
                    onChange={setTransferKarigarId}
                    placeholder="Select new karigar"
                  />
                  <button
                    type="button"
                    disabled={busy || !transferKarigarId}
                    className={`${erpBtnGhost} w-full border-amber-200 text-amber-900`}
                    onClick={() =>
                      void runAction('transfer', {
                        karigar_id: Number(transferKarigarId),
                        notes: actionNotes || undefined,
                      })
                    }
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
                    Transfer to another karigar
                  </button>
                  {transferKarigars.length === 0 ? (
                    <p className="text-xs text-amber-800">Add another karigar to transfer this order.</p>
                  ) : !transferKarigarId ? (
                    <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                      Select a different karigar above — the current one is not listed.
                    </p>
                  ) : null}
                </>
              ) : null}

              {canComplete ? (
                <button
                  type="button"
                  disabled={busy}
                  className={`${erpBtnPrimary} w-full bg-emerald-700 hover:opacity-90`}
                  onClick={() => void runAction('complete', { notes: actionNotes || undefined })}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Mark work complete
                </button>
              ) : null}

              {canCancel ? (
                <button
                  type="button"
                  disabled={busy}
                  className={`${erpBtnGhost} w-full border-rose-200 text-rose-700`}
                  onClick={() => {
                    if (!window.confirm('Cancel this order job?')) return
                    void runAction('cancel', { notes: actionNotes || undefined })
                  }}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                  Cancel job
                </button>
              ) : null}

              <input
                className={erpInputCls}
                placeholder="Optional note for this action"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
              {actionErr ? <p className="text-xs text-rose-700">{actionErr}</p> : null}
            </div>
          ) : null}

          {hasLines && !jobClosed ? (
            <div className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
                Whole order
              </p>
              <button
                type="button"
                disabled={busy || job.status === 'with_karigar'}
                className={`${erpBtnPrimary} w-full bg-emerald-700 hover:opacity-90`}
                onClick={() => void runAction('complete', { notes: actionNotes || undefined })}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Mark entire order complete
              </button>
              {job.status === 'with_karigar' ? (
                <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                  Return or complete individual items first while any are still with a karigar.
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                className={`${erpBtnGhost} w-full border-rose-200 text-rose-700`}
                onClick={() => {
                  if (!window.confirm('Cancel this order job?')) return
                  void runAction('cancel', { notes: actionNotes || undefined })
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                Cancel order
              </button>
            </div>
          ) : null}

          {!hasLines && karigars.length === 0 && canHandTo ? (
            <p className="text-xs text-amber-800">Add at least one karigar in the Karigars tab to assign work.</p>
          ) : null}

          <button
            type="button"
            disabled={busy}
            className={`${erpBtnGhost} w-full border-rose-200 text-rose-700`}
            onClick={() => void deleteOrder()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete order
          </button>
        </div>
      ) : null}
    </li>
  )
}

function KarigarsPanel({ karigars, onRefresh }: { karigars: ErpKarigar[]; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', mobile: '', specialty: '', address: '', notes: '' })
  const [editId, setEditId] = useState<number | null>(null)

  const resetForm = () => {
    setForm({ name: '', mobile: '', specialty: '', address: '', notes: '' })
    setEditId(null)
  }

  const save = async () => {
    if (busy || !form.name.trim()) return
    setBusy(true)
    try {
      if (editId) {
        await axios.put(`/api/reseller/erp/karigars/${editId}`, form)
      } else {
        await axios.post('/api/reseller/erp/karigars', form)
      }
      resetForm()
      await onRefresh()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (k: ErpKarigar) => {
    setEditId(k.id)
    setForm({
      name: k.name,
      mobile: k.mobile || '',
      specialty: k.specialty || '',
      address: k.address || '',
      notes: k.notes || '',
    })
  }

  const deactivate = async (id: number) => {
    if (!window.confirm('Deactivate this karigar?')) return
    try {
      await axios.delete(`/api/reseller/erp/karigars/${id}`)
      await onRefresh()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className={erpCardCls}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <UserPlus className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          {editId ? 'Edit karigar' : 'Add karigar'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            className={erpInputCls}
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className={erpInputCls}
            placeholder="Mobile"
            inputMode="tel"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          />
          <input
            className={erpInputCls}
            placeholder="Specialty (polish, kundan, setting…)"
            value={form.specialty}
            onChange={(e) => setForm({ ...form, specialty: e.target.value })}
          />
          <input
            className={erpInputCls}
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <textarea
          className={`${erpInputCls} mt-3 min-h-[72px] resize-y py-2`}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy || !form.name.trim()} onClick={() => void save()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {editId ? 'Update karigar' : 'Save karigar'}
          </button>
          {editId ? (
            <button type="button" className={erpBtnGhost} onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </div>

      <ul className="space-y-2">
        {karigars.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            No karigars yet. Add your artisans above.
          </li>
        ) : (
          karigars.map((k) => (
            <li key={k.id} className={`${erpCardCls} flex flex-wrap items-start justify-between gap-3`}>
              <div className="min-w-0">
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">{k.name}</p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/60">
                  {[k.mobile, k.specialty].filter(Boolean).join(' · ') || '—'}
                </p>
                {k.notes ? <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">{k.notes}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={erpBtnGhost} onClick={() => startEdit(k)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 px-3 text-sm text-rose-600"
                  onClick={() => void deactivate(k.id)}
                  aria-label="Deactivate"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export function ErpOrderManagementWorkspace() {
  const initialDraft = useMemo(() => loadErpOrderDraft(), [])
  const [tab, setTab] = useState<'orders' | 'karigars'>(initialDraft.tab)
  const [jobs, setJobs] = useState<ErpOrderJob[]>([])
  const [karigars, setKarigars] = useState<ErpKarigar[]>([])
  const [filter, setFilter] = useState<'all' | ErpOrderJobStatus>('all')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [customerName, setCustomerName] = useState(initialDraft.customerName)
  const [notes, setNotes] = useState(initialDraft.notes)
  const [lines, setLines] = useState<ErpBillLine[]>(initialDraft.lines)
  const [freeTextLine, setFreeTextLine] = useState(initialDraft.freeTextLine)
  const draftReady = useRef(false)

  useEffect(() => {
    draftReady.current = true
  }, [])

  useEffect(() => {
    if (!draftReady.current) return
    saveErpOrderDraft({
      customerName,
      notes,
      lines,
      freeTextLine,
      tab,
    })
  }, [customerName, notes, lines, freeTextLine, tab])

  const loadJobs = useCallback(async () => {
    const params: Record<string, string> = {}
    if (search.trim()) params.q = search.trim()
    const res = await axios.get<{ jobs: ErpOrderJob[] }>('/api/reseller/erp/order-jobs', { params })
    setJobs(res.data.jobs || [])
  }, [search])

  const loadKarigars = useCallback(async () => {
    const res = await axios.get<{ karigars: ErpKarigar[] }>('/api/reseller/erp/karigars')
    setKarigars(res.data.karigars || [])
  }, [])

  const refreshAll = useCallback(async () => {
    await Promise.all([loadJobs(), loadKarigars()])
  }, [loadJobs, loadKarigars])

  useEffect(() => {
    void refreshAll().catch(() => {
      setJobs([])
      setKarigars([])
    })
  }, [refreshAll])

  const addLineFromProduct = (p: ErpProductHit, code: string) => {
    const wt = p.net_weight ?? p.gross_weight ?? null
    setLines((prev) => [
      ...prev,
      {
        name: p.name || code,
        code: p.barcode || p.sku || code,
        qty: 1,
        unitInr: p.fixed_price && p.fixed_price > 0 ? p.fixed_price : null,
        lineTotalInr: p.fixed_price && p.fixed_price > 0 ? p.fixed_price : null,
        weightGm: wt,
        imageUrl: p.image_url ?? null,
      },
    ])
  }

  const addFreeTextLine = () => {
    const text = freeTextLine.trim()
    if (!text) return
    setLines((prev) => [
      ...prev,
      {
        name: text,
        code: text,
        qty: 1,
        unitInr: null,
        lineTotalInr: null,
      },
    ])
    setFreeTextLine('')
  }

  const total = lines.reduce((s, l) => s + (Number(l.lineTotalInr) || 0), 0)

  const saveOrder = async () => {
    if (busy || lines.length === 0) return
    setBusy(true)
    try {
      await axios.post('/api/reseller/erp/bills', {
        bill_type: 'order',
        customer_name: customerName,
        total_inr: total,
        notes,
        status: 'pending',
        lines,
      })
      setCustomerName('')
      setNotes('')
      setLines([])
      setFreeTextLine('')
      clearErpOrderDraft()
      await refreshAll()
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length }
    for (const j of jobs) {
      c[j.status] = (c[j.status] || 0) + 1
    }
    return c
  }, [jobs])

  const visibleJobs = useMemo(() => {
    if (filter === 'all') return jobs
    return jobs.filter((j) => j.status === filter)
  }, [jobs, filter])

  return (
    <div className="space-y-5">
      <div className="flex gap-2 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-1.5 shadow-sm">
        <button
          type="button"
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
            tab === 'orders'
              ? 'bg-[var(--kc-accent,#c41e3a)] text-white shadow-sm'
              : 'text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-[var(--color-slate-900,#faf8f4)]'
          }`}
          onClick={() => setTab('orders')}
        >
          <Package className="size-4" />
          Orders
        </button>
        <button
          type="button"
          className={`flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
            tab === 'karigars'
              ? 'bg-[var(--kc-accent,#c41e3a)] text-white shadow-sm'
              : 'text-[var(--color-jewelry-black,#1a1814)]/70 hover:bg-[var(--color-slate-900,#faf8f4)]'
          }`}
          onClick={() => setTab('karigars')}
        >
          <Users className="size-4" />
          Karigars
          {karigars.length > 0 ? (
            <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{karigars.length}</span>
          ) : null}
        </button>
      </div>

      {tab === 'karigars' ? (
        <KarigarsPanel karigars={karigars} onRefresh={loadKarigars} />
      ) : (
        <>
          <div className={erpCardCls}>
            <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">New order</p>
            <div className="space-y-3">
              <input
                className={erpInputCls}
                placeholder="Customer name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <BarcodeLookupField onHit={addLineFromProduct} />
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  Or type item / order line
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className={erpInputCls}
                    placeholder="e.g. 500 pcs payal, 150 rings, 125 curb packets"
                    value={freeTextLine}
                    onChange={(e) => setFreeTextLine(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addFreeTextLine()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`${erpBtnGhost} shrink-0 sm:min-w-[120px]`}
                    disabled={!freeTextLine.trim()}
                    onClick={() => addFreeTextLine()}
                  >
                    <Plus className="size-4" />
                    Add line
                  </button>
                </div>
              </div>
              {lines.length > 0 ? (
                <ul className="space-y-2">
                  {lines.map((line, idx) => (
                    <li
                      key={`${line.code}-${idx}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">{line.name}</p>
                        <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                          {line.code}
                          {line.weightGm != null ? ` · ${line.weightGm} gm` : ''}
                        </p>
                      </div>
                      <input
                        className="w-20 rounded-lg border border-[var(--color-slate-700,#e8e4df)] px-2 py-1.5 text-sm tabular-nums text-[var(--color-jewelry-black,#1a1814)]"
                        inputMode="decimal"
                        placeholder="₹"
                        value={line.lineTotalInr ?? ''}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setLines((prev) =>
                            prev.map((l, i) =>
                              i === idx
                                ? { ...l, lineTotalInr: Number.isFinite(v) ? v : null, unitInr: Number.isFinite(v) ? v : null }
                                : l,
                            ),
                          )
                        }}
                      />
                      <button
                        type="button"
                        className="p-1.5 text-rose-500"
                        onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                        aria-label="Remove line"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <input className={erpInputCls} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
                <span className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Total {formatErpInr(total)}</span>
                <button type="button" className={erpBtnPrimary} disabled={busy || lines.length === 0} onClick={() => void saveOrder()}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Save order
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <input
              className={erpInputCls}
              placeholder="Search order, customer, karigar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {FILTER_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    filter === t.id
                      ? 'border-[var(--kc-accent,#c41e3a)]/40 bg-[var(--kc-accent,#c41e3a)]/10 text-[var(--kc-accent,#c41e3a)]'
                      : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/55'
                  }`}
                  onClick={() => setFilter(t.id)}
                >
                  {t.label}
                  {counts[t.id] != null ? ` (${counts[t.id]})` : ''}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {visibleJobs.length === 0 ? (
              <li className="rounded-2xl border border-dashed border-[var(--color-slate-700,#e8e4df)] bg-white/70 px-4 py-10 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                {jobs.length === 0
                  ? 'No orders yet. Create one above and track karigar handovers here.'
                  : 'No orders in this filter.'}
              </li>
            ) : (
              visibleJobs.map((job) => (
                <OrderJobCard key={job.id} job={job} karigars={karigars} onRefresh={refreshAll} />
              ))
            )}
          </ul>
        </>
      )}
    </div>
  )
}

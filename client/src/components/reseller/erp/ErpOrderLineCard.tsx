'use client'

import { useState } from 'react'
import axios from '@/lib/axios'
import {
  ArrowRightLeft,
  CheckCircle2,
  Hammer,
  Loader2,
  PauseCircle,
  RotateCcw,
} from 'lucide-react'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { ErpOrderMediaControls } from '@/components/reseller/erp/ErpOrderMediaControls'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpErr,
  erpInputCls,
  type ErpBillLine,
  type ErpKarigar,
  type ErpOrderLineStatus,
} from '@/components/reseller/erp/erp-ui'

const LINE_STATUS_LABEL: Record<ErpOrderLineStatus, string> = {
  in_shop: 'In shop',
  on_hold: 'On hold',
  with_karigar: 'With karigar',
  returned: 'Returned',
  completed: 'Done',
}

const LINE_STATUS_STYLE: Record<ErpOrderLineStatus, string> = {
  in_shop: 'border-slate-300 bg-slate-50 text-slate-700',
  on_hold: 'border-violet-300 bg-violet-50 text-violet-900',
  with_karigar: 'border-amber-300 bg-amber-50 text-amber-900',
  returned: 'border-sky-300 bg-sky-50 text-sky-900',
  completed: 'border-emerald-300 bg-emerald-50 text-emerald-900',
}

type Props = {
  billId: number
  line: ErpBillLine
  karigars: ErpKarigar[]
  onRefresh: () => Promise<void>
  jobClosed: boolean
}

export function ErpOrderLineCard({ billId, line, karigars, onRefresh, jobClosed }: Props) {
  const lineKey = line.lineKey || ''
  const status = (line.lineStatus || 'in_shop') as ErpOrderLineStatus
  const [busy, setBusy] = useState(false)
  const [karigarId, setKarigarId] = useState('')
  const [transferKarigarId, setTransferKarigarId] = useState('')
  const [workDesc, setWorkDesc] = useState(line.workDescription || '')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  const transferOptions = karigars.filter((k) => k.id !== line.karigarId)
  const canHand = !jobClosed && (status === 'in_shop' || status === 'returned' || status === 'on_hold')
  const canTransfer = !jobClosed && status === 'with_karigar' && transferOptions.length > 0
  const canReturn = !jobClosed && status === 'with_karigar'
  const canHold = !jobClosed && status !== 'completed' && status !== 'on_hold'
  const canComplete = !jobClosed && status !== 'completed' && status !== 'with_karigar'
  const canRelease = !jobClosed && status === 'on_hold'

  const runLineAction = async (
    action: string,
    body: Record<string, unknown> = {},
  ) => {
    if (busy || !lineKey) return
    setBusy(true)
    setErr('')
    try {
      await axios.patch(
        `/api/reseller/erp/order-jobs/bill/${billId}/lines/${lineKey}/karigar`,
        { action, ...body },
      )
      setNote('')
      if (action === 'hand_to' || action === 'transfer') {
        setKarigarId('')
        setTransferKarigarId('')
      }
      await onRefresh()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-3 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{line.name}</p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            {[line.barcode || line.code, line.lineTotalInr != null ? formatErpInr(line.lineTotalInr) : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {line.karigarName ? (
            <p className="mt-0.5 text-xs font-medium text-amber-900">{line.karigarName}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LINE_STATUS_STYLE[status]}`}
        >
          {LINE_STATUS_LABEL[status]}
        </span>
      </div>

      <ErpOrderMediaControls
        billId={billId}
        lineKey={lineKey}
        imageUrls={line.imageUrls || []}
        voiceNoteUrl={line.voiceNoteUrl}
        onUpdated={onRefresh}
        compact
      />

      {!jobClosed && karigars.length > 0 ? (
        <div className="space-y-2 border-t border-[var(--color-slate-700,#e8e4df)]/70 pt-3">
          {canHand ? (
            <>
              <select
                className={erpInputCls}
                value={karigarId}
                onChange={(e) => setKarigarId(e.target.value)}
              >
                <option value="">Select karigar for this item</option>
                {karigars.map((k) => (
                  <option key={k.id} value={String(k.id)}>
                    {k.name}
                    {k.specialty ? ` · ${k.specialty}` : ''}
                  </option>
                ))}
              </select>
              <input
                className={erpInputCls}
                placeholder="Work description (optional)"
                value={workDesc}
                onChange={(e) => setWorkDesc(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !karigarId}
                className={`${erpBtnPrimary} w-full`}
                onClick={() =>
                  void runLineAction('hand_to', {
                    karigar_id: Number(karigarId),
                    work_description: workDesc || undefined,
                    notes: note || undefined,
                  })
                }
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Hammer className="size-4" />}
                Hand to karigar
              </button>
            </>
          ) : null}

          {canTransfer ? (
            <>
              <select
                className={erpInputCls}
                value={transferKarigarId}
                onChange={(e) => setTransferKarigarId(e.target.value)}
              >
                <option value="">Transfer to another karigar</option>
                {transferOptions.map((k) => (
                  <option key={k.id} value={String(k.id)}>
                    {k.name}
                    {k.specialty ? ` · ${k.specialty}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !transferKarigarId}
                className={`${erpBtnGhost} w-full border-amber-200 text-amber-900`}
                onClick={() =>
                  void runLineAction('transfer', {
                    karigar_id: Number(transferKarigarId),
                    notes: note || undefined,
                  })
                }
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
                Transfer item
              </button>
              {!transferKarigarId ? (
                <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
                  Pick a different karigar above — current karigar is hidden from this list.
                </p>
              ) : null}
            </>
          ) : null}

          {canReturn ? (
            <button
              type="button"
              disabled={busy}
              className={`${erpBtnGhost} w-full border-sky-200 text-sky-900`}
              onClick={() => void runLineAction('return', { notes: note || undefined })}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Mark returned to shop
            </button>
          ) : null}

          {canHold ? (
            <button
              type="button"
              disabled={busy}
              className={`${erpBtnGhost} w-full border-violet-200 text-violet-900`}
              onClick={() => void runLineAction('hold', { notes: note || 'On hold' })}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <PauseCircle className="size-4" />}
              Put on hold
            </button>
          ) : null}

          {canRelease ? (
            <button
              type="button"
              disabled={busy}
              className={`${erpBtnGhost} w-full`}
              onClick={() => void runLineAction('release', { notes: note || undefined })}
            >
              Release from hold
            </button>
          ) : null}

          {canComplete ? (
            <button
              type="button"
              disabled={busy}
              className={`${erpBtnPrimary} w-full bg-emerald-700 hover:opacity-90`}
              onClick={() => void runLineAction('complete', { notes: note || undefined })}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Mark item done
            </button>
          ) : null}

          <input
            className={erpInputCls}
            placeholder="Note for this action (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      ) : null}

      {!jobClosed && karigars.length === 0 ? (
        <p className="text-xs text-amber-800">Add karigars in the Karigars tab to assign this item.</p>
      ) : null}

      {err ? <p className="text-xs text-rose-700">{err}</p> : null}
    </li>
  )
}

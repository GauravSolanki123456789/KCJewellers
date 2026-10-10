'use client'

import { useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, X } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpErr } from '@/components/reseller/erp/erp-ui'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'

type NarrationRow = { id: number; label: string }

export function ErpApprovalIssueModal({
  open,
  estimateLabel,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  estimateLabel: string
  busy?: boolean
  onClose: () => void
  onConfirm: (narration: string) => void
}) {
  const [options, setOptions] = useState<NarrationRow[]>([])
  const [value, setValue] = useState('')
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    if (!open) return
    setValue('')
    setLoadErr('')
    void axios
      .get<{ options: NarrationRow[] }>('/api/reseller/erp/approval-narrations')
      .then((res) => setOptions(res.data.options || []))
      .catch((e) => setLoadErr(erpErr(e)))
  }, [open])

  if (!open) return null

  const labels = options.map((o) => o.label)
  const match = labels.find((l) => l.trim().toLowerCase() === value.trim().toLowerCase())

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Issue as approval
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
              {estimateLabel} — stock will leave inventory until you return this to an estimate or convert it to a
              sales bill.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--color-jewelry-black,#1a1814)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {loadErr ? <p className="mb-2 text-xs text-rose-700">{loadErr}</p> : null}
        <label className="mb-4 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
          Narration
          <div className="mt-1">
            <ErpBillingSuggestField
              value={value}
              placeholder="Type to search narration…"
              options={labels}
              autoFocus
              emptyText="No matching narration — add one in Estimate narrations"
              onChange={setValue}
              onCommit={(v) => setValue(v)}
            />
          </div>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={erpBtnGhost} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={erpBtnPrimary}
            disabled={busy || !match}
            onClick={() => match && onConfirm(match)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Issue GAI
          </button>
        </div>
      </div>
    </div>
  )
}

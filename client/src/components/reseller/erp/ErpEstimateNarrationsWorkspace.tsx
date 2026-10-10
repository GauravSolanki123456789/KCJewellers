'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls, erpErr } from '@/components/reseller/erp/erp-ui'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { appConfirm } from '@/lib/app-notice'

type NarrationRow = { id: number; label: string; sort_order: number }

export function ErpEstimateNarrationsWorkspace() {
  const { operator, shadowUnlocked } = useErpOperator()
  const isAdmin = operator?.role === 'admin'
  const [busy, setBusy] = useState(true)
  const [enabled, setEnabled] = useState(true)
  const [options, setOptions] = useState<NarrationRow[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [toggleBusy, setToggleBusy] = useState(false)
  const [approvalOptions, setApprovalOptions] = useState<NarrationRow[]>([])
  const [approvalNew, setApprovalNew] = useState('')
  const [approvalEditId, setApprovalEditId] = useState<number | null>(null)
  const [approvalEditLabel, setApprovalEditLabel] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const [est, appr] = await Promise.all([
        axios.get<{ enabled: boolean; options: NarrationRow[] }>('/api/reseller/erp/estimate-narrations'),
        axios.get<{ options: NarrationRow[] }>('/api/reseller/erp/approval-narrations'),
      ])
      setEnabled(est.data.enabled !== false)
      setOptions(est.data.options || [])
      setApprovalOptions(appr.data.options || [])
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const addOption = async () => {
    const label = newLabel.trim()
    if (!label || !isAdmin) return
    try {
      await axios.post('/api/reseller/erp/estimate-narrations', { label })
      setNewLabel('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const saveEdit = async () => {
    if (editId == null || !isAdmin) return
    const label = editLabel.trim()
    if (!label) return
    try {
      await axios.put(`/api/reseller/erp/estimate-narrations/${editId}`, { label })
      setEditId(null)
      setEditLabel('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const removeOption = async (row: NarrationRow) => {
    if (!shadowUnlocked || !isAdmin) return
    const ok = await appConfirm(`Delete narration “${row.label}”?`)
    if (!ok) return
    try {
      await axios.delete(`/api/reseller/erp/estimate-narrations/${row.id}`)
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const addApproval = async () => {
    const label = approvalNew.trim()
    if (!label || !isAdmin) return
    try {
      await axios.post('/api/reseller/erp/approval-narrations', { label })
      setApprovalNew('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const saveApprovalEdit = async () => {
    if (approvalEditId == null || !isAdmin) return
    const label = approvalEditLabel.trim()
    if (!label) return
    try {
      await axios.put(`/api/reseller/erp/approval-narrations/${approvalEditId}`, { label })
      setApprovalEditId(null)
      setApprovalEditLabel('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const removeApproval = async (row: NarrationRow) => {
    if (!shadowUnlocked || !isAdmin) return
    const ok = await appConfirm(`Delete approval narration “${row.label}”?`)
    if (!ok) return
    try {
      await axios.delete(`/api/reseller/erp/approval-narrations/${row.id}`)
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const toggleEnabled = async () => {
    if (!shadowUnlocked || !isAdmin) return
    setToggleBusy(true)
    try {
      const res = await axios.put<{ enabled: boolean }>(
        '/api/reseller/erp/estimate-narrations/settings/enabled',
        { enabled: !enabled },
      )
      setEnabled(res.data.enabled !== false)
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setToggleBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
        Only an ERP admin can manage estimate narration options.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="mb-4 text-sm text-[var(--color-jewelry-black,#1a1814)]/65">
        Estimate options appear in Scan &amp; bill. Approval issue narrations are chosen when converting an estimate
        to a Delivery Challan [Issue] — that text prints on the challan PDF.
      </p>

      <div className={`${erpCardCls} mb-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Require narration on estimates
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-jewelry-black,#1a1814)]">
              {enabled ? 'On — staff must pick a narration before generating an estimate.' : 'Off — narration field hidden in billing.'}
            </p>
          </div>
          {shadowUnlocked ? (
            <button
              type="button"
              className={erpBtnGhost}
              disabled={toggleBusy}
              onClick={() => void toggleEnabled()}
            >
              {toggleBusy ? <Loader2 className="size-4 animate-spin" /> : enabled ? 'Turn off' : 'Turn on'}
            </button>
          ) : (
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
              Unlock Jainav mode to turn this off.
            </p>
          )}
        </div>
      </div>

      <div className={`${erpCardCls} space-y-4`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            New narration
            <input
              className={`${erpInputCls} mt-1`}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Hand carry"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addOption()
              }}
            />
          </label>
          <button type="button" className={erpBtnPrimary} onClick={() => void addOption()} disabled={!newLabel.trim()}>
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>

        {busy ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-[var(--color-jewelry-black,#1a1814)]/35" />
          </div>
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">No options yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)] rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            {options.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {editId === row.id ? (
                  <>
                    <input
                      className={`${erpInputCls} min-w-[12rem] flex-1`}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className={erpBtnPrimary} onClick={() => void saveEdit()}>
                      Save
                    </button>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() => {
                        setEditId(null)
                        setEditLabel('')
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                      {row.label}
                    </span>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() => {
                        setEditId(row.id)
                        setEditLabel(row.label)
                      }}
                    >
                      Edit
                    </button>
                    {shadowUnlocked ? (
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"
                        onClick={() => void removeOption(row)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {shadowUnlocked ? (
          <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
            Delete is available only in Jainav mode.
          </p>
        ) : null}
      </div>

      <div className={`${erpCardCls} space-y-4`}>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Approval issue narrations
        </p>
        <p className="text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
          Shown when issuing an estimate as approval. Printed in bold on the Delivery Challan [Issue] PDF.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            New approval narration
            <input
              className={`${erpInputCls} mt-1`}
              value={approvalNew}
              onChange={(e) => setApprovalNew(e.target.value)}
              placeholder="e.g. ITEM SENT FOR REPAIR AND POLISH"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addApproval()
              }}
            />
          </label>
          <button
            type="button"
            className={erpBtnPrimary}
            onClick={() => void addApproval()}
            disabled={!approvalNew.trim()}
          >
            <Plus className="size-4" aria-hidden />
            Add
          </button>
        </div>
        {approvalOptions.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/45">
            No approval narrations yet.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)] rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            {approvalOptions.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {approvalEditId === row.id ? (
                  <>
                    <input
                      className={`${erpInputCls} min-w-[12rem] flex-1`}
                      value={approvalEditLabel}
                      onChange={(e) => setApprovalEditLabel(e.target.value)}
                      autoFocus
                    />
                    <button type="button" className={erpBtnPrimary} onClick={() => void saveApprovalEdit()}>
                      Save
                    </button>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() => {
                        setApprovalEditId(null)
                        setApprovalEditLabel('')
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                      {row.label}
                    </span>
                    <button
                      type="button"
                      className={erpBtnGhost}
                      onClick={() => {
                        setApprovalEditId(row.id)
                        setApprovalEditLabel(row.label)
                      }}
                    >
                      Edit
                    </button>
                    {shadowUnlocked ? (
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"
                        onClick={() => void removeApproval(row)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        Delete
                      </button>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

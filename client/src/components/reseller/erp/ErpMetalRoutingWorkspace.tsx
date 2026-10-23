'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  createMetalCounter,
  createMetalPurity,
  deleteMetalCounter,
  deleteMetalPurity,
  fetchMetalLots,
  fetchMetalPurities,
  fetchMetalRoutingBootstrap,
  fetchMetalStaffReport,
  fetchMetalStockReport,
  receiveMetalLot,
  setMetalRoutingManager,
  splitMetalLot,
  updateMetalCounter,
  type MetalPurity,
  type MetalRoutingBootstrap,
  type MetalStockLot,
  type MetalStockReportRow,
} from '@/lib/erp-metal-routing'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { erpTodayIso } from '@/lib/erp-date-format'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { cn } from '@/lib/utils'
import { GitBranch, Loader2, Plus, RefreshCw, Scale, Trash2 } from 'lucide-react'

type Tab = 'setup' | 'movements' | 'reports'

function fmtGm(n: number): string {
  return `${Number(n).toFixed(3)} g`
}

export function ErpMetalRoutingWorkspace() {
  const { operator } = useErpOperator()
  const [boot, setBoot] = useState<MetalRoutingBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('movements')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const [operators, setOperators] = useState<{ id: number; displayName: string }[]>([])
  const [purities, setPurities] = useState<MetalPurity[]>([])
  const [lots, setLots] = useState<MetalStockLot[]>([])

  const [newCounterName, setNewCounterName] = useState('')
  const [managerOpId, setManagerOpId] = useState<number | ''>('')
  const [purityLabel, setPurityLabel] = useState('')
  const [purityPct, setPurityPct] = useState('')

  const [metalType, setMetalType] = useState<'gold' | 'silver'>('silver')
  const [purityId, setPurityId] = useState<number | ''>('')
  const [grossGm, setGrossGm] = useState('')
  const [chargePct, setChargePct] = useState('')
  const [receiveCounterId, setReceiveCounterId] = useState<number | ''>('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [moveDate, setMoveDate] = useState(erpTodayIso())

  const [splitLotId, setSplitLotId] = useState<number | null>(null)
  const [splitPartA, setSplitPartA] = useState('')
  const [splitPartB, setSplitPartB] = useState('')

  const [reportFrom, setReportFrom] = useState(erpTodayIso())
  const [reportTo, setReportTo] = useState(erpTodayIso())
  const [reportMetal, setReportMetal] = useState<'gold' | 'silver' | ''>('')
  const [stockRows, setStockRows] = useState<MetalStockReportRow[]>([])
  const [staffReportOpId, setStaffReportOpId] = useState<number | ''>('')
  const [reportBusy, setReportBusy] = useState(false)

  const reloadBoot = useCallback(async () => {
    const b = await fetchMetalRoutingBootstrap()
    setBoot(b)
    if (b.manager) setManagerOpId(b.manager.id)
  }, [])

  const reloadPurities = useCallback(async () => {
    setPurities(await fetchMetalPurities(metalType))
  }, [metalType])

  const reloadLots = useCallback(async () => {
    const list = await fetchMetalLots({
      metal_type: metalType,
      status: 'active',
    })
    setLots(list)
  }, [metalType])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await reloadBoot()
      } catch {
        setErr('Failed to load metal routing')
      } finally {
        setLoading(false)
      }
    })()
  }, [reloadBoot])

  useEffect(() => {
    if (!boot) return
    void reloadPurities()
    void reloadLots()
  }, [boot, metalType, reloadPurities, reloadLots])

  useEffect(() => {
    const active = purities.filter((p) => p.is_active)
    if (active.length && !purityId) {
      setPurityId(active[0].id)
    }
  }, [purities, purityId])

  useEffect(() => {
    if (!boot || (boot.role !== 'admin' && boot.role !== 'manager')) return
    void axios
      .get<{ operators: { id: number; displayName: string }[] }>('/api/reseller/erp/operators')
      .then((r) =>
        setOperators(
          (r.data.operators || []).map((o) => ({ id: o.id, displayName: o.displayName })),
        ),
      )
      .catch(() => setOperators([]))
  }, [boot?.role])

  const role = boot?.role ?? 'viewer'
  const counters = boot?.counters ?? []
  const canManage = role === 'admin' || role === 'manager'
  const canMoveMetal = canManage || role === 'counter'

  const selectedLot = useMemo(
    () => lots.find((l) => l.id === splitLotId) ?? null,
    [lots, splitLotId],
  )

  const addCounter = async () => {
    if (!newCounterName.trim()) return
    setErr('')
    try {
      await createMetalCounter(newCounterName.trim())
      setNewCounterName('')
      setMsg('Counter saved')
      await reloadBoot()
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Could not save counter')
    }
  }

  const saveManager = async () => {
    if (!managerOpId) return
    try {
      await setMetalRoutingManager(Number(managerOpId))
      setMsg('Metal routing manager updated')
      await reloadBoot()
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Could not set manager')
    }
  }

  const addPurity = async () => {
    if (!purityLabel.trim()) return
    try {
      await createMetalPurity({
        metal_type: metalType,
        label: purityLabel.trim(),
        default_charge_pct: purityPct ? Number(purityPct) : null,
      })
      setPurityLabel('')
      setPurityPct('')
      setMsg('Purity saved')
      await reloadPurities()
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Could not save purity')
    }
  }

  const onReceive = async () => {
    if (!purityId || !grossGm) {
      setErr('Purity and gross grams required')
      return
    }
    setErr('')
    try {
      await receiveMetalLot({
        metal_type: metalType,
        purity_id: Number(purityId),
        gross_gm: Number(grossGm),
        charge_pct: chargePct ? Number(chargePct) : undefined,
        counter_id: receiveCounterId ? Number(receiveCounterId) : undefined,
        notes: receiveNotes || undefined,
        move_date: moveDate,
      })
      setGrossGm('')
      setReceiveNotes('')
      setMsg('Metal received')
      await reloadLots()
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Receive failed')
    }
  }

  const onSplit = async () => {
    if (!selectedLot) return
    const a = Number(splitPartA)
    const b = Number(splitPartB)
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      setErr('Enter two positive pure gram amounts')
      return
    }
    setErr('')
    try {
      await splitMetalLot(selectedLot.id, [{ pure_gm: a }, { pure_gm: b }])
      setSplitLotId(null)
      setSplitPartA('')
      setSplitPartB('')
      setMsg('Lot split')
      await reloadLots()
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Split failed')
    }
  }

  const loadStockReport = async () => {
    setReportBusy(true)
    setErr('')
    try {
      const data = await fetchMetalStockReport({
        from: reportFrom,
        to: reportTo,
        metal_type: reportMetal || undefined,
      })
      setStockRows(data.rows)
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Report failed')
    } finally {
      setReportBusy(false)
    }
  }

  const loadStaffReport = async () => {
    const opId = staffReportOpId || operator?.id
    if (!opId) return
    setReportBusy(true)
    try {
      const data = await fetchMetalStaffReport(Number(opId), { from: reportFrom, to: reportTo })
      setMsg(
        `${data.operator.displayName}: ${data.summary.movement_count} moves · ${fmtGm(data.summary.total_pure_gm)} pure`,
      )
    } catch (e: unknown) {
      setErr(extractErr(e) || 'Staff report failed')
    } finally {
      setReportBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
          <Scale className="mr-1 inline size-4" />
          {role === 'admin'
            ? 'Admin — counters, purities & reports'
            : role === 'manager'
              ? 'Manager — setup & all counters'
              : role === 'counter'
                ? 'Your counter — receive & split metal (grams)'
                : 'View only — ask manager for counter assignment'}
        </p>
        <button
          type="button"
          className={erpBtnGhost}
          onClick={() => void reloadBoot().then(() => Promise.all([reloadPurities(), reloadLots()]))}
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

      {msg ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>
      ) : null}
      {err ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900">{err}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(['movements', 'setup', 'reports'] as Tab[]).map((t) => {
          if (t === 'setup' && !canManage) return null
          return (
            <button
              key={t}
              type="button"
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-semibold capitalize',
                tab === t
                  ? 'bg-[var(--color-jewelry-black,#1a1814)] text-white'
                  : 'border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]',
              )}
              onClick={() => {
                setTab(t)
                setMsg('')
                setErr('')
              }}
            >
              {t === 'movements' ? 'Receive / split' : t}
            </button>
          )
        })}
      </div>

      {tab === 'setup' && canManage ? (
        <div className="space-y-4">
          {role === 'admin' ? (
            <div className={`${erpCardCls} space-y-3`}>
              <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Routing manager</p>
              <div className="flex flex-wrap gap-2">
                <select
                  className={erpInputCls}
                  value={managerOpId}
                  onChange={(e) => setManagerOpId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">Select operator</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.displayName}
                    </option>
                  ))}
                </select>
                <button type="button" className={erpBtnPrimary} onClick={() => void saveManager()}>
                  Save manager
                </button>
              </div>
            </div>
          ) : null}

          <div className={`${erpCardCls} space-y-3`}>
            <p className="font-semibold">Counters</p>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${erpInputCls} min-w-[160px] flex-1`}
                placeholder="Counter name"
                value={newCounterName}
                onChange={(e) => setNewCounterName(e.target.value)}
              />
              <button type="button" className={erpBtnPrimary} onClick={() => void addCounter()}>
                <Plus className="size-4" /> Add
              </button>
            </div>
            <ul className="space-y-2">
              {counters.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3"
                >
                  <span className="font-medium">{c.name}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={`${erpInputCls} text-xs`}
                      value={c.incharge_operator_id ?? ''}
                      onChange={(e) =>
                        void updateMetalCounter(c.id, {
                          incharge_operator_id: e.target.value ? Number(e.target.value) : null,
                        }).then(() => reloadBoot())
                      }
                    >
                      <option value="">Incharge</option>
                      {operators.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 p-2 text-rose-700"
                      onClick={() => void deleteMetalCounter(c.id).then(() => reloadBoot())}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className={`${erpCardCls} space-y-3`}>
            <p className="font-semibold">Metal purities (% charge → pure g)</p>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(erpBtnGhost, metalType === 'silver' && 'ring-2 ring-[var(--kc-accent,#c41e3a)]')}
                onClick={() => setMetalType('silver')}
              >
                Silver
              </button>
              <button
                type="button"
                className={cn(erpBtnGhost, metalType === 'gold' && 'ring-2 ring-amber-500')}
                onClick={() => setMetalType('gold')}
              >
                Gold
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className={erpInputCls}
                placeholder="Label e.g. 99.9"
                value={purityLabel}
                onChange={(e) => setPurityLabel(e.target.value)}
              />
              <input
                className={`${erpInputCls} w-24`}
                placeholder="%"
                inputMode="decimal"
                value={purityPct}
                onChange={(e) => setPurityPct(e.target.value)}
              />
              <button type="button" className={erpBtnPrimary} onClick={() => void addPurity()}>
                Add purity
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {purities
                .filter((p) => p.is_active)
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-black/[0.03] px-2 py-1.5">
                    <span>
                      {p.label}
                      {p.default_charge_pct != null ? ` · ${p.default_charge_pct}%` : ''}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-rose-700"
                      onClick={() => void deleteMetalPurity(p.id).then(() => reloadPurities())}
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tab === 'movements' && canMoveMetal ? (
        <div className="space-y-4">
          <div className={`${erpCardCls} space-y-3`}>
            <p className="font-semibold">
              <GitBranch className="mr-1 inline size-4" />
              Receive metal (grams)
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(erpBtnGhost, metalType === 'silver' && 'ring-2 ring-[var(--kc-accent,#c41e3a)]')}
                onClick={() => setMetalType('silver')}
              >
                Silver
              </button>
              <button
                type="button"
                className={cn(erpBtnGhost, metalType === 'gold' && 'ring-2 ring-amber-500')}
                onClick={() => setMetalType('gold')}
              >
                Gold
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-black/50">
                Purity
                <select
                  className={`${erpInputCls} mt-1 block w-full`}
                  value={purityId}
                  onChange={(e) => setPurityId(Number(e.target.value))}
                >
                  {purities
                    .filter((p) => p.is_active && p.metal_type === metalType)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {p.default_charge_pct != null ? ` (${p.default_charge_pct}%)` : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-black/50">
                Gross (g)
                <input
                  className={`${erpInputCls} mt-1 block w-full`}
                  inputMode="decimal"
                  value={grossGm}
                  onChange={(e) => setGrossGm(e.target.value)}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-black/50">
                Charge % (optional)
                <input
                  className={`${erpInputCls} mt-1 block w-full`}
                  inputMode="decimal"
                  placeholder="Uses purity default or 100"
                  value={chargePct}
                  onChange={(e) => setChargePct(e.target.value)}
                />
              </label>
              {canManage ? (
                <label className="text-xs font-semibold uppercase tracking-wide text-black/50">
                  Counter
                  <select
                    className={`${erpInputCls} mt-1 block w-full`}
                    value={receiveCounterId}
                    onChange={(e) =>
                      setReceiveCounterId(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">Default</option>
                    {counters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="text-xs font-semibold uppercase tracking-wide text-black/50">
                Date
                <input
                  type="date"
                  className={`${erpInputCls} mt-1 block w-full`}
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
              </label>
            </div>
            <textarea
              className={`${erpInputCls} min-h-[60px] w-full text-sm`}
              placeholder="Notes"
              value={receiveNotes}
              onChange={(e) => setReceiveNotes(e.target.value)}
            />
            <button type="button" className={erpBtnPrimary} onClick={() => void onReceive()}>
              Receive
            </button>
          </div>

          <div className={`${erpCardCls} space-y-3`}>
            <p className="font-semibold">Active lots — split</p>
            {lots.length === 0 ? (
              <p className="text-sm text-black/55">No active lots for {metalType}.</p>
            ) : (
              <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                {lots.map((lot) => (
                  <li key={lot.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-xl border p-3 text-left text-sm',
                        splitLotId === lot.id
                          ? 'border-[var(--kc-accent,#c41e3a)] bg-rose-50/40'
                          : 'border-[var(--color-slate-700,#e8e4df)] bg-white',
                      )}
                      onClick={() => setSplitLotId(lot.id)}
                    >
                      <span className="font-semibold">#{lot.id}</span> · {lot.purity?.label ?? '—'} ·{' '}
                      {lot.counter?.name ?? '—'} · {fmtGm(lot.pure_gm)} pure
                      <span className="block text-xs text-black/55">
                        Gross {fmtGm(lot.gross_gm)} · {lot.move_date}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedLot ? (
              <div className="space-y-2 border-t border-black/10 pt-3">
                <p className="text-sm">
                  Split lot #{selectedLot.id} ({fmtGm(selectedLot.pure_gm)} pure total)
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className={erpInputCls}
                    placeholder="Part A pure g"
                    inputMode="decimal"
                    value={splitPartA}
                    onChange={(e) => setSplitPartA(e.target.value)}
                  />
                  <input
                    className={erpInputCls}
                    placeholder="Part B pure g"
                    inputMode="decimal"
                    value={splitPartB}
                    onChange={(e) => setSplitPartB(e.target.value)}
                  />
                </div>
                <button type="button" className={erpBtnPrimary} onClick={() => void onSplit()}>
                  Split into 2 lots
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'reports' ? (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="font-semibold">Day / range report (pure grams)</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-semibold uppercase text-black/50">
              From
              <input
                type="date"
                className={`${erpInputCls} mt-1 block`}
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase text-black/50">
              To
              <input
                type="date"
                className={`${erpInputCls} mt-1 block`}
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
              />
            </label>
            <select
              className={erpInputCls}
              value={reportMetal}
              onChange={(e) => setReportMetal(e.target.value as 'gold' | 'silver' | '')}
            >
              <option value="">All metals</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
            </select>
            <button
              type="button"
              className={erpBtnPrimary}
              disabled={reportBusy}
              onClick={() => void loadStockReport()}
            >
              {reportBusy ? <Loader2 className="size-4 animate-spin" /> : 'Stock report'}
            </button>
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                const t = erpTodayIso()
                setReportFrom(t)
                setReportTo(t)
              }}
            >
              Today
            </button>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <select
                className={erpInputCls}
                value={staffReportOpId}
                onChange={(e) =>
                  setStaffReportOpId(e.target.value ? Number(e.target.value) : '')
                }
              >
                <option value="">Staff (self if empty)</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.displayName}
                  </option>
                ))}
              </select>
              <button type="button" className={erpBtnGhost} onClick={() => void loadStaffReport()}>
                Staff summary
              </button>
            </div>
          ) : null}
          {stockRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead>
                  <tr className="border-b text-black/50">
                    <th className="py-2 pr-2">Counter</th>
                    <th className="py-2 pr-2">Purity</th>
                    <th className="py-2 pr-2 text-right">Opening</th>
                    <th className="py-2 pr-2 text-right">Received</th>
                    <th className="py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {stockRows.map((r, i) => (
                    <tr key={i} className="border-b border-black/5">
                      <td className="py-2 pr-2">{r.counter_name}</td>
                      <td className="py-2 pr-2">{r.purity_label}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{fmtGm(r.opening_pure_gm)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{fmtGm(r.received_pure_gm)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtGm(r.closing_pure_gm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-black/55">Run stock report for opening / received / closing by counter.</p>
          )}
        </div>
      ) : null}

      {tab === 'movements' && !canMoveMetal ? (
        <p className="text-sm text-black/55">You need counter assignment or manager access to move metal.</p>
      ) : null}
    </div>
  )
}

function extractErr(e: unknown): string | null {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? null
  }
  return null
}

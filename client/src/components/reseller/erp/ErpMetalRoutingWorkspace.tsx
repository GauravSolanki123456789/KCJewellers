'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  closeMetalLot,
  createMetalCategory,
  createMetalCounter,
  createMetalPurity,
  deleteMetalCategory,
  deleteMetalCounter,
  deleteMetalLot,
  deleteMetalPurity,
  fetchMetalCategories,
  fetchMetalLotJourney,
  fetchMetalLots,
  fetchMetalLotsLedgerReport,
  fetchMetalPurities,
  fetchMetalRoutingBootstrap,
  fetchMetalStaffReport,
  fetchMetalStockReport,
  handoverMetalLot,
  metalGrossExceedsMax,
  metalLotDisplayNumber,
  recallMetalLotFromCustomer,
  receiveMetalLot,
  roundMetalGm,
  setMetalRoutingManager,
  splitMetalLot,
  transferMetalLot,
  updateMetalLot,
  updateMetalCounter,
  type MetalLotEvent,
  type MetalLotJourney,
  type MetalLotsLedgerDetailRow,
  type MetalLotsLedgerSummaryRow,
  type MetalPurity,
  type MetalRoutingBootstrap,
  type MetalRoutingCategory,
  type MetalStockLot,
  type MetalStockReportRow,
} from '@/lib/erp-metal-routing'
import { appAlert, appConfirm } from '@/lib/app-notice'
import { ErpCustomerSuggestField } from '@/components/reseller/erp/ErpCustomerSuggestField'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { erpDateFilterToIso, erpTodayIso, formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { cn } from '@/lib/utils'
import { GitBranch, History, Loader2, Plus, RefreshCw, Scale, Trash2, UserRound } from 'lucide-react'

type Tab = 'setup' | 'movements' | 'reports'

function fmtGm(n: number): string {
  return `${Number(n).toFixed(3)} g`
}

function lotPurityLabel(lot: MetalStockLot): string {
  if (lot.charge_pct != null && Number.isFinite(Number(lot.charge_pct))) {
    return String(lot.charge_pct)
  }
  return lot.purity?.label ?? '—'
}

function formatLotSummary(lot: MetalStockLot): string {
  const n = metalLotDisplayNumber(lot)
  return `#${n} · Gross: ${Number(lot.gross_gm).toFixed(3)} g    Purity: ${lotPurityLabel(lot)}    Pure wt: ${Number(lot.pure_gm).toFixed(3)} g`
}

function lotCounterLabel(lot: MetalStockLot): string {
  return lot.counter?.label_with_incharge ?? lot.counter?.name ?? 'No counter'
}

type SplitRow = { grossGm: string; counterId: number | '' }

export function ErpMetalRoutingWorkspace() {
  const { operator } = useErpOperator()
  const [boot, setBoot] = useState<MetalRoutingBootstrap | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('movements')

  const [operators, setOperators] = useState<{ id: number; displayName: string }[]>([])
  const [purities, setPurities] = useState<MetalPurity[]>([])
  const [categories, setCategories] = useState<MetalRoutingCategory[]>([])
  const [lots, setLots] = useState<MetalStockLot[]>([])
  const [lotListMode, setLotListMode] = useState<'open' | 'closed'>('open')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categoryQuery, setCategoryQuery] = useState('')

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
  const [fromCustomerId, setFromCustomerId] = useState<number | null>(null)
  const [fromCustomerName, setFromCustomerName] = useState('')
  const [moveDate, setMoveDate] = useState(erpTodayIso())

  const [activeLotId, setActiveLotId] = useState<number | null>(null)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([{ grossGm: '', counterId: '' }])
  const [transferCounterId, setTransferCounterId] = useState<number | ''>('')
  const [transferGrossGm, setTransferGrossGm] = useState('')
  const [transferOperatorId, setTransferOperatorId] = useState<number | ''>('')
  const [editPurityId, setEditPurityId] = useState<number | ''>('')
  const [editChargePct, setEditChargePct] = useState('')
  const [handoverCustomerId, setHandoverCustomerId] = useState<number | null>(null)
  const [handoverCustomerName, setHandoverCustomerName] = useState('')
  const [handoverOperatorId, setHandoverOperatorId] = useState<number | ''>('')
  const [handoverNotes, setHandoverNotes] = useState('')
  const [journey, setJourney] = useState<MetalLotJourney | null>(null)
  const [journeyBusy, setJourneyBusy] = useState(false)

  const [reportFrom, setReportFrom] = useState(erpTodayIso())
  const [reportTo, setReportTo] = useState(erpTodayIso())
  const [reportOn, setReportOn] = useState('')
  const [reportMetal, setReportMetal] = useState<'gold' | 'silver' | ''>('')
  const [stockRows, setStockRows] = useState<MetalStockReportRow[]>([])
  const [ledgerRows, setLedgerRows] = useState<
    (MetalLotsLedgerSummaryRow | MetalLotsLedgerDetailRow)[]
  >([])
  const [ledgerView, setLedgerView] = useState<'summary' | 'detail'>('summary')
  const [ledgerLotStatus, setLedgerLotStatus] = useState<'active' | 'closed' | 'all'>('active')
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

  const reloadCategories = useCallback(async () => {
    setCategories(await fetchMetalCategories())
  }, [])

  const reloadLots = useCallback(async () => {
    const list = await fetchMetalLots({
      metal_type: metalType,
      status: lotListMode === 'closed' ? 'closed' : 'active',
    })
    setLots(list)
  }, [metalType, lotListMode])

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories],
  )

  const filteredCategories = useMemo(() => {
    const q = categoryQuery.trim().toLowerCase()
    if (!q) return activeCategories
    return activeCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [activeCategories, categoryQuery])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        await reloadBoot()
        await reloadCategories()
      } catch {
        appAlert('Failed to load metal routing', 'error')
      } finally {
        setLoading(false)
      }
    })()
  }, [reloadBoot])

  useEffect(() => {
    if (!boot) return
    setActiveLotId(null)
    setJourney(null)
    setPurityId('')
    void reloadPurities()
    void reloadLots()
  }, [boot, metalType, reloadPurities, reloadLots])

  const visibleLots = useMemo(
    () => lots.filter((l) => String(l.metal_type).toLowerCase() === metalType),
    [lots, metalType],
  )

  useEffect(() => {
    const active = purities.filter((p) => p.is_active)
    if (active.length && !purityId) {
      setPurityId(active[0].id)
    }
  }, [purities, purityId])

  useEffect(() => {
    if (!categoryId && activeCategories.length === 1) {
      setCategoryId(activeCategories[0].id)
      setCategoryQuery(activeCategories[0].name)
    }
  }, [activeCategories, categoryId])

  useEffect(() => {
    if (!boot || boot.role === 'viewer') return
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
    () => visibleLots.find((l) => l.id === activeLotId) ?? null,
    [visibleLots, activeLotId],
  )

  const loadJourney = useCallback(async (lotId: number) => {
    setJourneyBusy(true)
    try {
      setJourney(await fetchMetalLotJourney(lotId))
    } catch (e: unknown) {
      setJourney(null)
      appAlert(extractErr(e) || 'Could not load lot journey', 'error')
    } finally {
      setJourneyBusy(false)
    }
  }, [])

  const mergeLotInList = useCallback((updated: MetalStockLot) => {
    setLots((prev) => {
      const idx = prev.findIndex((l) => l.id === updated.id)
      if (idx < 0) return prev
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  const splitTotalGross = useMemo(() => {
    return splitRows.reduce((s, r) => {
      const n = Number(String(r.grossGm).replace(/,/g, ''))
      return s + (Number.isFinite(n) && n > 0 ? n : 0)
    }, 0)
  }, [splitRows])

  const addCounter = async () => {
    if (!newCounterName.trim()) return
    try {
      await createMetalCounter(newCounterName.trim())
      setNewCounterName('')
      appAlert('Counter saved', 'success')
      await reloadBoot()
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not save counter', 'error')
    }
  }

  const saveManager = async () => {
    if (!managerOpId) return
    try {
      await setMetalRoutingManager(Number(managerOpId))
      appAlert('Metal routing manager updated', 'success')
      await reloadBoot()
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not set manager', 'error')
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
      appAlert('Purity saved', 'success')
      await reloadPurities()
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not save purity', 'error')
    }
  }

  const addCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      const cat = await createMetalCategory(newCategoryName.trim())
      setNewCategoryName('')
      await reloadCategories()
      setCategoryId(cat.id)
      setCategoryQuery(cat.name)
      appAlert('Category saved', 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not save category', 'error')
    }
  }

  const resolveReceiveCategoryId = (): number | null => {
    if (categoryId) return Number(categoryId)
    const q = categoryQuery.trim().toLowerCase()
    const match = activeCategories.find((c) => c.name.toLowerCase() === q)
    return match ? match.id : null
  }

  const onReceive = async () => {
    if (!purityId || !grossGm) {
      appAlert('Purity and gross grams required', 'error')
      return
    }
    const resolvedCategoryId = resolveReceiveCategoryId()
    if (!resolvedCategoryId) {
      appAlert('Choose a category (required)', 'error')
      return
    }
    try {
      const lot = await receiveMetalLot({
        metal_type: metalType,
        purity_id: Number(purityId),
        gross_gm: Number(grossGm),
        charge_pct: chargePct ? Number(chargePct) : undefined,
        counter_id: receiveCounterId ? Number(receiveCounterId) : undefined,
        from_customer_id: fromCustomerId ?? undefined,
        category_id: resolvedCategoryId,
        notes: receiveNotes || undefined,
        move_date: moveDate,
      })
      setGrossGm('')
      setReceiveNotes('')
      setFromCustomerId(null)
      setFromCustomerName('')
      setLots((prev) => [lot, ...prev.filter((l) => l.id !== lot.id)])
      appAlert('Metal received', 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Receive failed', 'error')
    }
  }

  const selectLot = (lotId: number) => {
    setActiveLotId((prev) => {
      const next = prev === lotId ? null : lotId
      if (next) void loadJourney(next)
      else setJourney(null)
      return next
    })
    setSplitRows([{ grossGm: '', counterId: '' }])
    setTransferCounterId('')
    setTransferGrossGm('')
    setHandoverCustomerId(null)
    setHandoverCustomerName('')
    setHandoverOperatorId('')
    const lot = visibleLots.find((l) => l.id === lotId)
    setEditPurityId(lot?.purity_id ?? '')
    setEditChargePct(lot?.charge_pct != null ? String(lot.charge_pct) : '')
  }

  const onSplit = async () => {
    if (!selectedLot) return
    const parts = splitRows
      .map((r) => ({
        gross_gm: Number(String(r.grossGm).replace(/,/g, '')),
        counter_id: r.counterId ? Number(r.counterId) : undefined,
      }))
      .filter((p) => Number.isFinite(p.gross_gm) && p.gross_gm > 0)
    if (!parts.length) {
      appAlert('Add at least one split line with gross grams', 'error')
      return
    }
    const total = roundMetalGm(parts.reduce((s, p) => s + p.gross_gm, 0))
    const maxGross = roundMetalGm(Number(selectedLot.gross_gm))
    if (metalGrossExceedsMax(total, maxGross)) {
      appAlert(
        `Split total (${total.toFixed(3)} g) cannot exceed lot gross (${maxGross.toFixed(3)} g)`,
        'error',
      )
      return
    }
    try {
      const res = await splitMetalLot(selectedLot.id, parts)
      await reloadLots()
      const parentId = res.parent?.id ?? res.parent_id
      setActiveLotId(parentId)
      setSplitRows([{ grossGm: '', counterId: '' }])
      if (parentId) void loadJourney(parentId)
      appAlert(
        res.remaining_gross_gm > 0.001
          ? `Split done — ${res.remaining_gross_gm.toFixed(3)} g left on #${res.parent_id}`
          : 'Lot fully split',
        'success',
      )
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Split failed', 'error')
    }
  }

  const onTransfer = async () => {
    if (!selectedLot || !transferCounterId) {
      appAlert('Choose a destination counter', 'error')
      return
    }
    try {
      const grossRaw = String(transferGrossGm).replace(/,/g, '').trim()
      const maxGross = roundMetalGm(Number(selectedLot.gross_gm))
      const body: { counter_id: number; gross_gm?: number; operator_id?: number } = {
        counter_id: Number(transferCounterId),
      }
      if (transferOperatorId) body.operator_id = Number(transferOperatorId)
      if (grossRaw) {
        const g = roundMetalGm(Number(grossRaw))
        if (!Number.isFinite(g) || g <= 0) {
          appAlert('Enter valid grams to move, or leave blank for full lot', 'error')
          return
        }
        if (metalGrossExceedsMax(g, maxGross)) {
          appAlert(
            `Cannot transfer ${g.toFixed(3)} g — lot has only ${maxGross.toFixed(3)} g gross`,
            'error',
          )
          return
        }
        body.gross_gm = g
      }
      const res = await transferMetalLot(selectedLot.id, body)
      setTransferGrossGm('')
      mergeLotInList(res.lot)
      if (res.transferred) {
        setLots((prev) => [res.transferred!, ...prev.filter((l) => l.id !== res.transferred!.id)])
      }
      setActiveLotId(res.lot.id)
      void loadJourney(res.lot.id)
      appAlert(
        res.mode === 'full'
          ? `Moved lot #${selectedLot.id} to counter`
          : `Moved ${fmtGm(Number(res.transferred?.gross_gm ?? 0))} to counter — remainder on #${res.lot.id}`,
        'success',
      )
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Transfer failed', 'error')
    }
  }

  const onHandover = async () => {
    if (!selectedLot) return
    if (!handoverCustomerId && !handoverOperatorId) {
      appAlert('Choose a customer or staff member to hand over to', 'error')
      return
    }
    try {
      const lot = await handoverMetalLot(selectedLot.id, {
        to_customer_id: handoverCustomerId ?? undefined,
        to_operator_id: handoverOperatorId ? Number(handoverOperatorId) : undefined,
        notes: handoverNotes.trim() || undefined,
      })
      setHandoverNotes('')
      mergeLotInList(lot)
      setHandoverCustomerId(null)
      setHandoverCustomerName('')
      setHandoverOperatorId('')
      void loadJourney(selectedLot.id)
      appAlert(
        handoverCustomerId
          ? `Lot #${selectedLot.id} handed to customer (still open until manager closes)`
          : `Lot #${selectedLot.id} handed to staff`,
        'success',
      )
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Handover failed', 'error')
    }
  }

  const onCloseLot = async () => {
    if (!selectedLot) return
    const ok = await appConfirm(`Close lot #${selectedLot.id}? This marks it finished in routing.`)
    if (!ok) return
    try {
      await closeMetalLot(selectedLot.id)
      setActiveLotId(null)
      setJourney(null)
      await reloadLots()
      appAlert(`Lot #${selectedLot.id} closed`, 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not close lot', 'error')
    }
  }

  const onRecallFromCustomer = async () => {
    if (!selectedLot || !canManage) return
    try {
      const lot = await recallMetalLotFromCustomer(selectedLot.id)
      mergeLotInList(lot)
      void loadJourney(selectedLot.id)
      appAlert(`Lot #${metalLotDisplayNumber(selectedLot)} taken back from customer`, 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Recall failed', 'error')
    }
  }

  const onDeleteLot = async () => {
    if (!selectedLot || !canManage) return
    const n = metalLotDisplayNumber(selectedLot)
    const ok = await appConfirm(
      `Delete lot #${n} and any split children? The lot number can be reused for the next receive.`,
    )
    if (!ok) return
    try {
      await deleteMetalLot(selectedLot.id)
      setActiveLotId(null)
      setJourney(null)
      await reloadLots()
      appAlert(`Lot #${n} deleted — number is free to reuse`, 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Delete failed', 'error')
    }
  }

  const onSaveLotPurity = async () => {
    if (!selectedLot || !editPurityId) return
    try {
      const lot = await updateMetalLot(selectedLot.id, {
        purity_id: Number(editPurityId),
        charge_pct: editChargePct ? Number(editChargePct) : undefined,
      })
      mergeLotInList(lot)
      appAlert('Purity updated (pure wt recalculated from gross)', 'success')
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Could not update purity', 'error')
    }
  }

  const reportRangeIso = () => {
    const onIso = erpDateFilterToIso(reportOn)
    const fromIso = onIso || erpDateFilterToIso(reportFrom)
    const toIso = onIso || erpDateFilterToIso(reportTo)
    return { fromIso, toIso, onIso }
  }

  const loadStockReport = async () => {
    const { fromIso, toIso } = reportRangeIso()
    if (!fromIso || !toIso) {
      appAlert('Enter a valid from/to or on date (dd/mm/yyyy)', 'error')
      return
    }
    setReportBusy(true)
    try {
      const data = await fetchMetalStockReport({
        from: fromIso,
        to: toIso,
        metal_type: reportMetal || undefined,
      })
      setStockRows(data.rows)
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Report failed', 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const loadLotsLedgerReport = async () => {
    if (!canManage) return
    const { fromIso, toIso } = reportRangeIso()
    if (!fromIso || !toIso) {
      appAlert('Enter a valid from/to or on date (dd/mm/yyyy)', 'error')
      return
    }
    setReportBusy(true)
    try {
      const data = await fetchMetalLotsLedgerReport({
        from: fromIso,
        to: toIso,
        metal_type: reportMetal || undefined,
        lot_status: ledgerLotStatus,
        view: ledgerView,
      })
      setLedgerRows(data.rows as (MetalLotsLedgerSummaryRow | MetalLotsLedgerDetailRow)[])
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Lots ledger report failed', 'error')
    } finally {
      setReportBusy(false)
    }
  }

  const loadStaffReport = async () => {
    const opId = staffReportOpId || operator?.id
    if (!opId) return
    const { fromIso, toIso } = reportRangeIso()
    if (!fromIso || !toIso) {
      appAlert('Enter a valid from/to or on date (dd/mm/yyyy)', 'error')
      return
    }
    setReportBusy(true)
    try {
      const data = await fetchMetalStaffReport(Number(opId), { from: fromIso, to: toIso })
      appAlert(
        `${data.operator.displayName}: ${data.summary.movement_count} moves · ${fmtGm(data.summary.total_pure_gm)} pure`,
        'info',
      )
    } catch (e: unknown) {
      appAlert(extractErr(e) || 'Staff report failed', 'error')
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
          onClick={() =>
            void reloadBoot().then(() =>
              Promise.all([reloadPurities(), reloadCategories(), reloadLots()]),
            )
          }
        >
          <RefreshCw className="size-4" /> Refresh
        </button>
      </div>

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
              onClick={() => setTab(t)}
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
            <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">Lot categories</p>
            <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              Required when receiving metal (e.g. Metal, Ornaments).
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className={`${erpInputCls} min-w-[160px] flex-1`}
                placeholder="Category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
              />
              <button type="button" className={erpBtnPrimary} onClick={() => void addCategory()}>
                <Plus className="size-4" /> Add
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {activeCategories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg bg-black/[0.03] px-2 py-1.5 text-[var(--color-jewelry-black,#1a1814)]"
                >
                  <span>{c.name}</span>
                  <button
                    type="button"
                    className="text-xs text-rose-700"
                    onClick={() =>
                      void deleteMetalCategory(c.id).then(() => reloadCategories())
                    }
                  >
                    Remove
                  </button>
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
            <label className="block text-xs font-semibold uppercase tracking-wide text-black/50">
              Category (required)
              <div className="relative mt-1">
                <input
                  className={`${erpInputCls} block w-full`}
                  list="metal-routing-categories"
                  placeholder="Type or pick category…"
                  value={categoryQuery}
                  onChange={(e) => {
                    setCategoryQuery(e.target.value)
                    const q = e.target.value.trim().toLowerCase()
                    const match = activeCategories.find((c) => c.name.toLowerCase() === q)
                    setCategoryId(match ? match.id : '')
                  }}
                />
                <datalist id="metal-routing-categories">
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                {filteredCategories.length > 0 && categoryQuery.trim() && !categoryId ? (
                  <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                    {filteredCategories.slice(0, 8).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-[var(--color-jewelry-black,#1a1814)] hover:bg-black/[0.04]"
                          onClick={() => {
                            setCategoryId(c.id)
                            setCategoryQuery(c.name)
                          }}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-black/50">
              From customer (optional)
              <div className="mt-1">
                <ErpCustomerSuggestField
                  customerId={fromCustomerId}
                  customerName={fromCustomerName}
                  onQueryChange={() => {}}
                  onSelect={(c) => {
                    setFromCustomerId(c.id)
                    setFromCustomerName(c.name)
                  }}
                  onClearLink={() => {
                    setFromCustomerId(null)
                    setFromCustomerName('')
                  }}
                  placeholder="Search customer…"
                />
              </div>
            </label>
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                {lotListMode === 'closed' ? 'Closed lots' : 'Open lots'}
              </p>
              {canManage ? (
                <div className="flex rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-0.5">
                  <button
                    type="button"
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold',
                      lotListMode === 'open'
                        ? 'bg-[var(--color-jewelry-black,#1a1814)] text-white'
                        : 'text-[var(--color-jewelry-black,#1a1814)]',
                    )}
                    onClick={() => {
                      setLotListMode('open')
                      setActiveLotId(null)
                      setJourney(null)
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold',
                      lotListMode === 'closed'
                        ? 'bg-[var(--color-jewelry-black,#1a1814)] text-white'
                        : 'text-[var(--color-jewelry-black,#1a1814)]',
                    )}
                    onClick={() => {
                      setLotListMode('closed')
                      setActiveLotId(null)
                      setJourney(null)
                    }}
                  >
                    Closed
                  </button>
                </div>
              ) : null}
            </div>
            {visibleLots.length === 0 ? (
              <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
                No {lotListMode} lots for {metalType}.
              </p>
            ) : (
              <ul className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto">
                {visibleLots.map((lot) => (
                  <li key={lot.id} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
                    <button
                      type="button"
                      className={cn(
                        'w-full p-3 text-left text-sm text-[var(--color-jewelry-black,#1a1814)]',
                        activeLotId === lot.id && 'bg-[var(--color-slate-900,#f7f4ef)]/80',
                      )}
                      onClick={() => selectLot(lot.id)}
                    >
                      <p className="font-semibold leading-snug">{formatLotSummary(lot)}</p>
                      <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        {lotCounterLabel(lot)}
                        {lot.category?.name ? ` · ${lot.category.name}` : ''}
                        {lot.held_by_customer?.name ? ` · With ${lot.held_by_customer.name}` : ''}
                        {lot.from_customer?.name ? ` · From ${lot.from_customer.name}` : ''}
                        {' · '}
                        {formatErpDateDdMmYyyy(lot.move_date)}
                      </p>
                    </button>
                    {activeLotId === lot.id ? (
                      <div className="space-y-3 border-t border-[var(--color-slate-700,#e8e4df)] p-3">
                        {lot.held_by_customer?.name ? (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
                            With customer: <strong>{lot.held_by_customer.name}</strong>
                            {canManage ? (
                              <button
                                type="button"
                                className="ml-2 font-semibold underline"
                                onClick={() => void onRecallFromCustomer()}
                              >
                                Take back (manager)
                              </button>
                            ) : (
                              ' — ask manager to take back before moving this lot.'
                            )}
                          </p>
                        ) : null}
                        {lotListMode === 'open' && lot.status === 'active' && !lot.held_by_customer_id ? (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                            Move to counter
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                            <select
                              className={`${erpInputCls} min-h-[44px] flex-1`}
                              value={transferCounterId}
                              onChange={(e) =>
                                setTransferCounterId(e.target.value ? Number(e.target.value) : '')
                              }
                            >
                              <option value="">Destination counter…</option>
                              {counters
                                .filter((c) => c.id !== lot.counter_id)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.label_with_incharge ?? c.name}
                                  </option>
                                ))}
                            </select>
                            <input
                              className={`${erpInputCls} min-h-[44px] w-full sm:w-36`}
                              placeholder={`Gross g (max ${Number(lot.gross_gm).toFixed(3)})`}
                              inputMode="decimal"
                              value={transferGrossGm}
                              onChange={(e) => setTransferGrossGm(e.target.value)}
                            />
                            {canManage ? (
                              <select
                                className={`${erpInputCls} min-h-[44px] sm:w-40`}
                                value={transferOperatorId}
                                onChange={(e) =>
                                  setTransferOperatorId(e.target.value ? Number(e.target.value) : '')
                                }
                              >
                                <option value="">Staff (self)</option>
                                {operators.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.displayName}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            <button type="button" className={erpBtnPrimary} onClick={() => void onTransfer()}>
                              Transfer
                            </button>
                          </div>
                        </div>
                        ) : null}

                        {lotListMode === 'open' && lot.status === 'active' && !lot.held_by_customer_id ? (
                        <div className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                            <UserRound className="mr-1 inline size-3.5" />
                            Hand over (lot stays open)
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-[10px] font-semibold uppercase text-black/50">
                              To customer
                              <div className="mt-1">
                                <ErpCustomerSuggestField
                                  customerId={handoverCustomerId}
                                  customerName={handoverCustomerName}
                                  onQueryChange={() => {}}
                                  onSelect={(c) => {
                                    setHandoverCustomerId(c.id)
                                    setHandoverCustomerName(c.name)
                                    setHandoverOperatorId('')
                                  }}
                                  onClearLink={() => {
                                    setHandoverCustomerId(null)
                                    setHandoverCustomerName('')
                                  }}
                                  placeholder="Search customer…"
                                />
                              </div>
                            </label>
                            <label className="text-[10px] font-semibold uppercase text-black/50">
                              To staff
                              <select
                                className={`${erpInputCls} mt-1 block w-full min-h-[44px]`}
                                value={handoverOperatorId}
                                onChange={(e) => {
                                  setHandoverOperatorId(e.target.value ? Number(e.target.value) : '')
                                  if (e.target.value) {
                                    setHandoverCustomerId(null)
                                    setHandoverCustomerName('')
                                  }
                                }}
                              >
                                <option value="">—</option>
                                {operators.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.displayName}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <textarea
                            className={`${erpInputCls} min-h-[52px] w-full text-sm`}
                            placeholder="Handover notes (optional — shown in history)"
                            value={handoverNotes}
                            onChange={(e) => setHandoverNotes(e.target.value)}
                          />
                          <button type="button" className={erpBtnGhost} onClick={() => void onHandover()}>
                            Hand over
                          </button>
                        </div>
                        ) : null}

                        {canManage && lotListMode === 'open' && lot.status === 'active' ? (
                          <div className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/50 p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                              Change purity (manager)
                            </p>
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                              <select
                                className={`${erpInputCls} min-h-[44px] flex-1`}
                                value={editPurityId}
                                onChange={(e) => setEditPurityId(Number(e.target.value))}
                              >
                                {purities
                                  .filter((p) => p.is_active && p.metal_type === lot.metal_type)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.label}
                                      {p.default_charge_pct != null ? ` (${p.default_charge_pct}%)` : ''}
                                    </option>
                                  ))}
                              </select>
                              <input
                                className={`${erpInputCls} min-h-[44px] w-full sm:w-28`}
                                placeholder="Charge %"
                                inputMode="decimal"
                                value={editChargePct}
                                onChange={(e) => setEditChargePct(e.target.value)}
                              />
                              <button type="button" className={erpBtnGhost} onClick={() => void onSaveLotPurity()}>
                                Update purity
                              </button>
                            </div>
                          </div>
                        ) : null}

                        {lotListMode === 'open' && lot.status === 'active' && !lot.held_by_customer_id ? (
                        <div className="space-y-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                            Split (optional)
                          </p>
                          {splitRows.map((row, idx) => (
                            <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                className={`${erpInputCls} min-h-[44px] flex-1`}
                                placeholder="Gross g for this part"
                                inputMode="decimal"
                                value={row.grossGm}
                                onChange={(e) => {
                                  const next = [...splitRows]
                                  next[idx] = { ...next[idx], grossGm: e.target.value }
                                  setSplitRows(next)
                                }}
                              />
                              {canManage ? (
                                <select
                                  className={`${erpInputCls} min-h-[44px] sm:w-40`}
                                  value={row.counterId}
                                  onChange={(e) => {
                                    const next = [...splitRows]
                                    next[idx] = {
                                      ...next[idx],
                                      counterId: e.target.value ? Number(e.target.value) : '',
                                    }
                                    setSplitRows(next)
                                  }}
                                >
                                  <option value="">Same counter</option>
                                  {counters.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              {splitRows.length > 1 ? (
                                <button
                                  type="button"
                                  className={erpBtnGhost}
                                  onClick={() => setSplitRows(splitRows.filter((_, i) => i !== idx))}
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={erpBtnGhost}
                              onClick={() => setSplitRows([...splitRows, { grossGm: '', counterId: '' }])}
                            >
                              <Plus className="size-4" /> Add split line
                            </button>
                            <button type="button" className={erpBtnPrimary} onClick={() => void onSplit()}>
                              Apply split
                            </button>
                          </div>
                          <p className="text-[11px] tabular-nums text-[var(--color-jewelry-black,#1a1814)]/55">
                            Split total: {roundMetalGm(splitTotalGross).toFixed(3)} g / max{' '}
                            {roundMetalGm(Number(lot.gross_gm)).toFixed(3)} g
                            {!metalGrossExceedsMax(splitTotalGross, Number(lot.gross_gm)) &&
                            splitTotalGross < roundMetalGm(Number(lot.gross_gm))
                              ? ` — ${roundMetalGm(Number(lot.gross_gm) - splitTotalGross).toFixed(3)} g stays on #${metalLotDisplayNumber(lot)}`
                              : ''}
                          </p>
                        </div>
                        ) : null}

                        <div className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                              <History className="mr-1 inline size-3.5" />
                              Lot journey
                            </p>
                            <button
                              type="button"
                              className={erpBtnGhost}
                              disabled={journeyBusy}
                              onClick={() => void loadJourney(lot.id)}
                            >
                              {journeyBusy ? <Loader2 className="size-4 animate-spin" /> : 'Refresh'}
                            </button>
                          </div>
                          {journey && journey.lot.id === lot.id ? (
                            <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-[var(--color-jewelry-black,#1a1814)]">
                              {journey.events.length === 0 ? (
                                <li className="text-black/55">No movement log yet (new receives/transfers will appear here).</li>
                              ) : (
                                journey.events.map((ev) => (
                                  <li
                                    key={ev.id}
                                    className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2 py-1.5"
                                  >
                                    <p className="font-medium">{formatMetalLotEvent(ev)}</p>
                                    <p className="mt-0.5 text-[10px] text-black/50">
                                      {new Date(ev.created_at).toLocaleString('en-IN')}
                                    </p>
                                  </li>
                                ))
                              )}
                            </ul>
                          ) : (
                            <p className="text-xs text-black/55">Select lot to load journey.</p>
                          )}
                        </div>

                        {canManage && lotListMode === 'open' && lot.status === 'active' ? (
                          <div className="flex flex-wrap gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
                            <button type="button" className={erpBtnGhost} onClick={() => void onCloseLot()}>
                              Close lot (manager)
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800"
                              onClick={() => void onDeleteLot()}
                            >
                              <Trash2 className="mr-1 inline size-4" /> Delete lot
                            </button>
                          </div>
                        ) : null}
                        {canManage && lot.status === 'closed' ? (
                          <div className="flex flex-wrap gap-2 border-t border-[var(--color-slate-700,#e8e4df)] pt-3">
                            <button
                              type="button"
                              className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-800"
                              onClick={() => void onDeleteLot()}
                            >
                              <Trash2 className="mr-1 inline size-4" /> Delete closed lot
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'reports' ? (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="font-semibold">Day / range report (gross grams)</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-semibold uppercase text-black/50">
              From
              <ErpDateInput
                className={`${erpInputCls} mt-1 block`}
                value={reportOn ? '' : reportFrom}
                onChange={(v) => {
                  setReportOn('')
                  setReportFrom(v)
                }}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase text-black/50">
              To
              <ErpDateInput
                className={`${erpInputCls} mt-1 block`}
                value={reportOn ? '' : reportTo}
                onChange={(v) => {
                  setReportOn('')
                  setReportTo(v)
                }}
              />
            </label>
            <label className="text-[10px] font-semibold uppercase text-black/50">
              On date
              <ErpDateInput
                className={`${erpInputCls} mt-1 block`}
                value={reportOn}
                onChange={(v) => {
                  setReportOn(v)
                  if (v.trim()) {
                    setReportFrom('')
                    setReportTo('')
                  }
                }}
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

          {canManage ? (
            <div className="space-y-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/30 p-3">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Lots ledger (open / closed)
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  className={erpInputCls}
                  value={ledgerLotStatus}
                  onChange={(e) =>
                    setLedgerLotStatus(e.target.value as 'active' | 'closed' | 'all')
                  }
                >
                  <option value="active">Open lots</option>
                  <option value="closed">Closed lots</option>
                  <option value="all">All lots</option>
                </select>
                <select
                  className={erpInputCls}
                  value={ledgerView}
                  onChange={(e) => setLedgerView(e.target.value as 'summary' | 'detail')}
                >
                  <option value="summary">Summary per lot</option>
                  <option value="detail">Detail (every movement)</option>
                </select>
                <button
                  type="button"
                  className={erpBtnPrimary}
                  disabled={reportBusy}
                  onClick={() => void loadLotsLedgerReport()}
                >
                  {reportBusy ? <Loader2 className="size-4 animate-spin" /> : 'Lots ledger'}
                </button>
              </div>
              {ledgerRows.length ? (
                <div className="max-h-[min(50vh,420px)] overflow-auto">
                  {ledgerView === 'detail' ? (
                    <ul className="space-y-2 text-xs text-[var(--color-jewelry-black,#1a1814)]">
                      {(ledgerRows as MetalLotsLedgerDetailRow[]).map((row) => (
                        <li
                          key={row.id}
                          className="rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white p-2"
                        >
                          <p className="font-medium">
                            #{row.lot_number ?? '—'} · {formatMetalLotEvent(row)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-black/50">
                            {new Date(row.created_at).toLocaleString('en-IN')} · {row.lot_status}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead>
                        <tr className="border-b text-black/50">
                          <th className="py-2 pr-2">Lot</th>
                          <th className="py-2 pr-2">Category</th>
                          <th className="py-2 pr-2">Counter</th>
                          <th className="py-2 pr-2 text-right">Opening</th>
                          <th className="py-2 pr-2 text-right">Received</th>
                          <th className="py-2 pr-2 text-right">Issued</th>
                          <th className="py-2 text-right">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(ledgerRows as MetalLotsLedgerSummaryRow[]).map((r) => (
                          <tr key={r.lot_id} className="border-b border-black/5">
                            <td className="py-2 pr-2">
                              #{r.lot_number} · {r.status}
                            </td>
                            <td className="py-2 pr-2">{r.category?.name ?? '—'}</td>
                            <td className="py-2 pr-2">
                              {r.counter?.label_with_incharge ?? r.counter?.name ?? '—'}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {fmtGm(r.opening_gross_gm)}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {fmtGm(r.received_gross_gm)}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {fmtGm(r.issued_gross_gm)}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {fmtGm(r.closing_gross_gm)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
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

function formatMetalLotEvent(ev: MetalLotEvent): string {
  const g = ev.gross_gm != null ? `${Number(ev.gross_gm).toFixed(3)} g` : ''
  const note = ev.notes?.trim() ? ` · Notes: ${ev.notes.trim()}` : ''
  const cat = ev.category?.name ? ` · ${ev.category.name}` : ''
  switch (ev.event_type) {
    case 'receive':
      return `Received ${g}${ev.to_counter_name ? ` → ${ev.to_counter_name}` : ''}${ev.from_customer?.name ? ` (from customer ${ev.from_customer.name})` : ''}${note}${cat}`
    case 'transfer':
      return `Transfer ${g}: ${ev.from_counter_name ?? '—'} → ${ev.to_counter_name ?? '—'}${ev.to_operator_name ? ` · ${ev.to_operator_name}` : ''}${note}`
    case 'split':
      return `Split ${g} → ${ev.to_counter_name ?? 'counter'}${ev.to_operator_name ? ` · ${ev.to_operator_name}` : ''}${note}`
    case 'handover_customer':
      return `Handed to customer ${ev.to_customer?.name ?? '—'}${g ? ` · ${g}` : ''}${note}`
    case 'handover_staff':
      return `Handed to staff ${ev.to_operator_name ?? '—'}${g ? ` · ${g}` : ''}${note}`
    case 'recall_from_customer':
      return `Taken back from customer ${ev.from_customer?.name ?? '—'}${g ? ` · ${g}` : ''}${note}`
    case 'close':
      return `Closed by manager${g ? ` · ${g}` : ''}${note}`
    default:
      return `${ev.event_type}${g ? ` · ${g}` : ''}${note}`
  }
}

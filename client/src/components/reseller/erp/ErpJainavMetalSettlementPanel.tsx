'use client'

import { useMemo } from 'react'
import { erpCardCls, erpInputCls } from '@/components/reseller/erp/erp-ui'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { ResellerSlabSettings } from '@/lib/catalog-slab-pricing'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import {
  computeJainavSettlementTotals,
  defaultJainavSettlementDraft,
  sumJainavMcOwedInr,
  sumJainavMetalOwedGm,
  type JainavSettlementDraft,
} from '@/lib/erp-jainav-settlement'

type Props = {
  lines: ErpBillLine[]
  rateSlab: ErpRateSlab
  slabSettings: ResellerSlabSettings
  displayRates: unknown
  wholesaleGold?: number | null
  wholesaleSilver?: number | null
  goldPerG: number
  silverPerG: number
  goldSlabRShowMc: boolean
  gstEnabled: boolean
  draft: JainavSettlementDraft
  onChange: (next: JainavSettlementDraft) => void
}

function numInput(
  value: number | null,
  onChange: (n: number | null) => void,
  placeholder?: string,
) {
  return (
    <input
      className={`${erpInputCls} mt-1 tabular-nums text-sm`}
      inputMode="decimal"
      placeholder={placeholder}
      value={value != null && Number.isFinite(value) ? String(value) : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.]/g, '')
        if (!raw.trim()) {
          onChange(null)
          return
        }
        const n = parseFloat(raw)
        onChange(Number.isFinite(n) ? n : null)
      }}
    />
  )
}

export function ErpJainavMetalSettlementPanel({
  lines,
  rateSlab,
  slabSettings,
  displayRates,
  wholesaleGold,
  wholesaleSilver,
  goldPerG,
  silverPerG,
  goldSlabRShowMc,
  gstEnabled,
  draft,
  onChange,
}: Props) {
  const totalMetalOwedGm = useMemo(
    () => sumJainavMetalOwedGm(lines, rateSlab),
    [lines, rateSlab],
  )
  const totalMcOwedInr = useMemo(
    () =>
      sumJainavMcOwedInr(
        lines,
        displayRates,
        rateSlab,
        slabSettings,
        wholesaleGold,
        wholesaleSilver,
        goldPerG,
        silverPerG,
        goldSlabRShowMc,
        gstEnabled,
      ),
    [
      lines,
      displayRates,
      rateSlab,
      slabSettings,
      wholesaleGold,
      wholesaleSilver,
      goldPerG,
      silverPerG,
      goldSlabRShowMc,
      gstEnabled,
    ],
  )

  const totals = useMemo(
    () => computeJainavSettlementTotals(totalMetalOwedGm, totalMcOwedInr, draft),
    [totalMetalOwedGm, totalMcOwedInr, draft],
  )

  const mcEquivGm =
    draft.adjustMcAgainstMetal && (draft.mcMetalRatePerG ?? 0) > 0 && totalMcOwedInr > 0
      ? Math.round((totalMcOwedInr / Number(draft.mcMetalRatePerG)) * 1000) / 1000
      : 0

  return (
    <div className={`${erpCardCls} border-teal-200/80 bg-gradient-to-br from-teal-50/40 to-white p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Metal payment &amp; settlement
        </h3>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-900">
          Jainav
        </span>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
            Metal owed
          </p>
          <p className="text-lg font-bold tabular-nums text-teal-800">
            {totalMetalOwedGm.toFixed(3)} g
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
            MC owed
          </p>
          <p className="text-lg font-bold tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
            {formatErpInr(totalMcOwedInr)}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
            Step A — Metal received (g)
          </label>
          {numInput(draft.metalReceivedGm, (n) => onChange({ ...draft, metalReceivedGm: n }), 'e.g. 1000')}
          <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/60">
            Balance after metal:{' '}
            <span className="font-semibold tabular-nums text-teal-800">
              {totals.metalBalanceAfterReceivedGm.toFixed(3)} g
            </span>
            <span className="text-[var(--color-jewelry-black,#1a1814)]/45">
              {' '}
              (positive = you owe customer metal)
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.adjustMcAgainstMetal}
              onChange={(e) =>
                onChange({
                  ...draft,
                  adjustMcAgainstMetal: e.target.checked,
                  mcMetalRatePerG:
                    draft.mcMetalRatePerG ??
                    defaultJainavSettlementDraft(silverPerG).mcMetalRatePerG,
                })
              }
            />
            <span className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Step B — Adjust MC against metal balance
            </span>
          </label>
          {draft.adjustMcAgainstMetal ? (
            <div className="mt-2">
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
                Metal rate (₹/g) for MC
              </label>
              {numInput(draft.mcMetalRatePerG, (n) => onChange({ ...draft, mcMetalRatePerG: n }), '230')}
              {mcEquivGm > 0 ? (
                <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/65">
                  MC as metal: <span className="font-semibold tabular-nums">{mcEquivGm.toFixed(3)} g</span>
                  · Balance:{' '}
                  <span className="font-semibold tabular-nums text-teal-800">
                    {totals.metalBalanceAfterMcGm.toFixed(3)} g
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.settleRemainingInCash}
              onChange={(e) =>
                onChange({
                  ...draft,
                  settleRemainingInCash: e.target.checked,
                  settlementRatePerG:
                    draft.settlementRatePerG ??
                    draft.mcMetalRatePerG ??
                    defaultJainavSettlementDraft(silverPerG).settlementRatePerG,
                })
              }
            />
            <span className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Step C — Settle remaining metal in cash
            </span>
          </label>
          {draft.settleRemainingInCash ? (
            <div className="mt-2">
              <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/50">
                Settlement rate (₹/g)
              </label>
              {numInput(
                draft.settlementRatePerG,
                (n) => onChange({ ...draft, settlementRatePerG: n }),
                '230',
              )}
              <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/65">
                Cash to customer:{' '}
                <span className="font-semibold tabular-nums text-emerald-800">
                  {formatErpInr(totals.finalCashBalanceInr)}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
              Pending metal:{' '}
              <span className="font-semibold tabular-nums">{totals.finalMetalBalanceGm.toFixed(3)} g</span>
            </p>
          )}
        </div>

        <div>
          <label className="text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
            Cash paid now (₹) — optional
          </label>
          {numInput(draft.cashPaidNowInr, (n) => onChange({ ...draft, cashPaidNowInr: n }), 'Settle cash balance')}
          <p className="mt-1 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/60">
            Remaining cash balance:{' '}
            <span className="font-semibold tabular-nums">
              {formatErpInr(totals.cashBalanceAfterPaidInr)}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

export function buildJainavSettlementSessionPayload(
  lines: ErpBillLine[],
  rateSlab: ErpRateSlab,
  slabSettings: ResellerSlabSettings,
  displayRates: unknown,
  draft: JainavSettlementDraft,
  opts: {
    wholesaleGold?: number | null
    wholesaleSilver?: number | null
    goldPerG: number
    silverPerG: number
    goldSlabRShowMc: boolean
    gstEnabled: boolean
  },
) {
  const totalMetalOwedGm = sumJainavMetalOwedGm(lines, rateSlab)
  const totalMcOwedInr = sumJainavMcOwedInr(
    lines,
    displayRates,
    rateSlab,
    slabSettings,
    opts.wholesaleGold,
    opts.wholesaleSilver,
    opts.goldPerG,
    opts.silverPerG,
    opts.goldSlabRShowMc,
    opts.gstEnabled,
  )
  const totals = computeJainavSettlementTotals(totalMetalOwedGm, totalMcOwedInr, draft)
  return {
    ...draft,
    ...totals,
    savedAt: new Date().toISOString(),
  }
}

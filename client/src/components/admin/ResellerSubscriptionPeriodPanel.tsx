'use client'

import { addDaysYmd, daysBetweenYmd, evaluateResellerModule, resellerStatusTone, todayIstYmd, ymdFromValue, type ResellerSubModule } from '@/lib/reseller-subscription'

export type SubscriptionPeriodValue = {
  from_date: string
  to_date: string
  days: string
  trial_enabled: boolean
  trial_from_date: string
  trial_to_date: string
  trial_days: string
}

export const emptySubscriptionPeriod = (): SubscriptionPeriodValue => ({
  from_date: '',
  to_date: '',
  days: '',
  trial_enabled: false,
  trial_from_date: '',
  trial_to_date: '',
  trial_days: '',
})

export function subscriptionPeriodFromUser(input: {
  from_date?: string | null
  to_date?: string | null
  trial_enabled?: boolean
  trial_from_date?: string | null
  trial_to_date?: string | null
}): SubscriptionPeriodValue {
  const from_date = ymdFromValue(input.from_date) || ''
  const to_date = ymdFromValue(input.to_date) || ''
  const trial_from_date = ymdFromValue(input.trial_from_date) || ''
  const trial_to_date = ymdFromValue(input.trial_to_date) || ''
  return {
    from_date,
    to_date,
    days: daysBetweenYmd(from_date, to_date),
    trial_enabled: !!input.trial_enabled,
    trial_from_date,
    trial_to_date,
    trial_days: daysBetweenYmd(trial_from_date, trial_to_date),
  }
}

type Props = {
  module: ResellerSubModule
  title: string
  value: SubscriptionPeriodValue
  onChange: (next: SubscriptionPeriodValue) => void
}

const inputClass =
  'mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100'

function DateRow({
  from,
  days,
  to,
  onFrom,
  onDays,
  onTo,
  fromId,
}: {
  from: string
  days: string
  to: string
  onFrom: (v: string) => void
  onDays: (v: string) => void
  onTo: (v: string) => void
  fromId: string
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <label className="block min-w-0">
        <span className="text-[11px] font-medium text-slate-400">From date</span>
        <input
          id={fromId}
          type="date"
          className={inputClass}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
        />
      </label>
      <label className="block min-w-0">
        <span className="text-[11px] font-medium text-slate-400">Days</span>
        <input
          type="number"
          min={1}
          max={3650}
          inputMode="numeric"
          placeholder="e.g. 30"
          className={inputClass}
          value={days}
          onChange={(e) => onDays(e.target.value)}
        />
      </label>
      <label className="block min-w-0">
        <span className="text-[11px] font-medium text-slate-400">To date</span>
        <input type="date" className={inputClass} value={to} onChange={(e) => onTo(e.target.value)} />
      </label>
    </div>
  )
}

function applyDays(from: string, daysRaw: string): { from_date: string; to_date: string; days: string } {
  const n = parseInt(String(daysRaw), 10)
  if (!Number.isFinite(n) || n <= 0) {
    return { from_date: from, to_date: '', days: daysRaw }
  }
  const clamped = Math.max(1, Math.min(3650, n))
  const from_date = from || todayIstYmd()
  return { from_date, to_date: addDaysYmd(from_date, clamped), days: String(clamped) }
}

function applyTo(from: string, to: string): { from_date: string; to_date: string; days: string } {
  const to_date = ymdFromValue(to) || ''
  const from_date = from || (to_date ? todayIstYmd() : '')
  return { from_date, to_date, days: daysBetweenYmd(from_date, to_date) }
}

function extendBy(from: string, to: string, extra: number): { from_date: string; to_date: string; days: string } {
  const today = todayIstYmd()
  const from_date = from || today
  const currentTo = ymdFromValue(to)
  const base = currentTo && currentTo > today ? currentTo : today
  const to_date = addDaysYmd(base, extra)
  return { from_date, to_date, days: daysBetweenYmd(from_date, to_date) }
}

export function ResellerSubscriptionPeriodPanel({ module, title, value, onChange }: Props) {
  const preview = evaluateResellerModule(module, {
    paidFrom: value.from_date,
    paidTo: value.to_date,
    trialEnabled: value.trial_enabled,
    trialFrom: value.trial_from_date,
    trialTo: value.trial_to_date,
  })
  const tone = resellerStatusTone(preview.status)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
        </div>
        <span
          className={`inline-flex shrink-0 self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.wrap} ${tone.text}`}
        >
          {preview.headline}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Paid period</p>
        <DateRow
          fromId={`${module}-from`}
          from={value.from_date}
          days={value.days}
          to={value.to_date}
          onFrom={(from_date) => {
            const to_date = value.days
              ? addDaysYmd(from_date || todayIstYmd(), parseInt(value.days, 10) || 0)
              : value.to_date
            onChange({
              ...value,
              from_date,
              to_date: value.days && parseInt(value.days, 10) > 0 ? to_date : value.to_date,
              days: daysBetweenYmd(from_date, value.days && parseInt(value.days, 10) > 0 ? to_date : value.to_date),
            })
          }}
          onDays={(days) => onChange({ ...value, ...applyDays(value.from_date, days) })}
          onTo={(to) => onChange({ ...value, ...applyTo(value.from_date, to) })}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100"
            onClick={() => onChange({ ...value, ...extendBy(value.from_date, value.to_date, 30) })}
          >
            +30 days
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100"
            onClick={() => onChange({ ...value, ...extendBy(value.from_date, value.to_date, 7) })}
          >
            +7 days
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-lg border border-slate-700 px-3 text-xs font-medium text-slate-300"
            onClick={() =>
              onChange({
                ...value,
                from_date: '',
                to_date: '',
                days: '',
              })
            }
          >
            Clear dates
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100">Free trial</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={value.trial_enabled}
            aria-label={`${title} free trial`}
            onClick={() => {
              const on = !value.trial_enabled
              onChange({
                ...value,
                trial_enabled: on,
                trial_from_date: on ? value.trial_from_date || todayIstYmd() : value.trial_from_date,
              })
            }}
            className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
              value.trial_enabled ? 'border-violet-400/50 bg-violet-500' : 'border-slate-600 bg-slate-800'
            }`}
          >
            <span
              className={`pointer-events-none absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform ${
                value.trial_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {value.trial_enabled ? (
          <div className="mt-3 space-y-2">
            <DateRow
              fromId={`${module}-trial-from`}
              from={value.trial_from_date}
              days={value.trial_days}
              to={value.trial_to_date}
              onFrom={(trial_from_date) => {
                const n = parseInt(value.trial_days, 10)
                const trial_to_date =
                  Number.isFinite(n) && n > 0
                    ? addDaysYmd(trial_from_date || todayIstYmd(), n)
                    : value.trial_to_date
                onChange({
                  ...value,
                  trial_from_date,
                  trial_to_date,
                  trial_days: daysBetweenYmd(trial_from_date, trial_to_date),
                })
              }}
              onDays={(trial_days) => {
                const applied = applyDays(value.trial_from_date, trial_days)
                onChange({
                  ...value,
                  trial_from_date: applied.from_date,
                  trial_to_date: applied.to_date,
                  trial_days: applied.days,
                })
              }}
              onTo={(trial_to) => {
                const applied = applyTo(value.trial_from_date, trial_to)
                onChange({
                  ...value,
                  trial_from_date: applied.from_date,
                  trial_to_date: applied.to_date,
                  trial_days: applied.days,
                })
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100"
                onClick={() => {
                  const applied = extendBy(value.trial_from_date, value.trial_to_date, 7)
                  onChange({
                    ...value,
                    trial_from_date: applied.from_date,
                    trial_to_date: applied.to_date,
                    trial_days: applied.days,
                  })
                }}
              >
                Trial +7 days
              </button>
              <button
                type="button"
                className="min-h-[40px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-100"
                onClick={() => {
                  const applied = extendBy(value.trial_from_date, value.trial_to_date, 30)
                  onChange({
                    ...value,
                    trial_from_date: applied.from_date,
                    trial_to_date: applied.to_date,
                    trial_days: applied.days,
                  })
                }}
              >
                Trial +30 days
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

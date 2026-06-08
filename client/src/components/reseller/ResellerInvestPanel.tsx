'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Search, Wallet, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { RESELLER_RATES_PATH, SIP_PATH } from '@/lib/routes'

type CustomerSip = {
  id: number
  status: string
  plan_name: string
  metal_type?: string | null
  installment_amount?: number | null
  total_paid: number
  total_grams: number
}

type SearchResult = {
  customer: {
    id: number
    name: string | null
    email: string | null
    mobile_number: string | null
  } | null
  sips: CustomerSip[]
}

export function ResellerInvestPanel() {
  const [loadingGate, setLoadingGate] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [mobile, setMobile] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<number | null>(null)
  const [amountBySip, setAmountBySip] = useState<Record<number, string>>({})
  const [savedSipId, setSavedSipId] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await axios.get<{ enabled?: boolean }>('/api/reseller/invest/enabled')
        setEnabled(!!data.enabled)
      } catch {
        setEnabled(false)
      } finally {
        setLoadingGate(false)
      }
    })()
  }, [])

  const search = useCallback(async () => {
    const digits = mobile.replace(/\D/g, '').slice(-10)
    if (digits.length !== 10) {
      setError('Enter a valid 10-digit mobile number')
      return
    }
    setSearching(true)
    setError(null)
    setResult(null)
    try {
      const { data } = await axios.get<SearchResult>('/api/reseller/invest/search', {
        params: { mobile: digits },
      })
      setResult(data)
      if (!data.customer) setError('No customer found with this mobile number')
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [mobile])

  const recordPayment = async (sip: CustomerSip) => {
    const amt = Number(amountBySip[sip.id] ?? sip.installment_amount ?? 0)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid payment amount')
      return
    }
    setRecordingId(sip.id)
    setError(null)
    try {
      await axios.post('/api/reseller/invest/record-payment', {
        user_sip_id: sip.id,
        amount: amt,
      })
      setSavedSipId(sip.id)
      setTimeout(() => setSavedSipId(null), 2500)
      await search()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not record payment')
    } finally {
      setRecordingId(null)
    }
  }

  if (loadingGate) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-6 py-10 text-center shadow-sm">
        <Wallet className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h2 className="mt-4 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Invest payments not enabled
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Ask KC admin to turn on &quot;Allow staff to record Invest payments&quot; in B2B clients → Edit
          reseller. You can still set DigiGold / DigiSilver rates under{' '}
          <Link href={RESELLER_RATES_PATH} className="font-medium text-[var(--kc-accent,#c41e3a)]">
            Update rates
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] to-transparent px-5 py-5">
        <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Record Invest payment
        </h2>
        <p className="mt-1 max-w-md text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
          When a customer pays offline for DigiGold / DigiSilver (SIP), search by mobile and credit their
          accumulation at today&apos;s invest rates.
        </p>
        <Link
          href={SIP_PATH}
          className="mt-3 inline-block text-xs font-medium text-[var(--kc-accent,#c41e3a)]"
        >
          View customer Invest page →
        </Link>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm sm:p-5">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
          Customer mobile
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile"
            className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-base outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/20"
          />
          <button
            type="button"
            disabled={searching}
            onClick={() => void search()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kc-accent,#c41e3a)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
          >
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </button>
        </div>
      </div>

      {result?.customer ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/70">
            <span className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              {result.customer.name || result.customer.email || 'Customer'}
            </span>
            {' · '}
            {result.customer.mobile_number}
          </p>
          {result.sips.length === 0 ? (
            <p className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-4 py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
              No active Invest (SIP) plans for this customer.
            </p>
          ) : (
            result.sips.map((sip) => (
              <article
                key={sip.id}
                className="rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {sip.plan_name}
                    </h3>
                    <p className="mt-0.5 text-xs capitalize text-[var(--color-jewelry-black,#1a1814)]/50">
                      {sip.metal_type || 'gold'} · {sip.status}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums text-[var(--color-jewelry-black,#1a1814)]/60">
                    <p>Paid ₹{Number(sip.total_paid).toLocaleString('en-IN')}</p>
                    <p>{Number(sip.total_grams).toFixed(3)} g accumulated</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                      Amount received (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={amountBySip[sip.id] ?? String(sip.installment_amount ?? '')}
                      onChange={(e) =>
                        setAmountBySip((prev) => ({ ...prev, [sip.id]: e.target.value }))
                      }
                      className="mt-1 w-full min-h-[44px] rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2.5 text-base font-semibold tabular-nums outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={recordingId === sip.id || sip.status !== 'active'}
                    onClick={() => void recordPayment(sip)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-[var(--kc-accent,#c41e3a)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {savedSipId === sip.id ? (
                      <>
                        <CheckCircle2 className="size-4" /> Saved
                      </>
                    ) : recordingId === sip.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      'Record payment'
                    )}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

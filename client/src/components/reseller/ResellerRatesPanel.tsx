'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, RefreshCw, Save, Sparkles, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { LIVE_RATES_PATH } from '@/lib/routes'
import { dispatchRatesUpdated } from '@/lib/reseller-rates-events'
import WhatsAppShareButton from '@/components/WhatsAppShareButton'
import { buildRatesShareMessage } from '@/lib/rates-share'
import { useAuth } from '@/hooks/useAuth'
import { useResellerBranding } from '@/context/ResellerBrandingContext'

type RateForm = {
  silver_per_gram: string
  gold_24k_per_gram: string
  gold_22k_per_gram: string
  gold_18k_per_gram: string
}

type MarketRates = {
  gold24k_10g?: number
  gold22k_10g?: number
  gold18k_10g?: number
  silver_1kg?: number
}

function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function parseField(s: string): number {
  const n = Number(String(s).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const EMPTY: RateForm = {
  silver_per_gram: '',
  gold_24k_per_gram: '',
  gold_22k_per_gram: '',
  gold_18k_per_gram: '',
}

export function ResellerRatesPanel() {
  const auth = useAuth()
  const { businessName, active: brandingActive } = useResellerBranding()
  const user = auth.user as { custom_domain?: string | null; business_name?: string | null } | undefined
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [form, setForm] = useState<RateForm>(EMPTY)
  const [market, setMarket] = useState<MarketRates | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await axios.get<{
        enabled?: boolean
        rates?: {
          silver_per_gram: number
          gold_24k_per_gram: number
          gold_22k_per_gram: number
          gold_18k_per_gram: number
        } | null
        market?: MarketRates | null
        updated_at?: string | null
      }>('/api/reseller/rates')
      setEnabled(!!data.enabled)
      if (data.rates) {
        setForm({
          silver_per_gram: String(data.rates.silver_per_gram ?? ''),
          gold_24k_per_gram: String(data.rates.gold_24k_per_gram ?? ''),
          gold_22k_per_gram: String(data.rates.gold_22k_per_gram ?? ''),
          gold_18k_per_gram: String(data.rates.gold_18k_per_gram ?? ''),
        })
      } else if (data.market) {
        const m = data.market
        setForm({
          silver_per_gram: m.silver_1kg ? String(Math.round(m.silver_1kg / 1000)) : '',
          gold_24k_per_gram: m.gold24k_10g ? String(Math.round(m.gold24k_10g / 10)) : '',
          gold_22k_per_gram: m.gold22k_10g ? String(Math.round(m.gold22k_10g / 10)) : '',
          gold_18k_per_gram: m.gold18k_10g ? String(Math.round(m.gold18k_10g / 10)) : '',
        })
      }
      setMarket(data.market ?? null)
      setUpdatedAt(data.updated_at ?? null)
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Could not load rates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const preview = useMemo(() => {
    const s = parseField(form.silver_per_gram)
    const g24 = parseField(form.gold_24k_per_gram)
    const g22 = parseField(form.gold_22k_per_gram)
    const g18 = parseField(form.gold_18k_per_gram)
    return {
      silver1g: s,
      silver1kg: s * 1000,
      g24_1g: g24,
      g24_10g: g24 * 10,
      g22_1g: g22,
      g22_10g: g22 * 10,
      g18_1g: g18,
      g18_10g: g18 * 10,
    }
  }, [form])

  const fillFromMarket = () => {
    if (!market) return
    setForm({
      silver_per_gram: market.silver_1kg ? String(Math.round(market.silver_1kg / 1000)) : '',
      gold_24k_per_gram: market.gold24k_10g ? String(Math.round(market.gold24k_10g / 10)) : '',
      gold_22k_per_gram: market.gold22k_10g ? String(Math.round(market.gold22k_10g / 10)) : '',
      gold_18k_per_gram: market.gold18k_10g ? String(Math.round(market.gold18k_10g / 10)) : '',
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setSavedFlash(false)
    try {
      await axios.put('/api/reseller/rates', {
        silver_per_gram: parseField(form.silver_per_gram),
        gold_24k_per_gram: parseField(form.gold_24k_per_gram),
        gold_22k_per_gram: parseField(form.gold_22k_per_gram),
        gold_18k_per_gram: parseField(form.gold_18k_per_gram),
      })
      setSavedFlash(true)
      dispatchRatesUpdated()
      setTimeout(() => setSavedFlash(false), 2500)
      await load()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/50">
        <Loader2 className="size-8 animate-spin text-[var(--kc-accent,#c41e3a)]" />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="kc-reseller-rates-panel mx-auto max-w-lg rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-6 py-10 text-center shadow-sm">
        <TrendingUp className="mx-auto size-12 text-[var(--color-jewelry-black,#1a1814)]/25" />
        <h2 className="mt-4 text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          Rate updates not enabled
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/60">
          Ask KC admin to turn on &quot;Allow staff to update live rates&quot; in B2B clients → Edit
          reseller. Once enabled, your team can set silver and gold prices for your custom domain
          storefront.
        </p>
        <Link
          href={LIVE_RATES_PATH}
          className="mt-6 inline-block text-sm font-medium text-[var(--kc-accent,#c41e3a)]"
        >
          View today rates →
        </Link>
      </div>
    )
  }

  return (
    <div className="kc-reseller-rates-panel mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl border border-[var(--kc-accent,#c41e3a)]/20 bg-gradient-to-br from-[var(--kc-accent,#c41e3a)]/[0.06] to-transparent px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Your storefront rates
            </h2>
            <p className="mt-1 max-w-md text-sm text-[var(--color-jewelry-black,#1a1814)]/60">
              Enter ₹ per gram and tap Save — your customers on your custom domain see these rates in
              Today Rates, catalogue, and cart. Share via WhatsApp when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/80 transition hover:bg-[var(--color-slate-900,#f7f4ef)]"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
        </div>
        {updatedAt ? (
          <p className="mt-3 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
            Last saved {new Date(updatedAt).toLocaleString('en-IN')}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}

      {savedFlash ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Rates saved — your storefront and shared links now show these prices.
        </p>
      ) : null}

      {!loading && user?.custom_domain?.trim() && (preview.g24_1g > 0 || preview.silver1g > 0) ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Share today&apos;s rates with customers
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/55">
            Opens WhatsApp with your business name, rates, and links to your domain — not KC Jewellers.
          </p>
          <div className="mt-3">
            <WhatsAppShareButton
              message={buildRatesShareMessage(
                {
                  browserHostname: typeof window !== 'undefined' ? window.location.hostname : null,
                  customerTier: 'RESELLER',
                  resellerCustomDomain: user?.custom_domain ?? null,
                  userBusinessName: user?.business_name ?? null,
                  brandingActive,
                  brandingBusinessName: businessName,
                },
                {
                  gold24_1g: preview.g24_1g,
                  gold22_1g: preview.g22_1g,
                  gold18_1g: preview.g18_1g,
                  silver1g: preview.silver1g,
                },
              )}
              label="Share on WhatsApp"
              className="w-full sm:w-auto border-emerald-600/40 bg-emerald-600/10 text-emerald-800 hover:bg-emerald-600/20"
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={fillFromMarket}
          disabled={!market}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)] transition hover:bg-[var(--color-slate-900,#f7f4ef)] disabled:opacity-40"
        >
          <Sparkles className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Fill from KC market
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-sm">
        <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--kc-accent,#c41e3a)]">Gold (₹ per gram)</h3>
        </div>
        <div className="divide-y divide-[var(--color-slate-700,#e8e4df)]">
          {(
            [
              ['24K (999)', 'gold_24k_per_gram', preview.g24_1g, preview.g24_10g],
              ['22K (916)', 'gold_22k_per_gram', preview.g22_1g, preview.g22_10g],
              ['18K (750)', 'gold_18k_per_gram', preview.g18_1g, preview.g18_10g],
            ] as const
          ).map(([label, key, oneG, tenG]) => (
            <div key={key} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <label className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                  {label}
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-[var(--color-jewelry-black,#1a1814)]/45">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full max-w-[10rem] rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-950,#fff)] px-3 py-2.5 text-base font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-[var(--kc-accent,#c41e3a)] focus:ring-2 focus:ring-[var(--kc-accent,#c41e3a)]/20"
                    placeholder="per g"
                  />
                  <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">/ g</span>
                </div>
              </div>
              <div className="text-right text-xs text-[var(--color-jewelry-black,#1a1814)]/55 sm:pl-4">
                <p>
                  1 g → <span className="font-semibold text-[var(--kc-accent,#c41e3a)]">{formatInr(oneG)}</span>
                </p>
                <p className="mt-0.5">
                  10 g → <span className="font-medium tabular-nums">{formatInr(tenG)}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-sm">
        <div className="border-b border-[var(--color-slate-700,#e8e4df)] bg-cyan-500/[0.06] px-4 py-3">
          <h3 className="text-sm font-semibold text-cyan-700">Silver (₹ per gram)</h3>
        </div>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <label className="text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
              Silver (999)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-[var(--color-jewelry-black,#1a1814)]/45">₹</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={form.silver_per_gram}
                onChange={(e) => setForm((f) => ({ ...f, silver_per_gram: e.target.value }))}
                className="w-full max-w-[10rem] rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5 text-base font-semibold tabular-nums text-[var(--color-jewelry-black,#1a1814)] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
                placeholder="per g"
              />
              <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">/ g</span>
            </div>
          </div>
          <div className="text-right text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            <p>
              1 g → <span className="font-semibold text-cyan-600">{formatInr(preview.silver1g)}</span>
            </p>
            <p className="mt-0.5">
              1 kg → <span className="font-medium tabular-nums">{formatInr(preview.silver1kg)}</span>
            </p>
          </div>
        </div>
      </section>

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-[var(--kc-accent,#c41e3a)] px-6 py-4 text-base font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Save className="size-5" />
        )}
        {saving ? 'Saving…' : 'Save rates'}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/45">
        After saving, open{' '}
        <Link href={LIVE_RATES_PATH} className="font-medium text-[var(--kc-accent,#c41e3a)]">
          Today Rates
        </Link>{' '}
        on your custom domain to confirm what customers will see.
      </p>
    </div>
  )
}

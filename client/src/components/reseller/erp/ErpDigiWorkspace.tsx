'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import axios from '@/lib/axios'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
} from '@/components/reseller/erp/erp-ui'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { RESELLER_PAYMENT_SETTINGS_PATH, RESELLER_RATES_PATH } from '@/lib/routes'
import { Gem, Loader2, MessageCircle, Save, Wallet } from 'lucide-react'

type DigiTier = {
  metal_key: string
  retail_rate_per_gram: number
  discount_inr: number
  effective_rate_per_gram: number
}

type DigiSettings = {
  tiers: DigiTier[]
  discounts: Record<string, number> | null
  payments: { payments_configured: boolean; razorpay_key_id_set: boolean }
  custom_domain: string | null
  reseller_invite_code: string | null
  business_name: string | null
  rates: { updated_at?: string } | null
}

const GOLD_LABELS: Record<string, string> = {
  gold_24k: '24K (999)',
  gold_22k: '22K (916)',
  gold_18k: '18K (750)',
}

function tierLabel(metalKey: string, product: 'gold' | 'silver') {
  if (product === 'silver') return 'Silver (999)'
  return GOLD_LABELS[metalKey] || metalKey
}

function discountField(metalKey: string) {
  if (metalKey === 'silver') return 'digi_silver_discount_inr'
  if (metalKey === 'gold_24k') return 'digi_gold_24k_discount_inr'
  if (metalKey === 'gold_22k') return 'digi_gold_22k_discount_inr'
  return 'digi_gold_18k_discount_inr'
}

function buildShareUrl(
  metal: 'gold' | 'silver',
  customDomain: string | null,
  inviteCode: string | null,
): string | null {
  const path = `/digi/${metal}`
  if (customDomain) {
    const host = customDomain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
    return `https://${host}${path}`
  }
  if (inviteCode && typeof window !== 'undefined') {
    return `${window.location.origin}${path}?code=${encodeURIComponent(inviteCode)}`
  }
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`
  return null
}

function shareWhatsApp(url: string, businessName: string, productLabel: string) {
  const text = `${businessName} — Buy ${productLabel} at today's rate minus your special discount.\n\nOpen & pay securely:\n${url}`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}

export function ErpDigiWorkspace({ metal }: { metal: 'gold' | 'silver' }) {
  const productLabel = metal === 'gold' ? 'DigiGold' : 'DigiSilver'
  const [settings, setSettings] = useState<DigiSettings | null>(null)
  const [discounts, setDiscounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await axios.get<DigiSettings>('/api/reseller/erp/digi/settings', {
        params: { metal },
      })
      setSettings(res.data)
      const d = res.data.discounts || {}
      setDiscounts({
        digi_silver_discount_inr: Number(d.digi_silver_discount_inr) || 0,
        digi_gold_24k_discount_inr: Number(d.digi_gold_24k_discount_inr) || 0,
        digi_gold_22k_discount_inr: Number(d.digi_gold_22k_discount_inr) || 0,
        digi_gold_18k_discount_inr: Number(d.digi_gold_18k_discount_inr) || 0,
      })
    } catch {
      setSettings(null)
    } finally {
      setBusy(false)
    }
  }, [metal])

  useEffect(() => {
    void load()
  }, [load])

  const tiers = settings?.tiers ?? []
  const shareUrl = useMemo(
    () =>
      buildShareUrl(
        metal,
        settings?.custom_domain ?? null,
        settings?.reseller_invite_code ?? null,
      ),
    [metal, settings?.custom_domain, settings?.reseller_invite_code],
  )

  const saveDiscounts = async () => {
    setSaveBusy(true)
    setMsg(null)
    try {
      const res = await axios.put<{ tiers: DigiTier[] }>('/api/reseller/erp/digi/settings', {
        ...discounts,
        metal,
      })
      setSettings((prev) => (prev ? { ...prev, tiers: res.data.tiers } : prev))
      setMsg('Discounts saved.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  if (busy && !settings) {
    return (
      <div className="flex min-h-[20vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  const paymentsOk = settings?.payments?.payments_configured

  return (
    <div className="space-y-4">
      {!paymentsOk ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Razorpay not configured</p>
          <p className="mt-1 text-amber-900/80">
            Add your Razorpay Key ID &amp; Secret so customers can pay online.
          </p>
          <Link href={RESELLER_PAYMENT_SETTINGS_PATH} className={`${erpBtnPrimary} mt-3 inline-flex`}>
            <Wallet className="size-4" />
            Payment settings
          </Link>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2">
          <Gem className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">
            {productLabel} — today&apos;s rate minus discount (₹/g)
          </h3>
        </div>
        <p className="mb-4 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Customer pays online → weight accumulates in their account. Example: silver ₹235/g with ₹6
          discount → effective ₹229/g. Pay ₹22,900 → 100 g silver.
        </p>

        {!tiers.length ? (
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/55">
            Save today rates first, then set discounts here.
          </p>
        ) : (
          <ul className="space-y-4">
            {tiers.map((tier) => {
              const field = discountField(tier.metal_key)
              const disc = discounts[field] ?? 0
              const effective = Math.max(1, tier.retail_rate_per_gram - disc)
              return (
                <li
                  key={tier.metal_key}
                  className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                        {tierLabel(tier.metal_key, metal)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                        Today: {formatErpInr(tier.retail_rate_per_gram)}/g
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-emerald-700">
                      Effective {formatErpInr(effective)}/g
                    </p>
                  </div>
                  <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                    Customer discount (₹/g off today rate)
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={`${erpInputCls} mt-1 max-w-[140px]`}
                      value={disc || ''}
                      onChange={(e) =>
                        setDiscounts((prev) => ({
                          ...prev,
                          [field]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                    />
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {settings?.rates?.updated_at ? (
          <p className="mt-3 text-xs text-[var(--color-jewelry-black,#1a1814)]/45">
            Rates updated {formatErpDateDdMmYyyy(String(settings.rates.updated_at))}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={erpBtnPrimary}
          disabled={saveBusy || !tiers.length}
          onClick={() => void saveDiscounts()}
        >
          {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save discounts
        </button>
        <Link href={RESELLER_RATES_PATH} className={erpBtnGhost}>
          Update today rates
        </Link>
        {shareUrl ? (
          <button
            type="button"
            className={erpBtnGhost}
            disabled={!paymentsOk}
            onClick={() =>
              shareWhatsApp(
                shareUrl,
                settings?.business_name || 'Our store',
                productLabel,
              )
            }
          >
            <MessageCircle className="size-4 text-emerald-600" />
            Share link on WhatsApp
          </button>
        ) : null}
      </div>

      {shareUrl ? (
        <div className={`${erpCardCls} text-xs`}>
          <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]/70">Customer link</p>
          <p className="mt-1 break-all font-mono text-[var(--color-jewelry-black,#1a1814)]">{shareUrl}</p>
          {!settings?.custom_domain ? (
            <p className="mt-2 text-[var(--color-jewelry-black,#1a1814)]/45">
              Tip: set a custom domain in your reseller profile for a cleaner link.
            </p>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            msg.includes('saved') || msg.includes('Saved')
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg}
        </p>
      ) : null}
    </div>
  )
}

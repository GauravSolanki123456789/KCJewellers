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
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { formatErpInr } from '@/lib/reseller-erp-modules'
import { erpDateFilterToIso, formatErpDateDdMmYyyy, formatErpDateTime } from '@/lib/erp-date-format'
import { RESELLER_PAYMENT_SETTINGS_PATH, RESELLER_RATES_PATH } from '@/lib/routes'
import { Gem, Loader2, MessageCircle, Plus, Save, Search, Trash2, Wallet } from 'lucide-react'

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

type DigiTransaction = {
  id: number
  metal_key: string
  amount_inr: number
  effective_rate_per_gram: number
  discount_inr: number
  grams: number
  razorpay_payment_id: string | null
  razorpay_order_id: string | null
  paid_at: string | null
  created_at: string
  customer_name: string | null
  customer_mobile: string | null
}

type DigiHolding = {
  metal_key: string
  balance_grams: number
  customer_name: string | null
  customer_mobile: string | null
  customer_user_id: number
  updated_at: string
}

type ChitScheme = {
  id: number
  name: string
  scheme_type: string
  description?: string | null
  monthly_amount_inr?: number | null
  duration_months?: number | null
  metal_key?: string | null
  bonus_pct?: number | null
  is_active: boolean
  member_count?: number
  total_collected_inr?: number
}

type ChitMember = {
  id: number
  customer_name: string
  customer_mobile?: string | null
  paid_inr?: number
  grams_total?: number
  status: string
}

const SCHEME_TYPES = [
  { id: 'monthly_chit', label: 'Monthly chit' },
  { id: 'digi_accumulation', label: 'Digi accumulation' },
  { id: 'flexi_savings', label: 'Flexi savings' },
  { id: 'custom', label: 'Custom scheme' },
] as const

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
  const text = `${businessName} — Buy ${productLabel} online.\n\n${url}`
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}

export function ErpDigiWorkspace({ metal }: { metal: 'gold' | 'silver' }) {
  const productLabel = metal === 'gold' ? 'DigiGold' : 'DigiSilver'
  const [settings, setSettings] = useState<DigiSettings | null>(null)
  const [discounts, setDiscounts] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [txBusy, setTxBusy] = useState(false)
  const [transactions, setTransactions] = useState<DigiTransaction[]>([])
  const [holdings, setHoldings] = useState<DigiHolding[]>([])
  const [txQ, setTxQ] = useState('')
  const [txFrom, setTxFrom] = useState('')
  const [txTo, setTxTo] = useState('')
  const [schemes, setSchemes] = useState<ChitScheme[]>([])
  const [schemesBusy, setSchemesBusy] = useState(false)
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null)
  const [members, setMembers] = useState<ChitMember[]>([])
  const [membersBusy, setMembersBusy] = useState(false)
  const [schemeDraft, setSchemeDraft] = useState({
    name: '',
    scheme_type: 'monthly_chit',
    monthly_amount_inr: '',
    duration_months: '',
    metal_key: metal === 'silver' ? 'silver' : 'gold_22k',
    description: '',
  })
  const [memberDraft, setMemberDraft] = useState({ customer_name: '', customer_mobile: '', target_amount_inr: '' })
  const [manualDraft, setManualDraft] = useState({
    customer_name: '',
    customer_mobile: '',
    metal_key: metal === 'silver' ? 'silver' : 'gold_22k',
    amount_inr: '',
    payment_mode: 'cash',
    reference_no: '',
    notes: '',
  })
  const [txnDraft, setTxnDraft] = useState({
    member_id: '',
    amount_inr: '',
    payment_mode: 'cash',
    reference_no: '',
    notes: '',
  })

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

  const loadTransactions = useCallback(async () => {
    setTxBusy(true)
    try {
      const params: Record<string, string> = { metal, limit: '200' }
      if (txQ.trim()) params.q = txQ.trim()
      const fromIso = erpDateFilterToIso(txFrom)
      const toIso = erpDateFilterToIso(txTo)
      if (fromIso) params.from = fromIso
      if (toIso) params.to = toIso
      const res = await axios.get<{ transactions: DigiTransaction[]; holdings: DigiHolding[] }>(
        '/api/reseller/erp/digi/transactions',
        { params },
      )
      setTransactions(res.data.transactions || [])
      setHoldings(res.data.holdings || [])
    } catch {
      setTransactions([])
      setHoldings([])
    } finally {
      setTxBusy(false)
    }
  }, [metal, txQ, txFrom, txTo])

  const loadSchemes = useCallback(async () => {
    setSchemesBusy(true)
    try {
      const res = await axios.get<{ schemes: ChitScheme[] }>('/api/reseller/erp/digi/chit-schemes', {
        params: { product_line: metal },
      })
      const rows = res.data.schemes || []
      setSchemes(rows)
      if (!selectedSchemeId && rows[0]?.id) setSelectedSchemeId(rows[0].id)
    } catch {
      setSchemes([])
    } finally {
      setSchemesBusy(false)
    }
  }, [metal])

  const loadMembers = useCallback(async (schemeId: number) => {
    setMembersBusy(true)
    try {
      const res = await axios.get<{ members: ChitMember[] }>(
        `/api/reseller/erp/digi/chit-schemes/${schemeId}/members`,
      )
      setMembers(res.data.members || [])
    } catch {
      setMembers([])
    } finally {
      setMembersBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void loadSchemes()
  }, [load, loadSchemes])

  useEffect(() => {
    if (selectedSchemeId) void loadMembers(selectedSchemeId)
    else setMembers([])
  }, [selectedSchemeId, loadMembers])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

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

  const createScheme = async () => {
    if (!schemeDraft.name.trim()) return
    setMsg(null)
    try {
      await axios.post('/api/reseller/erp/digi/chit-schemes', {
        product_line: metal,
        name: schemeDraft.name.trim(),
        scheme_type: schemeDraft.scheme_type,
        monthly_amount_inr: schemeDraft.monthly_amount_inr ? Number(schemeDraft.monthly_amount_inr) : null,
        duration_months: schemeDraft.duration_months ? Number(schemeDraft.duration_months) : null,
        metal_key: schemeDraft.metal_key,
        description: schemeDraft.description.trim() || null,
      })
      setSchemeDraft((d) => ({ ...d, name: '', description: '' }))
      await loadSchemes()
      setMsg('Scheme created.')
    } catch (e) {
      setMsg(erpErr(e))
    }
  }

  const deleteScheme = async (id: number) => {
    if (!window.confirm('Delete this scheme and all its members/transactions?')) return
    try {
      await axios.delete(`/api/reseller/erp/digi/chit-schemes/${id}`)
      if (selectedSchemeId === id) setSelectedSchemeId(null)
      await loadSchemes()
      setMsg('Scheme deleted.')
    } catch (e) {
      setMsg(erpErr(e))
    }
  }

  const addMember = async () => {
    if (!selectedSchemeId || !memberDraft.customer_name.trim()) return
    try {
      await axios.post(`/api/reseller/erp/digi/chit-schemes/${selectedSchemeId}/members`, {
        customer_name: memberDraft.customer_name.trim(),
        customer_mobile: memberDraft.customer_mobile.trim(),
        target_amount_inr: memberDraft.target_amount_inr ? Number(memberDraft.target_amount_inr) : null,
      })
      setMemberDraft({ customer_name: '', customer_mobile: '', target_amount_inr: '' })
      await loadMembers(selectedSchemeId)
      await loadSchemes()
      setMsg('Member added.')
    } catch (e) {
      setMsg(erpErr(e))
    }
  }

  const recordChitPayment = async () => {
    const schemeId = selectedSchemeId
    const memberId = parseInt(txnDraft.member_id, 10)
    if (!schemeId || !memberId) return
    try {
      await axios.post('/api/reseller/erp/digi/chit-transactions', {
        scheme_id: schemeId,
        member_id: memberId,
        amount_inr: Number(txnDraft.amount_inr) || 0,
        payment_mode: txnDraft.payment_mode,
        reference_no: txnDraft.reference_no.trim() || null,
        notes: txnDraft.notes.trim() || null,
      })
      setTxnDraft({ member_id: '', amount_inr: '', payment_mode: 'cash', reference_no: '', notes: '' })
      await loadMembers(schemeId)
      await loadSchemes()
      await loadTransactions()
      setMsg('Payment recorded.')
    } catch (e) {
      setMsg(erpErr(e))
    }
  }

  const recordManualDigi = async () => {
    if (!manualDraft.customer_name.trim() || !manualDraft.amount_inr) return
    try {
      await axios.post('/api/reseller/erp/digi/manual-transaction', {
        customer_name: manualDraft.customer_name.trim(),
        customer_mobile: manualDraft.customer_mobile.trim(),
        metal_key: manualDraft.metal_key,
        amount_inr: Number(manualDraft.amount_inr),
        payment_mode: manualDraft.payment_mode,
        reference_no: manualDraft.reference_no.trim() || null,
        notes: manualDraft.notes.trim() || null,
      })
      setManualDraft((d) => ({
        ...d,
        customer_name: '',
        customer_mobile: '',
        amount_inr: '',
        reference_no: '',
        notes: '',
      }))
      await loadTransactions()
      setMsg('Manual transaction saved.')
    } catch (e) {
      setMsg(erpErr(e))
    }
  }

  const saveDiscounts = async () => {
    setSaveBusy(true)
    setMsg(null)
    try {
      await axios.put('/api/reseller/erp/digi/settings', { ...discounts, metal })
      await load()
      setMsg('Discounts saved.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  const filteredHoldings = useMemo(() => {
    const q = txQ.trim().toLowerCase()
    let rows = holdings.filter((h) =>
      metal === 'gold' ? h.metal_key.startsWith('gold_') : h.metal_key === 'silver',
    )
    if (q) {
      rows = rows.filter(
        (h) =>
          String(h.customer_name || '').toLowerCase().includes(q) ||
          String(h.customer_mobile || '').includes(q),
      )
    }
    return rows
  }, [holdings, metal, txQ])

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
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-[var(--color-jewelry-black,#1a1814)]">
          <p className="font-semibold">Razorpay optional</p>
          <p className="mt-1 text-[var(--color-jewelry-black,#1a1814)]/75">
            You can record cash/UPI payments below without Razorpay. Configure Razorpay only if you want customers to pay online via your share link.
          </p>
          <Link href={RESELLER_PAYMENT_SETTINGS_PATH} className={`${erpBtnGhost} mt-3 inline-flex`}>
            <Wallet className="size-4" />
            Payment settings
          </Link>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <div className="mb-3 flex items-center gap-2">
          <Gem className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">{productLabel}</h3>
        </div>

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
                      value={disc === 0 ? '' : disc}
                      placeholder="0"
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
              shareWhatsApp(shareUrl, settings?.business_name || 'Our store', productLabel)
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
        </div>
      ) : null}

      {msg ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm ${
            msg.includes('saved') || msg.includes('Saved') || msg.includes('created') || msg.includes('recorded') || msg.includes('added') || msg.includes('deleted')
              ? 'border border-emerald-200 bg-emerald-50 text-[var(--color-jewelry-black,#1a1814)]'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg}
        </p>
      ) : null}

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Chit &amp; savings schemes</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Create monthly chits, flexi savings, or digi accumulation schemes — track members and payments even without Razorpay.
        </p>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              New scheme
            </p>
            <input
              className={erpInputCls}
              placeholder="Scheme name"
              value={schemeDraft.name}
              onChange={(e) => setSchemeDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <select
              className={erpInputCls}
              value={schemeDraft.scheme_type}
              onChange={(e) => setSchemeDraft((d) => ({ ...d, scheme_type: e.target.value }))}
            >
              {SCHEME_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                className={erpInputCls}
                placeholder="Monthly ₹"
                inputMode="decimal"
                value={schemeDraft.monthly_amount_inr}
                onChange={(e) => setSchemeDraft((d) => ({ ...d, monthly_amount_inr: e.target.value }))}
              />
              <input
                className={erpInputCls}
                placeholder="Months"
                inputMode="numeric"
                value={schemeDraft.duration_months}
                onChange={(e) => setSchemeDraft((d) => ({ ...d, duration_months: e.target.value }))}
              />
            </div>
            {metal === 'gold' ? (
              <select
                className={erpInputCls}
                value={schemeDraft.metal_key}
                onChange={(e) => setSchemeDraft((d) => ({ ...d, metal_key: e.target.value }))}
              >
                <option value="gold_22k">22K (916)</option>
                <option value="gold_24k">24K (999)</option>
                <option value="gold_18k">18K (750)</option>
              </select>
            ) : null}
            <button type="button" className={erpBtnPrimary} onClick={() => void createScheme()}>
              <Plus className="size-4" />
              Add scheme
            </button>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              Your schemes
            </p>
            {schemesBusy ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
              </div>
            ) : schemes.length === 0 ? (
              <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">No schemes yet.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {schemes.map((s) => (
                  <li key={s.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-left text-sm ${
                        selectedSchemeId === s.id
                          ? 'bg-[#d1fae5] font-semibold text-[var(--color-jewelry-black,#1a1814)] ring-1 ring-emerald-600/30'
                          : 'border border-[var(--color-slate-700,#e8e4df)] bg-white hover:bg-[var(--color-slate-900,#f7f4ef)]'
                      }`}
                      onClick={() => setSelectedSchemeId(s.id)}
                    >
                      {s.name}
                      <span className="ml-1 block text-[10px] font-normal opacity-65">
                        {s.member_count ?? 0} members · {formatErpInr(Number(s.total_collected_inr || 0))}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-700"
                      aria-label="Delete scheme"
                      onClick={() => void deleteScheme(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selectedSchemeId ? (
          <div className="mt-4 border-t border-[var(--color-slate-700,#e8e4df)] pt-4">
            <p className="mb-2 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">Members &amp; payments</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className={erpInputCls}
                placeholder="Customer name"
                value={memberDraft.customer_name}
                onChange={(e) => setMemberDraft((d) => ({ ...d, customer_name: e.target.value }))}
              />
              <input
                className={erpInputCls}
                placeholder="Mobile"
                inputMode="tel"
                value={memberDraft.customer_mobile}
                onChange={(e) => setMemberDraft((d) => ({ ...d, customer_mobile: e.target.value }))}
              />
              <button type="button" className={erpBtnGhost} onClick={() => void addMember()}>
                <Plus className="size-4" />
                Add member
              </button>
            </div>

            {membersBusy ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : members.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
                <table className="w-full min-w-[480px] text-[11px]">
                  <thead>
                    <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Mobile</th>
                      <th className="px-2 py-2">Paid</th>
                      <th className="px-2 py-2">Grams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                        <td className="px-2 py-2 font-medium">{m.customer_name}</td>
                        <td className="px-2 py-2">{m.customer_mobile || '—'}</td>
                        <td className="px-2 py-2 tabular-nums">{formatErpInr(Number(m.paid_inr || 0))}</td>
                        <td className="px-2 py-2 tabular-nums">{Number(m.grams_total || 0).toFixed(3)} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <select
                className={erpInputCls}
                value={txnDraft.member_id}
                onChange={(e) => setTxnDraft((d) => ({ ...d, member_id: e.target.value }))}
              >
                <option value="">Member…</option>
                {members.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.customer_name}
                  </option>
                ))}
              </select>
              <input
                className={erpInputCls}
                placeholder="Amount ₹"
                inputMode="decimal"
                value={txnDraft.amount_inr}
                onChange={(e) => setTxnDraft((d) => ({ ...d, amount_inr: e.target.value }))}
              />
              <select
                className={erpInputCls}
                value={txnDraft.payment_mode}
                onChange={(e) => setTxnDraft((d) => ({ ...d, payment_mode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank">Bank</option>
                <option value="other">Other</option>
              </select>
              <input
                className={erpInputCls}
                placeholder="Ref / UTR"
                value={txnDraft.reference_no}
                onChange={(e) => setTxnDraft((d) => ({ ...d, reference_no: e.target.value }))}
              />
              <button type="button" className={erpBtnPrimary} onClick={() => void recordChitPayment()}>
                Record payment
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Quick manual entry (no Razorpay)</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Record a walk-in payment — updates customer balance at today&apos;s effective rate.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            className={erpInputCls}
            placeholder="Customer name"
            value={manualDraft.customer_name}
            onChange={(e) => setManualDraft((d) => ({ ...d, customer_name: e.target.value }))}
          />
          <input
            className={erpInputCls}
            placeholder="Mobile"
            inputMode="tel"
            value={manualDraft.customer_mobile}
            onChange={(e) => setManualDraft((d) => ({ ...d, customer_mobile: e.target.value }))}
          />
          {metal === 'gold' ? (
            <select
              className={erpInputCls}
              value={manualDraft.metal_key}
              onChange={(e) => setManualDraft((d) => ({ ...d, metal_key: e.target.value }))}
            >
              <option value="gold_22k">22K (916)</option>
              <option value="gold_24k">24K (999)</option>
              <option value="gold_18k">18K (750)</option>
            </select>
          ) : null}
          <input
            className={erpInputCls}
            placeholder="Amount ₹"
            inputMode="decimal"
            value={manualDraft.amount_inr}
            onChange={(e) => setManualDraft((d) => ({ ...d, amount_inr: e.target.value }))}
          />
          <select
            className={erpInputCls}
            value={manualDraft.payment_mode}
            onChange={(e) => setManualDraft((d) => ({ ...d, payment_mode: e.target.value }))}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
          <button type="button" className={erpBtnPrimary} onClick={() => void recordManualDigi()}>
            Save transaction
          </button>
        </div>
      </div>

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Customer balances</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
          Total accumulated {metal} weight per customer
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          <table className="w-full min-w-[480px] text-[11px]">
            <thead>
              <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Mobile</th>
                <th className="px-2 py-2">Metal</th>
                <th className="px-2 py-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No customer balances yet.
                  </td>
                </tr>
              ) : (
                filteredHoldings.map((h) => (
                  <tr key={`${h.customer_user_id}-${h.metal_key}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                    <td className="px-2 py-2 font-medium">{h.customer_name || '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{h.customer_mobile || '—'}</td>
                    <td className="px-2 py-2">{tierLabel(h.metal_key, metal)}</td>
                    <td className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                      {Number(h.balance_grams).toFixed(3)} g
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Payment history</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Search name, mobile, payment id
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-jewelry-black,#1a1814)]/35" />
              <input
                className={`${erpInputCls} pl-8`}
                value={txQ}
                onChange={(e) => setTxQ(e.target.value)}
                placeholder="Name, mobile, Razorpay id…"
              />
            </div>
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            From
            <ErpDateInput className={`${erpInputCls} mt-1`} value={txFrom} onChange={setTxFrom} />
          </label>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
            To
            <ErpDateInput className={`${erpInputCls} mt-1`} value={txTo} onChange={setTxTo} />
          </label>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          {txBusy ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-[var(--color-jewelry-black,#1a1814)]/40" />
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-[11px]">
              <thead>
                <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                  <th className="px-2 py-2">Date &amp; time</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Mobile</th>
                  <th className="px-2 py-2">Metal</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Rate</th>
                  <th className="px-2 py-2">Grams</th>
                  <th className="px-2 py-2">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                      No payments in this period.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                      <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                        {formatErpDateTime(t.paid_at || t.created_at)}
                      </td>
                      <td className="max-w-[100px] truncate px-2 py-2 font-medium">
                        {t.customer_name || '—'}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{t.customer_mobile || '—'}</td>
                      <td className="px-2 py-2">{tierLabel(t.metal_key, metal)}</td>
                      <td className="px-2 py-2 tabular-nums">{formatErpInr(Number(t.amount_inr))}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatErpInr(Number(t.effective_rate_per_gram))}/g
                        {Number(t.discount_inr) > 0 ? (
                          <span className="block text-[10px] text-emerald-700">
                            −₹{Number(t.discount_inr)} disc
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-semibold tabular-nums text-emerald-700">
                        {Number(t.grams).toFixed(3)} g
                      </td>
                      <td className="max-w-[90px] truncate px-2 py-2 font-mono text-[10px]">
                        {t.razorpay_payment_id || t.razorpay_order_id || `#${t.id}`}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

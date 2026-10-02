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
import { appConfirm } from '@/lib/app-notice'
import { erpDateFilterToIso, formatErpDateDdMmYyyy, formatErpDateTime } from '@/lib/erp-date-format'
import { RESELLER_PAYMENT_SETTINGS_PATH, RESELLER_RATES_PATH } from '@/lib/routes'
import { Gem, Loader2, MessageCircle, Pencil, Plus, Save, Search, Trash2, Wallet } from 'lucide-react'

type DigiScheme = {
  id: number
  product_type: 'gold' | 'silver'
  scheme_name: string
  description?: string | null
  installment_inr?: number | null
  duration_months?: number | null
  bonus_months?: number | null
  bonus_description?: string | null
  metal_key?: string | null
  is_active?: boolean
  terms_and_conditions?: string | null
}

type DigiRules = {
  standard_discount_per_gram: number
  standard_making_charge_pct: number
  exception_making_charge_pct: number
  exception_weight_under_grams: number
  raw_metal_wastage_pct: number
  shipping_charge_inr: number
  support_whatsapp: string | null
  terms_and_conditions: string | null
  gst_note: string
}

type DigiEnrollment = {
  id: number
  scheme_name?: string | null
  customer_name?: string | null
  customer_mobile?: string | null
  metal_key: string
  installment_inr: number
  duration_months: number
  months_paid: number
  months_remaining: number
  bonus_credited: boolean
  status: string
}

type DigiRedemption = {
  id: number
  customer_name?: string | null
  customer_mobile?: string | null
  metal_key: string
  grams: number
  item_kind: string
  status: string
  doorstep?: boolean
  shipping_inr?: number
  created_at: string
}

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
  rules?: DigiRules | null
  support_whatsapp?: string | null
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
  source?: string | null
  payment_mode?: string | null
  reference_no?: string | null
  scheme_id?: number | null
}

type DigiHolding = {
  metal_key: string
  balance_grams: number
  customer_name: string | null
  customer_mobile: string | null
  customer_user_id: number
  updated_at: string
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
  const [schemes, setSchemes] = useState<DigiScheme[]>([])
  const [schemeBusy, setSchemeBusy] = useState(false)
  const [editingSchemeId, setEditingSchemeId] = useState<number | null>(null)
  const emptySchemeForm = {
    scheme_name: '',
    description: '',
    installment_inr: '',
    duration_months: '15',
    bonus_months: '1',
    bonus_description: '1 month bonus on maturity',
    metal_key: metal === 'gold' ? 'gold_22k' : 'silver',
    terms_and_conditions: '',
  }
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm)
  const [rules, setRules] = useState<DigiRules>({
    standard_discount_per_gram: 4,
    standard_making_charge_pct: 0,
    exception_making_charge_pct: 50,
    exception_weight_under_grams: 25,
    raw_metal_wastage_pct: 0,
    shipping_charge_inr: 0,
    support_whatsapp: '',
    terms_and_conditions: '',
    gst_note: '+ 3% GST applicable',
  })
  const [enrollments, setEnrollments] = useState<DigiEnrollment[]>([])
  const [enrollTab, setEnrollTab] = useState<'active' | 'closed'>('active')
  const [redemptions, setRedemptions] = useState<DigiRedemption[]>([])
  const [manualBusy, setManualBusy] = useState(false)
  const [manualForm, setManualForm] = useState({
    customer_name: '',
    customer_mobile: '',
    metal_key: metal === 'gold' ? 'gold_22k' : 'silver',
    amount_inr: '',
    payment_mode: 'cash',
    reference_no: '',
    notes: '',
    scheme_id: '',
  })

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await axios.get<DigiSettings>('/api/reseller/digi/settings', {
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
      if (res.data.rules) {
        setRules({
          standard_discount_per_gram: Number(res.data.rules.standard_discount_per_gram) || 0,
          standard_making_charge_pct: Number(res.data.rules.standard_making_charge_pct) || 0,
          exception_making_charge_pct: Number(res.data.rules.exception_making_charge_pct) || 50,
          exception_weight_under_grams: Number(res.data.rules.exception_weight_under_grams) || 25,
          raw_metal_wastage_pct: Number(res.data.rules.raw_metal_wastage_pct) || 0,
          shipping_charge_inr: Number(res.data.rules.shipping_charge_inr) || 0,
          support_whatsapp: res.data.rules.support_whatsapp || res.data.support_whatsapp || '',
          terms_and_conditions: res.data.rules.terms_and_conditions || '',
          gst_note: res.data.rules.gst_note || '+ 3% GST applicable',
        })
      }
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
        '/api/reseller/digi/transactions',
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
    setSchemeBusy(true)
    try {
      const res = await axios.get<{ schemes: DigiScheme[] }>('/api/reseller/digi/schemes', {
        params: { product_type: metal },
      })
      setSchemes(res.data.schemes || [])
    } catch {
      setSchemes([])
    } finally {
      setSchemeBusy(false)
    }
  }, [metal])

  const loadEnrollments = useCallback(async () => {
    try {
      const res = await axios.get<{ enrollments: DigiEnrollment[] }>('/api/reseller/digi/enrollments', {
        params: { metal, status: enrollTab },
      })
      setEnrollments(res.data.enrollments || [])
    } catch {
      setEnrollments([])
    }
  }, [metal, enrollTab])

  const loadRedemptions = useCallback(async () => {
    try {
      const res = await axios.get<{ redemptions: DigiRedemption[] }>('/api/reseller/digi/redemptions')
      setRedemptions(
        (res.data.redemptions || []).filter((r) =>
          metal === 'gold' ? r.metal_key.startsWith('gold_') : r.metal_key === 'silver',
        ),
      )
    } catch {
      setRedemptions([])
    }
  }, [metal])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadTransactions()
  }, [loadTransactions])

  useEffect(() => {
    void loadSchemes()
  }, [loadSchemes])

  useEffect(() => {
    void loadEnrollments()
  }, [loadEnrollments])

  useEffect(() => {
    void loadRedemptions()
  }, [loadRedemptions])

  useEffect(() => {
    setSchemeForm((f) => ({ ...f, metal_key: metal === 'gold' ? 'gold_22k' : 'silver' }))
    setManualForm((f) => ({ ...f, metal_key: metal === 'gold' ? 'gold_22k' : 'silver' }))
  }, [metal])

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
      await axios.put('/api/reseller/digi/settings', { ...discounts, metal })
      await load()
      setMsg('Discounts saved.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  const addScheme = async () => {
    const name = schemeForm.scheme_name.trim()
    if (!name) return
    setSchemeBusy(true)
    setMsg(null)
    try {
      const payload = {
        product_type: metal,
        scheme_name: name,
        description: schemeForm.description.trim() || undefined,
        installment_inr: Number(schemeForm.installment_inr) || 0,
        duration_months: Number(schemeForm.duration_months) || undefined,
        bonus_months: Number(schemeForm.bonus_months) || 0,
        bonus_description: schemeForm.bonus_description.trim() || undefined,
        metal_key: schemeForm.metal_key,
        terms_and_conditions: schemeForm.terms_and_conditions.trim() || undefined,
      }
      if (editingSchemeId) {
        await axios.put(`/api/reseller/digi/schemes/${editingSchemeId}`, payload)
        setMsg('Scheme updated.')
      } else {
        await axios.post('/api/reseller/digi/schemes', payload)
        setMsg('Scheme added.')
      }
      setEditingSchemeId(null)
      setSchemeForm({
        ...emptySchemeForm,
        metal_key: metal === 'gold' ? 'gold_22k' : 'silver',
      })
      await loadSchemes()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSchemeBusy(false)
    }
  }

  const startEditScheme = (s: DigiScheme) => {
    setEditingSchemeId(s.id)
    setSchemeForm({
      scheme_name: s.scheme_name,
      description: s.description || '',
      installment_inr: s.installment_inr != null ? String(s.installment_inr) : '',
      duration_months: s.duration_months != null ? String(s.duration_months) : '',
      bonus_months: s.bonus_months != null ? String(s.bonus_months) : '1',
      bonus_description: s.bonus_description || '',
      metal_key: s.metal_key || (metal === 'gold' ? 'gold_22k' : 'silver'),
      terms_and_conditions: s.terms_and_conditions || '',
    })
  }

  const saveRules = async () => {
    setSaveBusy(true)
    setMsg(null)
    try {
      await axios.put('/api/reseller/digi/rules', rules)
      setMsg('Redemption rules saved.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  const deleteScheme = async (id: number) => {
    if (!(await appConfirm('Delete this scheme?'))) return
    setSchemeBusy(true)
    try {
      await axios.delete(`/api/reseller/digi/schemes/${id}`)
      await loadSchemes()
      setMsg('Scheme deleted.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setSchemeBusy(false)
    }
  }

  const submitManual = async () => {
    setManualBusy(true)
    setMsg(null)
    try {
      await axios.post('/api/reseller/digi/manual-transactions', {
        customer_name: manualForm.customer_name.trim(),
        customer_mobile: manualForm.customer_mobile.trim(),
        metal_key: manualForm.metal_key,
        amount_inr: Number(manualForm.amount_inr) || 0,
        payment_mode: manualForm.payment_mode,
        reference_no: manualForm.reference_no.trim() || undefined,
        notes: manualForm.notes.trim() || undefined,
        scheme_id: manualForm.scheme_id ? Number(manualForm.scheme_id) : undefined,
      })
      setManualForm((f) => ({
        ...f,
        customer_name: '',
        customer_mobile: '',
        amount_inr: '',
        reference_no: '',
        notes: '',
      }))
      await loadTransactions()
      setMsg('Transaction recorded.')
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setManualBusy(false)
    }
  }

  const deleteManualTx = async (id: number) => {
    if (!(await appConfirm('Remove this manual entry and reverse the balance?'))) return
    try {
      await axios.delete(`/api/reseller/digi/manual-transactions/${id}`)
      await loadTransactions()
      setMsg('Manual entry removed.')
    } catch (e) {
      setMsg(erpErr(e))
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
      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Chit &amp; savings schemes</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Monthly plans customers see in the Digi app. Amount, tenure and bonus are fully editable.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Scheme name
            <input
              className={`${erpInputCls} mt-1`}
              placeholder="e.g. 15 Months Plan"
              value={schemeForm.scheme_name}
              onChange={(e) => setSchemeForm((f) => ({ ...f, scheme_name: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Monthly amount (₹)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={schemeForm.installment_inr}
              onChange={(e) => setSchemeForm((f) => ({ ...f, installment_inr: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Duration (months)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={1}
              value={schemeForm.duration_months}
              onChange={(e) => setSchemeForm((f) => ({ ...f, duration_months: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Bonus months on maturity
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={schemeForm.bonus_months}
              onChange={(e) => setSchemeForm((f) => ({ ...f, bonus_months: e.target.value }))}
            />
          </label>
          {metal === 'gold' ? (
            <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
              Metal
              <select
                className={`${erpInputCls} mt-1`}
                value={schemeForm.metal_key}
                onChange={(e) => setSchemeForm((f) => ({ ...f, metal_key: e.target.value }))}
              >
                <option value="gold_24k">24K (999)</option>
                <option value="gold_22k">22K (916)</option>
                <option value="gold_18k">18K (750)</option>
              </select>
            </label>
          ) : null}
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Description
            <input
              className={`${erpInputCls} mt-1`}
              value={schemeForm.description}
              onChange={(e) => setSchemeForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Terms (optional)
            <textarea
              className={`${erpInputCls} mt-1 min-h-[72px] py-2`}
              value={schemeForm.terms_and_conditions}
              onChange={(e) => setSchemeForm((f) => ({ ...f, terms_and_conditions: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={schemeBusy} onClick={() => void addScheme()}>
            {schemeBusy ? <Loader2 className="size-4 animate-spin" /> : editingSchemeId ? <Save className="size-4" /> : <Plus className="size-4" />}
            {editingSchemeId ? 'Save scheme' : 'Add scheme'}
          </button>
          {editingSchemeId ? (
            <button
              type="button"
              className={erpBtnGhost}
              onClick={() => {
                setEditingSchemeId(null)
                setSchemeForm({
                  ...emptySchemeForm,
                  metal_key: metal === 'gold' ? 'gold_22k' : 'silver',
                })
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
        <ul className="mt-3 space-y-2">
          {schemes.length === 0 ? (
            <li className="text-xs text-[var(--color-jewelry-black,#1a1814)]/45">No schemes yet.</li>
          ) : (
            schemes.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                    {s.scheme_name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">
                    {s.installment_inr ? `${formatErpInr(Number(s.installment_inr))}/mo` : 'Amount not set'}
                    {s.duration_months ? ` · ${s.duration_months} months` : ''}
                    {s.bonus_months ? ` · +${s.bonus_months} bonus` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] text-[var(--color-jewelry-black,#1a1814)] hover:bg-[var(--color-slate-900,#faf8f4)]"
                    aria-label="Edit scheme"
                    onClick={() => startEditScheme(s)}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50"
                    aria-label="Delete scheme"
                    onClick={() => void deleteScheme(s.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Record offline payment</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Cash / UPI at counter — no Razorpay needed. Updates customer balance automatically.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Customer name
            <input
              className={`${erpInputCls} mt-1`}
              value={manualForm.customer_name}
              onChange={(e) => setManualForm((f) => ({ ...f, customer_name: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Mobile (10 digit)
            <input
              className={`${erpInputCls} mt-1`}
              inputMode="numeric"
              value={manualForm.customer_mobile}
              onChange={(e) => setManualForm((f) => ({ ...f, customer_mobile: e.target.value }))}
            />
          </label>
          {metal === 'gold' ? (
            <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
              Gold purity
              <select
                className={`${erpInputCls} mt-1`}
                value={manualForm.metal_key}
                onChange={(e) => setManualForm((f) => ({ ...f, metal_key: e.target.value }))}
              >
                <option value="gold_24k">24K (999)</option>
                <option value="gold_22k">22K (916)</option>
                <option value="gold_18k">18K (750)</option>
              </select>
            </label>
          ) : null}
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Amount (₹)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={manualForm.amount_inr}
              onChange={(e) => setManualForm((f) => ({ ...f, amount_inr: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Payment mode
            <select
              className={`${erpInputCls} mt-1`}
              value={manualForm.payment_mode}
              onChange={(e) => setManualForm((f) => ({ ...f, payment_mode: e.target.value }))}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank transfer</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </select>
          </label>
          {schemes.length ? (
            <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
              Scheme (optional)
              <select
                className={`${erpInputCls} mt-1`}
                value={manualForm.scheme_id}
                onChange={(e) => setManualForm((f) => ({ ...f, scheme_id: e.target.value }))}
              >
                <option value="">— None —</option>
                {schemes.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.scheme_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Reference / UTR (optional)
            <input
              className={`${erpInputCls} mt-1`}
              value={manualForm.reference_no}
              onChange={(e) => setManualForm((f) => ({ ...f, reference_no: e.target.value }))}
            />
          </label>
        </div>
        <button
          type="button"
          className={`${erpBtnPrimary} mt-3`}
          disabled={manualBusy}
          onClick={() => void submitManual()}
        >
          {manualBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save transaction
        </button>
      </div>

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
            msg.includes('saved') ||
            msg.includes('Saved') ||
            msg.includes('added') ||
            msg.includes('updated') ||
            msg.includes('recorded') ||
            msg.includes('deleted') ||
            msg.includes('removed')
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {msg}
        </p>
      ) : null}

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Redemption &amp; making charges</h3>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Controls jewellery making when customers redeem grams. Standard items get ₹/g off retail and zero making.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Standard discount (₹/g)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.standard_discount_per_gram}
              onChange={(e) =>
                setRules((r) => ({ ...r, standard_discount_per_gram: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Standard making %
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.standard_making_charge_pct}
              onChange={(e) =>
                setRules((r) => ({ ...r, standard_making_charge_pct: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Exception making % (antique / 92.5 / light)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.exception_making_charge_pct}
              onChange={(e) =>
                setRules((r) => ({ ...r, exception_making_charge_pct: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Light-weight under (g)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.exception_weight_under_grams}
              onChange={(e) =>
                setRules((r) => ({ ...r, exception_weight_under_grams: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Raw / coin wastage %
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.raw_metal_wastage_pct}
              onChange={(e) =>
                setRules((r) => ({ ...r, raw_metal_wastage_pct: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Doorstep shipping (₹)
            <input
              className={`${erpInputCls} mt-1`}
              type="number"
              min={0}
              value={rules.shipping_charge_inr}
              onChange={(e) =>
                setRules((r) => ({ ...r, shipping_charge_inr: Math.max(0, Number(e.target.value) || 0) }))
              }
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            Support WhatsApp (10 digit)
            <input
              className={`${erpInputCls} mt-1`}
              inputMode="numeric"
              value={rules.support_whatsapp || ''}
              onChange={(e) => setRules((r) => ({ ...r, support_whatsapp: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
            GST note on rates
            <input
              className={`${erpInputCls} mt-1`}
              value={rules.gst_note}
              onChange={(e) => setRules((r) => ({ ...r, gst_note: e.target.value }))}
            />
          </label>
          <label className="block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45 sm:col-span-2">
            Terms &amp; conditions (customer app)
            <textarea
              className={`${erpInputCls} mt-1 min-h-[88px] py-2`}
              value={rules.terms_and_conditions || ''}
              onChange={(e) => setRules((r) => ({ ...r, terms_and_conditions: e.target.value }))}
            />
          </label>
        </div>
        <button type="button" className={`${erpBtnPrimary} mt-3`} disabled={saveBusy} onClick={() => void saveRules()}>
          {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save redemption rules
        </button>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Installment accounts</h3>
          <div className="flex gap-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-0.5">
            {(['active', 'closed'] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                  enrollTab === id
                    ? 'bg-emerald-50 !text-[#1a1814] ring-1 ring-emerald-300/60'
                    : 'text-[var(--color-jewelry-black,#1a1814)]/70'
                }`}
                onClick={() => setEnrollTab(id)}
              >
                {id === 'active' ? 'Active A/c' : 'Closed A/c'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          <table className="w-full min-w-[560px] text-[11px]">
            <thead>
              <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Mobile</th>
                <th className="px-2 py-2">Plan</th>
                <th className="px-2 py-2">Paid</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No {enrollTab} accounts.
                  </td>
                </tr>
              ) : (
                enrollments.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                    <td className="px-2 py-2 font-medium">{e.customer_name || '—'}</td>
                    <td className="px-2 py-2 tabular-nums">{e.customer_mobile || '—'}</td>
                    <td className="px-2 py-2">{e.scheme_name || '—'}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {e.months_paid}/{e.duration_months}
                      {e.bonus_credited ? (
                        <span className="ml-1 text-emerald-700">bonus</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {e.status === 'active' ? (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-rose-700 underline"
                          onClick={async () => {
                            if (!(await appConfirm('Close this installment account?'))) return
                            try {
                              await axios.post(`/api/reseller/digi/enrollments/${e.id}/close`)
                              await loadEnrollments()
                              setMsg('Account closed.')
                            } catch (err) {
                              setMsg(erpErr(err))
                            }
                          }}
                        >
                          Close
                        </button>
                      ) : (
                        <span className="uppercase text-[var(--color-jewelry-black,#1a1814)]/45">{e.status}</span>
                      )}
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
                      <td className="max-w-[120px] px-2 py-2">
                        <span className="block truncate font-mono text-[10px]">
                          {t.source === 'manual'
                            ? t.reference_no || t.payment_mode || 'Manual'
                            : t.razorpay_payment_id || t.razorpay_order_id || `#${t.id}`}
                        </span>
                        {t.source === 'manual' ? (
                          <button
                            type="button"
                            className="mt-1 text-[10px] font-semibold text-rose-700 underline"
                            onClick={() => void deleteManualTx(t.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={erpCardCls}>
        <h3 className="text-sm font-bold text-[var(--color-jewelry-black,#1a1814)]">Redemption requests</h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          <table className="w-full min-w-[620px] text-[11px]">
            <thead>
              <tr className="bg-[var(--color-slate-900,#faf8f4)] text-left text-[var(--color-jewelry-black,#1a1814)]/55">
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Grams</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {redemptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                    No redemptions yet.
                  </td>
                </tr>
              ) : (
                redemptions.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-slate-700,#e8e4df)]/50">
                    <td className="px-2 py-2">
                      <p className="font-medium">{r.customer_name || '—'}</p>
                      <p className="tabular-nums text-[var(--color-jewelry-black,#1a1814)]/55">{r.customer_mobile}</p>
                    </td>
                    <td className="px-2 py-2 font-semibold tabular-nums">
                      {Number(r.grams).toFixed(3)} g
                      <span className="block font-normal">{tierLabel(r.metal_key, metal)}</span>
                    </td>
                    <td className="px-2 py-2">
                      {r.item_kind}
                      {r.doorstep ? <span className="block text-[10px]">Doorstep</span> : null}
                    </td>
                    <td className="px-2 py-2 uppercase">{r.status}</td>
                    <td className="px-2 py-2">
                      {r.status === 'requested' ? (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-emerald-800 underline"
                            onClick={async () => {
                              await axios.post(`/api/reseller/digi/redemptions/${r.id}/status`, {
                                status: 'confirmed',
                              })
                              await loadRedemptions()
                              setMsg('Redemption confirmed.')
                            }}
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-rose-700 underline"
                            onClick={async () => {
                              if (!(await appConfirm('Cancel and return grams to the customer?'))) return
                              await axios.post(`/api/reseller/digi/redemptions/${r.id}/status`, {
                                status: 'cancelled',
                              })
                              await loadRedemptions()
                              await loadTransactions()
                              setMsg('Redemption cancelled.')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : r.status === 'confirmed' ? (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-emerald-800 underline"
                          onClick={async () => {
                            await axios.post(`/api/reseller/digi/redemptions/${r.id}/status`, {
                              status: 'dispatched',
                            })
                            await loadRedemptions()
                            setMsg('Marked dispatched.')
                          }}
                        >
                          Dispatched
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

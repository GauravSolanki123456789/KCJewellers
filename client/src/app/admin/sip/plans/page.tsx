'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  X,
  Wallet,
  Edit2,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'

type SipPlan = {
  id: number
  name: string
  type?: string
  metal_type?: string | null
  duration_months: number
  min_amount?: number
  installment_amount?: number | null
  jeweler_benefit_percentage?: number | null
  is_active: boolean
  created_at?: string
}

const METAL_OPTIONS = [
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'diamond', label: 'Diamond' },
]

export default function AdminSipPlansPage() {
  const [plans, setPlans] = useState<SipPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<SipPlan | null>(null)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const [form, setForm] = useState({
    name: '',
    metal_type: 'gold' as string,
    duration_months: 12,
    installment_amount: '',
    jeweler_benefit_percentage: '',
    is_active: true,
  })

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get('/api/admin/sip/plans')
      setPlans(Array.isArray(res.data) ? res.data : [])
    } catch {
      setPlans([])
      showToast('error', 'Failed to load SIP plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const resetForm = () => {
    setForm({
      name: '',
      metal_type: 'gold',
      duration_months: 12,
      installment_amount: '',
      jeweler_benefit_percentage: '',
      is_active: true,
    })
    setEditingPlan(null)
  }

  const openCreateModal = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (plan: SipPlan) => {
    setEditingPlan(plan)
    setForm({
      name: plan.name || '',
      metal_type: plan.metal_type || 'gold',
      duration_months: plan.duration_months || 12,
      installment_amount: plan.installment_amount != null ? String(plan.installment_amount) : '',
      jeweler_benefit_percentage: plan.jeweler_benefit_percentage != null ? String(plan.jeweler_benefit_percentage) : '',
      is_active: plan.is_active ?? true,
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast('error', 'Plan name is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        metal_type: form.metal_type,
        duration_months: form.duration_months,
        installment_amount: form.installment_amount ? Number(form.installment_amount) : 0,
        jeweler_benefit_percentage: form.jeweler_benefit_percentage ? Number(form.jeweler_benefit_percentage) : null,
        is_active: form.is_active,
      }
      if (editingPlan) {
        await axios.put(`/api/admin/sip/plans/${editingPlan.id}`, payload)
        showToast('success', 'Plan updated successfully')
      } else {
        await axios.post('/api/admin/sip/plans', payload)
        showToast('success', 'Plan created successfully')
      }
      setModalOpen(false)
      resetForm()
      load()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Failed to save plan'
      showToast('error', msg || 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (plan: SipPlan) => {
    setTogglingId(plan.id)
    try {
      await axios.put(`/api/admin/sip/plans/${plan.id}`, { is_active: !plan.is_active })
      showToast('success', plan.is_active ? 'Plan deactivated' : 'Plan activated')
      load()
    } catch {
      showToast('error', 'Failed to update status')
    } finally {
      setTogglingId(null)
    }
  }

  const metalLabel = (m: string | null | undefined) => {
    if (!m) return '—'
    const opt = METAL_OPTIONS.find(o => o.value === m)
    return opt?.label || m
  }

  const inputClass = 'w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none transition-all'
  const labelClass = 'block text-sm font-medium text-slate-400 mb-1.5'

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-slate-400">Loading...</div></div>}>
      <AdminGuard>
        <div className="min-h-screen bg-slate-950 text-slate-100">
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 pb-24 sm:pb-12">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-amber-500 mb-6 transition-colors"
            >
              <ArrowLeft className="size-4" /> Back to Dashboard
            </Link>

            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Wallet className="size-6 text-amber-500" />
                  </div>
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-100">SIP Plans Manager</h1>
                    <p className="text-slate-500 text-sm">Create and manage Gold, Silver & Diamond SIP plans</p>
                  </div>
                </div>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors shadow-lg shadow-amber-500/20"
                >
                  <Plus className="size-5" /> Create New Plan
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden">
              {loading ? (
                <div className="p-12 sm:p-16 text-center">
                  <Loader2 className="size-10 text-amber-500 animate-spin mx-auto" />
                  <p className="text-slate-500 mt-4">Loading plans…</p>
                </div>
              ) : plans.length === 0 ? (
                <div className="p-12 sm:p-16 text-center">
                  <Wallet className="size-14 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 text-lg">No SIP plans yet</p>
                  <p className="text-slate-500 text-sm mt-1">Create your first plan to get started</p>
                  <button
                    onClick={openCreateModal}
                    className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm"
                  >
                    <Plus className="size-5" /> Create Plan
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile: Card layout */}
                  <div className="sm:hidden divide-y divide-white/5 p-4 space-y-4">
                    {plans.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl border border-white/10 bg-slate-800/40 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-slate-200">{p.name}</h3>
                            <span className="inline-flex mt-1 px-2 py-0.5 rounded-lg text-xs font-medium capitalize bg-slate-700 text-slate-300">
                              {metalLabel(p.metal_type)}
                            </span>
                          </div>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-medium ${
                              p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600 text-slate-400'
                            }`}
                          >
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-slate-400">
                          <span>{p.duration_months} months</span>
                          <span>₹{Number(p.installment_amount || p.min_amount || 0).toLocaleString('en-IN')}/mo</span>
                          <span>Benefit: {p.jeweler_benefit_percentage ?? 0}%</span>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-white/5">
                          <button
                            onClick={() => openEditModal(p)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                          >
                            <Edit2 className="size-4" /> Edit
                          </button>
                          <button
                            onClick={() => toggleStatus(p)}
                            disabled={togglingId === p.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium border border-amber-500/40 disabled:opacity-50"
                          >
                            {togglingId === p.id ? <Loader2 className="size-4 animate-spin" /> : p.is_active ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                            {p.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10 bg-slate-800/40">
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Name</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Metal</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Duration</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Installment</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Benefit %</th>
                          <th className="text-left py-4 px-5 text-slate-400 font-medium text-sm">Status</th>
                          <th className="text-right py-4 px-5 text-slate-400 font-medium text-sm">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((p) => (
                          <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="py-4 px-5 font-medium text-slate-200">{p.name}</td>
                            <td className="py-4 px-5">
                              <span className="inline-flex px-2 py-0.5 rounded-lg text-xs font-medium capitalize bg-slate-700/80 text-slate-300">
                                {metalLabel(p.metal_type)}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-slate-400">{p.duration_months} mo</td>
                            <td className="py-4 px-5 text-right">
                              <span className="font-medium text-amber-400 tabular-nums">
                                ₹{Number(p.installment_amount || p.min_amount || 0).toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right text-slate-400 tabular-nums">
                              {p.jeweler_benefit_percentage ?? 0}%
                            </td>
                            <td className="py-4 px-5">
                              <span
                                className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                                  p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/80 text-slate-400'
                                }`}
                              >
                                {p.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditModal(p)}
                                  className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                                  title="Edit"
                                >
                                  <Edit2 className="size-4" />
                                </button>
                                <button
                                  onClick={() => toggleStatus(p)}
                                  disabled={togglingId === p.id}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
                                    p.is_active
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                  }`}
                                >
                                  {togglingId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                  {p.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href="/admin/sip/payouts"
                className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 text-sm font-medium"
              >
                Payout Requests
              </Link>
              <Link
                href="/admin/sip/movements"
                className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium"
              >
                Gold Lot Movements
              </Link>
            </div>
          </main>
        </div>

        {/* Create/Edit Modal */}
        {modalOpen && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => !saving && setModalOpen(false)} aria-hidden="true" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/80">
                  <h2 className="text-lg font-semibold text-slate-100">
                    {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                  </h2>
                  <button
                    onClick={() => !saving && setModalOpen(false)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
                  <div>
                    <label className={labelClass}>Plan Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. 11-Month Gold Saver"
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Metal Type</label>
                    <select
                      value={form.metal_type}
                      onChange={(e) => setForm({ ...form, metal_type: e.target.value })}
                      className={inputClass}
                    >
                      {METAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Duration (months)</label>
                    <input
                      type="number"
                      min={1}
                      value={form.duration_months}
                      onChange={(e) => setForm({ ...form, duration_months: parseInt(e.target.value) || 12 })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Installment Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.installment_amount}
                      onChange={(e) => setForm({ ...form, installment_amount: e.target.value })}
                      placeholder="e.g. 5000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Jeweler Benefit %</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.jeweler_benefit_percentage}
                      onChange={(e) => setForm({ ...form, jeweler_benefit_percentage: e.target.value })}
                      placeholder="e.g. 100"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500/50"
                    />
                    <label htmlFor="is_active" className="text-sm text-slate-300">Active (visible to customers)</label>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => !saving && setModalOpen(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 className="size-5 animate-spin" /> : null}
                      {editingPlan ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300">
            <div
              className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[280px] max-w-[90vw] ${
                toast.type === 'success' ? 'bg-emerald-500/95 text-white border-emerald-400' : 'bg-red-500/95 text-white border-red-400'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="size-5 shrink-0" /> : <XCircle className="size-5 shrink-0" />}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </AdminGuard>
    </Suspense>
  )
}

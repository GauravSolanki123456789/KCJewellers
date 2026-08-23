'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { RefreshCw, Shield, Trash2, UserPlus } from 'lucide-react'
import {
  RESELLER_ERP_MODULES,
  type ResellerErpModuleId,
} from '@/lib/reseller-erp-modules'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import type { ErpOperator } from '@/context/ErpOperatorContext'

type OperatorRow = ErpOperator & { lastLoginAt?: string | null }

export function ErpUsersWorkspace() {
  const [operators, setOperators] = useState<OperatorRow[]>([])
  const [moduleIds, setModuleIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'staff' as 'admin' | 'staff',
    fullAccess: false,
    shadowAccess: false,
    allowedModules: [] as string[],
  })

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await axios.get<{ operators: OperatorRow[]; moduleIds: string[] }>(
        '/api/reseller/erp/operators',
      )
      setOperators(res.data.operators || [])
      setModuleIds(res.data.moduleIds || [])
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const resetForm = () => {
    setEditId(null)
    setForm({
      username: '',
      password: '',
      displayName: '',
      role: 'staff',
      fullAccess: false,
      shadowAccess: false,
      allowedModules: [],
    })
    setFormOpen(false)
  }

  const startEdit = (op: OperatorRow) => {
    setEditId(op.id)
    setForm({
      username: op.username,
      password: '',
      displayName: op.displayName,
      role: op.role,
      fullAccess: op.fullAccess,
      shadowAccess: op.shadowAccess,
      allowedModules: op.allowedModules || [],
    })
    setFormOpen(true)
  }

  const toggleModule = (id: string) => {
    setForm((f) => ({
      ...f,
      allowedModules: f.allowedModules.includes(id)
        ? f.allowedModules.filter((m) => m !== id)
        : [...f.allowedModules, id],
    }))
  }

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const body = {
        username: form.username,
        display_name: form.displayName || form.username,
        role: form.role,
        full_access: form.fullAccess,
        shadow_access: form.shadowAccess,
        allowed_modules: form.fullAccess ? moduleIds : form.allowedModules,
        ...(form.password ? { password: form.password } : {}),
      }
      if (editId) {
        await axios.put(`/api/reseller/erp/operators/${editId}`, body)
        setMsg('User updated.')
      } else {
        if (!form.password || form.password.length < 6) {
          setMsg('Password must be at least 6 characters.')
          return
        }
        await axios.post('/api/reseller/erp/operators', body)
        setMsg('User created.')
      }
      resetForm()
      await load()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remove this ERP user permanently?')) return
    setBusy(true)
    try {
      await axios.delete(`/api/reseller/erp/operators/${id}`)
      await load()
    } catch (e) {
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const moduleLabel = (id: string) =>
    RESELLER_ERP_MODULES.find((m) => m.id === id)?.title || id

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total users', value: operators.length, tone: 'text-[var(--color-jewelry-black,#1a1814)]' },
          {
            label: 'Active',
            value: operators.filter((o) => o.isActive !== false).length,
            tone: 'text-emerald-700',
          },
          {
            label: 'Admins',
            value: operators.filter((o) => o.role === 'admin').length,
            tone: 'text-violet-700',
          },
          { label: 'Shadow access', value: operators.filter((o) => o.shadowAccess).length, tone: 'text-amber-700' },
        ].map((c) => (
          <div key={c.label} className={`${erpCardCls} py-3`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
              {c.label}
            </p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={erpBtnPrimary} onClick={() => { resetForm(); setFormOpen(true) }}>
          <UserPlus className="size-4" />
          Add user
        </button>
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 text-xs text-[var(--color-jewelry-black,#1a1814)]">
          {msg}
        </p>
      ) : null}

      {formOpen ? (
        <div className={erpCardCls}>
          <p className="mb-3 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            {editId ? 'Edit user' : 'Add new user'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Username
              <input
                className={`${erpInputCls} mt-1`}
                disabled={!!editId}
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Display name
              <input
                className={`${erpInputCls} mt-1`}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Password {editId ? '(leave blank to keep)' : '*'}
              <input
                className={`${erpInputCls} mt-1`}
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Role
              <select
                className={`${erpInputCls} mt-1`}
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'admin' | 'staff' }))}
              >
                <option value="staff">Employee</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-2">
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-3">
              <input
                type="checkbox"
                checked={form.fullAccess}
                onChange={(e) => setForm((f) => ({ ...f, fullAccess: e.target.checked }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Full access (all modules)
                </span>
                <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  Grant access to all ERP tabs
                </span>
              </span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3">
              <input
                type="checkbox"
                checked={form.shadowAccess}
                onChange={(e) => setForm((f) => ({ ...f, shadowAccess: e.target.checked }))}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  Shadow mode access
                </span>
                <span className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  Admin can unlock internal ledger with secret key (F9Rs* + Enter)
                </span>
              </span>
            </label>
          </div>

          {!form.fullAccess ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                Module access
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(moduleIds.length ? moduleIds : RESELLER_ERP_MODULES.map((m) => m.id)).map((id) => (
                  <label
                    key={id}
                    className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2.5 py-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={form.allowedModules.includes(id)}
                      onChange={() => toggleModule(id)}
                    />
                    <span className="text-[var(--color-jewelry-black,#1a1814)]">{moduleLabel(id)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
              {editId ? 'Save changes' : 'Add user'}
            </button>
            <button type="button" className={erpBtnPrimary} onClick={resetForm}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className={erpCardCls}>
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Shield className="size-4 text-[var(--kc-accent,#c41e3a)]" />
          Authorized users
        </p>
        <ul className="space-y-2">
          {operators.map((op) => (
            <li
              key={op.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)]/40 px-3 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                  {op.displayName}{' '}
                  <span className="font-mono text-xs font-normal text-[var(--color-jewelry-black,#1a1814)]/50">
                    @{op.username}
                  </span>
                </p>
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  {op.role === 'admin' ? 'Admin' : 'Employee'}
                  {op.fullAccess ? ' · Full access' : ` · ${op.allowedModules?.length || 0} modules`}
                  {op.shadowAccess ? ' · Shadow' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" className={erpBtnPrimary} onClick={() => startEdit(op)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700"
                  onClick={() => void remove(op.id)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
              </div>
            </li>
          ))}
          {!operators.length ? (
            <li className="py-6 text-center text-sm text-[var(--color-jewelry-black,#1a1814)]/50">
              No ERP users yet. Add an admin first.
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}

export type { ResellerErpModuleId }

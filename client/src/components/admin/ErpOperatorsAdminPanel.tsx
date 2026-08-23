'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'

type Op = {
  id: number
  username: string
  displayName: string
  role: string
  fullAccess: boolean
  shadowAccess: boolean
}

export function ErpOperatorsAdminPanel({ resellerUserId }: { resellerUserId: number }) {
  const [operators, setOperators] = useState<Op[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('admin')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await axios.get<{ operators: Op[] }>(`/api/admin/users/${resellerUserId}/erp/operators`)
      setOperators(res.data.operators || [])
    } catch {
      setOperators([])
    }
  }, [resellerUserId])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    if (!username.trim() || !password) {
      setMsg('Username and password required.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await axios.post(`/api/admin/users/${resellerUserId}/erp/operators`, {
        username: username.trim(),
        password,
        display_name: displayName || username.trim(),
        role,
        full_access: role === 'admin',
        shadow_access: role === 'admin',
      })
      setUsername('')
      setPassword('')
      setDisplayName('')
      setMsg('ERP user created.')
      await load()
    } catch (e: unknown) {
      const err = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setMsg(err || 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this ERP user?')) return
    await axios.delete(`/api/admin/users/${resellerUserId}/erp/operators/${id}`)
    await load()
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-3">
      <p className="text-sm font-semibold text-slate-100">ERP staff logins</p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
        Usernames and passwords for Jewellery ERP (after Google sign-in). Create the first admin here.
      </p>

      {operators.length ? (
        <ul className="mt-2 space-y-1.5">
          {operators.map((op) => (
            <li
              key={op.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-xs"
            >
              <span className="text-slate-200">
                {op.displayName}{' '}
                <span className="font-mono text-slate-500">@{op.username}</span>
                <span className="ml-1 text-slate-500">· {op.role === 'admin' ? 'Admin' : 'Employee'}</span>
              </span>
              <button
                type="button"
                className="shrink-0 text-red-400 hover:text-red-300"
                onClick={() => void remove(op.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          type="password"
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 sm:col-span-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100"
          value={role}
          onChange={(e) => setRole(e.target.value as 'admin' | 'staff')}
        >
          <option value="admin">Admin</option>
          <option value="staff">Employee</option>
        </select>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void add()}
        className="mt-3 min-h-[44px] w-full rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60 sm:w-auto"
      >
        Add ERP user
      </button>
      {msg ? <p className="mt-2 text-xs text-slate-300">{msg}</p> : null}
    </div>
  )
}

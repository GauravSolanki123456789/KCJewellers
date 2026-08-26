'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  DEFAULT_ERP_NAV_VISIBILITY,
  ERP_NAV_PICKER_MODULES,
  normalizeErpNavVisibility,
  type ErpNavVisibility,
} from '@/lib/erp-nav-visibility'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import type { ResellerErpModuleId } from '@/lib/reseller-erp-modules'
import { Loader2, Save, Settings2 } from 'lucide-react'

type Props = {
  onSaved?: () => void
}

export function ErpNavVisibilityPanel({ onSaved }: Props) {
  const [draft, setDraft] = useState<ErpNavVisibility>(DEFAULT_ERP_NAV_VISIBILITY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get<{ settings?: { navVisibility?: unknown } }>('/api/reseller/erp/settings')
      setDraft(normalizeErpNavVisibility(res.data.settings?.navVisibility))
    } catch {
      setDraft(DEFAULT_ERP_NAV_VISIBILITY)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = (list: 'adminTabs' | 'jainavTabs', id: ResellerErpModuleId) => {
    setDraft((prev) => {
      const cur = new Set(prev[list])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...prev, [list]: Array.from(cur) }
    })
  }

  const save = async () => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await axios.get<{ settings?: Record<string, unknown> }>('/api/reseller/erp/settings')
      const settings = res.data.settings || {}
      await axios.put('/api/reseller/erp/settings', {
        settings: { ...settings, navVisibility: draft },
      })
      setMsg('Tab visibility saved. Lock and re-unlock F9Rs* if tabs look stale.')
      onSaved?.()
    } catch (e) {
      setErr(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className={`${erpCardCls} flex items-center gap-2 text-sm text-[var(--color-jewelry-black,#1a1814)]/55`}>
        <Loader2 className="size-4 animate-spin" />
        Loading tab settings…
      </div>
    )
  }

  return (
    <div className={`${erpCardCls} space-y-4`}>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
          <Settings2 className="size-4 text-emerald-700" />
          ERP tab visibility
        </p>
        <p className="mt-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Choose which tabs appear when you log in as admin vs only after F9Rs* unlock. Staff logins use their own
          allowed modules.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/55">
            Admin mode tabs
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {ERP_NAV_PICKER_MODULES.map((m) => (
              <li key={`admin-${m.id}`}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
                    checked={draft.adminTabs.includes(m.id)}
                    onChange={() => toggle('adminTabs', m.id)}
                  />
                  <span className="text-[var(--color-jewelry-black,#1a1814)]">{m.short || m.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-900/70">
            F9Rs* unlock only
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {ERP_NAV_PICKER_MODULES.map((m) => (
              <li key={`jainav-${m.id}`}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/80">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-emerald-300"
                    checked={draft.jainavTabs.includes(m.id)}
                    onChange={() => toggle('jainavTabs', m.id)}
                  />
                  <span className="text-emerald-950">{m.short || m.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save tab layout
        </button>
        <button
          type="button"
          className={erpInputCls}
          disabled={busy}
          onClick={() => setDraft(DEFAULT_ERP_NAV_VISIBILITY)}
        >
          Reset defaults
        </button>
      </div>
      {msg ? <p className="text-xs font-medium text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-xs font-medium text-rose-600">{err}</p> : null}
    </div>
  )
}

export async function fetchErpNavVisibility(): Promise<ErpNavVisibility> {
  try {
    const res = await axios.get<{ settings?: { navVisibility?: unknown } }>('/api/reseller/erp/settings')
    return normalizeErpNavVisibility(res.data.settings?.navVisibility)
  } catch {
    return DEFAULT_ERP_NAV_VISIBILITY
  }
}

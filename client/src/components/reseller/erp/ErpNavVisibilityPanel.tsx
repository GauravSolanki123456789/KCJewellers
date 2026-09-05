'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  DEFAULT_ERP_NAV_VISIBILITY,
  normalizeErpNavVisibility,
  type ErpNavVisibility,
} from '@/lib/erp-nav-visibility'
import { RESELLER_ERP_MODULES } from '@/lib/reseller-erp-modules'
import { erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import type { ResellerErpModuleId } from '@/lib/reseller-erp-modules'
import { Loader2, Save, Settings2 } from 'lucide-react'

const PICKER_MODULES = RESELLER_ERP_MODULES.filter(
  (m) => m.id !== 'shadow' && m.kind === 'workspace',
)

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

  const toggle = (id: ResellerErpModuleId) => {
    setDraft((prev) => {
      const cur = new Set(prev.jainavUnlockTabs)
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { jainavUnlockTabs: Array.from(cur) }
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
      setMsg('Tab layout saved. Lock and re-unlock Jainav if tabs look stale.')
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
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/65">
          Check a tab to hide it from normal admin until you unlock Jainav mode (F9Rs* + Enter). Unchecked tabs
          stay visible in admin. Day close, Inventory, Lane ledger, and ROL are always unlock-only.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/70">
          Jainav unlock only
        </p>
        <ul className="grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
          {PICKER_MODULES.map((m) => {
            const checked = draft.jainavUnlockTabs.includes(m.id)
            return (
              <li key={m.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-sm transition hover:border-[var(--color-slate-700,#e8e4df)] hover:bg-[var(--color-slate-900,#faf8f4)]">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-[var(--color-slate-700,#cbd5e1)] accent-emerald-700"
                    checked={checked}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="font-medium text-[var(--color-jewelry-black,#1a1814)]">{m.short || m.title}</span>
                </label>
              </li>
            )
          })}
        </ul>
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

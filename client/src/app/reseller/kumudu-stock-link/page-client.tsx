'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import axios from '@/lib/axios'
import { useAuth } from '@/hooks/useAuth'
import { useLoginModal } from '@/context/LoginModalContext'
import { PROFILE_PATH, RESELLER_KUMUDU_STOCK_LINK_PATH } from '@/lib/routes'
import SaveFeedbackButton from '@/components/ui/SaveFeedbackButton'
import { useSaveFeedback } from '@/hooks/useSaveFeedback'

type EndpointId = 'catalogue_creation' | 'product_creation' | 'stock'

type FieldDef = {
  key: string
  label: string
  group: string
  hint?: string
}

type MappingState = {
  selected: string[]
  map: Record<string, string>
}

type KumuduEvent = {
  id: number
  endpoint: string
  status: string
  summary: string | null
  payload?: unknown
  result?: unknown
  created_at: string
}

type KumuduLinkPayload = {
  enabled: boolean
  inbound_key: string
  store_id: string
  api_key: string
  endpoints: Record<
    EndpointId | 'health' | 'last_received' | 'last_received_catalogue' | 'last_received_products' | 'last_received_stock',
    string
  >
  fields: FieldDef[]
  recommended: Record<EndpointId, string[]>
  catalogue_mapping: MappingState
  product_mapping: MappingState
  stock_mapping: MappingState
  detected_keys: Record<EndpointId, string[]>
  mapping_hints?: Record<EndpointId, Record<string, string>>
  events: KumuduEvent[]
  error?: string
}

const EMPTY_MAP: MappingState = { selected: [], map: {} }

const TAB_META: { id: EndpointId; short: string }[] = [
  { id: 'catalogue_creation', short: 'Catalogue' },
  { id: 'product_creation', short: 'Products' },
  { id: 'stock', short: 'Stock' },
]

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export default function KumuduStockLinkPageClient() {
  const auth = useAuth()
  const { open: openLoginModal } = useLoginModal()
  const saveFb = useSaveFeedback()
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [data, setData] = useState<KumuduLinkPayload | null>(null)
  const [tab, setTab] = useState<EndpointId>('catalogue_creation')
  const [storeId, setStoreId] = useState('')
  const [maps, setMaps] = useState<Record<EndpointId, MappingState>>({
    catalogue_creation: EMPTY_MAP,
    product_creation: EMPTY_MAP,
    stock: EMPTY_MAP,
  })
  const [sampleText, setSampleText] = useState('')
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null)
  const [fieldQuery, setFieldQuery] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [busySample, setBusySample] = useState(false)
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, string>>({})
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<KumuduLinkPayload>('/api/reseller/kumudu-link', {
        withCredentials: true,
      })
      const d = res.data
      setEnabled(d.enabled !== false)
      setData(d)
      setStoreId(d.store_id || '')
      setMaps({
        catalogue_creation: d.catalogue_mapping || EMPTY_MAP,
        product_creation: d.product_mapping || EMPTY_MAP,
        stock: d.stock_mapping || EMPTY_MAP,
      })
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { enabled?: boolean; error?: string } } }
      if (err.response?.status === 403 || err.response?.data?.enabled === false) {
        setEnabled(false)
      } else {
        setError(err.response?.data?.error || 'Could not load Kumudu stock link.')
        setEnabled(false)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!auth.hasChecked) return
    if (!auth.isAuthenticated) {
      setLoading(false)
      setEnabled(false)
      return
    }
    void load()
  }, [auth.hasChecked, auth.isAuthenticated, load])

  const markCopied = (id: string) => {
    setCopied(id)
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600)
  }

  const fields = data?.fields || []
  const groups = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase()
    const grouped = new Map<string, FieldDef[]>()
    for (const f of fields) {
      if (
        q &&
        !f.label.toLowerCase().includes(q) &&
        !f.key.toLowerCase().includes(q) &&
        !(f.hint || '').toLowerCase().includes(q)
      ) {
        continue
      }
      const list = grouped.get(f.group) || []
      list.push(f)
      grouped.set(f.group, list)
    }
    return grouped
  }, [fields, fieldQuery])

  const currentMap = maps[tab]
  const detected = data?.detected_keys?.[tab] || []
  const hints = data?.mapping_hints?.[tab] || {}
  const endpointUrl = data?.endpoints?.[tab] || ''
  const endpointDef = TAB_META.find((t) => t.id === tab)

  const setCurrentMap = (next: MappingState) => {
    setMaps((m) => ({ ...m, [tab]: next }))
  }

  const toggleField = (key: string) => {
    const selected = currentMap.selected.includes(key)
      ? currentMap.selected.filter((k) => k !== key)
      : [...currentMap.selected, key]
    setCurrentMap({ ...currentMap, selected })
  }

  const selectAll = () => {
    setCurrentMap({ ...currentMap, selected: fields.map((f) => f.key) })
  }
  const selectNone = () => {
    setCurrentMap({ ...currentMap, selected: [] })
  }
  const selectRecommended = () => {
    const rec = data?.recommended?.[tab] || []
    setCurrentMap({ ...currentMap, selected: [...rec] })
  }

  const setPath = (kc: string, path: string) => {
    setCurrentMap({
      ...currentMap,
      map: { ...currentMap.map, [kc]: path },
    })
  }

  const handleSave = () =>
    saveFb.runSave(async () => {
      setError(null)
      setSuccess(null)
      try {
        await axios.put(
          '/api/reseller/kumudu-link',
          {
            store_id: storeId,
            catalogue_mapping: maps.catalogue_creation,
            product_mapping: maps.product_creation,
            stock_mapping: maps.stock,
          },
          { withCredentials: true },
        )
        setSuccess('Saved. Kumudu can now send to the three URLs using your API key.')
        await load()
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Failed to save mapping.'
        setError(msg)
        throw new Error(msg)
      }
    })

  const applySuggestions = (overwrite: boolean) => {
    const src = { ...hints, ...pendingSuggestions }
    const nextMap = { ...currentMap.map }
    for (const [kc, path] of Object.entries(src)) {
      if (!path) continue
      if (overwrite || !String(nextMap[kc] || '').trim()) {
        nextMap[kc] = path
      }
    }
    setCurrentMap({ ...currentMap, map: nextMap })
    setSuccess('Suggestions filled in the form. Review each path, then click Save mappings.')
    setPendingSuggestions({})
  }

  const deleteEvent = async (eventId: number) => {
    if (!window.confirm('Remove this call from Recent Kumudu calls? This cannot be undone.')) return
    setDeletingEventId(eventId)
    setError(null)
    try {
      await axios.delete(`/api/reseller/kumudu-link/events/${eventId}`, { withCredentials: true })
      setData((d) => (d ? { ...d, events: (d.events || []).filter((e) => e.id !== eventId) } : d))
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not delete this call.',
      )
    } finally {
      setDeletingEventId(null)
    }
  }

  const clearAllEvents = async () => {
    if (!window.confirm('Clear all Recent Kumudu calls for your shop?')) return
    try {
      await axios.delete('/api/reseller/kumudu-link/events', { withCredentials: true })
      setData((d) => (d ? { ...d, events: [] } : d))
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not clear call history.',
      )
    }
  }

  const useEventPayloadAsSample = (payload: unknown) => {
    setSampleText(JSON.stringify(payload, null, 2))
    setSuccess('JSON copied into the sample box. Click Detect fields & preview for path suggestions.')
  }

  const handleSample = async () => {
    setBusySample(true)
    setError(null)
    setPreview(null)
    try {
      let payload: unknown = sampleText.trim()
      if (!payload) {
        setError('Paste a JSON sample from Kumudu first.')
        return
      }
      try {
        payload = JSON.parse(String(payload))
      } catch {
        setError('Sample must be valid JSON.')
        return
      }
      const sampleRes = await axios.post<{
        detected_keys: string[]
        suggested_map: Record<string, string>
        mapping_hints?: Record<string, string>
      }>(
        '/api/reseller/kumudu-link/sample',
        { endpoint: tab, payload },
        { withCredentials: true },
      )
      const suggested =
        sampleRes.data.mapping_hints || sampleRes.data.suggested_map || {}
      setPendingSuggestions(suggested)
      setData((d) =>
        d
          ? {
              ...d,
              detected_keys: {
                ...d.detected_keys,
                [tab]: sampleRes.data.detected_keys || d.detected_keys[tab],
              },
              mapping_hints: {
                ...(d.mapping_hints || {
                  catalogue_creation: {},
                  product_creation: {},
                  stock: {},
                }),
                [tab]: suggested,
              },
            }
          : d,
      )
      const previewMap: MappingState = {
        ...currentMap,
        map: { ...currentMap.map },
      }
      for (const [kc, path] of Object.entries(suggested)) {
        if (path && !String(previewMap.map[kc] || '').trim()) previewMap.map[kc] = path
      }
      const prev = await axios.post<{ preview: Record<string, unknown>[] }>(
        '/api/reseller/kumudu-link/preview',
        {
          endpoint: tab,
          payload,
          mapping: previewMap,
        },
        { withCredentials: true },
      )
      setPreview(prev.data.preview || [])
      setSuccess(
        'Sample stored. Use “Apply suggestions” below or tap “Use suggestion” on each field, then Save mappings.',
      )
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not read that sample.',
      )
    } finally {
      setBusySample(false)
    }
  }

  const regenerateKey = async () => {
    if (!window.confirm('Generate a new API key? Kumudu must use the new key after this.')) return
    try {
      const res = await axios.post<{ api_key: string }>(
        '/api/reseller/kumudu-link/regenerate-key',
        {},
        { withCredentials: true },
      )
      setData((d) => (d ? { ...d, api_key: res.data.api_key } : d))
      setShowKey(true)
      setSuccess('New API key generated. Copy it for Kumudu.')
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Could not regenerate key.',
      )
    }
  }

  if (!auth.hasChecked || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-jewelry-black,#1a1814)]/55">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">
          Sign in to manage the Kumudu software stock link.
        </p>
        <button
          type="button"
          onClick={() => openLoginModal(RESELLER_KUMUDU_STOCK_LINK_PATH)}
          className="kc-btn-theme mt-4 min-h-[44px]"
        >
          Sign in
        </button>
      </div>
    )
  }

  if (enabled === false) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]">
          Kumudu software stock link is not enabled for your shop. Ask KC admin to turn it on in B2B
          Clients → Reseller profile.
        </p>
        <Link
          href={PROFILE_PATH}
          className="mt-4 inline-flex text-sm font-semibold text-[var(--kc-accent,#c41e3a)] underline"
        >
          Back to profile
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-slate-900,#faf8f4)] text-[var(--color-jewelry-black,#1a1814)]">
      <main className="mx-auto max-w-3xl px-4 py-6 kc-pb-mobile-nav md:py-8">
        <Link
          href={PROFILE_PATH}
          className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]/70"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Profile
        </Link>

        <header className="mb-5 flex items-start gap-3">
          <div className="rounded-xl border border-[var(--kc-accent,#c41e3a)]/20 bg-[var(--kc-accent,#c41e3a)]/10 p-2.5">
            <Link2 className="size-6 text-[var(--kc-accent,#c41e3a)]" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-jewelry-black,#1a1814)]">
              Kumudu software stock link
            </h1>
          </div>
        </header>

        {error ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {success}
          </p>
        ) : null}

        <section className="kc-profile-card mb-4 space-y-3 rounded-2xl p-4">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Connection</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              Store ID
            </span>
            <input
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)]"
              placeholder="e.g. JP01"
            />
            <span className="mt-1 block text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
              You choose this code (or agree with Kumudu on their branch code). Save it here, then Kumudu
              must send the same <code className="font-mono text-[11px]">store_id</code> in each POST. Leave
              blank until agreed — health then shows <code className="font-mono text-[11px]">null</code>.
            </span>
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
              API key — send as header <code className="font-mono">x-api-key</code>
            </span>
            <div className="flex gap-2">
              <input
                readOnly
                type={showKey ? 'text' : 'password'}
                value={data?.api_key || ''}
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 font-mono text-xs text-[var(--color-jewelry-black,#1a1814)]"
              />
              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                onClick={async () => {
                  if (data?.api_key && (await copyText(data.api_key))) markCopied('key')
                }}
                aria-label="Copy API key"
              >
                {copied === 'key' ? <Check className="size-4 text-emerald-700" /> : <Copy className="size-4" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void regenerateKey()}
              className="mt-2 inline-flex min-h-[40px] items-center gap-1.5 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70"
            >
              <RefreshCw className="size-3.5" />
              Generate new key
            </button>
          </div>
          <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/65">
            View what Kumudu sent (GET, same <code className="font-mono">x-api-key</code> as health).
          </p>
          {(
            [
              ['last_received_catalogue', 'Last catalogue JSON (GET)'],
              ['last_received_products', 'Last products JSON (GET)'],
              ['last_received_stock', 'Last stock JSON (GET)'],
            ] as const
          ).map(([key, label]) =>
            data?.endpoints?.[key] ? (
              <div key={key}>
                <span className="mb-1 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                  {label}
                </span>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={data.endpoints[key]}
                    className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]"
                  />
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                    onClick={async () => {
                      if (data.endpoints[key] && (await copyText(data.endpoints[key]))) markCopied(key)
                    }}
                    aria-label={`Copy ${label}`}
                  >
                    {copied === key ? (
                      <Check className="size-4 text-emerald-700" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : null,
          )}
          {data?.endpoints?.health ? (
            <div>
              <span className="mb-1 block text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/60">
                Health check (GET)
              </span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={data.endpoints.health}
                  className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]"
                />
                <button
                  type="button"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
                  onClick={async () => {
                    if (data.endpoints.health && (await copyText(data.endpoints.health))) markCopied('health')
                  }}
                  aria-label="Copy health URL"
                >
                  {copied === 'health' ? (
                    <Check className="size-4 text-emerald-700" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-1">
          {TAB_META.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setPreview(null)
                setFieldQuery('')
                setPendingSuggestions({})
              }}
              className={`min-h-[44px] rounded-xl text-xs font-semibold sm:text-sm ${
                tab === t.id
                  ? 'bg-[var(--kc-accent,#c41e3a)] text-white'
                  : 'text-[var(--color-jewelry-black,#1a1814)]/70'
              }`}
            >
              {t.short}
            </button>
          ))}
        </div>

        <section className="kc-profile-card mb-4 space-y-3 rounded-2xl p-4">
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            {endpointDef?.short} API
          </p>
          <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/65">
            Kumudu must call this URL with <span className="font-semibold">POST</span> and JSON body.
            A browser or GET test may show 405 — that is normal. Use Health check above for GET.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={endpointUrl}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]"
            />
            <button
              type="button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white"
              onClick={async () => {
                if (endpointUrl && (await copyText(endpointUrl))) markCopied('url')
              }}
              aria-label="Copy endpoint URL"
            >
              {copied === 'url' ? <Check className="size-4 text-emerald-700" /> : <Copy className="size-4" />}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
            >
              Deselect all
            </button>
            <button
              type="button"
              onClick={selectRecommended}
              className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
            >
              Recommended
            </button>
            <span className="self-center text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
              {currentMap.selected.length} selected
            </span>
          </div>

          <input
            value={fieldQuery}
            onChange={(e) => setFieldQuery(e.target.value)}
            placeholder="Search your field names"
            className="min-h-[44px] w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-sm text-[var(--color-jewelry-black,#1a1814)]"
          />

          <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
            {[...groups.entries()].map(([group, list]) => (
              <div key={group}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                  {group}
                </p>
                <div className="space-y-2">
                  {list.map((f) => {
                    const on = currentMap.selected.includes(f.key)
                    return (
                      <div
                        key={f.key}
                        className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2.5"
                      >
                        <label className="flex min-h-[40px] items-start gap-3">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleField(f.key)}
                            className="mt-1 size-4 accent-[var(--kc-accent,#c41e3a)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                              {f.label}
                            </span>
                            <span className="block font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]/45">
                              {f.key}
                              {f.hint ? ` · ${f.hint}` : ''}
                            </span>
                          </span>
                        </label>
                        {on ? (
                          <div className="mt-2 pl-7">
                            <input
                              list={`kumudu-keys-${tab}`}
                              value={currentMap.map[f.key] || ''}
                              onChange={(e) => setPath(f.key, e.target.value)}
                              placeholder="Kumudu field path, e.g. data.StyleCode"
                              className="min-h-[40px] w-full rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-2.5 font-mono text-xs text-[var(--color-jewelry-black,#1a1814)]"
                            />
                            {(() => {
                              const suggestion =
                                pendingSuggestions[f.key] || hints[f.key] || ''
                              const current = String(currentMap.map[f.key] || '').trim()
                              if (!suggestion || current === suggestion) return null
                              return (
                                <button
                                  type="button"
                                  onClick={() => setPath(f.key, suggestion)}
                                  className="mt-1.5 text-left text-[11px] font-medium text-[var(--kc-accent,#c41e3a)] underline"
                                >
                                  Use suggestion: <span className="font-mono">{suggestion}</span>
                                </button>
                              )
                            })()}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <datalist id={`kumudu-keys-${tab}`}>
            {detected.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>

          <div>
            <p className="mb-1 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]/70">
              Paste a Kumudu JSON sample to auto-detect their field names
            </p>
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              rows={5}
              placeholder='{ "store_id": "", "data": { "StyleCode": "CURB", "ItemName": "..." } }'
              className="w-full rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2 font-mono text-xs text-[var(--color-jewelry-black,#1a1814)]"
            />
            <button
              type="button"
              onClick={() => void handleSample()}
              disabled={busySample}
              className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-4 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]"
            >
              {busySample ? <Loader2 className="size-4 animate-spin" /> : null}
              Detect fields &amp; preview
            </button>
            {Object.keys({ ...hints, ...pendingSuggestions }).length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySuggestions(false)}
                  className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
                >
                  Apply suggestions (empty fields only)
                </button>
                <button
                  type="button"
                  onClick={() => applySuggestions(true)}
                  className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
                >
                  Apply all suggestions
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/60">
              Kumudu live POSTs use only paths you save below — nothing is auto-mapped on the server until then.
            </p>
            {tab === 'catalogue_creation' ? (
              <p className="mt-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/80">
                Map <span className="font-mono">MetalName</span>, <span className="font-mono">Item</span>,{' '}
                <span className="font-mono">Shortcode</span>, <span className="font-mono">Design</span> — the server
                applies family rules after save:{' '}
                <strong className="font-medium">Emerald idol</strong> → style{' '}
                <span className="font-mono">EMERALD IDOLS</span>, SKU = Shortcode (e.g. GANESH), name = Design;{' '}
                <strong className="font-medium">Pitara…</strong> → style <span className="font-mono">PITARA</span>,
                SKU = full Item (e.g. PITARA BANGLE), name = Design;{' '}
                <strong className="font-medium">Air…</strong> → style <span className="font-mono">AIR COLLECTION</span>,
                SKU = full Item, name = Design. Other items use your mapped paths only. Response includes{' '}
                <span className="font-mono">catalogue_sync_id</span> for products.
              </p>
            ) : null}
            {tab === 'product_creation' ? (
              <p className="mt-2 rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-[11px] leading-relaxed text-[var(--color-jewelry-black,#1a1814)]/80">
                Send <span className="font-mono">catalogue_sync_id</span> from catalogue response (read automatically
                even if unchecked). ERP rows: <span className="font-mono">Shortcode</span> → SKU subcategory,{' '}
                <span className="font-mono">Design</span> → product name + web SKU (barcode auto if not mapped). Cloud
                rows: map <span className="font-mono">catalogue</span>, <span className="font-mono">sku</span>,{' '}
                <span className="font-mono">name</span>. Style comes from the linked catalogue (e.g. Jingle). Stock uses{' '}
                <span className="font-mono">product_sync_id</span>.
              </p>
            ) : null}
          </div>

          {preview ? (
            <div className="rounded-xl bg-[var(--color-slate-900,#f7f4ef)] p-3">
              <p className="mb-1 text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Mapped preview
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-jewelry-black,#1a1814)]/80">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>

        <div className="mb-6">
          <SaveFeedbackButton
            saving={saveFb.saving}
            saved={saveFb.saved}
            onClick={() => void handleSave()}
            className="kc-btn-theme flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
          >
            Save mappings
          </SaveFeedbackButton>
        </div>

        {data?.events?.length ? (
          <section className="kc-profile-card rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                Recent Kumudu calls
              </p>
              <button
                type="button"
                onClick={() => void clearAllEvents()}
                className="min-h-[40px] rounded-full border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 text-xs font-medium text-[var(--color-jewelry-black,#1a1814)]"
              >
                Clear all
              </button>
            </div>
            <ul className="space-y-2">
              {data.events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
                      {ev.endpoint} · {ev.status}
                    </p>
                    <button
                      type="button"
                      disabled={deletingEventId === ev.id}
                      onClick={() => void deleteEvent(ev.id)}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/70"
                      aria-label="Delete this call"
                    >
                      {deletingEventId === ev.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                  {ev.summary ? (
                    <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/60">{ev.summary}</p>
                  ) : null}
                  <p className="mt-0.5 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/40">
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                  {ev.payload != null ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]/75">
                        View JSON Kumudu sent
                      </summary>
                      <div className="mt-1 flex justify-end">
                        <button
                          type="button"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-white px-2.5 text-[11px] font-medium text-[var(--color-jewelry-black,#1a1814)]"
                          onClick={async (e) => {
                            e.preventDefault()
                            const text = JSON.stringify(ev.payload, null, 2)
                            if (await copyText(text)) markCopied(`event-json-${ev.id}`)
                          }}
                        >
                          {copied === `event-json-${ev.id}` ? (
                            <Check className="size-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          Copy JSON
                        </button>
                      </div>
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] p-2 font-mono text-[10px] text-[var(--color-jewelry-black,#1a1814)]">
                        {JSON.stringify(ev.payload, null, 2)}
                      </pre>
                      <button
                        type="button"
                        onClick={() => useEventPayloadAsSample(ev.payload)}
                        className="mt-2 text-[11px] font-medium text-[var(--kc-accent,#c41e3a)] underline"
                      >
                        Use this JSON for mapping
                      </button>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  )
}

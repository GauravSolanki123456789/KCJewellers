'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { Check, Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr } from '@/components/reseller/erp/erp-ui'
import { formatPvGrams } from '@/lib/erp-pv-weight'

type RunningTag = {
  kind: 'jewellery' | 'articles'
  label: string
  barcode: string
  balance_gm: number
  generated_at?: string
}

const KIND_META: { kind: 'jewellery' | 'articles'; title: string; hint: string; shortcut: string }[] = [
  {
    kind: 'jewellery',
    title: 'Silver jewellery',
    hint: 'Used when you type S + Enter on Scan & bill',
    shortcut: 'S',
  },
  {
    kind: 'articles',
    title: 'Silver articles',
    hint: 'Used when you type A + Enter on Scan & bill',
    shortcut: 'A',
  },
]

function balanceClass(gm: number): string {
  if (gm < 0) return 'text-rose-800'
  if (gm > 0) return 'text-emerald-800'
  return 'text-[var(--color-jewelry-black,#1a1814)]'
}

export function ErpRunningTagsWorkspace() {
  const [tags, setTags] = useState<{ jewellery: RunningTag | null; articles: RunningTag | null }>({
    jewellery: null,
    articles: null,
  })
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgTone, setMsgTone] = useState<'ok' | 'err'>('ok')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await axios.get<{ tags: { jewellery: RunningTag | null; articles: RunningTag | null } }>(
        '/api/reseller/erp/running-tags',
        { params: { refresh: 1 } },
      )
      setTags({
        jewellery: res.data.tags?.jewellery || null,
        articles: res.data.tags?.articles || null,
      })
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const generate = async (kind: 'jewellery' | 'articles') => {
    if (generating) return
    setGenerating(kind)
    setMsg(null)
    try {
      const res = await axios.post<{ tag: RunningTag }>('/api/reseller/erp/running-tags/generate', { kind })
      setTags((prev) => ({ ...prev, [kind]: res.data.tag }))
      setMsgTone('ok')
      setMsg(`${res.data.tag.label} tag created. Copy it for Excel stock-in.`)
    } catch (e) {
      setMsgTone('err')
      setMsg(erpErr(e))
    } finally {
      setGenerating(null)
    }
  }

  const copyBarcode = async (barcode: string) => {
    try {
      await navigator.clipboard.writeText(barcode)
      setCopied(barcode)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setMsgTone('err')
      setMsg('Could not copy. Select the number and copy it manually.')
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} space-y-2`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-jewelry-black,#1a1814)]">Running tags</h2>
          </div>
          <button type="button" className={erpBtnGhost} disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh
          </button>
        </div>
        {msg ? (
          <p
            role="status"
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              msgTone === 'err'
                ? 'border-rose-200 bg-rose-50 text-rose-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            {msg}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {KIND_META.map((meta) => {
          const tag = tags[meta.kind]
          const gm = tag ? Number(tag.balance_gm) || 0 : 0
          return (
            <div key={meta.kind} className={`${erpCardCls} space-y-3`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">{meta.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-jewelry-black,#1a1814)]/55">{meta.hint}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-1 font-mono text-[11px] font-semibold text-emerald-900">
                  {meta.shortcut} Enter
                </span>
              </div>

              {tag ? (
                <>
                  <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#faf8f4)] px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                      9-digit barcode
                    </p>
                    <p className="mt-1 font-mono text-xl font-semibold tracking-wide text-[var(--color-jewelry-black,#1a1814)] sm:text-2xl">
                      {tag.barcode}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                      Pending balance
                    </p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${balanceClass(gm)}`}>
                      {formatPvGrams(gm)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={erpBtnPrimary}
                    onClick={() => void copyBarcode(tag.barcode)}
                  >
                    {copied === tag.barcode ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied === tag.barcode ? 'Copied' : 'Copy barcode'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={erpBtnPrimary}
                  disabled={!!generating}
                  onClick={() => void generate(meta.kind)}
                >
                  {generating === meta.kind ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate 9-digit tag
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

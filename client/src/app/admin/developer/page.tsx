'use client'

import { useState, useEffect, useCallback } from 'react'
import axios from '@/lib/axios'
import AdminGuard from '@/components/AdminGuard'
import Link from 'next/link'
import {
  ArrowLeft,
  Code2,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Check,
  AlertTriangle,
  KeyRound,
  ShieldCheck,
  Zap,
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function DeveloperApiPage() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [confirmGenerate, setConfirmGenerate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const fetchKey = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get(`${API}/api/admin/developer/key`, { withCredentials: true })
      setApiKey(res.data?.apiKey ?? null)
    } catch {
      setError('Failed to load API key. Ensure you are logged in as admin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKey()
  }, [fetchKey])

  const handleCopy = async () => {
    if (!apiKey) return
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — please select and copy manually.')
    }
  }

  const handleGenerate = async () => {
    if (!confirmGenerate) {
      setConfirmGenerate(true)
      return
    }
    setGenerating(true)
    setError(null)
    setSuccessMsg(null)
    setConfirmGenerate(false)
    try {
      const res = await axios.post(`${API}/api/admin/developer/key/generate`, {}, { withCredentials: true })
      setApiKey(res.data?.apiKey ?? null)
      setRevealed(true)
      setSuccessMsg('New API key generated. Copy it now — it will be masked when you leave this page.')
    } catch {
      setError('Failed to generate API key.')
    } finally {
      setGenerating(false)
    }
  }

  const maskedKey = apiKey ? '•'.repeat(32) + apiKey.slice(-8) : null

  return (
    <AdminGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="max-w-2xl mx-auto px-4 py-8 pb-24">
          {/* Back */}
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-yellow-500 transition-colors mb-6"
          >
            <ArrowLeft className="size-4" /> Back to Dashboard
          </Link>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20">
                <Code2 className="size-6 text-violet-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">Developer API Settings</h1>
                <p className="text-sm text-slate-400">Use this API Key to link your Jewelry ERP Software.</p>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="mb-6 grid sm:grid-cols-3 gap-3">
            {[
              { icon: KeyRound,    color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', title: 'Authenticate', desc: 'Send your key via x-api-key header' },
              { icon: Zap,         color: 'text-cyan-400',   bg: 'bg-cyan-500/10 border-cyan-500/20',     title: 'Push Products', desc: 'POST /api/sync/receive with your payload' },
              { icon: ShieldCheck, color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20',title: 'Secure',       desc: 'Key is hashed and never exposed in logs' },
            ].map(({ icon: Icon, color, bg, title, desc }) => (
              <div key={title} className={`rounded-xl border p-4 ${bg}`}>
                <Icon className={`size-5 ${color} mb-2`} />
                <p className={`text-sm font-semibold ${color}`}>{title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>

          {/* Main card */}
          <div className="bg-slate-900/60 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center gap-2">
              <KeyRound className="size-5 text-violet-400" />
              <h2 className="font-semibold text-slate-200">API Key</h2>
            </div>

            <div className="p-5 space-y-5">
              {/* Status messages */}
              {error && (
                <div className="flex items-start gap-3 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-300">
                  <Check className="size-4 shrink-0 mt-0.5" />
                  {successMsg}
                </div>
              )}

              {/* Key display */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Current API Key</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      readOnly
                      value={
                        loading
                          ? 'Loading…'
                          : apiKey == null
                          ? 'No key generated yet'
                          : revealed
                          ? apiKey
                          : (maskedKey ?? '')
                      }
                      className={`w-full bg-slate-800/80 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm outline-none select-all
                        ${loading || apiKey == null ? 'text-slate-500 italic' : 'text-slate-200 tracking-widest'}
                      `}
                    />
                  </div>

                  {/* Reveal toggle */}
                  <button
                    onClick={() => setRevealed((r) => !r)}
                    disabled={!apiKey || loading}
                    title={revealed ? 'Hide key' : 'Reveal key'}
                    className="p-3 rounded-xl bg-slate-800/80 border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>

                  {/* Copy */}
                  <button
                    onClick={handleCopy}
                    disabled={!apiKey || loading}
                    title="Copy key to clipboard"
                    className="p-3 rounded-xl bg-slate-800/80 border border-white/10 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-emerald-400 mt-1.5 ml-1">Copied to clipboard!</p>
                )}
              </div>

              {/* Usage hint */}
              {apiKey && (
                <div className="rounded-xl bg-slate-800/50 border border-white/5 p-4 text-xs font-mono text-slate-400 space-y-1 leading-relaxed">
                  <p className="text-slate-500 font-sans font-medium mb-2 text-xs not-italic">Example ERP request:</p>
                  <p><span className="text-violet-400">POST</span> {API}/api/sync/receive</p>
                  <p><span className="text-yellow-400">x-api-key:</span> <span className="text-slate-300">{revealed && apiKey ? apiKey : '••••••••••••••••••••••••••••••••'}</span></p>
                  <p><span className="text-yellow-400">Content-Type:</span> application/json</p>
                  <p className="text-slate-500 pt-1">{"{ \"products\": [ { \"styleCode\": \"RING01\", \"sku\": \"R001\", ... } ] }"}</p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-white/10" />

              {/* Generate section */}
              <div>
                <p className="text-xs font-medium text-slate-400 mb-3">
                  {apiKey ? 'Regenerate API Key' : 'Generate your first API Key'}
                </p>

                {confirmGenerate && (
                  <div className="mb-3 flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                    <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-300">This will break existing ERP connections.</p>
                      <p className="text-slate-400 mt-0.5 text-xs">
                        Any ERP software currently using the old key will fail until you update it with the new one.
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-xs font-semibold transition-colors disabled:opacity-60"
                        >
                          {generating ? 'Generating…' : 'Yes, generate new key'}
                        </button>
                        <button
                          onClick={() => setConfirmGenerate(false)}
                          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!confirmGenerate && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating || loading}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed
                      ${apiKey
                        ? 'bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 hover:border-red-500/50 text-red-400'
                        : 'bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 hover:border-violet-500/50 text-violet-300'
                      }
                    `}
                  >
                    <RefreshCw className={`size-4 ${generating ? 'animate-spin' : ''}`} />
                    {generating
                      ? 'Generating…'
                      : apiKey
                      ? 'Generate New API Key'
                      : 'Generate API Key'}
                  </button>
                )}

                {apiKey && !confirmGenerate && (
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <AlertTriangle className="size-3 text-amber-500" />
                    This will invalidate the current key and break existing ERP connections.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Payload reference */}
          <div className="mt-6 bg-slate-900/40 backdrop-blur border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-semibold text-slate-300 text-sm">ERP Payload Reference</h3>
              <p className="text-xs text-slate-500 mt-0.5">Each item in the <code className="text-violet-400">products</code> array supports these fields.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-800/30">
                    <th className="text-left py-2.5 px-4 text-slate-400 font-medium">Field</th>
                    <th className="text-left py-2.5 px-4 text-slate-400 font-medium">Required</th>
                    <th className="text-left py-2.5 px-4 text-slate-400 font-medium">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ['styleCode',   'Yes', 'Maps to Style Code → web_categories'],
                    ['sku',         'Yes*','Maps to SKU Code → web_subcategories (*or barcode)'],
                    ['barcode',     'Yes*','Unique product identifier for UPSERT (*or sku)'],
                    ['name',        'Yes', 'Product display name'],
                    ['netWeight',   'No',  'Net weight in grams'],
                    ['grossWeight', 'No',  'Gross weight in grams'],
                    ['purity',      'No',  'e.g. 22K, 18K, 925'],
                    ['imageUrl',    'No',  'Full HTTPS URL to product image'],
                    ['metalType',   'No',  'gold / silver'],
                  ].map(([field, req, desc]) => (
                    <tr key={field} className="hover:bg-white/5 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-violet-400">{field}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          req === 'Yes'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : req === 'Yes*'
                            ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
                            : 'bg-slate-700/50 text-slate-400 border border-white/10'
                        }`}>{req}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </AdminGuard>
  )
}

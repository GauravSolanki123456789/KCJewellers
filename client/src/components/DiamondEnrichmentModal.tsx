'use client'

import { useState, useEffect } from 'react'
import axios from '@/lib/axios'
import { X, FileUp, Gem } from 'lucide-react'

type DiamondEnrichmentModalProps = {
  open: boolean
  onClose: () => void
  product: {
    barcode?: string
    sku?: string
    name?: string
    item_name?: string
    short_name?: string
    diamond_carat?: string
    diamond_cut?: string
    diamond_color?: string
    diamond_clarity?: string
    certificate_url?: string
  }
  onSaved?: () => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export default function DiamondEnrichmentModal({
  open,
  onClose,
  product,
  onSaved,
}: DiamondEnrichmentModalProps) {
  const [diamondCarat, setDiamondCarat] = useState('')
  const [diamondCut, setDiamondCut] = useState('')
  const [diamondColor, setDiamondColor] = useState('')
  const [diamondClarity, setDiamondClarity] = useState('')
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const barcode = product.barcode || product.sku || ''
  const displayName = product.name || product.item_name || product.short_name || barcode

  useEffect(() => {
    if (open && product) {
      setDiamondCarat(product.diamond_carat ?? '')
      setDiamondCut(product.diamond_cut ?? '')
      setDiamondColor(product.diamond_color ?? '')
      setDiamondClarity(product.diamond_clarity ?? '')
      setCertificateFile(null)
      setError(null)
    }
  }, [open, product])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode) return
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('diamond_carat', diamondCarat)
      formData.append('diamond_cut', diamondCut)
      formData.append('diamond_color', diamondColor)
      formData.append('diamond_clarity', diamondClarity)
      if (certificateFile) {
        formData.append('certificate', certificateFile)
      }
      await axios.post(
        `${API_URL}/api/admin/products/${encodeURIComponent(barcode)}/diamond-details`,
        formData,
        { withCredentials: true },
      )
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="diamond-enrichment-title"
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-slate-700/80 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Gem className="size-5 text-amber-500" />
            <h2 id="diamond-enrichment-title" className="text-lg font-semibold text-slate-100">
              Diamond Enrichment
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {displayName && (
            <p className="text-sm text-slate-400 truncate">{displayName}</p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Carat</label>
            <input
              type="text"
              value={diamondCarat}
              onChange={(e) => setDiamondCarat(e.target.value)}
              placeholder="e.g. 1.5"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Cut</label>
            <input
              type="text"
              value={diamondCut}
              onChange={(e) => setDiamondCut(e.target.value)}
              placeholder="e.g. Round Brilliant, Princess"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Color</label>
            <input
              type="text"
              value={diamondColor}
              onChange={(e) => setDiamondColor(e.target.value)}
              placeholder="e.g. D, E, F"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Clarity</label>
            <input
              type="text"
              value={diamondClarity}
              onChange={(e) => setDiamondClarity(e.target.value)}
              placeholder="e.g. VVS1, VS2"
              className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Certificate (PDF or Image)</label>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setCertificateFile(e.target.files?.[0] ?? null)}
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-100 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-500/20 file:text-amber-400 file:text-sm focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none"
              />
              <FileUp className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-slate-500 pointer-events-none" />
            </div>
            {product.certificate_url && !certificateFile && (
              <p className="text-xs text-emerald-400 mt-1">Current certificate on file</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-600 text-slate-200 font-medium hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60 transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { erpBtnGhost, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { fetchErpGstinDetails, type ErpGstinLookupDetails } from '@/lib/erp-gstin-lookup'

type Props = {
  value: string
  onChange: (gstin: string) => void
  onFetched: (details: ErpGstinLookupDetails) => void
  inputClassName?: string
  label?: string
  disabled?: boolean
}

export function ErpGstinFetchField({
  value,
  onChange,
  onFetched,
  inputClassName = erpInputCls,
  label = 'GSTIN',
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const fetchDetails = async () => {
    const g = value.trim().toUpperCase()
    if (!g || busy) return
    setBusy(true)
    setErr(null)
    try {
      const details = await fetchErpGstinDetails(g)
      onChange(details.gstin)
      onFetched(details)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e instanceof Error ? e.message : 'Could not fetch GST details')
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      {label ? (
        <label className="mb-0.5 block text-[10px] font-semibold uppercase text-[var(--color-jewelry-black,#1a1814)]/45">
          {label}
        </label>
      ) : null}
      <div className="flex gap-2">
        <input
          className={`${inputClassName} min-h-[44px] flex-1 py-2 text-sm font-mono`}
          value={value}
          disabled={disabled || busy}
          placeholder="15-character GSTIN"
          onChange={(e) => {
            setErr(null)
            onChange(e.target.value.toUpperCase())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void fetchDetails()
            }
          }}
        />
        <button
          type="button"
          className={`${erpBtnGhost} min-h-[44px] shrink-0 gap-1.5 px-3 text-xs font-semibold`}
          disabled={disabled || busy || !value.trim()}
          onClick={() => void fetchDetails()}
          title="Fetch legal name, address, state & PAN from GST portal"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Fetch GST
        </button>
      </div>
      {err ? <p className="text-xs text-rose-700">{err}</p> : null}
    </div>
  )
}

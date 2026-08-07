'use client'

import { useMemo, useState } from 'react'
import axios from '@/lib/axios'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { erpBtnGhost, erpBtnPrimary, erpErr, type ErpStockPiece } from '@/components/reseller/erp/erp-ui'
import {
  downloadTsplLabels,
  openBrowserTagLabelPrint,
  printTagLabelsApi,
  type TagLabelPrintResult,
} from '@/lib/erp-tag-label-print'
import { Download, Loader2, Printer, Wifi } from 'lucide-react'
import Link from 'next/link'
import { resellerErpModulePath } from '@/lib/reseller-erp-modules'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pieces: ErpStockPiece[]
  title?: string
  subtitle?: string | null
}

export function ErpTagLabelPrintSheet({
  open,
  onOpenChange,
  pieces,
  title = 'Print tag labels',
  subtitle = null,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastResults, setLastResults] = useState<TagLabelPrintResult[] | null>(null)
  const [companyCode, setCompanyCode] = useState('KC925')

  const pieceIds = useMemo(() => pieces.map((p) => p.id).filter((id) => id > 0), [pieces])

  const loadCompanyCode = async () => {
    try {
      const res = await axios.get<{ settings?: { hardware?: { companyCode?: string } } }>(
        '/api/reseller/erp/settings',
      )
      const code = res.data.settings?.hardware?.companyCode
      if (code) setCompanyCode(code)
    } catch {
      /* optional */
    }
  }

  const onOpen = (next: boolean) => {
    if (next) void loadCompanyCode()
    else {
      setError('')
      setLastResults(null)
    }
    onOpenChange(next)
  }

  const printThermal = async () => {
    if (!pieceIds.length) return
    setBusy(true)
    setError('')
    try {
      const res = await printTagLabelsApi({ pieceIds })
      setLastResults(res.results)
      const ok = res.results.filter((r) => r.printed).length
      if (res.printerConfigured) {
        if (ok === res.results.length) onOpenChange(false)
      } else {
        downloadTsplLabels(res.results)
      }
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  const printBrowser = () => {
    openBrowserTagLabelPrint(pieces, companyCode)
  }

  const downloadTspl = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await printTagLabelsApi({ pieceIds })
      setLastResults(res.results)
      downloadTsplLabels(res.results)
    } catch (e) {
      setError(erpErr(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[var(--color-slate-700,#e8e4df)] bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--color-jewelry-black,#1a1814)]">
            <Printer className="size-5 shrink-0 text-emerald-700" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {subtitle ? (
          <p className="text-sm text-[var(--color-jewelry-black,#1a1814)]/65">{subtitle}</p>
        ) : null}

        <ul className="max-h-[40vh] space-y-2 overflow-y-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] p-2">
          {pieces.map((p) => (
            <li
              key={p.id || p.barcode}
              className="rounded-lg bg-[var(--color-slate-900,#faf8f4)] px-3 py-2 text-sm"
            >
              <p className="font-bold text-emerald-900">{p.barcode}</p>
              <p className="text-[var(--color-jewelry-black,#1a1814)]/70">
                {p.product_name || p.item_code || '—'} · {p.pcs ?? 1} pcs · {p.avg_weight ?? '—'}g
                {p.gross_weight != null ? ` · gross ${p.gross_weight}g` : ''}
              </p>
              {p.bags ? (
                <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">Bags: {p.bags}</p>
              ) : null}
            </li>
          ))}
        </ul>

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        ) : null}

        {lastResults ? (
          <p className="text-xs text-emerald-800">
            {lastResults.filter((r) => r.printed).length} sent to printer
            {lastResults.some((r) => r.tspl) ? ' · TSPL files ready for download' : ''}
          </p>
        ) : null}

        <p className="text-xs text-[var(--color-jewelry-black,#1a1814)]/50">
          Configure your TSC / thermal printer in{' '}
          <Link href={resellerErpModulePath('hardware')} className="font-semibold text-emerald-800 underline">
            Hardware
          </Link>{' '}
          for direct network printing.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <button type="button" className={erpBtnPrimary} disabled={busy || !pieceIds.length} onClick={() => void printThermal()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wifi className="size-4" />}
            Send to label printer
          </button>
          <button type="button" className={erpBtnGhost} disabled={busy || !pieces.length} onClick={printBrowser}>
            <Printer className="size-4" />
            Browser print (100×50 mm)
          </button>
          <button type="button" className={erpBtnGhost} disabled={busy || !pieceIds.length} onClick={() => void downloadTspl()}>
            <Download className="size-4" />
            Download TSPL files
          </button>
          <button type="button" className={erpBtnGhost} onClick={() => onOpenChange(false)}>
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

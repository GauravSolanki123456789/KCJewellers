import axios from '@/lib/axios'
import {
  getPrinterProfileById,
  migrateHardwareSettings,
  normalizeComPort,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import { checkLocalPrintAgent } from '@/lib/erp-local-print'
import {
  isLabelPrinterConnected,
  printClientTsplLabels,
  resolvePrinterSerialSettings,
  webSerialSupported,
} from '@/lib/erp-serial-device'

export type PrintLabelPieceOverride = {
  avg_weight?: number | string | null
  gross_weight?: number | string | null
  chain_wt_only?: number | string | null
  pendant_wt_only?: number | string | null
  earring_wt_only?: number | string | null
}

type PrintResult = {
  barcode: string
  printed: boolean
  clientPrint?: boolean
  clientPrintMode?: 'serial' | 'usb'
  tspl?: string
  error?: string
}

type PrintApiProfile = {
  id?: string
  name: string
  connection: string
  serial?: {
    port: string
    baudRate: number
    dataBits: 7 | 8
    parity: 'none' | 'even' | 'odd'
    stopBits: 1 | 2
  }
  windowsPrinter?: { name?: string; portHint?: string }
}

export type PrintStockLabelsOptions = {
  batchId?: string | null
  pieceIds?: number[]
  pieceOverrides?: Record<number, PrintLabelPieceOverride>
  printerProfileId?: string | null
  hardware?: ErpHardwareSettings | null
}

export type PrintStockLabelsResult = {
  ok: boolean
  message: string
  printedCount?: number
}

async function resolveHardware(hw: ErpHardwareSettings | null | undefined): Promise<ErpHardwareSettings> {
  if (hw) return hw
  const settingsRes = await axios.get<{ settings: { hardware?: ErpHardwareSettings } }>(
    '/api/reseller/erp/settings',
  )
  return migrateHardwareSettings(settingsRes.data.settings?.hardware)
}

export async function printStockLabels(opts: PrintStockLabelsOptions): Promise<PrintStockLabelsResult> {
  const hardware = await resolveHardware(opts.hardware)
  const printerProfile = getPrinterProfileById(hardware, opts.printerProfileId)

  const body: Record<string, unknown> = {
    printer_profile_id: opts.printerProfileId || printerProfile?.id,
  }
  if (opts.batchId) body.batch_id = opts.batchId
  if (opts.pieceIds?.length) body.piece_ids = opts.pieceIds
  if (opts.pieceOverrides && Object.keys(opts.pieceOverrides).length) {
    body.piece_overrides = opts.pieceOverrides
  }

  const res = await axios.post<{
    results: PrintResult[]
    printerConfigured: boolean
    clientPrintRequired?: boolean
    printerProfile?: PrintApiProfile | null
  }>('/api/reseller/erp/print/barcodes', body)

  const results = res.data.results || []
  const clientTspl = results.filter((r) => r.clientPrint && r.tspl)

  if (clientTspl.length > 0 || res.data.clientPrintRequired) {
    const conn = res.data.printerProfile?.connection || printerProfile?.connection
    if (conn === 'usb') {
      if (!(await checkLocalPrintAgent())) {
        return {
          ok: false,
          message: 'Start erp-print-service on this PC (START-KC-Label-Print.bat), then try again.',
        }
      }
    } else if (conn === 'serial') {
      if (!webSerialSupported()) {
        return { ok: false, message: 'Use Chrome or Edge on this PC for serial printing.' }
      }
      if (!isLabelPrinterConnected()) {
        return { ok: false, message: 'Connect the label printer in Hardware (serial mode), then try again.' }
      }
    }

    let count: number
    try {
      count = await printClientTsplLabels(
        results,
        hardware,
        opts.printerProfileId,
        res.data.printerProfile,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Print failed'
      if (/Raw print failed|Installed Windows printers|OpenPrinter/i.test(msg)) {
        return {
          ok: false,
          message:
            'TSC printer not installed in Windows. Install TSC TTP-244 driver so it appears in Settings → Printers. Run CHECK-TSC-Printer.bat on this PC.',
        }
      }
      return { ok: false, message: msg }
    }

    if (conn === 'usb') {
      const winName =
        res.data.printerProfile?.windowsPrinter?.name ||
        printerProfile?.windowsPrinter?.name ||
        'TSC TTP-244 Pro'
      return { ok: true, message: `Printed ${count} label(s) · USB · ${winName}`, printedCount: count }
    }

    const serial = resolvePrinterSerialSettings(hardware, opts.printerProfileId, res.data.printerProfile)
    return {
      ok: true,
      message: `Printed ${count} label(s) · ${normalizeComPort(serial.port)} @ ${serial.baudRate}`,
      printedCount: count,
    }
  }

  const ok = results.filter((r) => r.printed).length
  if (ok) {
    return {
      ok: true,
      message: `Printed ${ok} label(s)${res.data.printerProfile ? ` · ${res.data.printerProfile.name}` : ''}`,
      printedCount: ok,
    }
  }

  const err = results.find((r) => r.error)?.error
  return {
    ok: false,
    message: err || `Label not sent (${results.length} prepared). Check Hardware printer settings.`,
  }
}

import axios from '@/lib/axios'
import {
  getPrinterProfileById,
  isTvsLp46LabelProfile,
  loadWorkstationSelection,
  migrateHardwareSettings,
  normalizeComPort,
  type ErpHardwareSettings,
} from '@/lib/erp-hardware'
import { normalizeTscPrnLayout, TSC_PRN_LAYOUT_3ACROSS } from '@/lib/erp-print-templates'
import {
  getLocalPrintAgentInfo,
  localPrintAgentUnreachableMessage,
  printViaLocalAgent,
  resolveWindowsPrinterName,
} from '@/lib/erp-local-print'
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
  bag_wt?: number | string | null
  stone_charges?: number | string | null
  box_charges?: number | string | null
  wastage_pct?: number | string | null
  mc_rate?: number | string | null
  mc_type?: string | null
  metal_type?: string | null
  bags?: string | null
  purity?: number | string | null
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
  /** Fixed/MRP gift rows: print the same barcode once per PCS (e.g. 6 → 6 labels). */
  repeatByPcs?: boolean
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

  const workstation = loadWorkstationSelection()
  let prnTemplateName =
    workstation.prnTemplateName || printerProfile?.prnTemplateName || null
  if (!prnTemplateName && printerProfile?.name && /3.?across/i.test(printerProfile.name)) {
    prnTemplateName = TSC_PRN_LAYOUT_3ACROSS
  }
  const body: Record<string, unknown> = {
    printer_profile_id: opts.printerProfileId || printerProfile?.id,
    prn_template_name: normalizeTscPrnLayout(prnTemplateName || 'standard'),
  }
  if (opts.batchId) body.batch_id = opts.batchId
  if (opts.pieceIds?.length) body.piece_ids = opts.pieceIds
  if (opts.pieceOverrides && Object.keys(opts.pieceOverrides).length) {
    body.piece_overrides = opts.pieceOverrides
  }
  if (opts.repeatByPcs) body.repeat_by_pcs = true

  const res = await axios.post<{
    results: PrintResult[]
    tsplJobs?: { tspl: string; barcodes: string[]; pieceCount?: number }[]
    printerConfigured: boolean
    clientPrintRequired?: boolean
    printerProfile?: PrintApiProfile | null
  }>('/api/reseller/erp/print/barcodes', body)

  const results = res.data.results || []
  const tsplJobs = (res.data.tsplJobs || []).filter((j) => j.tspl?.trim())
  const clientTspl = results.filter((r) => r.clientPrint && r.tspl)

  if (tsplJobs.length > 0 || clientTspl.length > 0 || res.data.clientPrintRequired) {
    const conn = res.data.printerProfile?.connection || printerProfile?.connection
    if (conn === 'usb') {
      const agentInfo = await getLocalPrintAgentInfo()
      if (!agentInfo.ok) {
        return {
          ok: false,
          message: localPrintAgentUnreachableMessage(agentInfo),
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
      if (tsplJobs.length > 0 && conn === 'usb') {
        const printerName = resolveWindowsPrinterName(
          hardware,
          opts.printerProfileId,
          res.data.printerProfile,
        )
        count = await printViaLocalAgent(
          tsplJobs.map((j) => j.tspl),
          printerName,
        )
      } else if (tsplJobs.length > 0 && conn === 'serial') {
        count = await printClientTsplLabels(
          tsplJobs.map((j) => ({
            barcode: j.barcodes[0] || '',
            clientPrint: true,
            clientPrintMode: 'serial',
            tspl: j.tspl,
          })),
          hardware,
          opts.printerProfileId,
          res.data.printerProfile,
        )
      } else {
        count = await printClientTsplLabels(
          results,
          hardware,
          opts.printerProfileId,
          res.data.printerProfile,
        )
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Print failed'
      if (/Raw print failed|Installed Windows printers|OpenPrinter/i.test(msg)) {
        const winName =
          res.data.printerProfile?.windowsPrinter?.name ||
          printerProfile?.windowsPrinter?.name ||
          ''
        const zebra = /Zebra|GC420|EPL/i.test(winName)
        const tvs = isTvsLp46LabelProfile(printerProfile)
        return {
          ok: false,
          message: zebra
            ? `Zebra raw print failed for “${winName}”. Check Settings → Printers, USB002 port, and restart START-KC-Label-Print.bat.`
            : tvs
              ? `TVS LP46 print failed for “${winName}”. Install the TVS LP 46 NEO driver, match the name in Hardware, and restart START-KC-Label-Print.bat.`
              : 'TSC printer not installed in Windows. Install TSC TTP-244 driver so it appears in Settings → Printers. Run CHECK-TSC-Printer.bat on this PC.',
        }
      }
      return { ok: false, message: msg }
    }

    if (conn === 'usb') {
      const winName =
        res.data.printerProfile?.windowsPrinter?.name ||
        printerProfile?.windowsPrinter?.name ||
        'TSC TTP-244 Pro'
      const rowHint =
        tsplJobs.length === 1 && (tsplJobs[0].pieceCount ?? 0) > 1
          ? ` · ${tsplJobs[0].pieceCount} tags on one row`
          : tsplJobs.length > 1
            ? ` · ${tsplJobs.length} row(s)`
            : ''
      return {
        ok: true,
        message: `Printed ${count} label job(s) · USB · ${winName}${rowHint}`,
        printedCount: count,
      }
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

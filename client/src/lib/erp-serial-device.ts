import type { ErpHardwareSettings, ErpSerialSettings } from '@/lib/erp-hardware'
import { DEFAULT_SERIAL, getPrinterProfileById } from '@/lib/erp-hardware'
import { normalizePrnTemplate } from '@/lib/erp-print-templates'
import { printViaLocalAgent, resolveWindowsPrinterName } from '@/lib/erp-local-print'

export type SerialPortLike = {
  open: (opts: {
    baudRate: number
    dataBits?: number
    parity?: string
    stopBits?: number
  }) => Promise<void>
  close: () => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

let labelPrinterPort: SerialPortLike | null = null
let labelPrinterPortOpen = false

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

function navSerial() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (navigator as any).serial as {
    requestPort: () => Promise<SerialPortLike>
    getPorts: () => Promise<SerialPortLike[]>
  }
}

export async function requestUserSerialPort(): Promise<SerialPortLike> {
  if (!webSerialSupported()) {
    throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge on this PC.')
  }
  try {
    return await navSerial().requestPort()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/no port selected|notfound|cancel/i.test(msg)) {
      throw new Error('No COM port selected — choose your scale (e.g. COM1) in the browser popup.')
    }
    throw e instanceof Error ? e : new Error(msg)
  }
}

export async function getGrantedSerialPorts(): Promise<SerialPortLike[]> {
  if (!webSerialSupported()) return []
  try {
    return (await navSerial().getPorts()) || []
  } catch {
    return []
  }
}

export function getLabelPrinterPort(): SerialPortLike | null {
  return labelPrinterPort
}

export function isLabelPrinterConnected(): boolean {
  return labelPrinterPortOpen && labelPrinterPort != null
}

export async function openSerialPort(port: SerialPortLike, settings: ErpSerialSettings) {
  try {
    await port.open({
      baudRate: settings.baudRate,
      dataBits: settings.dataBits,
      parity: settings.parity,
      stopBits: settings.stopBits,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'InvalidStateError') return
    const raw = e instanceof Error ? e.message : String(e)
    if (/failed to open serial port|networkerror|access denied/i.test(raw)) {
      throw new Error(
        'Could not open COM port — close other apps using this port, unplug and replug the USB cable, then pick the port again in the browser popup.',
      )
    }
    throw e instanceof Error ? e : new Error(raw)
  }
}

export async function closeSerialPort(port: SerialPortLike | null) {
  if (!port) return
  try {
    await port.close()
  } catch {
    /* already closed */
  }
}

/** Connect TSC label printer — caches USB device so scale can stay on a different COM port. */
export async function connectLabelPrinter(serial: ErpSerialSettings, pickNew = false): Promise<SerialPortLike> {
  if (!webSerialSupported()) {
    throw new Error('Web Serial is not supported. Use Chrome or Edge on this PC.')
  }

  if (labelPrinterPort && !pickNew) {
    await openSerialPort(labelPrinterPort, serial)
    labelPrinterPortOpen = true
    return labelPrinterPort
  }

  if (labelPrinterPort && pickNew) {
    await disconnectLabelPrinter()
  }

  const port = await requestUserSerialPort()
  await openSerialPort(port, serial)
  labelPrinterPort = port
  labelPrinterPortOpen = true
  return port
}

export async function disconnectLabelPrinter() {
  if (labelPrinterPort) {
    await closeSerialPort(labelPrinterPort)
  }
  labelPrinterPort = null
  labelPrinterPortOpen = false
}

/** TSC TTP-244 expects CRLF-separated TSPL commands. */
export function formatTsplForSerial(tspl: string): string {
  const body = normalizePrnTemplate(tspl)
  return `${body.split('\n').join('\r\n')}\r\n`
}

export async function sendTsplOverSerial(port: SerialPortLike, tspl: string) {
  if (!port.writable) throw new Error('Serial port is not open for writing')
  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(formatTsplForSerial(tspl)))
    await writer.ready
  } finally {
    writer.releaseLock()
  }
}

export async function sendTsplBatchOverSerial(port: SerialPortLike, tsplList: string[], gapMs = 450) {
  for (let i = 0; i < tsplList.length; i += 1) {
    await sendTsplOverSerial(port, tsplList[i])
    if (i < tsplList.length - 1 && gapMs > 0) {
      await new Promise((r) => setTimeout(r, gapMs))
    }
  }
}

export type PrintLabelResult = {
  barcode: string
  clientPrint?: boolean
  clientPrintMode?: 'serial' | 'usb'
  tspl?: string
  error?: string
}

/** Print TSC labels — USB (Windows agent) or serial (Web Serial). */
export async function printClientTsplLabels(
  results: PrintLabelResult[],
  hw: ErpHardwareSettings | null,
  printerProfileId: string | null | undefined,
  apiProfile?: {
    connection?: string
    serial?: ErpSerialSettings
    windowsPrinter?: { name?: string }
  } | null,
): Promise<number> {
  const clientTspl = results.filter((r) => r.clientPrint && r.tspl).map((r) => r.tspl as string)
  if (!clientTspl.length) return 0

  const profile = hw ? getPrinterProfileById(hw, printerProfileId) : null
  const mode =
    apiProfile?.connection === 'usb' || results.some((r) => r.clientPrintMode === 'usb')
      ? 'usb'
      : apiProfile?.connection === 'serial' || profile?.connection === 'serial' || results.some((r) => r.clientPrint)
        ? 'serial'
        : null

  if (mode === 'usb') {
    const printerName = resolveWindowsPrinterName(hw, printerProfileId, apiProfile)
    return printViaLocalAgent(clientTspl, printerName)
  }

  if (!webSerialSupported()) {
    throw new Error('Serial printer needs Chrome or Edge on this PC.')
  }

  if (mode !== 'serial') {
    throw new Error('Printer connection not configured. Check Hardware settings.')
  }

  const serial = apiProfile?.serial || profile?.serial || DEFAULT_SERIAL
  let port = labelPrinterPort
  if (!port || !labelPrinterPortOpen) {
    port = await connectLabelPrinter(serial, false)
  } else {
    await openSerialPort(port, serial)
  }

  try {
    await sendTsplBatchOverSerial(port, clientTspl)
    return clientTspl.length
  } finally {
    /* keep serial port open for next labels */
  }
}

export function resolvePrinterSerialSettings(
  hw: ErpHardwareSettings | null,
  printerProfileId: string | null | undefined,
  apiProfile?: { serial?: ErpSerialSettings } | null,
): ErpSerialSettings {
  const profile = hw ? getPrinterProfileById(hw, printerProfileId) : null
  return apiProfile?.serial || profile?.serial || DEFAULT_SERIAL
}

/** Parse scale weight from serial stream — brand selects protocol. */
export function parseScaleWeightChunk(
  text: string,
  brand: 'essae' | 'generic' | 'mettler_toledo' = 'generic',
): number | null {
  if (brand === 'mettler_toledo') {
    const lines = text.split(/[\r\n]+/)
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line) continue
      // MT-SICS stable weight: "S S     12.450 g" or "S     +   12.45 g"
      const mt = line.match(/^S\s+S?\s*[+-]?\s*([\d.]+)\s*g\b/i)
      if (mt) {
        const v = parseFloat(mt[1])
        if (Number.isFinite(v) && v >= 0) return v
      }
      // SI immediate response: "S     12.450 g"
      const si = line.match(/^SI?\s+[+-]?\s*([\d.]+)\s*g\b/i)
      if (si) {
        const v = parseFloat(si[1])
        if (Number.isFinite(v) && v >= 0) return v
      }
      // Some JSB models send net weight on print key as "N     12.450 g"
      const net = line.match(/^N\s+[+-]?\s*([\d.]+)\s*g\b/i)
      if (net) {
        const v = parseFloat(net[1])
        if (Number.isFinite(v) && v >= 0) return v
      }
    }
  }
  const matches = text.match(/\d+\.\d{2,4}/g)
  if (!matches?.length) return null
  const last = parseFloat(matches[matches.length - 1])
  return Number.isFinite(last) && last >= 0 ? last : null
}

/** Mettler Toledo: detect Print key / transfer-to-host events in MT-SICS stream. */
export function detectMettlerPrintTrigger(text: string): boolean {
  const lines = text.split(/[\r\n]+/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^P\s*$/i.test(line)) return true
    if (/^P\s+[+-]?\s*[\d.]+\s*g\b/i.test(line)) return true
    if (/^Print\b/i.test(line)) return true
    if (/^T\s+[+-]?\s*[\d.]+\s*g\b/i.test(line)) return true
  }
  return false
}

export type ScaleReaderCallbacks = {
  onWeight: (grams: number) => void
  onError?: (message: string) => void
  /** Mettler Toledo: fired when Print is pressed on the scale (uses last stable weight). */
  onPrint?: (grams: number) => void
}

/** Read scale continuously from an open serial port. Returns stop function. */
export async function startScaleReader(
  port: SerialPortLike,
  callbacks: ScaleReaderCallbacks,
  options?: { brand?: 'essae' | 'generic' | 'mettler_toledo' },
): Promise<() => void> {
  const brand = options?.brand || 'generic'
  if (!port.readable) throw new Error('Serial port is not open for reading')
  const reader = port.readable.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let stopped = false
  let lastStableWeight: number | null = null

  void (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 512) buffer = buffer.slice(-256)
        const w = parseScaleWeightChunk(buffer, brand)
        if (w != null) {
          lastStableWeight = w
          callbacks.onWeight(w)
        }
        if (brand === 'mettler_toledo' && callbacks.onPrint && detectMettlerPrintTrigger(buffer)) {
          const printWt = w ?? lastStableWeight
          if (printWt != null && printWt > 0) {
            callbacks.onPrint(printWt)
            buffer = ''
          }
        }
      }
    } catch (e) {
      if (!stopped) {
        callbacks.onError?.(e instanceof Error ? e.message : 'Scale read failed')
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* ignore */
      }
    }
  })()

  return () => {
    stopped = true
    void reader.cancel().catch(() => {})
  }
}

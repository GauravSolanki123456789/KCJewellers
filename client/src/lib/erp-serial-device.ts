import type { ErpHardwareSettings, ErpSerialSettings } from '@/lib/erp-hardware'
import { DEFAULT_SERIAL, getPrinterProfileById } from '@/lib/erp-hardware'
import { normalizePrnTemplate } from '@/lib/erp-print-templates'

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
  return navSerial().requestPort()
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
    throw e
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
  tspl?: string
  error?: string
}

/** Print TSC labels — uses connected printer port when available. */
export async function printClientTsplLabels(
  results: PrintLabelResult[],
  hw: ErpHardwareSettings | null,
  printerProfileId: string | null | undefined,
  apiProfile?: { connection?: string; serial?: ErpSerialSettings } | null,
): Promise<number> {
  const clientTspl = results.filter((r) => r.clientPrint && r.tspl).map((r) => r.tspl as string)
  if (!clientTspl.length) return 0

  if (!webSerialSupported()) {
    throw new Error('Serial printer needs Chrome or Edge on this PC.')
  }

  const profile = hw ? getPrinterProfileById(hw, printerProfileId) : null
  const isSerial =
    apiProfile?.connection === 'serial' || profile?.connection === 'serial' || results.some((r) => r.clientPrint)

  if (!isSerial) {
    throw new Error('Printer is not configured for serial/COM output. Check Hardware → Label printer → Serial.')
  }

  const serial = apiProfile?.serial || profile?.serial || DEFAULT_SERIAL
  let port = labelPrinterPort
  let closeAfter = false

  if (!port || !labelPrinterPortOpen) {
    port = await connectLabelPrinter(serial, false)
    closeAfter = false
  } else {
    await openSerialPort(port, serial)
  }

  try {
    await sendTsplBatchOverSerial(port, clientTspl)
    return clientTspl.length
  } finally {
    if (closeAfter) {
      await disconnectLabelPrinter()
    }
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

/** Parse Essae / generic scale stream — picks last stable decimal weight (e.g. 2.366). */
export function parseScaleWeightChunk(text: string): number | null {
  const matches = text.match(/\d+\.\d{2,4}/g)
  if (!matches?.length) return null
  const last = parseFloat(matches[matches.length - 1])
  return Number.isFinite(last) && last >= 0 ? last : null
}

export type ScaleReaderCallbacks = {
  onWeight: (grams: number) => void
  onError?: (message: string) => void
}

/** Read scale continuously from an open serial port. Returns stop function. */
export async function startScaleReader(
  port: SerialPortLike,
  callbacks: ScaleReaderCallbacks,
): Promise<() => void> {
  if (!port.readable) throw new Error('Serial port is not open for reading')
  const reader = port.readable.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let stopped = false

  void (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        buffer += decoder.decode(value, { stream: true })
        if (buffer.length > 512) buffer = buffer.slice(-256)
        const w = parseScaleWeightChunk(buffer)
        if (w != null) callbacks.onWeight(w)
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

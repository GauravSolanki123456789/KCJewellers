import type { ErpHardwareSettings, ErpPrinterProfile, ErpSerialSettings } from '@/lib/erp-hardware'
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

export function webSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export async function requestUserSerialPort(): Promise<SerialPortLike> {
  if (!webSerialSupported()) {
    throw new Error('Web Serial is not supported in this browser. Use Chrome or Edge on this PC.')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any
  return (await nav.serial.requestPort()) as SerialPortLike
}

export async function openSerialPort(port: SerialPortLike, settings: ErpSerialSettings) {
  await port.open({
    baudRate: settings.baudRate,
    dataBits: settings.dataBits,
    parity: settings.parity,
    stopBits: settings.stopBits,
  })
}

export async function closeSerialPort(port: SerialPortLike | null) {
  if (!port) return
  try {
    await port.close()
  } catch {
    /* already closed */
  }
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
  } finally {
    writer.releaseLock()
  }
}

export async function sendTsplBatchOverSerial(port: SerialPortLike, tsplList: string[], gapMs = 350) {
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

/** Open Web Serial and print TSC labels from API results (Generate barcodes / tag split). */
export async function printClientTsplLabels(
  results: PrintLabelResult[],
  hw: ErpHardwareSettings | null,
  printerProfileId: string | null | undefined,
  apiProfile?: { connection?: string; serial?: ErpSerialSettings } | null,
): Promise<number> {
  const clientTspl = results.filter((r) => r.clientPrint && r.tspl).map((r) => r.tspl as string)
  if (!clientTspl.length) return 0

  if (!webSerialSupported()) {
    throw new Error('Serial printer needs Chrome or Edge on this PC. Use Hardware → Test print to pick the USB port.')
  }

  const profile = hw ? getPrinterProfileById(hw, printerProfileId) : null
  const isSerial =
    apiProfile?.connection === 'serial' || profile?.connection === 'serial' || results.some((r) => r.clientPrint)

  if (!isSerial) {
    throw new Error('Printer is not configured for serial/COM output. Check Hardware → Label printer → Serial.')
  }

  const serial = apiProfile?.serial || profile?.serial || DEFAULT_SERIAL
  const port = await requestUserSerialPort()
  try {
    await openSerialPort(port, serial)
    await sendTsplBatchOverSerial(port, clientTspl)
  } finally {
    await closeSerialPort(port)
  }
  return clientTspl.length
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

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

export async function sendSerialCommand(port: SerialPortLike, command: string): Promise<void> {
  if (!port.writable) throw new Error('Serial port is not open for writing')
  const writer = port.writable.getWriter()
  try {
    const body = command.trim()
    const cmd = body ? (body.endsWith('\r\n') ? body : `${body}\r\n`) : '\r\n'
    await writer.write(new TextEncoder().encode(cmd))
    await writer.ready
  } finally {
    writer.releaseLock()
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Wake Mettler Toledo JSB / MT-SICS scales and enable host print key transfer. */
export async function initMettlerToledoScale(port: SerialPortLike): Promise<void> {
  if (!port.writable) return
  await sendSerialCommand(port, '')
  await delay(120)
  try {
    await sendSerialCommand(port, 'I4')
    await delay(120)
  } catch {
    /* identify optional */
  }
  try {
    // Print key → send stable weight to host interface (works on most JSB / Excellence models).
    await sendSerialCommand(port, 'M24 2')
    await delay(120)
  } catch {
    /* some firmware rejects M24 — shop may configure on device */
  }
}

export type MettlerParsedLine = {
  grams: number
  stable: boolean
  isPrintLine: boolean
}

/** Parse one MT-SICS response line (S / SI / ST / print channel). */
export function parseMettlerLine(line: string): MettlerParsedLine | null {
  const t = line.trim()
  if (!t || /^ES\b|^@/i.test(t)) return null

  const isPrintLine = /^(P|ST|T)\b/i.test(t) || /^Print\b/i.test(t)

  // MT-SICS stable/dynamic: "S S     15.400 g" · "S D     15.4 g" · "SI S     12.45 g"
  const sics = t.match(
    /^(?:SI|ST|SN|SR|SIR|SU|[SP])?\s*([SDIN])\s+([SDIN])?\s+([+-]?\d[\d.]*)\s*([gG]|kg|lb)?/i,
  )
  if (sics) {
    const status2 = (sics[2] || sics[1] || '').toUpperCase()
    const grams = parseFloat(String(sics[3]).replace(/\s+/g, ''))
    if (Number.isFinite(grams) && grams >= 0) {
      return {
        grams,
        stable: status2 === 'S' || status2 === 'M' || /\sS\s+S\s/i.test(t),
        isPrintLine,
      }
    }
  }

  // Compact: "15.4g" / "15.400 G" (print channel or legacy)
  const compact = t.match(/([+-]?\d+\.\d+|\d+)\s*([gG])\b/i)
  if (compact) {
    const grams = parseFloat(compact[1])
    if (Number.isFinite(grams) && grams >= 0) {
      return {
        grams,
        stable: /\sS\s+S\s/i.test(t) || isPrintLine,
        isPrintLine,
      }
    }
  }

  // Generic decimal fallback within MT-SICS context
  if (/^[SPN]/i.test(t) || isPrintLine) {
    const nums = t.match(/\d+\.\d+|\d+/g)
    if (nums?.length) {
      const grams = parseFloat(nums[nums.length - 1])
      if (Number.isFinite(grams) && grams >= 0) {
        return { grams, stable: /\sS\s+S\s/i.test(t), isPrintLine }
      }
    }
  }

  return null
}

/** Parse scale weight from serial stream — brand selects protocol. */
export function parseScaleWeightChunk(
  text: string,
  brand: 'essae' | 'generic' | 'mettler_toledo' = 'generic',
): number | null {
  if (brand === 'mettler_toledo') {
    const lines = text.split(/[\r\n]+/)
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const parsed = parseMettlerLine(lines[i])
      if (parsed) return parsed.grams
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
    if (/^ST\s/i.test(line)) return true
    if (/^T\s+[+-]?\s*[\d.]+\s*g\b/i.test(line)) return true
    const parsed = parseMettlerLine(line)
    if (parsed?.isPrintLine && parsed.grams > 0) return true
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

  if (brand === 'mettler_toledo') {
    try {
      await initMettlerToledoScale(port)
    } catch {
      /* init is best-effort */
    }
  }

  const reader = port.readable.getReader()
  const decoder = new TextDecoder()
  let lineBuffer = ''
  let stopped = false
  let lastStableWeight: number | null = null
  let lastPollAt = 0
  let lastPrintAt = 0
  const connectGraceUntil = Date.now() + 1500
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let sirFallbackSent = false

  const processMettlerLines = (chunk: string) => {
    lineBuffer += chunk
    const parts = lineBuffer.split(/[\r\n]+/)
    lineBuffer = parts.pop() || ''
    if (lineBuffer.length > 400) lineBuffer = lineBuffer.slice(-200)

    for (const raw of parts) {
      const parsed = parseMettlerLine(raw)
      if (!parsed) continue

      lastStableWeight = parsed.grams
      callbacks.onWeight(parsed.grams)

      if (!callbacks.onPrint || parsed.grams <= 0) continue

      const now = Date.now()
      const sincePoll = now - lastPollAt
      const unsolicited = sincePoll > 220 || parsed.isPrintLine || detectMettlerPrintTrigger(raw)
      if (
        now > connectGraceUntil &&
        now - lastPrintAt > 900 &&
        unsolicited &&
        (parsed.stable || parsed.isPrintLine)
      ) {
        lastPrintAt = now
        callbacks.onPrint(parsed.grams)
      }
    }
  }

  if (brand === 'mettler_toledo') {
    pollTimer = setInterval(() => {
      if (stopped) return
      if (!sirFallbackSent && Date.now() > connectGraceUntil + 2500 && lastStableWeight == null) {
        sirFallbackSent = true
        void sendSerialCommand(port, 'SIR').catch(() => {})
      }
      lastPollAt = Date.now()
      void sendSerialCommand(port, 'SI').catch(() => {})
    }, 350)
    lastPollAt = Date.now()
    void sendSerialCommand(port, 'SI').catch(() => {})
  }

  void (async () => {
    try {
      while (!stopped) {
        const { value, done } = await reader.read()
        if (done) break
        if (!value) continue
        const chunk = decoder.decode(value, { stream: true })

        if (brand === 'mettler_toledo') {
          processMettlerLines(chunk)
          continue
        }

        const w = parseScaleWeightChunk(chunk, brand)
        if (w != null) {
          lastStableWeight = w
          callbacks.onWeight(w)
        }
      }
    } catch (e) {
      if (!stopped) {
        callbacks.onError?.(e instanceof Error ? e.message : 'Scale read failed')
      }
    } finally {
      if (pollTimer) clearInterval(pollTimer)
      try {
        reader.releaseLock()
      } catch {
        /* ignore */
      }
    }
  })()

  return () => {
    stopped = true
    if (pollTimer) clearInterval(pollTimer)
    void reader.cancel().catch(() => {})
  }
}

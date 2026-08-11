import type { ErpSerialSettings } from '@/lib/erp-hardware'

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

export async function sendTsplOverSerial(port: SerialPortLike, tspl: string) {
  if (!port.writable) throw new Error('Serial port is not open for writing')
  const writer = port.writable.getWriter()
  try {
    await writer.write(new TextEncoder().encode(tspl))
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

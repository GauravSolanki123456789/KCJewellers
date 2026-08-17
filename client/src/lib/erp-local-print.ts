import type { ErpHardwareSettings, ErpPrinterProfile } from '@/lib/erp-hardware'
import { DEFAULT_WINDOWS_USB_PRINTER, getPrinterProfileById } from '@/lib/erp-hardware'
import { formatTsplForSerial } from '@/lib/erp-serial-device'

export const LOCAL_PRINT_AGENT_URL = 'http://127.0.0.1:17888'

export async function checkLocalPrintAgent(): Promise<boolean> {
  try {
    const r = await fetch(`${LOCAL_PRINT_AGENT_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    })
    return r.ok
  } catch {
    return false
  }
}

export async function listLocalPrinters(): Promise<string[]> {
  const r = await fetch(`${LOCAL_PRINT_AGENT_URL}/printers`, {
    method: 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  const data = (await r.json()) as { ok?: boolean; printers?: string[] }
  if (!r.ok || !data.ok) return []
  return Array.isArray(data.printers) ? data.printers : []
}

export function resolveWindowsPrinterName(
  hw: ErpHardwareSettings | null,
  printerProfileId: string | null | undefined,
  apiProfile?: { windowsPrinter?: { name?: string }; connection?: string } | null,
): string {
  const profile = hw ? getPrinterProfileById(hw, printerProfileId) : null
  return (
    apiProfile?.windowsPrinter?.name ||
    profile?.windowsPrinter?.name ||
    DEFAULT_WINDOWS_USB_PRINTER.name
  )
}

export async function printViaLocalAgent(
  tsplList: string[],
  printerName: string,
): Promise<number> {
  const formatted = tsplList.map((t) => formatTsplForSerial(t))
  const r = await fetch(`${LOCAL_PRINT_AGENT_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerName, tsplList: formatted }),
  })
  let data: { ok?: boolean; error?: string; count?: number } = {}
  try {
    data = (await r.json()) as typeof data
  } catch {
    data = {}
  }
  if (!r.ok || !data.ok) {
    throw new Error(data.error || 'Local USB print failed — is the print agent running?')
  }
  return data.count || formatted.length
}

export function isUsbWindowsPrinter(profile: ErpPrinterProfile | null | undefined): boolean {
  return profile?.connection === 'usb'
}

export function isLabelPrinterReadyForProfile(profile: ErpPrinterProfile | null | undefined): boolean {
  if (!profile) return false
  if (profile.connection === 'network') return true
  if (profile.connection === 'usb') return false
  return profile.connection === 'serial'
}

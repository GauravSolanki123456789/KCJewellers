import type { ErpHardwareSettings, ErpPrinterProfile } from '@/lib/erp-hardware'
import { DEFAULT_WINDOWS_USB_PRINTER, getPrinterProfileById } from '@/lib/erp-hardware'
import { formatTsplForSerial } from '@/lib/erp-serial-device'

/** Chrome on https://kcjewellers.co.in must reach loopback — try both hosts. */
export const LOCAL_PRINT_AGENT_URL = 'http://127.0.0.1:17888'

const LOCAL_PRINT_AGENT_BASE_URLS = [
  'http://127.0.0.1:17888',
  'http://localhost:17888',
] as const

let cachedAgentBaseUrl: string | null = null

export type LocalPrintAgentUnreachableReason = 'blocked' | 'offline' | 'timeout'

export type LocalPrintAgentInfo = {
  ok: boolean
  unreachableReason?: LocalPrintAgentUnreachableReason
  supportsReceipt?: boolean
  supportsLabels?: boolean
  supportsTally?: boolean
  runtime?: string
  agentBaseUrl?: string
}

function isPublicHttpsSite(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'https:'
}

function classifyAgentFetchFailure(): LocalPrintAgentUnreachableReason {
  if (isPublicHttpsSite()) return 'blocked'
  return 'offline'
}

async function probeAgentHealth(baseUrl: string): Promise<LocalPrintAgentInfo | null> {
  try {
    const r = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      mode: 'cors',
      signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) return null
    const data = (await r.json()) as LocalPrintAgentInfo
    return { ...data, ok: true, agentBaseUrl: baseUrl }
  } catch {
    return null
  }
}

async function resolveLocalPrintAgentBaseUrl(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && cachedAgentBaseUrl) {
    const quick = await probeAgentHealth(cachedAgentBaseUrl)
    if (quick?.ok) return cachedAgentBaseUrl
    cachedAgentBaseUrl = null
  }
  for (const base of LOCAL_PRINT_AGENT_BASE_URLS) {
    const info = await probeAgentHealth(base)
    if (info?.ok) {
      cachedAgentBaseUrl = base
      return base
    }
  }
  return null
}

export function localPrintAgentUnreachableMessage(info?: LocalPrintAgentInfo): string {
  if (info?.unreachableReason === 'blocked') {
    return (
      'Chrome blocked the local print service (service may already be running). ' +
      'Click the lock icon in the address bar → Site settings → set Local network / Loopback to Allow, ' +
      'then tap Refresh on Label printer (USB). Also re-copy the latest erp-print-service folder and restart START-KC-Label-Print.bat.'
    )
  }
  return (
    'Start KC ERP Print Service on this PC: double-click START-KC-Label-Print.bat ' +
    '(whole erp-print-service folder on Desktop). The window must show Listening on http://127.0.0.1:17888/'
  )
}

export async function getLocalPrintAgentInfo(): Promise<LocalPrintAgentInfo> {
  const base = await resolveLocalPrintAgentBaseUrl()
  if (base) {
    const info = await probeAgentHealth(base)
    if (info?.ok) return info
  }
  return { ok: false, unreachableReason: classifyAgentFetchFailure() }
}

export async function checkLocalPrintAgent(): Promise<boolean> {
  const info = await getLocalPrintAgentInfo()
  return info.ok
}

export async function fetchLocalPrintAgent(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = await resolveLocalPrintAgentBaseUrl()
  if (!base) {
    throw new Error(localPrintAgentUnreachableMessage({ ok: false, unreachableReason: classifyAgentFetchFailure() }))
  }
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, {
    ...init,
    mode: 'cors',
    cache: 'no-store',
    signal: init?.signal ?? AbortSignal.timeout(60000),
  })
}

export async function listLocalPrinters(): Promise<string[]> {
  try {
    const r = await fetchLocalPrintAgent('/printers', {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })
    const data = (await r.json()) as { ok?: boolean; printers?: string[] }
    if (!r.ok || !data.ok) return []
    return Array.isArray(data.printers) ? data.printers : []
  } catch {
    return []
  }
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
  const formatted = tsplList.map((t) => formatTsplForSerial(t, printerName))
  const r = await fetchLocalPrintAgent('/print', {
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
    throw new Error(data.error || localPrintAgentUnreachableMessage(await getLocalPrintAgentInfo()))
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

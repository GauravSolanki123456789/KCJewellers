/** ERP hardware profiles — shared between Hardware settings and workstation picker. */

export type ErpSerialSettings = {
  port: string
  baudRate: number
  dataBits: 7 | 8
  parity: 'none' | 'even' | 'odd'
  stopBits: 1 | 2
}

export type ErpPrinterProfile = {
  id: string
  name: string
  connection: 'network' | 'serial' | 'usb'
  network?: { host: string; port: number }
  serial?: ErpSerialSettings
  /** Windows USB spooler printer name (USB001) — e.g. TSC TTP-244 Pro */
  windowsPrinter?: { name: string; portHint?: string }
  companyCode?: string
  /** TSPL (default) or PRN template when you upload formats later */
  labelFormat?: 'tspl' | 'prn'
  prnTemplateName?: string
  isDefault?: boolean
}

export type ErpScaleProfile = {
  id: string
  name: string
  serial: ErpSerialSettings
  brand?: 'essae' | 'generic'
  isDefault?: boolean
}

export type ErpHardwareSettings = {
  companyCode?: string
  printerProfiles?: ErpPrinterProfile[]
  scaleProfiles?: ErpScaleProfile[]
  billingPrinter?: { type?: string; address?: string; port?: number }
  scanner?: { mode?: string; suffix?: string }
  /** @deprecated use printerProfiles */
  labelPrinter?: { type?: string; address?: string; port?: number; serial?: ErpSerialSettings }
}

export type ErpWorkstationSelection = {
  printerProfileId: string | null
  scaleProfileId: string | null
}

export const DEFAULT_SERIAL: ErpSerialSettings = {
  port: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
}

export const DEFAULT_WINDOWS_USB_PRINTER = {
  name: 'TSC TTP-244 Pro',
  portHint: 'USB001',
}

export const ERP_WORKSTATION_STORAGE_KEY = 'kc-erp-workstation-v1'

export function newProfileId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeComPort(raw: string): string {
  const t = String(raw || '').trim().toUpperCase()
  if (!t) return 'COM3'
  if (/^COM\d+$/.test(t)) return t
  if (/^\d+$/.test(t)) return `COM${t}`
  return t
}

export function serialSettingsLabel(s: ErpSerialSettings): string {
  const parity = s.parity === 'none' ? 'N' : s.parity === 'even' ? 'E' : 'O'
  return `${normalizeComPort(s.port)} · ${s.baudRate} ${s.dataBits}-${parity}-${s.stopBits}`
}

export function migrateHardwareSettings(raw: ErpHardwareSettings | null | undefined): ErpHardwareSettings {
  const hw: ErpHardwareSettings = { ...(raw || {}) }
  if (!hw.companyCode) hw.companyCode = 'KC925'

  if (!hw.printerProfiles?.length) {
    const profiles: ErpPrinterProfile[] = []
    const legacy = hw.labelPrinter
    if (legacy?.address) {
      const isNetwork = legacy.type === 'network' || /^\d+\.\d+\.\d+\.\d+/.test(legacy.address)
      profiles.push({
        id: newProfileId(),
        name: 'Main label printer',
        connection: isNetwork ? 'network' : 'serial',
        network: isNetwork
          ? { host: legacy.address, port: legacy.port || 9100 }
          : undefined,
        serial: !isNetwork
          ? {
              ...(legacy.serial || DEFAULT_SERIAL),
              port: normalizeComPort(legacy.address || legacy.serial?.port || 'COM3'),
            }
          : undefined,
        isDefault: true,
        labelFormat: 'prn',
      })
    } else {
      profiles.push({
        id: newProfileId(),
        name: 'TSC barcode (TTP-244)',
        connection: 'usb',
        windowsPrinter: { ...DEFAULT_WINDOWS_USB_PRINTER },
        isDefault: true,
        labelFormat: 'prn',
      })
    }
    hw.printerProfiles = profiles
  }

  if (!hw.billingPrinter?.address) {
    hw.billingPrinter = { type: 'network', address: '192.168.0.198', port: 9100 }
  }

  if (!hw.scaleProfiles?.length) {
    hw.scaleProfiles = [
      {
        id: newProfileId(),
        name: 'Weighing scale',
        serial: { ...DEFAULT_SERIAL },
        brand: 'essae',
        isDefault: true,
      },
    ]
  }

  return hw
}

export function getDefaultPrinterProfile(hw: ErpHardwareSettings): ErpPrinterProfile | null {
  const profiles = hw.printerProfiles || []
  if (!profiles.length) return null
  return profiles.find((p) => p.isDefault) || profiles[0]
}

export function getDefaultScaleProfile(hw: ErpHardwareSettings): ErpScaleProfile | null {
  const profiles = hw.scaleProfiles || []
  if (!profiles.length) return null
  return profiles.find((p) => p.isDefault) || profiles[0]
}

export function getPrinterProfileById(
  hw: ErpHardwareSettings,
  id: string | null | undefined,
): ErpPrinterProfile | null {
  if (!id) return getDefaultPrinterProfile(hw)
  return hw.printerProfiles?.find((p) => p.id === id) || getDefaultPrinterProfile(hw)
}

export function getScaleProfileById(
  hw: ErpHardwareSettings,
  id: string | null | undefined,
): ErpScaleProfile | null {
  if (!id) return getDefaultScaleProfile(hw)
  return hw.scaleProfiles?.find((p) => p.id === id) || getDefaultScaleProfile(hw)
}

export function loadWorkstationSelection(): ErpWorkstationSelection {
  if (typeof window === 'undefined') return { printerProfileId: null, scaleProfileId: null }
  try {
    const raw = localStorage.getItem(ERP_WORKSTATION_STORAGE_KEY)
    if (!raw) return { printerProfileId: null, scaleProfileId: null }
    const parsed = JSON.parse(raw) as ErpWorkstationSelection
    return {
      printerProfileId: parsed.printerProfileId || null,
      scaleProfileId: parsed.scaleProfileId || null,
    }
  } catch {
    return { printerProfileId: null, scaleProfileId: null }
  }
}

export function saveWorkstationSelection(sel: ErpWorkstationSelection) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ERP_WORKSTATION_STORAGE_KEY, JSON.stringify(sel))
}

export function printerProfileSummary(p: ErpPrinterProfile): string {
  if (p.connection === 'network') {
    return `${p.network?.host || '—'}:${p.network?.port || 9100}`
  }
  if (p.connection === 'usb') {
    const hint = p.windowsPrinter?.portHint ? ` · ${p.windowsPrinter.portHint}` : ''
    return `USB · ${p.windowsPrinter?.name || DEFAULT_WINDOWS_USB_PRINTER.name}${hint}`
  }
  if (p.serial) return serialSettingsLabel(p.serial)
  return 'Serial — not configured'
}

export function isClientSidePrinter(p: ErpPrinterProfile | null): boolean {
  return p?.connection === 'serial' || p?.connection === 'usb'
}

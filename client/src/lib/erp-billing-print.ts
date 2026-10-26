/** Epson / Bills Banao billing & estimate thermal print — via local Windows print agent on the shop PC. */

import axios from '@/lib/axios'
import {
  fetchLocalPrintAgent,
  getLocalPrintAgentInfo,
  listLocalPrinters,
  localPrintAgentUnreachableMessage,
} from '@/lib/erp-local-print'
import { migrateHardwareSettings, type ErpHardwareSettings } from '@/lib/erp-hardware'

type ThermalPrepareResponse = {
  escPosBase64?: string
  windowsPrinterName?: string
  message?: string
  printed?: boolean
  requiresClientPrint?: boolean
}

type SheetPrepareResponse = {
  sheetText?: string
  paper?: string
  marginMm?: number
  fontPt?: number
  fontName?: string
  windowsPrinterName?: string
  message?: string
  printed?: boolean
  printKind?: string
}

export type ErpThermalPrinterKind = 'epson' | 'bills_banao'

const DEFAULT_EPSON_NAME = 'EPSON TM-m30III Receipt'
const DEFAULT_BILLS_BANAO_NAME = 'Bills Banao Printer'
const DEFAULT_SHEET_PRINTER_NAME = 'Epson L3310 Series'

const AGENT_UPGRADE_MSG =
  'Your print agent is outdated. Copy the latest erp-print-service folder to Desktop, restart START-KC-Label-Print.bat, then try again.'

export async function resolveLocalBillingPrinterName(configured?: string | null): Promise<string> {
  const requested = String(configured || DEFAULT_EPSON_NAME).trim() || DEFAULT_EPSON_NAME
  try {
    const names = await listLocalPrinters()
    if (names.includes(requested)) return requested
    const epson = names.find((n) => /epson|tm-m|tm-t|receipt|billing/i.test(n))
    if (epson) return epson
  } catch {
    /* agent offline — use configured name */
  }
  return requested
}

export async function resolveLocalBillsBanaoPrinterName(configured?: string | null): Promise<string> {
  const requested = String(configured || DEFAULT_BILLS_BANAO_NAME).trim() || DEFAULT_BILLS_BANAO_NAME
  try {
    const names = await listLocalPrinters()
    if (names.includes(requested)) return requested
    const match = names.find((n) => /bills\s*banao|bill\s*bao|ggt/i.test(n))
    if (match) return match
  } catch {
    /* agent offline */
  }
  return requested
}

async function loadHardwareFromSettings(): Promise<ErpHardwareSettings> {
  try {
    const res = await axios.get<{ settings?: { hardware?: ErpHardwareSettings } }>(
      '/api/reseller/erp/settings',
    )
    return migrateHardwareSettings(res.data.settings?.hardware)
  } catch {
    return migrateHardwareSettings(null)
  }
}

async function loadBillingPrinterNameFromSettings(): Promise<string | null> {
  const hw = await loadHardwareFromSettings()
  return hw.billingPrinter?.windowsPrinterName?.trim() || null
}

async function loadBillsBanaoPrinterNameFromSettings(): Promise<string | null> {
  const hw = await loadHardwareFromSettings()
  return hw.billsBanaoPrinter?.windowsPrinterName?.trim() || null
}

async function loadSheetPrinterFromSettings(): Promise<{
  windowsPrinterName: string
  paperSize: string
}> {
  const hw = await loadHardwareFromSettings()
  return {
    windowsPrinterName:
      hw.estimateSheetPrinter?.windowsPrinterName?.trim() || DEFAULT_SHEET_PRINTER_NAME,
    paperSize: hw.estimateSheetPrinter?.paperSize || 'A5',
  }
}

export async function resolveLocalSheetPrinterName(configured?: string | null): Promise<string> {
  const requested = String(configured || DEFAULT_SHEET_PRINTER_NAME).trim() || DEFAULT_SHEET_PRINTER_NAME
  try {
    const names = await listLocalPrinters()
    if (names.includes(requested)) return requested
    const match = names.find((n) => /L3310|L-3310|EcoTank|L3250|L3210|L3110/i.test(n))
    if (match) return match
  } catch {
    /* agent offline */
  }
  return requested
}

export async function printReceiptViaLocalAgent(
  escPosBase64: string,
  printerName: string,
): Promise<void> {
  const agent = await getLocalPrintAgentInfo()
  if (agent.ok && agent.supportsReceipt === false) {
    throw new Error(AGENT_UPGRADE_MSG)
  }

  const body = JSON.stringify({ printerName, escPosBase64 })
  const endpoints = ['/print-receipt', '/print'] as const

  let lastError = 'Could not print on thermal printer.'
  for (const path of endpoints) {
    try {
      const r = await fetchLocalPrintAgent(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      let data: { ok?: boolean; error?: string } = {}
      try {
        data = (await r.json()) as typeof data
      } catch {
        data = {}
      }
      if (r.ok && data.ok) return
      lastError =
        data.error ||
        (path === '/print' && r.status === 400
          ? AGENT_UPGRADE_MSG
          : `Thermal print failed (${r.status}).`)
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError
    }
  }

  throw new Error(
    `${lastError} Keep START-KC-Label-Print.bat running and check Hardware → printer name.`,
  )
}

async function deliverThermalReceipt(
  prep: ThermalPrepareResponse,
  successLabel: string,
  kind: ErpThermalPrinterKind,
): Promise<string> {
  const escPosBase64 = prep.escPosBase64
  if (!escPosBase64) {
    throw new Error('Could not prepare thermal receipt data from server.')
  }

  const configuredName =
    prep.windowsPrinterName ||
    (kind === 'bills_banao'
      ? await loadBillsBanaoPrinterNameFromSettings()
      : await loadBillingPrinterNameFromSettings()) ||
    (kind === 'bills_banao' ? DEFAULT_BILLS_BANAO_NAME : DEFAULT_EPSON_NAME)

  const printerName =
    kind === 'bills_banao'
      ? await resolveLocalBillsBanaoPrinterName(configuredName)
      : await resolveLocalBillingPrinterName(configuredName)

  await printReceiptViaLocalAgent(escPosBase64, printerName)
  return `${successLabel} sent to ${printerName} on this PC.`
}

async function printThermalViaLocalAgent(
  endpoint: '/api/reseller/erp/print/estimate' | '/api/reseller/erp/print/bill',
  billId: number,
  successLabel: string,
  kind: ErpThermalPrinterKind,
): Promise<string> {
  const agentInfo = await getLocalPrintAgentInfo()
  if (!agentInfo.ok) {
    throw new Error(localPrintAgentUnreachableMessage(agentInfo))
  }

  const prep = await axios.post<ThermalPrepareResponse>(endpoint, {
    bill_id: billId,
    mode: 'client',
    printer: kind,
  })

  if (prep.data.printed && !prep.data.escPosBase64) {
    return prep.data.message || `${successLabel} sent to printer.`
  }

  return deliverThermalReceipt(prep.data, successLabel, kind)
}

export function printErpEstimateThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent(
    '/api/reseller/erp/print/estimate',
    billId,
    'Estimate',
    'epson',
  )
}

export function printErpEstimateThermalBillsBanao(billId: number): Promise<string> {
  return printThermalViaLocalAgent(
    '/api/reseller/erp/print/estimate',
    billId,
    'Estimate',
    'bills_banao',
  )
}

export function printErpBillThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent('/api/reseller/erp/print/bill', billId, 'Receipt', 'epson')
}

async function printTestReceipt(kind: ErpThermalPrinterKind): Promise<string> {
  const agentInfo = await getLocalPrintAgentInfo()
  if (!agentInfo.ok) {
    throw new Error(localPrintAgentUnreachableMessage(agentInfo))
  }

  const prep = await axios.post<ThermalPrepareResponse>('/api/reseller/erp/print/test-receipt', {
    printer: kind,
  })
  const label = kind === 'bills_banao' ? 'Bills Banao test receipt' : 'Test receipt'
  return deliverThermalReceipt(prep.data, label, kind)
}

export function printErpTestReceipt(): Promise<string> {
  return printTestReceipt('epson')
}

export function printErpTestReceiptBillsBanao(): Promise<string> {
  return printTestReceipt('bills_banao')
}

async function printDocumentViaLocalAgent(payload: {
  printerName: string
  text: string
  paper?: string
  marginMm?: number
  fontPt?: number
  fontName?: string
}): Promise<void> {
  const agent = await getLocalPrintAgentInfo()
  if (agent.ok && agent.supportsDocument !== true) {
    throw new Error(AGENT_UPGRADE_MSG)
  }

  const r = await fetchLocalPrintAgent('/print-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data: { ok?: boolean; error?: string } = {}
  try {
    data = (await r.json()) as typeof data
  } catch {
    data = {}
  }
  if (r.ok && data.ok) return
  if (r.status === 404) throw new Error(AGENT_UPGRADE_MSG)
  throw new Error(
    data.error ||
      `Sheet print failed (${r.status}). Keep START-KC-Label-Print.bat running and check Hardware → Epson L3310 printer name.`,
  )
}

async function deliverSheetEstimate(prep: SheetPrepareResponse, successLabel: string): Promise<string> {
  const text = String(prep.sheetText || '').trim()
  if (!text) {
    throw new Error('Could not prepare sheet estimate from server.')
  }
  const configured = prep.windowsPrinterName || (await loadSheetPrinterFromSettings()).windowsPrinterName
  const printerName = await resolveLocalSheetPrinterName(configured)
  await printDocumentViaLocalAgent({
    printerName,
    text,
    paper: prep.paper || 'A5',
    marginMm: prep.marginMm,
    fontPt: prep.fontPt,
    fontName: prep.fontName,
  })
  return `${successLabel} sent to ${printerName} on this PC.`
}

export async function printErpEstimateSheet(billId: number): Promise<string> {
  const agentInfo = await getLocalPrintAgentInfo()
  if (!agentInfo.ok) {
    throw new Error(localPrintAgentUnreachableMessage(agentInfo))
  }
  if (agentInfo.supportsDocument !== true) {
    throw new Error(AGENT_UPGRADE_MSG)
  }

  const sheetHw = await loadSheetPrinterFromSettings()
  const prep = await axios.post<SheetPrepareResponse>('/api/reseller/erp/print/estimate', {
    bill_id: billId,
    mode: 'client',
    printer: 'epson_sheet',
    paper_size: sheetHw.paperSize,
  })

  if (prep.data.printed && !prep.data.sheetText) {
    return prep.data.message || 'Sheet estimate sent to printer.'
  }
  return deliverSheetEstimate(prep.data, 'Sheet estimate')
}

export async function printErpTestSheet(): Promise<string> {
  const agentInfo = await getLocalPrintAgentInfo()
  if (!agentInfo.ok) {
    throw new Error(localPrintAgentUnreachableMessage(agentInfo))
  }
  if (agentInfo.supportsDocument !== true) {
    throw new Error(AGENT_UPGRADE_MSG)
  }

  const sheetHw = await loadSheetPrinterFromSettings()
  const prep = await axios.post<SheetPrepareResponse>('/api/reseller/erp/print/test-receipt', {
    printer: 'epson_sheet',
    paper_size: sheetHw.paperSize,
  })
  return deliverSheetEstimate(prep.data, 'L3310 sheet test')
}

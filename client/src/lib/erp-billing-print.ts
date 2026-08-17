/** Epson billing / estimate thermal print — via local Windows print agent on the shop PC. */

import axios from '@/lib/axios'
import {
  LOCAL_PRINT_AGENT_URL,
  checkLocalPrintAgent,
  getLocalPrintAgentInfo,
  listLocalPrinters,
} from '@/lib/erp-local-print'
import { migrateHardwareSettings, type ErpHardwareSettings } from '@/lib/erp-hardware'

type ThermalPrepareResponse = {
  escPosBase64?: string
  windowsPrinterName?: string
  message?: string
  printed?: boolean
  requiresClientPrint?: boolean
}

const DEFAULT_EPSON_NAME = 'EPSON TM-m30III Receipt'

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

async function loadBillingPrinterNameFromSettings(): Promise<string | null> {
  try {
    const res = await axios.get<{ settings?: { hardware?: ErpHardwareSettings } }>(
      '/api/reseller/erp/settings',
    )
    const hw = migrateHardwareSettings(res.data.settings?.hardware)
    return hw.billingPrinter?.windowsPrinterName?.trim() || null
  } catch {
    return null
  }
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

  let lastError = 'Could not print on Epson.'
  for (const path of endpoints) {
    try {
      const r = await fetch(`${LOCAL_PRINT_AGENT_URL}${path}`, {
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
          : `Epson print failed (${r.status}).`)
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError
    }
  }

  throw new Error(
    `${lastError} Keep START-KC-Label-Print.bat running and check Hardware → Epson billing printer name.`,
  )
}

async function deliverThermalReceipt(
  prep: ThermalPrepareResponse,
  successLabel: string,
): Promise<string> {
  const escPosBase64 = prep.escPosBase64
  if (!escPosBase64) {
    throw new Error('Could not prepare Epson receipt data from server.')
  }

  const configuredName =
    prep.windowsPrinterName || (await loadBillingPrinterNameFromSettings()) || DEFAULT_EPSON_NAME
  const printerName = await resolveLocalBillingPrinterName(configuredName)
  await printReceiptViaLocalAgent(escPosBase64, printerName)
  return `${successLabel} sent to ${printerName} on this PC.`
}

async function printThermalViaLocalAgent(
  endpoint: '/api/reseller/erp/print/estimate' | '/api/reseller/erp/print/bill',
  billId: number,
  successLabel: string,
): Promise<string> {
  const agentOk = await checkLocalPrintAgent()
  if (!agentOk) {
    throw new Error(
      'Local print agent is not running on this PC. Start START-KC-Label-Print.bat from erp-print-service on the Desktop, then try again.',
    )
  }

  const prep = await axios.post<ThermalPrepareResponse>(endpoint, {
    bill_id: billId,
    mode: 'client',
  })

  if (prep.data.printed && !prep.data.escPosBase64) {
    return prep.data.message || `${successLabel} sent to Epson.`
  }

  return deliverThermalReceipt(prep.data, successLabel)
}

export function printErpEstimateThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent('/api/reseller/erp/print/estimate', billId, 'Estimate')
}

export function printErpBillThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent('/api/reseller/erp/print/bill', billId, 'Receipt')
}

export async function printErpTestReceipt(): Promise<string> {
  const agentOk = await checkLocalPrintAgent()
  if (!agentOk) {
    throw new Error(
      'Local print agent is not running. Start START-KC-Label-Print.bat on this PC first.',
    )
  }

  const prep = await axios.post<ThermalPrepareResponse>('/api/reseller/erp/print/test-receipt')
  return deliverThermalReceipt(prep.data, 'Test receipt')
}

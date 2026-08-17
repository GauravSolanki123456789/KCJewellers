/** Epson billing / estimate thermal print — via local Windows print agent on the shop PC. */

import axios from '@/lib/axios'
import {
  LOCAL_PRINT_AGENT_URL,
  checkLocalPrintAgent,
  listLocalPrinters,
} from '@/lib/erp-local-print'

type ThermalPrepareResponse = {
  escPosBase64?: string
  windowsPrinterName?: string
  message?: string
  printed?: boolean
}

const DEFAULT_EPSON_NAME = 'EPSON TM-m30III Receipt'

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

export async function printReceiptViaLocalAgent(
  escPosBase64: string,
  printerName: string,
): Promise<void> {
  const r = await fetch(`${LOCAL_PRINT_AGENT_URL}/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ printerName, escPosBase64 }),
  })
  let data: { ok?: boolean; error?: string } = {}
  try {
    data = (await r.json()) as typeof data
  } catch {
    data = {}
  }
  if (!r.ok || !data.ok) {
    throw new Error(
      data.error ||
        'Could not print on Epson — is the local print agent running on this PC? (START-KC-Label-Print.bat)',
    )
  }
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
    mode: 'prepare',
  })
  const escPosBase64 = prep.data.escPosBase64
  if (!escPosBase64) {
    throw new Error('Could not prepare Epson receipt data.')
  }

  const printerName = await resolveLocalBillingPrinterName(prep.data.windowsPrinterName)
  await printReceiptViaLocalAgent(escPosBase64, printerName)
  return `${successLabel} sent to ${printerName} on this PC.`
}

export function printErpEstimateThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent('/api/reseller/erp/print/estimate', billId, 'Estimate')
}

export function printErpBillThermal(billId: number): Promise<string> {
  return printThermalViaLocalAgent('/api/reseller/erp/print/bill', billId, 'Receipt')
}

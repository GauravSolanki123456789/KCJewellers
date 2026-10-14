import { normalizeAddressField } from '@/lib/erp-customer-address-format'

function normHeader(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '')
}

/** Read a cell by header name (case / spacing insensitive). */
export function pickBulkCustomerCell(row: Record<string, unknown>, aliases: string[]): string {
  const want = new Set(aliases.map(normHeader))
  for (const [k, v] of Object.entries(row)) {
    if (!want.has(normHeader(k))) continue
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

/** Billing address: line1 = Address1, line2 = Address2, line3 = Place + Pincode; or multiline Address column. */
export function buildBulkCustomerAddress(row: Record<string, unknown>): string {
  const single = pickBulkCustomerCell(row, [
    'Address',
    'address',
    'Billing address',
    'billing address',
  ])
  if (single) return normalizeAddressField(single)

  const line1 = pickBulkCustomerCell(row, ['Address1', 'address1', 'Address 1'])
  const line2 = pickBulkCustomerCell(row, ['Address2', 'address2', 'Address 2'])
  const place = pickBulkCustomerCell(row, ['Place', 'place', 'City', 'city'])
  const pincode = pickBulkCustomerCell(row, ['Pincode', 'pincode', 'PIN', 'Pin', 'Zip', 'ZIP'])

  const lines: string[] = []
  if (line1) lines.push(line1)
  if (line2) lines.push(line2)
  if (place && pincode) lines.push(`${place} - ${pincode}`)
  else if (place || pincode) lines.push(place || pincode)

  if (lines.length) return lines.slice(0, 3).join('\n')
  return ''
}

export type BulkCustomerRow = {
  Name: string
  Mobile: string
  Email: string
  GSTIN: string
  PAN: string
  Address: string
  Birthday: string
  Anniversary: string
  Notes: string
  Slab: string
  rate_slab?: string
}

/** Map one spreadsheet row (KC sample or legacy ACCOUNTS.xls) to bulk API shape. */
export function mapBulkCustomerSpreadsheetRow(row: Record<string, unknown>): BulkCustomerRow {
  const name = pickBulkCustomerCell(row, ['Name', 'name', 'aname', 'AName', 'Customer', 'Customer Name'])
  const mobile = pickBulkCustomerCell(row, ['Mobile', 'mobile', 'phone', 'Phone', 'Mobile No'])
  const email = pickBulkCustomerCell(row, ['Email', 'email'])
  const gstin = pickBulkCustomerCell(row, ['GSTIN', 'gstin', 'Gstin'])
  const pan = pickBulkCustomerCell(row, ['PAN', 'pan'])
  const address = buildBulkCustomerAddress(row)
  const birthday = pickBulkCustomerCell(row, ['Birthday', 'birthday', 'Birthdate', 'birthdate'])
  const anniversary = pickBulkCustomerCell(row, [
    'Anniversary',
    'anniversary',
    'Anniversary Date',
    'anniversary_date',
  ])
  const notes = pickBulkCustomerCell(row, ['Notes', 'notes'])
  const slabRaw = pickBulkCustomerCell(row, ['Slab', 'slab', 'SLAB', 'rate_slab', 'Rate Slab'])

  const out: BulkCustomerRow = {
    Name: name,
    Mobile: mobile,
    Email: email,
    GSTIN: gstin,
    PAN: pan,
    Address: address,
    Birthday: birthday,
    Anniversary: anniversary,
    Notes: notes,
    Slab: slabRaw,
  }
  if (slabRaw) out.rate_slab = slabRaw
  return out
}

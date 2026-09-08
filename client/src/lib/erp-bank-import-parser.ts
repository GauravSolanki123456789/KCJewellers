/**
 * Smart bank statement Excel/CSV parser — IDFC, HDFC, generic formats.
 */

export type ParsedBankRow = {
  row_index: number
  entry_date: string
  value_date?: string
  entry_type: 'payment_in' | 'payment_out'
  amount_inr: number
  narration: string
  reference_no: string
  counterparty_name: string
  bank_name: string
  payment_mode: string
  customer_id?: number | null
  /** Server-side duplicate check result */
  duplicate?: boolean
  skip?: boolean
}

function normalizeKey(k: string): string {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row || {})
  for (const alias of aliases) {
    const hit = keys.find((k) => normalizeKey(k).includes(alias))
    if (hit != null && String(row[hit] ?? '').trim() !== '') return row[hit]
  }
  return null
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function parseDateOrNull(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  const dmY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (dmY) {
    return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`
  }
  const dMonY = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s)
  if (dMonY) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const m = months[dMonY[2].toLowerCase()]
    if (m) return `${dMonY[3]}-${m}-${dMonY[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  return null
}

/** Extract party name from IDFC-style NEFT/IFT narration. */
function extractCounterparty(particulars: string): string {
  const s = particulars.trim()
  if (!s) return ''
  const neft = /^NEFT\/[^/]+\/([^/]+)\//i.exec(s)
  if (neft?.[1]) return neft[1].trim()
  const ift = /^IFT\/[^/]+\/([^/]+)\//i.exec(s)
  if (ift?.[1]) return ift[1].replace(/\s+\./g, '').trim()
  const upi = /\/([^/]+@[^/]+)/i.exec(s)
  if (upi?.[1]) return upi[1].trim()
  return s.slice(0, 120)
}

/** Extract UTR / ref from narration when no dedicated column. */
function extractReference(particulars: string, chequeNo: string): string {
  const cheque = String(chequeNo || '').trim()
  if (cheque) return cheque.slice(0, 120)
  const s = particulars.trim()
  const neft = /^NEFT\/([^/]+)/i.exec(s)
  if (neft?.[1]) return neft[1].trim()
  const ift = /^IFT\/([^/]+)/i.exec(s)
  if (ift?.[1]) return ift[1].trim()
  return s.slice(0, 120)
}

function inferPaymentMode(particulars: string): string {
  const u = particulars.toUpperCase()
  if (u.includes('UPI')) return 'upi'
  if (u.includes('NEFT')) return 'neft'
  if (u.includes('IMPS')) return 'imps'
  if (u.includes('IFT') || u.includes('RTGS')) return 'neft'
  if (u.includes('CHEQUE') || u.includes('CHQ')) return 'cheque'
  if (u.includes('CASH')) return 'cash'
  return 'neft'
}

function mapGenericRow(row: Record<string, unknown>, rowIndex: number, bankName: string): ParsedBankRow | null {
  const dateRaw =
    pickField(row, ['txn date', 'transaction date', 'value date', 'posting date', 'date']) ||
    row.date ||
    row.Date
  const entryDate = parseDateOrNull(dateRaw) || new Date().toISOString().slice(0, 10)

  let credit = parseAmount(
    pickField(row, ['credit', 'deposit', 'cr amount', 'credit amount']) || row.credit || row.Credit,
  )
  let debit = parseAmount(
    pickField(row, ['debit', 'withdrawal', 'dr amount', 'debit amount']) || row.debit || row.Debit,
  )
  const amountRaw = parseAmount(pickField(row, ['amount', 'transaction amount', 'amt']) || row.amount)

  let entryType: 'payment_in' | 'payment_out' = 'payment_in'
  let amount = credit
  if (amount == null && amountRaw != null) {
    amount = Math.abs(amountRaw)
    entryType = amountRaw < 0 ? 'payment_out' : 'payment_in'
  }
  if (debit != null && debit > 0) {
    amount = debit
    entryType = 'payment_out'
  }
  if (amount == null || amount <= 0) return null

  const narration = String(
    pickField(row, ['narration', 'description', 'particulars', 'remarks', 'details']) ||
      row.narration ||
      row.Narration ||
      '',
  ).trim()
  const reference = String(
    pickField(row, ['reference', 'ref no', 'utr', 'cheque', 'txn id', 'transaction id']) ||
      row.reference ||
      row.UTR ||
      extractReference(narration, ''),
  ).trim()
  const counterparty = String(
    pickField(row, ['beneficiary', 'party name', 'customer', 'payee', 'name']) ||
      row.customer ||
      row.Customer ||
      extractCounterparty(narration),
  ).trim()

  return {
    row_index: rowIndex,
    entry_date: entryDate,
    entry_type: entryType,
    amount_inr: amount,
    narration: narration.slice(0, 2000),
    reference_no: reference.slice(0, 120),
    counterparty_name: counterparty.slice(0, 255),
    bank_name: bankName || String(pickField(row, ['bank', 'bank name']) || row.bank || '').trim().slice(0, 120),
    payment_mode: inferPaymentMode(narration),
  }
}

/** Parse IDFC FIRST Bank statement (header block + transaction table). */
function parseIdfcSheet(rows: unknown[][]): { bankName: string; parsed: ParsedBankRow[] } {
  const bankName = 'IDFC FIRST Bank'
  let headerIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const joined = row.map((c) => String(c || '').toLowerCase()).join('|')
    if (joined.includes('transaction date') && (joined.includes('debit') || joined.includes('credit'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return { bankName, parsed: [] }

  const headers = (rows[headerIdx] as unknown[]).map((h) => String(h || '').trim())
  const parsed: ParsedBankRow[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i] as unknown[]
    if (!cells?.length || cells.every((c) => String(c ?? '').trim() === '')) continue

    const obj: Record<string, unknown> = {}
    headers.forEach((h, j) => {
      if (h) obj[h] = cells[j] ?? ''
    })

    const txnDate = parseDateOrNull(obj['Transaction Date'] || obj['Txn Date'])
    if (!txnDate) continue

    const credit = parseAmount(obj.Credit)
    const debit = parseAmount(obj.Debit)
    let entryType: 'payment_in' | 'payment_out' = 'payment_in'
    let amount = credit
    if (debit != null && debit > 0) {
      amount = debit
      entryType = 'payment_out'
    }
    if (amount == null || amount <= 0) continue

    const particulars = String(obj.Particulars || obj['Transaction Remarks'] || '').trim()
    const chequeNo = String(obj['Cheque No.'] || obj['Cheque No'] || '').trim()

    parsed.push({
      row_index: i,
      entry_date: txnDate,
      value_date: parseDateOrNull(obj['Value Date']) || undefined,
      entry_type: entryType,
      amount_inr: amount,
      narration: particulars.slice(0, 2000),
      reference_no: extractReference(particulars, chequeNo).slice(0, 120),
      counterparty_name: extractCounterparty(particulars).slice(0, 255),
      bank_name: bankName,
      payment_mode: inferPaymentMode(particulars),
    })
  }

  return { bankName, parsed }
}

function detectBankName(fileName: string, rows: unknown[][]): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('idfc')) return 'IDFC FIRST Bank'
  if (lower.includes('hdfc')) return 'HDFC Bank'
  if (lower.includes('icici')) return 'ICICI Bank'
  if (lower.includes('sbi') || lower.includes('state bank')) return 'SBI'
  const flat = rows.slice(0, 20).flat().map((c) => String(c || '').toLowerCase()).join(' ')
  if (flat.includes('idfc')) return 'IDFC FIRST Bank'
  if (flat.includes('hdfc')) return 'HDFC Bank'
  return ''
}

/** Parse workbook first sheet into normalized bank rows. */
export async function parseBankStatementFile(file: File): Promise<{
  rows: ParsedBankRow[]
  bankName: string
  format: 'idfc' | 'generic'
}> {
  const buf = await file.arrayBuffer()
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  const bankName = detectBankName(file.name, matrix)

  const idfc = parseIdfcSheet(matrix)
  if (idfc.parsed.length > 0) {
    return { rows: idfc.parsed, bankName: idfc.bankName, format: 'idfc' }
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const parsed: ParsedBankRow[] = []
  jsonRows.forEach((row, idx) => {
    const mapped = mapGenericRow(row, idx, bankName)
    if (mapped) parsed.push(mapped)
  })

  return { rows: parsed, bankName, format: 'generic' }
}

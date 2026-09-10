/**
 * Smart bank statement Excel/CSV parser — IDFC, HDFC, SBI, ICICI, generic formats.
 * Credit / deposit = money received. Debit / withdrawal = money paid out.
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
    .trim()
}

function pickField(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row || {})
  const norms = keys.map((k) => ({ k, n: normalizeKey(k) }))

  const matchAlias = (alias: string, mode: 'exact' | 'token' | 'includes'): (typeof norms)[0] | undefined => {
    const a = normalizeKey(alias)
    if (!a) return undefined
    const aliasTokens = a.split(' ').filter(Boolean)
    return norms.find((x) => {
      if (mode === 'exact') return x.n === a
      const tokens = x.n.split(' ').filter(Boolean)
      if (mode === 'token') {
        if (aliasTokens.length === 1 && aliasTokens[0].length <= 2) return tokens.includes(aliasTokens[0])
        return x.n === a || tokens.slice(0, aliasTokens.length).join(' ') === a
      }
      if (aliasTokens.length === 1 && aliasTokens[0].length <= 2) return tokens.includes(aliasTokens[0])
      return x.n === a || x.n.startsWith(`${a} `) || x.n.includes(` ${a} `) || x.n.endsWith(` ${a}`)
    })
  }

  for (const mode of ['exact', 'token', 'includes'] as const) {
    for (const alias of aliases) {
      const hit = matchAlias(alias, mode)
      if (hit != null && String(row[hit.k] ?? '').trim() !== '') return row[hit.k]
    }
  }
  return null
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 100) / 100
  const n = Number(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function excelSerialToIso(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null
  const epoch = Date.UTC(1899, 11, 30)
  const dt = new Date(epoch + Math.round(n) * 86400000)
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

function parseDateOrNull(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') return excelSerialToIso(v)
  const s = String(v).trim()
  if (!s) return null
  const asNum = Number(s)
  if (/^\d+(\.\d+)?$/.test(s) && asNum > 20000 && asNum < 80000) return excelSerialToIso(asNum)
  const dmY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (dmY) {
    return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`
  }
  const dMonY = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s)
  if (dMonY) {
    const months: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    }
    const m = months[dMonY[2].toLowerCase()]
    if (m) return `${dMonY[3]}-${m}-${dMonY[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dt = new Date(s)
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10)
  return null
}

function parseDrCrHint(v: unknown): 'in' | 'out' | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (!s) return null
  if (s === 'cr' || s === 'c' || s === 'credit' || s === 'deposit' || s === 'received') return 'in'
  if (s === 'dr' || s === 'd' || s === 'debit' || s === 'withdrawal' || s === 'paid' || s === 'payout') return 'out'
  if (s.includes('credit') && !s.includes('debit')) return 'in'
  if (s.includes('debit') && !s.includes('credit')) return 'out'
  return null
}

/** Credit / deposit = received. Debit / withdrawal = paid out. */
export function resolveBankCreditDebit(
  credit: number | null,
  debit: number | null,
  amountRaw: number | null,
  drCr?: unknown,
): { amount: number; entryType: 'payment_in' | 'payment_out' } | null {
  const cr = credit != null && credit > 0 ? credit : null
  const dr = debit != null && debit > 0 ? debit : null
  if (cr && !dr) return { amount: cr, entryType: 'payment_in' }
  if (dr && !cr) return { amount: dr, entryType: 'payment_out' }
  if (cr && dr) {
    if (cr >= dr) return { amount: cr, entryType: 'payment_in' }
    return { amount: dr, entryType: 'payment_out' }
  }
  if (amountRaw != null && amountRaw !== 0) {
    const abs = Math.abs(amountRaw)
    const hint = parseDrCrHint(drCr)
    if (hint === 'in') return { amount: abs, entryType: 'payment_in' }
    if (hint === 'out') return { amount: abs, entryType: 'payment_out' }
    return { amount: abs, entryType: amountRaw < 0 ? 'payment_out' : 'payment_in' }
  }
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
  const rtgs = /^RTGS\/([^/]+)/i.exec(s)
  if (rtgs?.[1]) return rtgs[1].trim()
  const imps = /^IMPS[^/]*\/([^/]+)/i.exec(s)
  if (imps?.[1]) return imps[1].trim()
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

const CREDIT_ALIASES = ['credit', 'deposit', 'cr amount', 'credit amount', 'deposit amt', 'cr']
const DEBIT_ALIASES = ['debit', 'withdrawal', 'dr amount', 'debit amount', 'withdrawal amt', 'dr']

function mapGenericRow(row: Record<string, unknown>, rowIndex: number, bankName: string): ParsedBankRow | null {
  const dateRaw =
    pickField(row, ['txn date', 'transaction date', 'value date', 'posting date', 'date']) ||
    row.date ||
    row.Date
  const entryDate = parseDateOrNull(dateRaw)
  if (!entryDate) return null

  const credit = parseAmount(
    pickField(row, CREDIT_ALIASES) || row.credit || row.Credit,
  )
  const debit = parseAmount(pickField(row, DEBIT_ALIASES) || row.debit || row.Debit)
  const amountRaw = parseAmount(pickField(row, ['amount', 'transaction amount', 'amt']) || row.amount)
  const drCr = pickField(row, ['dr cr', 'cr dr', 'debit credit']) || row['Dr / Cr'] || row.Type
  const resolved = resolveBankCreditDebit(credit, debit, amountRaw, drCr)
  if (!resolved) return null

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
    entry_type: resolved.entryType,
    amount_inr: resolved.amount,
    narration: narration.slice(0, 2000),
    reference_no: reference.slice(0, 120),
    counterparty_name: counterparty.slice(0, 255),
    bank_name: bankName || String(pickField(row, ['bank', 'bank name']) || row.bank || '').trim().slice(0, 120),
    payment_mode: inferPaymentMode(narration),
  }
}

function headerIndex(headers: string[], aliases: string[]): number {
  const norms = headers.map((h) => normalizeKey(h))
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    const exact = norms.findIndex((n) => n === a)
    if (exact >= 0) return exact
  }
  for (const alias of aliases) {
    const a = normalizeKey(alias)
    if (a.length <= 2) {
      const token = norms.findIndex((n) => n.split(' ').includes(a))
      if (token >= 0) return token
      continue
    }
    const hit = norms.findIndex((n) => n === a || n.startsWith(`${a} `) || n.includes(` ${a}`))
    if (hit >= 0) return hit
  }
  return -1
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
  const creditIdx = headerIndex(headers, CREDIT_ALIASES)
  const debitIdx = headerIndex(headers, DEBIT_ALIASES)
  const parsed: ParsedBankRow[] = []

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i] as unknown[]
    if (!cells?.length || cells.every((c) => String(c ?? '').trim() === '')) continue

    const obj: Record<string, unknown> = {}
    headers.forEach((h, j) => {
      if (h) obj[h] = cells[j] ?? ''
    })

    const txnDate = parseDateOrNull(
      obj['Transaction Date'] || obj['Txn Date'] || pickField(obj, ['transaction date', 'txn date']),
    )
    if (!txnDate) continue

    const credit = parseAmount(creditIdx >= 0 ? cells[creditIdx] : obj.Credit)
    const debit = parseAmount(debitIdx >= 0 ? cells[debitIdx] : obj.Debit)
    const resolved = resolveBankCreditDebit(credit, debit, null, null)
    if (!resolved) continue

    const particulars = String(obj.Particulars || obj['Transaction Remarks'] || '').trim()
    const chequeNo = String(obj['Cheque No.'] || obj['Cheque No'] || '').trim()

    parsed.push({
      row_index: i,
      entry_date: txnDate,
      value_date: parseDateOrNull(obj['Value Date']) || undefined,
      entry_type: resolved.entryType,
      amount_inr: resolved.amount,
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
  if (lower.includes('axis')) return 'Axis Bank'
  if (lower.includes('kotak')) return 'Kotak Bank'
  if (lower.includes('sbi') || lower.includes('state bank')) return 'SBI'
  const flat = rows
    .slice(0, 20)
    .flat()
    .map((c) => String(c || '').toLowerCase())
    .join(' ')
  if (flat.includes('idfc')) return 'IDFC FIRST Bank'
  if (flat.includes('hdfc')) return 'HDFC Bank'
  if (flat.includes('icici')) return 'ICICI Bank'
  if (flat.includes('axis bank')) return 'Axis Bank'
  if (flat.includes('state bank')) return 'SBI'
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
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true }) as unknown[][]
  const bankName = detectBankName(file.name, matrix)

  const idfc = parseIdfcSheet(matrix)
  if (idfc.parsed.length > 0) {
    return { rows: idfc.parsed, bankName: idfc.bankName, format: 'idfc' }
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  const parsed: ParsedBankRow[] = []
  jsonRows.forEach((row, idx) => {
    const mapped = mapGenericRow(row, idx, bankName)
    if (mapped) parsed.push(mapped)
  })

  return { rows: parsed, bankName, format: 'generic' }
}

export function formatErpDateDdMmYyyy(iso?: string | null): string {
  if (!iso) return '—'
  const s = String(iso).trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return s
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Date + time as dd/mm/yyyy, hh:mm am/pm (India). */
export function formatErpDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatErpDateDdMmYyyy(iso)
  const date = formatErpDateDdMmYyyy(iso)
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${date}, ${time}`
}

/** ISO yyyy-mm-dd → dd/mm/yyyy for text inputs. */
export function isoToDdMmYyyyInput(iso?: string | null): string {
  if (!iso) return ''
  const s = String(iso).trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return ''
}

/** Parse dd/mm/yyyy (or dd-mm-yyyy) → ISO yyyy-mm-dd, or null if invalid. */
export function parseDdMmYyyyToIso(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)
  if (!m) return null
  const dd = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  const yyyy = parseInt(m[3], 10)
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null
  const d = new Date(yyyy, mm - 1, dd)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** Filter dates for API: accept dd/mm/yyyy display or ISO. */
export function erpDateFilterToIso(input: string): string {
  if (!input.trim()) return ''
  const parsed = parseDdMmYyyyToIso(input)
  if (parsed) return parsed
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim().slice(0, 10))) return input.trim().slice(0, 10)
  return ''
}

/** Days until next annual occurrence (month-day) from today at local midnight. */
export function daysUntilAnnualEvent(iso?: string | null): number | null {
  if (!iso) return null
  const s = String(iso).trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const month = parseInt(m[2], 10) - 1
  const day = parseInt(m[3], 10)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let next = new Date(today.getFullYear(), month, day)
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month, day)
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000)
}

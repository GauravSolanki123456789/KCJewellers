/** Display ERP dates as dd/mm/yyyy (India). */

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

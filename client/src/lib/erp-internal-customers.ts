/** System / lane cash-book customers — hidden from normal CRM export and search. */

export function compactCustomerNameKey(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '')
}

export function isInternalErpCustomer(row: {
  name?: string | null
  notes?: string | null
}): boolean {
  const key = compactCustomerNameKey(row.name)
  if (key === 'cash' || key === 'cashbook' || key === 'jainav2') return true
  const notes = String(row.notes || '').toLowerCase()
  if (/lane\s*cash|official\s*cash|cash\s*book/i.test(notes)) return true
  return false
}

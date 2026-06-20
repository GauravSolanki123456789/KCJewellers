/** Indian mobile / WhatsApp number helpers for checkout & admin contact. */

export type CheckoutContact = {
  name: string
  mobile: string
}

export function normalizeIndianMobileDigits(raw: string | null | undefined): string {
  return String(raw || '').replace(/\D/g, '').slice(-10)
}

export function formatIndianMobileDisplay(digits10: string): string {
  const d = normalizeIndianMobileDigits(digits10)
  if (d.length !== 10) return digits10.trim()
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`
}

export function validateCheckoutContact(contact: CheckoutContact): string | null {
  const name = contact.name.trim()
  const mobile = normalizeIndianMobileDigits(contact.mobile)
  if (name.length < 2) return 'Enter your full name (at least 2 characters)'
  if (mobile.length !== 10) return 'Enter a valid 10-digit WhatsApp / mobile number'
  if (!/^[6-9]/.test(mobile)) return 'Mobile number should start with 6, 7, 8, or 9'
  return null
}

/** wa.me expects country code + national number (no +). */
export function toWhatsAppWaMeFromMobile(mobile: string | undefined): string {
  const d = normalizeIndianMobileDigits(mobile)
  if (d.length !== 10) return ''
  return `91${d}`
}

export function checkoutContactFromUser(user: unknown): CheckoutContact {
  const u = user as { name?: string; mobile_number?: string } | null | undefined
  return {
    name: String(u?.name || '').trim(),
    mobile: normalizeIndianMobileDigits(u?.mobile_number),
  }
}

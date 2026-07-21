/** Shared-catalog customer mobile — India + international. */

export type ParsedMobile = {
  stored: string
  countryCode: string
  national: string
  isIndian: boolean
  display: string
  whatsAppDigits: string
}

export type CountryDialOption = {
  code: string
  label: string
  flag: string
  placeholder: string
  maxLength: number
}

export const COMMON_COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '91', label: 'India', flag: '🇮🇳', placeholder: '10-digit mobile', maxLength: 10 },
  { code: '1', label: 'US / Canada', flag: '🇺🇸', placeholder: 'Mobile number', maxLength: 10 },
  { code: '44', label: 'United Kingdom', flag: '🇬🇧', placeholder: 'Mobile number', maxLength: 10 },
  { code: '971', label: 'UAE', flag: '🇦🇪', placeholder: 'Mobile number', maxLength: 9 },
  { code: '966', label: 'Saudi Arabia', flag: '🇸🇦', placeholder: 'Mobile number', maxLength: 9 },
  { code: '65', label: 'Singapore', flag: '🇸🇬', placeholder: 'Mobile number', maxLength: 8 },
  { code: '61', label: 'Australia', flag: '🇦🇺', placeholder: 'Mobile number', maxLength: 9 },
  { code: '49', label: 'Germany', flag: '🇩🇪', placeholder: 'Mobile number', maxLength: 11 },
  { code: '33', label: 'France', flag: '🇫🇷', placeholder: 'Mobile number', maxLength: 9 },
  { code: '81', label: 'Japan', flag: '🇯🇵', placeholder: 'Mobile number', maxLength: 10 },
  { code: '86', label: 'China', flag: '🇨🇳', placeholder: 'Mobile number', maxLength: 11 },
  { code: '974', label: 'Qatar', flag: '🇶🇦', placeholder: 'Mobile number', maxLength: 8 },
  { code: '968', label: 'Oman', flag: '🇴🇲', placeholder: 'Mobile number', maxLength: 8 },
  { code: '973', label: 'Bahrain', flag: '🇧🇭', placeholder: 'Mobile number', maxLength: 8 },
  { code: '965', label: 'Kuwait', flag: '🇰🇼', placeholder: 'Mobile number', maxLength: 8 },
]

function digitsOnly(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

export function isIndianMobileDigits(digits: string): boolean {
  const d = digitsOnly(digits)
  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) return true
  if (d.length === 12 && d.startsWith('91') && /^91[6-9]\d{9}$/.test(d)) return true
  return false
}

export function normalizeStoredMobile(raw: string | null | undefined): string {
  const d = digitsOnly(raw)
  if (!d) return ''
  if (d.length === 12 && d.startsWith('91') && /^91[6-9]\d{9}$/.test(d)) {
    return d.slice(2)
  }
  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) {
    return d
  }
  return d
}

export function parseInternationalMobileInput(
  countryCode: string,
  nationalNumber: string,
): { ok: true; parsed: ParsedMobile } | { ok: false; error: string } {
  const cc = digitsOnly(countryCode).replace(/^0+/, '')
  const national = digitsOnly(nationalNumber).replace(/^0+/, '')
  if (!cc || !national) {
    return { ok: false, error: 'Enter country code and mobile number' }
  }
  const combined = `${cc}${national}`
  if (cc === '91') {
    const indian = national.length === 10 ? national : combined.slice(-10)
    if (!/^[6-9]\d{9}$/.test(indian)) {
      return { ok: false, error: 'Enter a valid 10-digit Indian mobile number' }
    }
    return {
      ok: true,
      parsed: {
        stored: indian,
        countryCode: '91',
        national: indian,
        isIndian: true,
        display: `+91 ${indian.slice(0, 5)} ${indian.slice(5)}`,
        whatsAppDigits: `91${indian}`,
      },
    }
  }
  if (national.length < 4 || national.length > 14) {
    return { ok: false, error: 'Enter a valid mobile number for your country' }
  }
  if (combined.length < 8 || combined.length > 15) {
    return { ok: false, error: 'Mobile number looks too short or too long' }
  }
  return {
    ok: true,
    parsed: {
      stored: combined,
      countryCode: cc,
      national,
      isIndian: false,
      display: `+${cc} ${national}`,
      whatsAppDigits: combined,
    },
  }
}

export function mobilesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeStoredMobile(a)
  const nb = normalizeStoredMobile(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length === 10 && nb === `91${na}`) return true
  if (nb.length === 10 && na === `91${nb}`) return true
  return false
}

export function formatStoredMobileDisplay(stored: string | null | undefined): string | null {
  const n = normalizeStoredMobile(stored)
  if (!n) return null
  if (n.length === 10 && /^[6-9]/.test(n)) {
    return `+91 ${n.slice(0, 5)} ${n.slice(5)}`
  }
  if (n.startsWith('91') && n.length === 12) {
    const indian = n.slice(2)
    return `+91 ${indian.slice(0, 5)} ${indian.slice(5)}`
  }
  return `+${n}`
}

export function whatsAppDigitsFromStored(stored: string | null | undefined): string | null {
  const n = normalizeStoredMobile(stored)
  if (!n) return null
  if (n.length === 10 && /^[6-9]/.test(n)) return `91${n}`
  return n
}

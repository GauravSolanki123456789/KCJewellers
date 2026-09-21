const WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'admin',
  'admin123',
  'letmein',
  'welcome',
  'iloveyou',
  '000000',
  '111111',
  'abc123',
  'monkey',
  'dragon',
  'master',
  'login',
  'princess',
  'football',
  'shadow',
  'sunshine',
  'trustno1',
  '654321',
  'superman',
  'qazwsx',
  'passw0rd',
  'hello123',
  'starwars',
  'batman',
  'access',
  'mustang',
  '696969',
  '123123',
  '121212',
  '112233',
  '987654321',
  '1234',
  '12345',
  '1234567',
  'changeme',
  'secret',
  'test123',
  'guest',
  'root',
  'toor',
  'administrator',
  'staff',
  'staff123',
  'jewellery',
  'jewelry',
  'silver',
  'gold123',
])

export function validateErpOperatorPassword(password: string): string | null {
  const s = String(password || '')
  if (s.length < 12) {
    return 'Password must be at least 12 characters (letters, numbers, and a symbol recommended).'
  }
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) {
    return 'Password must include both letters and numbers.'
  }
  const lower = s.toLowerCase()
  if (WEAK_PASSWORDS.has(lower)) {
    return 'This password is too common. Use a unique passphrase or tap Generate secure password.'
  }
  return null
}

export function generateSecureErpPassword(length = 16): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*'
  const all = upper + lower + digits + symbols
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]
  const base = [pick(upper), pick(lower), pick(digits), pick(symbols)]
  while (base.length < length) {
    base.push(pick(all))
  }
  for (let i = base.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  return base.join('')
}

/**
 * Admin users who may use Catalogue Builder / shared-catalog APIs.
 * Aligns with `AdminGuard` and `services/authService.resolveUserRole` (super_admin email + roles).
 */
export const SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

export function isCatalogAdminUser(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const u = user as { email?: string; role?: string }
  const email = (u.email || '').toLowerCase().trim()
  if (email === SUPER_ADMIN_EMAIL.toLowerCase()) return true
  const role = String(u.role || '').toLowerCase()
  return role === 'super_admin' || role === 'admin'
}

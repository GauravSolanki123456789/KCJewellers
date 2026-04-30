/**
 * Admin access helpers — keep in sync with `middleware/auth.js` `isAdminStrict`
 * (whitelisted super-admin email) and `AdminGuard` (dashboard UI for admin roles).
 */
export const KC_SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

type UserLike = { email?: string; role?: string } | null | undefined

export function userHasAdminDashboardAccess(user: UserLike): boolean {
  if (!user) return false
  const email = String(user.email || '')
    .toLowerCase()
    .trim()
  const role = String(user.role || '')
  return (
    email === KC_SUPER_ADMIN_EMAIL || role === 'super_admin' || role === 'admin'
  )
}

/** Only this identity may call `/api/admin/*` (matches server `isAdminStrict`). */
export function userCanCallStrictAdminApi(user: UserLike): boolean {
  if (!user) return false
  const email = String(user.email || '')
    .toLowerCase()
    .trim()
  return email === KC_SUPER_ADMIN_EMAIL
}

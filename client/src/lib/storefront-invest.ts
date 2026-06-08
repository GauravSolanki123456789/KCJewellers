/**
 * Invest (SIP) availability — KC main site always; reseller vanity domains only when
 * `users.reseller_invest_enabled` (public API: reseller_invest_enabled).
 */
export function isStorefrontInvestAvailable(
  customDomainHost: boolean,
  resellerInvestEnabled: boolean,
): boolean {
  if (!customDomainHost) return true
  return resellerInvestEnabled
}

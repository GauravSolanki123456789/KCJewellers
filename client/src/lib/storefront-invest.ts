/**
 * Invest (SIP) availability — KC main site only; hidden on reseller custom domains.
 */
export function isStorefrontInvestAvailable(
  customDomainHost: boolean,
  _resellerInvestEnabled?: boolean,
): boolean {
  return !customDomainHost
}

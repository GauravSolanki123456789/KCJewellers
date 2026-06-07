/**
 * Anonymous visitors on a reseller vanity domain (`users.custom_domain`).
 * Used to hide Sign in / Profile so customers stay in the partner storefront.
 */
export function isResellerStorefrontGuest(
  customDomainHost: boolean,
  isAuthenticated: boolean,
): boolean {
  return customDomainHost && !isAuthenticated
}

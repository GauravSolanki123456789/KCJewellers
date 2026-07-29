/** Hosts that use KC Jewellers branding (not a reseller vanity domain). */
export function isCanonicalPlatformHost(host: string): boolean {
  const h = host.trim().toLowerCase().split(":")[0];
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "kcjewellers.co.in" || h === "www.kcjewellers.co.in") return true;
  return false;
}

export function resellerHostFromHeaders(
  hostHeader: string | null | undefined,
  customDomainHeader: string | null | undefined,
): string | null {
  const fromMiddleware = customDomainHeader?.trim().toLowerCase();
  if (fromMiddleware) return fromMiddleware;
  const host = hostHeader?.trim().toLowerCase().split(":")[0];
  if (!host || isCanonicalPlatformHost(host)) return null;
  return host;
}

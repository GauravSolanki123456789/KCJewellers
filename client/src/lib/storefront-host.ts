/** Hosts that use KC Jewellers branding (not a reseller vanity domain). */
export function isCanonicalPlatformHost(host: string): boolean {
  const h = host.trim().toLowerCase().split(":")[0];
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "kcjewellers.co.in" || h === "www.kcjewellers.co.in") return true;
  return false;
}

function apexHost(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/^www\./, "");
}

export function resellerHostFromHeaders(
  hostHeader: string | null | undefined,
  customDomainHeader: string | null | undefined,
): string | null {
  const fromMiddleware = apexHost(customDomainHeader);
  if (fromMiddleware && !isCanonicalPlatformHost(fromMiddleware)) return fromMiddleware;
  const host = apexHost(hostHeader);
  if (!host || isCanonicalPlatformHost(host)) return null;
  return host;
}

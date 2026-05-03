import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Hosts where we do NOT treat the request as a reseller vanity domain.
 * (Do not add NEXT_PUBLIC_SITE_URL here — if it ever equals a reseller domain,
 * branding + OG previews on that host would break.)
 */
function isCanonicalPlatformHost(host: string): boolean {
  const h = host.trim().toLowerCase().split(":")[0];
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "kcjewellers.co.in" || h === "www.kcjewellers.co.in") return true;
  return false;
}

function hostname(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0].trim().toLowerCase();
}

/** Legacy catalogue query URLs → path-based SEO URLs; custom domains → `x-custom-domain` for branding. */
export function middleware(request: NextRequest) {
  const host = hostname(request.headers.get("host"));

  const requestHeaders = new Headers(request.headers);
  if (host && !isCanonicalPlatformHost(host)) {
    requestHeaders.set("x-custom-domain", host);
  }

  const { pathname, searchParams } = request.nextUrl;
  requestHeaders.set("x-pathname", pathname);

  if (pathname === "/catalog") {
    const style = searchParams.get("style")?.trim();
    const sku = searchParams.get("sku")?.trim();
    const metalRaw = (searchParams.get("metal") || "gold").toLowerCase().trim();

    if (
      style &&
      sku &&
      (metalRaw === "gold" || metalRaw === "silver" || metalRaw === "diamond")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/catalog/${encodeURIComponent(metalRaw)}/${encodeURIComponent(style)}/${encodeURIComponent(sku)}`;
      url.search = "";
      const res = NextResponse.redirect(url, 308);
      if (host && !isCanonicalPlatformHost(host)) {
        res.headers.set("x-custom-domain", host);
      }
      return res;
    }
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

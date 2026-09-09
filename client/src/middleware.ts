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

  const iconRewrite =
    pathname === "/favicon.ico" || pathname === "/icon.png"
      ? "/icon"
      : pathname === "/apple-touch-icon.png" ||
          pathname === "/apple-touch-icon-precomposed.png" ||
          pathname === "/apple-icon.png"
        ? "/apple-icon"
        : pathname === "/opengraph-image.png" ||
            pathname === "/opengraph-image2.png" ||
            pathname === "/opengraph-image3.png" ||
            pathname === "/twitter-image.png"
          ? "/opengraph-image"
          : null;
  if (iconRewrite) {
    const url = request.nextUrl.clone();
    url.pathname = iconRewrite;
    url.search = "";
    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  if (pathname === "/catalog") {
    const style = searchParams.get("style")?.trim();
    const sku = searchParams.get("sku")?.trim();
    const metalRaw = (searchParams.get("metal") || "gold").toLowerCase().trim();

    if (
      style &&
      sku &&
      (metalRaw === "gold" || metalRaw === "silver" || metalRaw === "diamond" || metalRaw === "gifting")
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
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/favicon.ico",
    "/icon.png",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
    "/apple-icon.png",
    "/opengraph-image.png",
    "/opengraph-image2.png",
    "/opengraph-image3.png",
    "/twitter-image.png",
  ],
};

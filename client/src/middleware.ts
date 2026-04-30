import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function defaultHostnames(): Set<string> {
  const s = new Set([
    "kcjewellers.co.in",
    "www.kcjewellers.co.in",
    "localhost",
    "127.0.0.1",
  ]);
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      const u = new URL(site.startsWith("http") ? site : `https://${site}`);
      s.add(u.hostname.toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return s;
}

function hostname(hostHeader: string | null): string {
  if (!hostHeader) return "";
  return hostHeader.split(":")[0].trim().toLowerCase();
}

/** Legacy catalogue query URLs → path-based SEO URLs; custom domains → `x-custom-domain` for branding. */
export function middleware(request: NextRequest) {
  const host = hostname(request.headers.get("host"));
  const defaults = defaultHostnames();

  const requestHeaders = new Headers(request.headers);
  if (host && !defaults.has(host)) {
    requestHeaders.set("x-custom-domain", host);
  }

  const { pathname, searchParams } = request.nextUrl;

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
      if (host && !defaults.has(host)) {
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

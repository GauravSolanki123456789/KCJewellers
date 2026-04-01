import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 308 legacy query catalogue URLs → path-based SEO URLs. */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/catalog") return NextResponse.next();

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
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/catalog",
};

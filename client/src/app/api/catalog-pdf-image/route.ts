import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy for catalogue product images so the browser can embed them
 * in @react-pdf/renderer as data URLs (avoids CORS / opaque fetch failures).
 * Only URLs on NEXT_PUBLIC_API_URL with a safe path are allowed.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw?.trim()) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!apiBase) {
    return NextResponse.json({ error: "NEXT_PUBLIC_API_URL not set" }, { status: 500 });
  }

  let allowed: URL;
  try {
    const withScheme =
      apiBase.startsWith("http://") || apiBase.startsWith("https://")
        ? apiBase
        : `http://${apiBase}`;
    allowed = new URL(withScheme);
  } catch {
    return NextResponse.json({ error: "invalid NEXT_PUBLIC_API_URL" }, { status: 500 });
  }

  if (target.origin !== allowed.origin) {
    return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
  }

  const upstream = await fetch(target.toString(), {
    headers: { Accept: "image/*,*/*" },
    next: { revalidate: 3600 },
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return NextResponse.json({ error: "upstream fetch failed" }, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  const ct =
    upstream.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";

  return new NextResponse(buf, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

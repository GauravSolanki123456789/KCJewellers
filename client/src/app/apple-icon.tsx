import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorefrontTenantFromHeaders } from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

async function defaultAppleIconBuffer(): Promise<Buffer> {
  const candidates = [
    path.join(process.cwd(), "public", "favicon.png"),
    path.join(process.cwd(), "src", "app", "icon.png"),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p);
    } catch {
      /* try next */
    }
  }
  throw new Error("Default apple icon not found");
}

export default async function AppleIcon() {
  const { branding, customDomainHost } = await getStorefrontTenantFromHeaders();
  const logoUrl =
    customDomainHost && branding?.logoUrl
      ? normalizeResellerLogoUrl(branding.logoUrl)
      : null;

  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { next: { revalidate: 3600 } });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const ct = res.headers.get("content-type")?.trim() || "image/png";
        return new Response(buf, {
          headers: {
            "Content-Type": ct,
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      }
    } catch {
      /* fall through */
    }
  }

  const buf = await defaultAppleIconBuffer();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

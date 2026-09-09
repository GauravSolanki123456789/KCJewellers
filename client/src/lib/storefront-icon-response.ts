import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorefrontTenantFromHeaders } from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

async function readFallbackPng(kind: "icon" | "og"): Promise<Buffer> {
  const files =
    kind === "og"
      ? [
          path.join(process.cwd(), "public", "og", "kc-jewellers.png"),
          path.join(process.cwd(), "src", "app", "icon.png"),
        ]
      : [
          path.join(process.cwd(), "src", "app", "icon.png"),
          path.join(process.cwd(), "public", "favicon.png"),
        ];
  for (const p of files) {
    try {
      return await readFile(p);
    } catch {
      /* try next */
    }
  }
  throw new Error("Default storefront icon not found");
}

/**
 * Same-origin favicon / OG bytes for the current Host.
 * Reseller vanity domains serve their uploaded logo so WhatsApp/Google never see the KC mark.
 */
export async function storefrontBrandImageResponse(
  kind: "icon" | "og" = "icon",
): Promise<Response> {
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
            "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
          },
        });
      }
    } catch {
      /* fall through */
    }
  }

  const buf = await readFallbackPng(kind);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

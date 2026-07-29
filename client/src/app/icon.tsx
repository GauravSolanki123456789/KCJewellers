import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorefrontTenantFromHeaders } from "@/lib/reseller-branding-server";
import { normalizeResellerLogoUrl } from "@/lib/normalize-image-url";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

async function defaultIconBuffer(): Promise<Buffer> {
  const p = path.join(process.cwd(), "src", "app", "icon.png");
  return readFile(p);
}

/** Reseller custom domains serve their uploaded logo as the tab / Google favicon. */
export default async function Icon() {
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
      /* fall through to KC default */
    }
  }

  const buf = await defaultIconBuffer();
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

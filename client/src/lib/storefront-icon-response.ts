import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    const res = await fetch(logoUrl, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Square PNG so WhatsApp/OG crawlers never receive a 20MP JPEG from the API host. */
async function fitLogoOnSquare(src: Buffer, size: number): Promise<Buffer> {
  const inner = Math.max(32, Math.round(size * 0.86));
  const fitted = await sharp(src)
    .rotate()
    .resize(inner, inner, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: fitted, gravity: "centre" }])
    .png({ compressionLevel: 8 })
    .toBuffer();
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
  const size = kind === "og" ? 1200 : 256;

  if (logoUrl) {
    const raw = await fetchLogoBuffer(logoUrl);
    if (raw) {
      try {
        const png = await fitLogoOnSquare(raw, size);
        return new Response(new Uint8Array(png), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
          },
        });
      } catch {
        /* fall through to original bytes / KC mark */
      }
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

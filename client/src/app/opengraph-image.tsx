import { storefrontBrandImageResponse } from "@/lib/storefront-icon-response";
import { getStorefrontSeoContext } from "@/lib/storefront-seo";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 1200 };
export const contentType = "image/png";

export async function generateAlt() {
  const seo = await getStorefrontSeoContext();
  return seo.brandLabel;
}

/** Same-origin OG image so WhatsApp/Facebook fetch this host, not KC assets. */
export default async function OpenGraphImage() {
  return storefrontBrandImageResponse("og");
}

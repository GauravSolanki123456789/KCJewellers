import type { Metadata } from "next";
import { getStorefrontSeoContext } from "@/lib/storefront-seo";

/** noindex staff/dashboard routes — canonical follows the request host (reseller domain or KC). */
export async function staffRouteMetadata(
  title: string,
  path: string,
): Promise<Metadata> {
  const seo = await getStorefrontSeoContext();
  return {
    title,
    robots: { index: false, follow: false },
    alternates: { canonical: `${seo.origin}${path}` },
  };
}

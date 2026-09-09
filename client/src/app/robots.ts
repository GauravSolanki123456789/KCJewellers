import type { MetadataRoute } from "next";
import { getStorefrontSeoContext } from "@/lib/storefront-seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await getStorefrontSeoContext();
  const base = seo.origin.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/reseller", "/profile"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}

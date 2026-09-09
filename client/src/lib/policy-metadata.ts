import type { Metadata } from "next";
import { getStorefrontSeoContext } from "@/lib/storefront-seo";

export async function policyPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Promise<Metadata> {
  const seo = await getStorefrontSeoContext();
  const description = seo.isResellerHost
    ? opts.description.replace(/KC Jewellers/g, seo.brandLabel)
    : opts.description;
  return {
    title: opts.title,
    description,
    alternates: { canonical: `${seo.origin}${opts.path}` },
    robots: { index: true, follow: true },
  };
}

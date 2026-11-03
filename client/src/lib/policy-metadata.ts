import type { Metadata } from "next";
import { getStorefrontSeoContext, type StorefrontSeoContext } from "@/lib/storefront-seo";

/** Replace KC-default legal copy with the reseller storefront brand on vanity domains. */
export function applyPolicyBranding(text: string, seo: StorefrontSeoContext): string {
  if (!seo.isResellerHost) return text;
  const brand = seo.brandLabel.trim() || "Our store";
  const host = seo.origin.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  let out = text;
  out = out.replace(/KC JEWELLERS/g, brand.toUpperCase());
  out = out.replace(/KC Jewellers/g, brand);
  out = out.replace(/kcjewellers\.co\.in/gi, host);
  out = out.replace(
    /Our physical operations are based out of [^\n]+/,
    `Our operations are conducted under ${brand}.`,
  );
  return out;
}

export async function policyPageMetadata(opts: {
  title: string;
  description: string;
  path: string;
}): Promise<Metadata> {
  const seo = await getStorefrontSeoContext();
  const description = applyPolicyBranding(opts.description, seo);
  const title = seo.isResellerHost ? `${opts.title} · ${seo.brandLabel}` : opts.title;
  return {
    title,
    description,
    alternates: { canonical: `${seo.origin}${opts.path}` },
    robots: { index: true, follow: true },
  };
}

export async function getBrandedPolicyBody(slug: import("@/lib/policy-content").PolicySlug): Promise<string> {
  const { getPolicyPlainText } = await import("@/lib/policy-content");
  const seo = await getStorefrontSeoContext();
  return applyPolicyBranding(getPolicyPlainText(slug), seo);
}

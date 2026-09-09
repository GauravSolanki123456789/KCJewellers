import type { MetadataRoute } from "next";
import { getApiUrlForServer } from "@/lib/site";
import { buildCatalogSegmentPath } from "@/lib/catalog-paths";
import { fetchCatalogJson } from "@/lib/server-data";
import { getStorefrontSeoContext } from "@/lib/storefront-seo";
import {
  CATALOG_PATH,
  POLICY_PRIVACY_PATH,
  POLICY_REFUNDS_PATH,
  POLICY_SHIPPING_PATH,
  POLICY_TERMS_PATH,
  RATES_PATH,
  SIP_PATH,
} from "@/lib/routes";

function matchesMetalForSitemap(
  p: { metal_type?: string },
  m: string
): boolean {
  const mt = (p.metal_type || "").toLowerCase();
  if (m === "gold") return mt.startsWith("gold") || mt.includes("gold");
  if (m === "silver") return mt.startsWith("silver") || mt.includes("silver");
  if (m === "diamond") return mt.startsWith("diamond") || mt.includes("diamond");
  if (m === "gifting") return mt.startsWith("gifting") || mt.includes("gifting");
  return false;
}

async function catalogPillarEntries(
  base: string,
  storefrontDomain?: string | null,
): Promise<MetadataRoute.Sitemap> {
  const categories = await fetchCatalogJson(storefrontDomain);
  const now = new Date();
  const metals = ["gold", "silver", "diamond", "gifting"] as const;
  const out: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      for (const metal of metals) {
        const prods = sub.products || [];
        const has = prods.some((p) =>
          matchesMetalForSitemap(p as { metal_type?: string }, metal)
        );
        if (!has) continue;
        const path = buildCatalogSegmentPath(metal, cat.slug, sub.slug);
        if (seen.has(path)) continue;
        seen.add(path);
        out.push({
          url: `${base}${path}`,
          lastModified: now,
          changeFrequency: "daily",
          priority: 0.9,
        });
      }
    }
  }
  return out;
}

type SitemapProductRow = { path: string; lastmod: string | null };

async function fetchSitemapProducts(): Promise<SitemapProductRow[]> {
  const api = getApiUrlForServer();
  try {
    const res = await fetch(`${api}/api/seo/sitemap-products`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: SitemapProductRow[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

/** Per-host sitemap: reseller domains list their storefront URLs, not kcjewellers.co.in. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await getStorefrontSeoContext();
  const base = seo.origin.replace(/\/$/, "");
  const now = new Date();
  const includeSip = !seo.isResellerHost || seo.branding?.investEnabled !== false;
  const storefrontDomain = seo.isResellerHost
    ? (() => {
        try {
          return new URL(base).hostname;
        } catch {
          return null;
        }
      })()
    : null;

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${base}${CATALOG_PATH}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}${RATES_PATH}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...(includeSip
      ? [
          {
            url: `${base}${SIP_PATH}`,
            lastModified: now,
            changeFrequency: "weekly" as const,
            priority: 0.85,
          },
        ]
      : []),
    {
      url: `${base}${POLICY_TERMS_PATH}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.35,
    },
    {
      url: `${base}${POLICY_PRIVACY_PATH}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.35,
    },
    {
      url: `${base}${POLICY_REFUNDS_PATH}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.35,
    },
    {
      url: `${base}${POLICY_SHIPPING_PATH}`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.35,
    },
  ];

  const catalogPillars = await catalogPillarEntries(base, storefrontDomain);
  if (seo.isResellerHost) {
    return [...staticRoutes, ...catalogPillars];
  }

  const rows = await fetchSitemapProducts();
  const productEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${base}/products/${encodeURIComponent(row.path)}`,
    lastModified: row.lastmod ? new Date(row.lastmod) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...catalogPillars, ...productEntries];
}

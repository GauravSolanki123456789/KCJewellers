import type { MetadataRoute } from "next";
import { getApiUrlForServer, getSiteUrl } from "@/lib/site";
import { buildCatalogSegmentPath } from "@/lib/catalog-paths";
import { fetchCatalogJson } from "@/lib/server-data";
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
  return false;
}

async function catalogPillarEntries(
  base: string
): Promise<MetadataRoute.Sitemap> {
  const categories = await fetchCatalogJson();
  const now = new Date();
  const metals = ["gold", "silver", "diamond"] as const;
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

/** Regenerate sitemap periodically; product URLs from API (web_products + published web_categories). */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const now = new Date();

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
    {
      url: `${base}${SIP_PATH}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.85,
    },
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

  const [rows, catalogPillars] = await Promise.all([
    fetchSitemapProducts(),
    catalogPillarEntries(base),
  ]);
  const productEntries: MetadataRoute.Sitemap = rows.map((row) => ({
    url: `${base}/products/${encodeURIComponent(row.path)}`,
    lastModified: row.lastmod ? new Date(row.lastmod) : now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...catalogPillars, ...productEntries];
}
